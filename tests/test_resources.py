import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

path = Path(__file__).resolve().parents[1] / "custom_components/lg_thinq_native_timer/resources.py"
spec = importlib.util.spec_from_file_location("timer_resources", path)
resources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resources)


class Collection:
    def __init__(self, items):
        self.items = items
        self.events = []

    async def async_get_info(self):
        self.events.append("load")

    def async_items(self):
        return self.items

    async def async_delete_item(self, item_id):
        self.events.append(("delete", item_id))
        self.items[:] = [i for i in self.items if i.get("id") != item_id]


def item(url, ident="old", kind="module"):
    return {"id": ident, "url": url, "type": kind}


class ResourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_backup_precedes_deletion_and_other_cards_survive(self):
        old = item("/lg_thinq_native_timer_card.js?v=0.2.4")
        duplicate = item("/lg_thinq_native_timer_static/lg-thinq-timer-card.js?v=0.2.0", "duplicate", "js")
        current = item("/lg_thinq_native_timer_card.js?v=0.2.6", "current")
        other = item("/hacsfiles/other/card.js", "other")
        collection = Collection([old, duplicate, current, other])
        saved = []
        async def backup(items):
            collection.events.append("backup")
            saved.extend(items)
        ll = SimpleNamespace(resource_mode="storage", resources=collection)
        result = await resources.cleanup_resources(ll, backup)
        self.assertEqual(result, {"status": "ok", "removed": 3})
        self.assertEqual(saved, [old, duplicate, current])
        self.assertEqual(collection.items, [other])
        self.assertEqual(collection.events[:3], ["load", "backup", ("delete", "old")])
        self.assertEqual(await resources.cleanup_resources(ll, backup), {"status": "ok", "removed": 0})
        self.assertEqual(collection.events.count("backup"), 1)

    async def test_exact_paths_only_never_remote_or_similarly_named_resources(self):
        for url in ["https://example.com/lg_thinq_native_timer_card.js?v=old",
                    "//example.com/lg_thinq_native_timer_card.js", "/other/lg_thinq_native_timer_card.js",
                    "/lg_thinq_native_timer_card.js.backup", "/local/lg-thinq-timer-card.js",
                    "/lg_thinq_native_timer_card.js/other", "https://[broken", "///lg_thinq_native_timer_card.js",
                    "/lg_thinq_native_timer_card.js\n"]:
            with self.subTest(url=url):
                self.assertFalse(resources.is_card_resource(item(url)))
        self.assertTrue(resources.is_card_resource(item("/lg_thinq_native_timer_card.js")))
        self.assertFalse(resources.is_card_resource(item("/lg_thinq_native_timer_card.js", kind="css")))
        self.assertFalse(resources.is_card_resource({"url": None, "type": "module"}))

    async def test_yaml_is_reported_without_editing_or_backing_up(self):
        entry = item("/lg_thinq_native_timer_card.js?v=old")
        collection = Collection([entry])
        async def backup(items):
            self.fail("YAML must not be changed")
        result = await resources.cleanup_resources(
            SimpleNamespace(resource_mode="yaml", resources=collection), backup)
        self.assertEqual(result["status"], "yaml_manual")
        self.assertEqual(collection.items, [entry])
        self.assertEqual(collection.events, ["load"])

    async def test_failed_backup_does_not_delete_any_resource(self):
        entry = item("/lg_thinq_native_timer_card.js?v=old")
        collection = Collection([entry])
        async def backup(items):
            raise OSError("storage unavailable")
        with self.assertRaises(OSError):
            await resources.cleanup_resources(
                SimpleNamespace(resource_mode="storage", resources=collection), backup)
        self.assertEqual(collection.items, [entry])
        self.assertEqual(collection.events, ["load"])

    async def test_missing_lovelace_is_safe(self):
        async def backup(items):
            self.fail("nothing to back up")
        result = await resources.cleanup_resources(None, backup)
        self.assertEqual(result, {"status": "unavailable", "removed": 0})
