import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import update_meteonetwork as m  # noqa: E402

NOW = dt.datetime(2026, 11, 8, 16, 0, tzinfo=dt.timezone.utc)
REC = {
    "observation_time_utc": "2026-11-08 15:50:00", "station_code": "abc001", "name": "Stazione X",
    "place": "Oristano", "area": "OR", "latitude": "39.90", "longitude": "8.59", "altitude": "9",
    "temperature": "18.4", "rh": "71", "wind_speed": "14.5", "wind_direction_degree": "300", "wind_gust": "27",
    "daily_rain": "0.0", "rain_rate": "0", "smlp": "1018.2", "current_tmin": "11.2", "current_tmax": "19.8",
}


class T(unittest.TestCase):
    def test_normalize_maps_fields_and_keeps_real_time(self):
        r = m.normalize(REC, NOW)
        self.assertEqual(r["station_id"], "abc001")
        self.assertEqual(r["name"], "Oristano")
        self.assertEqual(r["last"], "2026-11-08T15:50:00Z")
        self.assertEqual((r["temp"], r["wind_kmh"], r["wind_dir"], r["pressure_hpa"]), (18.4, 14.5, 300.0, 1018.2))
        self.assertEqual(r["rain_today"], 0.0)  # uno zero misurato resta zero

    def test_out_of_range_becomes_null_not_zero(self):
        r = m.normalize({**REC, "temperature": "99", "rh": None}, NOW)
        self.assertIsNone(r["temp"])
        self.assertIsNone(r["rh"])
        self.assertFalse(r["available"]["temp"])

    def test_future_or_missing_time_rejected(self):
        self.assertIsNone(m.normalize({**REC, "observation_time_utc": "2026-11-08 18:00:00"}, NOW))
        self.assertIsNone(m.normalize({**REC, "observation_time_utc": None}, NOW))

    def test_throttle_and_output(self):
        waits = []
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "meteonetwork.json"
            ok = m.main(fetch=lambda c: [{**REC, "station_code": c}], sleep=waits.append, now=NOW, codes=["a1", "b2", "c3"], out=out)
            doc = json.loads(out.read_text())
        self.assertTrue(ok)
        self.assertEqual(waits, [m.REQUEST_GAP_S] * 2)
        self.assertGreaterEqual(m.REQUEST_GAP_S, 12)  # <= 5 richieste/minuto
        self.assertEqual(doc["station_count"], 3)
        self.assertIn("CC-BY", doc["license"])

    def test_no_data_keeps_previous_file(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "meteonetwork.json"
            out.write_text('{"old": true}')
            self.assertFalse(m.main(fetch=lambda c: [], sleep=lambda s: None, now=NOW, codes=["a1"], out=out))
            self.assertEqual(json.loads(out.read_text()), {"old": True})

    def test_station_cap_fits_interval(self):
        self.assertLessEqual(m.MAX_STATIONS * m.REQUEST_GAP_S, 14 * 60)


if __name__ == "__main__":
    unittest.main()
