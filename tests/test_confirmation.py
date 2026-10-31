import asyncio
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / "custom_components/lg_thinq_native_timer/confirmation.py"
spec = importlib.util.spec_from_file_location("confirmation", path)
confirmation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(confirmation)


class ConfirmationTests(unittest.TestCase):
    def run_confirmation(self, samples, service="set_timer", minutes=120):
        reads, delays = [], []
        async def read():
            reads.append(True)
            return samples[len(reads) - 1]
        async def sleep(delay):
            delays.append(delay)
        result = asyncio.run(confirmation.confirm(read, service, minutes, sleep))
        return result, len(reads), delays

    def test_delayed_set_stops_when_remaining_matches(self):
        result, reads, delays = self.run_confirmation([
            {"timer_state": "UNSET"}, {"timer_state": "SET", "remaining_minutes": 60},
            {"timer_state": "SET", "remaining_minutes": 119}])
        self.assertTrue(result[1])
        self.assertEqual(reads, 3)
        self.assertEqual(delays, [2, 3])

    def test_already_confirmed_has_no_wait(self):
        result, reads, delays = self.run_confirmation([
            {"timer_state": "SET", "remaining_minutes": 120}])
        self.assertTrue(result[1])
        self.assertEqual((reads, delays), (1, []))

    def test_cancel_waits_for_unset(self):
        result, reads, delays = self.run_confirmation([
            {"timer_state": "SET"}, {"timer_state": "UNSET"}], "cancel_timer", None)
        self.assertTrue(result[1])
        self.assertEqual(reads, 2)

    def test_unconfirmed_is_bounded_and_keeps_last_observation(self):
        result, reads, delays = self.run_confirmation([
            None, {"timer_state": "UNSET"}, None, None])
        self.assertEqual(result, ({"timer_state": "UNSET"}, False))
        self.assertEqual((reads, sum(delays)), (4, 10))

    def test_missing_remaining_cannot_confirm_setting(self):
        self.assertFalse(confirmation.matches({"timer_state": "SET"}, "set_timer", 120))


class TrackerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.now = 0
        self.changes = []
        async def sleep(delay):
            self.now += delay
            await asyncio.sleep(0)
        self.tracker = confirmation.ConfirmationTracker(
            asyncio.create_task, lambda *args: self.changes.append(args),
            clock=lambda: self.now, sleep=sleep)
        self.lock = asyncio.Lock()

    async def asyncTearDown(self):
        self.tracker.stop()
        await asyncio.sleep(0)

    async def test_three_minute_delayed_report_confirms_without_control_calls(self):
        samples = []
        async def read():
            samples.append(self.now)
            if self.now < 180:
                return {"timer_state": "UNSET"}
            return {"timer_state": "SET", "remaining_minutes": 57}
        self.tracker.begin("device", "set_timer", 60)
        self.tracker.follow("device", read, self.lock)
        await self.tracker.tasks["device"]
        self.assertEqual(samples, [5, 15, 30, 60, 120, 180])
        self.assertEqual(self.tracker.status("device")["status"], "confirmed")
        self.assertEqual(self.changes, [("device", "confirmed")])
        self.assertEqual(self.tracker.tasks, {})

    async def test_timeout_stays_unknown_and_later_inspect_can_confirm(self):
        async def read():
            return None
        self.tracker.begin("device", "set_timer", 60)
        self.tracker.follow("device", read, self.lock)
        await self.tracker.tasks["device"]
        self.assertEqual(self.now, 300)
        self.assertEqual(self.tracker.status("device")["status"], "unconfirmed")
        self.now = 360
        self.assertTrue(self.tracker.observe("device", {"timer_state": "SET", "remaining_minutes": 54}))
        self.assertEqual(self.tracker.status("device")["status"], "confirmed")

    async def test_elapsed_window_rejects_old_or_unrelated_timer(self):
        self.tracker.begin("device", "set_timer", 60)
        self.now = 180
        self.assertFalse(self.tracker.observe("device", {"timer_state": "SET", "remaining_minutes": 60}))
        self.assertFalse(self.tracker.observe("device", {"timer_state": "SET", "remaining_minutes": 30}))
        self.assertTrue(self.tracker.observe("device", {"timer_state": "SET", "remaining_minutes": 57}))

    async def test_new_command_cancels_old_background_task(self):
        async def read():
            self.fail("superseded task must not read")
        self.tracker.begin("device", "set_timer", 60)
        self.tracker.follow("device", read, self.lock)
        old = self.tracker.tasks["device"]
        self.tracker.begin("device", "cancel_timer", None)
        await asyncio.gather(old, return_exceptions=True)
        self.assertTrue(old.cancelled())
        self.assertTrue(self.tracker.observe("device", {"timer_state": "UNSET"}))

    async def test_background_reads_wait_for_device_lock(self):
        reads = []
        async def read():
            reads.append(True)
            return {"timer_state": "UNSET"}
        async with self.lock:
            self.tracker.begin("device", "cancel_timer", None)
            self.tracker.follow("device", read, self.lock)
            task = self.tracker.tasks["device"]
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            self.assertEqual(reads, [])
        await task
        self.assertEqual(reads, [True])

    async def test_stop_cancels_reads_on_shutdown(self):
        async def read():
            self.fail("shutdown task must not read")
        self.tracker.begin("device", "set_timer", 60)
        self.tracker.follow("device", read, self.lock)
        task = self.tracker.tasks["device"]
        self.tracker.stop()
        await asyncio.gather(task, return_exceptions=True)
        self.assertTrue(task.cancelled())
