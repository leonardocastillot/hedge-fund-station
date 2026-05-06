from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from backend.hyperliquid_gateway.macro_intelligence import (
    build_calendar_quality,
    build_post_event_notes,
    build_stand_aside_windows,
    canonicalize_calendar_events,
)


class MacroIntelligenceTest(unittest.TestCase):
    def fixture_calendar(self, *, warning: str | None = None, source: str = "Forex Factory weekly JSON export") -> dict[str, object]:
        event_time = datetime.now(timezone.utc) + timedelta(hours=2)
        return {
            "source": source,
            "timezone": "America/Santiago",
            "source_updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "count": 2,
            "warning": warning,
            "events_by_day": {
                event_time.date().isoformat(): [
                    {
                        "id": 1,
                        "time": event_time.strftime("%H:%M"),
                        "date_time": event_time.isoformat(),
                        "currency": "USD",
                        "impact": "HIGH",
                        "event_name": "CPI m/m",
                        "forecast": "0.2%",
                        "previous": "0.3%",
                        "actual": "0.4%",
                    },
                    {
                        "id": 2,
                        "time": event_time.strftime("%H:%M"),
                        "date_time": event_time.isoformat(),
                        "currency": "EUR",
                        "impact": "LOW",
                        "event_name": "Spanish Manufacturing PMI",
                        "forecast": "49.5",
                        "previous": "48.7",
                        "actual": None,
                    },
                ]
            },
        }

    def test_quality_marks_saved_snapshot_as_cached(self) -> None:
        quality = build_calendar_quality(
            self.fixture_calendar(warning="Forex Factory unavailable: HTTP 429; using latest saved Forex Factory calendar snapshot")
        )

        self.assertEqual(quality["status"], "cached")
        self.assertTrue(quality["uses_saved_snapshot"])
        self.assertGreaterEqual(quality["confidence"], 60)

    def test_quality_marks_fallback_as_low_confidence(self) -> None:
        quality = build_calendar_quality(
            self.fixture_calendar(
                source="Deterministic macro calendar fallback",
                warning="No provider; using deterministic fallback risk markers, not scheduled release data",
            )
        )

        self.assertEqual(quality["status"], "fallback")
        self.assertTrue(quality["uses_fallback"])
        self.assertLess(quality["confidence"], 50)

    def test_canonical_events_classify_crypto_relevant_macro(self) -> None:
        canonical = canonicalize_calendar_events(self.fixture_calendar())
        cpi = canonical[0]

        self.assertEqual(cpi["category"], "inflation")
        self.assertEqual(cpi["crypto_importance"], "high")
        self.assertEqual(cpi["surprise"]["direction"], "above_forecast")

    def test_stand_aside_windows_only_use_high_importance_events(self) -> None:
        canonical = canonicalize_calendar_events(self.fixture_calendar())
        windows = build_stand_aside_windows(canonical)

        self.assertEqual(len(windows), 1)
        self.assertIn("CPI", windows[0]["label"])

    def test_post_event_notes_explain_surprise(self) -> None:
        canonical = canonicalize_calendar_events(self.fixture_calendar())
        notes = build_post_event_notes(canonical)

        self.assertEqual(len(notes), 1)
        self.assertIn("Hotter", notes[0]["read"])


if __name__ == "__main__":
    unittest.main()
