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
