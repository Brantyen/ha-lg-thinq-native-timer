import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / "custom_components/lg_thinq_native_timer/logic.py"
spec = importlib.util.spec_from_file_location("timer_logic", path)
logic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(logic)

def range_prop(lo, hi, step=1):
    return {"type": "range", "mode": ["r", "w"],
            "value": {"w": {"min": lo, "max": hi, "step": step}}}

def profile():
    return {"property": {"sleepTimer": {
        "relativeHourToStop": range_prop(0, 12),
        "relativeMinuteToStop": range_prop(0, 59),
        "relativeStopTimer": {"type": "enum", "mode": ["r", "w"],
                              "value": {"w": ["SET", "UNSET"]}}
    }}}


def real_profile():
    return {"property": {"sleepTimer": {
        "relativeHourToStop": {"type": "number", "mode": ["r", "w"]},
        "relativeMinuteToStop": {"type": "number", "mode": ["r"]},
        "relativeStopTimer": {"type": "enum", "mode": ["r", "w"],
            "value": {"r": ["SET", "UNSET"], "w": ["UNSET"]}}
    }}}

class TimerTests(unittest.TestCase):
    def test_real_dhum_profile_hour_only(self):
        self.assertEqual(logic.set_payload(real_profile(), 120),
                         {"sleepTimer": {"relativeHourToStop": 2}})
        self.assertEqual(logic.set_payload(real_profile(), 60),
                         {"sleepTimer": {"relativeHourToStop": 1}})

    def test_real_dhum_readonly_minutes_are_never_written(self):
        with self.assertRaises(logic.TimerUnsupported):
            logic.set_payload(real_profile(), 90)
        payload = logic.set_payload(real_profile(), 180)["sleepTimer"]
        self.assertNotIn("relativeMinuteToStop", payload)
        self.assertNotIn("relativeStopTimer", payload)

    def test_real_dhum_cancel_uses_only_unset(self):
        self.assertEqual(logic.cancel_payload(real_profile()),
                         {"sleepTimer": {"relativeStopTimer": "UNSET"}})

    def test_numeric_range_if_declared_is_enforced(self):
        p = real_profile()
        p["property"]["sleepTimer"]["relativeHourToStop"]["value"] = {
            "w": {"min": 1, "max": 4, "step": 1}}
        with self.assertRaises(logic.TimerUnsupported):
            logic.set_payload(p, 300)

    def test_set_hour_and_minutes(self):
        self.assertEqual(logic.set_payload(profile(), 125), {
            "sleepTimer": {"relativeHourToStop": 2, "relativeMinuteToStop": 5, "relativeStopTimer": "SET"}})

    def test_readonly_and_missing_rejected(self):
        for p in ({}, {"property": {"sleepTimer": {
                "relativeHourToStop": {"type": "range", "mode": ["r"], "value": {"r": {"min": 0, "max": 12}}}}}}):
            with self.assertRaises(logic.TimerUnsupported):
                logic.set_payload(p, 60)

    def test_exact_device_range_step_exceptions(self):
        p = profile()
        p["property"]["sleepTimer"]["relativeMinuteToStop"] = range_prop(0, 50, 10)
        for minutes in (61, 115, 800):
            with self.assertRaises(logic.TimerUnsupported):
                logic.set_payload(p, minutes)
        p["property"]["sleepTimer"]["relativeHourToStop"]["value"]["w"]["except"] = [2]
        with self.assertRaises(logic.TimerUnsupported):
            logic.set_payload(p, 120)

    def test_whole_hour_model(self):
        p = profile()
        del p["property"]["sleepTimer"]["relativeMinuteToStop"]
        self.assertEqual(logic.set_payload(p, 120)["sleepTimer"]["relativeHourToStop"], 2)
        with self.assertRaises(logic.TimerUnsupported):
            logic.set_payload(p, 121)

    def test_cancel_requires_explicit_permission(self):
        self.assertEqual(logic.cancel_payload(profile()), {"sleepTimer": {"relativeStopTimer": "UNSET"}})
        p = profile()
        p["property"]["sleepTimer"]["relativeStopTimer"]["mode"] = ["r"]
        with self.assertRaises(logic.TimerUnsupported):
            logic.cancel_payload(p)

    def test_mqtt_examples(self):
        self.assertEqual(logic.snapshot({"sleepTimer": {
            "relativeHourToStop": 0, "relativeMinuteToStop": 59,
            "relativeStopTimer": "SET"}})["remaining_minutes"], 59)
        self.assertIsNone(logic.snapshot({"sleepTimer": {
            "relativeHourToStop": None, "relativeMinuteToStop": None,
            "relativeStopTimer": "UNSET"}})["remaining_minutes"])
        self.assertIsNone(logic.snapshot({})["remaining_minutes"])
        self.assertIsNone(logic.snapshot({"sleepTimer": {"relativeStopTimer": "SET"}})["remaining_minutes"])

    def test_invalid_input(self):
        for value in (0, -1, 1441, True, 1.5, "60"):
            with self.assertRaises(ValueError):
                logic.set_payload(profile(), value)

if __name__ == "__main__":
    unittest.main()
