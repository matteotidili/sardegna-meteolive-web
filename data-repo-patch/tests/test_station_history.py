import datetime as dt
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("ush", Path(__file__).resolve().parent.parent / "scripts" / "update_station_history.py")
ush = importlib.util.module_from_spec(spec)
sys.modules["ush"] = ush
spec.loader.exec_module(ush)

NOW = dt.datetime(2026, 11, 8, 14, 0, tzinfo=dt.timezone.utc)


def write(root, name, stations):
    (root / name).write_text(json.dumps({"stations": stations}), encoding="utf-8")


class StationHistoryTest(unittest.TestCase):
    def run_once(self, stations, now=NOW, existing=None):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            write(root, "stations.json", stations)
            write(root, "am.json", [])
            write(root, "ecowitt.json", [])
            out = root / "station_history_24h.json"
            if existing:
                out.write_text(json.dumps(existing), encoding="utf-8")
            ush.main(root, out, now)
            return json.loads(out.read_text()) if out.exists() else {}

    def test_uses_observation_time_and_tenths(self):
        doc = self.run_once([{"name": "Bauladu", "temp": 22.4, "rain_today": 0.2, "last": "2026-11-08T13:40:00Z"}])
        self.assertEqual(doc["series"]["dpcn-sardegna|Bauladu"], [[int(dt.datetime(2026, 11, 8, 13, 40, tzinfo=dt.timezone.utc).timestamp() // 60), 224, 2]])

    def test_missing_values_stay_null_not_zero(self):
        doc = self.run_once([{"name": "X", "temp": 10.0, "rain_today": None, "last": "2026-11-08T13:50:00Z"}])
        self.assertIsNone(doc["series"]["dpcn-sardegna|X"][0][2])

    def test_stale_or_future_samples_rejected(self):
        doc = self.run_once([
            {"name": "Old", "temp": 10, "last": "2026-11-08T10:00:00Z"},
            {"name": "Future", "temp": 10, "last": "2026-11-08T15:00:00Z"},
        ])
        self.assertEqual(doc, {})

    def test_retention_prunes_old_points(self):
        old_min = int((NOW - dt.timedelta(hours=30)).timestamp() // 60)
        existing = {"series": {"dpcn-sardegna|X": [[old_min, 100, 0]]}}
        doc = self.run_once([{"name": "X", "temp": 11.0, "last": "2026-11-08T13:50:00Z"}], existing=existing)
        self.assertEqual(len(doc["series"]["dpcn-sardegna|X"]), 1)


if __name__ == "__main__":
    unittest.main()
