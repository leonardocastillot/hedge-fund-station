from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx

try:
    from .ai_provider import AIProviderError, complete_json, provider_status
except ImportError:
    from ai_provider import AIProviderError, complete_json, provider_status


TIMEZONE_LABEL = "America/Santiago"
LOCAL_TZ = ZoneInfo(TIMEZONE_LABEL)
MACRO_CACHE_SECONDS = 900
AI_BRIEF_CACHE_SECONDS = 1800
BACKEND_ROOT = Path(__file__).resolve().parent
DEFAULT_MACRO_DATA_DIR = Path("/data") if Path("/data").exists() else BACKEND_ROOT / "data"
MACRO_DATA_DIR = Path(os.getenv("MACRO_DATA_DIR", str(DEFAULT_MACRO_DATA_DIR)))
CALENDAR_CACHE_PATH = Path(os.getenv("MACRO_CALENDAR_CACHE_PATH", str(MACRO_DATA_DIR / "macro_calendar_latest.json")))
FOREX_FACTORY_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
FOREX_FACTORY_HEADERS = {
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HedgeFundStation/1.0 Safari/537.36",
}
_calendar_cache: dict[str, Any] | None = None
_calendar_cache_at = 0.0
_news_cache: dict[str, Any] | None = None
_news_cache_at = 0.0
_holidays_cache: dict[str, Any] | None = None
_holidays_cache_at = 0.0
_brief_cache: dict[str, Any] | None = None
_brief_cache_key: str | None = None
_brief_cache_at = 0.0


NEWS_FEEDS = [
    ("Yahoo Finance", "https://feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD,ETH-USD,SPY,QQQ&region=US&lang=en-US"),
    ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("Federal Reserve", "https://www.federalreserve.gov/feeds/press_all.xml"),
]

HOLIDAY_COUNTRIES = {
    "US": "United States",
    "CL": "Chile",
    "GB": "United Kingdom",
    "JP": "Japan",
    "DE": "Germany",
}

FALLBACK_CALENDAR_MARKERS = [
    {
        "weekday": 0,
        "time": "08:30",
        "currency": "GLOBAL",
        "impact": "MEDIUM",
        "event_name": "Fallback macro risk marker: review weekend policy and liquidity headlines",
    },
    {
        "weekday": 1,
        "time": "10:00",
        "currency": "USD",
        "impact": "MEDIUM",
        "event_name": "Fallback macro risk marker: monitor US data and Fed speaker risk",
    },
    {
        "weekday": 2,
        "time": "14:00",
        "currency": "USD",
        "impact": "HIGH",
        "event_name": "Fallback macro risk marker: reserve window for central-bank or rates shock",
    },
    {
        "weekday": 3,
        "time": "08:30",
        "currency": "USD",
        "impact": "HIGH",
        "event_name": "Fallback macro risk marker: review US labor, inflation, and claims risk",
    },
    {
        "weekday": 4,
        "time": "10:00",
        "currency": "GLOBAL",
        "impact": "MEDIUM",
        "event_name": "Fallback macro risk marker: reduce weekend gap and liquidity risk",
    },
]


def now_ms() -> int:
    return int(time.time() * 1000)


async def get_calendar_week(days: int = 7, force: bool = False) -> dict[str, Any]:
    global _calendar_cache, _calendar_cache_at
    if not force and _calendar_cache and time.time() - _calendar_cache_at <= MACRO_CACHE_SECONDS:
        return limit_calendar_payload(_calendar_cache, days)

    payload = await fetch_calendar_from_forex_factory(days)
    _calendar_cache = payload
    _calendar_cache_at = time.time()
    return limit_calendar_payload(payload, days)


async def fetch_calendar_from_forex_factory(days: int) -> dict[str, Any]:
    warning = None
    events: list[dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            response = await client.get(FOREX_FACTORY_CALENDAR_URL, headers=FOREX_FACTORY_HEADERS)
        if response.status_code == 429:
            warning = "Forex Factory unavailable: HTTP 429"
        elif response.status_code >= 400:
            warning = f"Forex Factory unavailable: HTTP {response.status_code}"
        else:
            for index, item in enumerate(response.json()):
                event = normalize_forex_factory_event(index, item)
                if event:
                    events.append(event)
    except Exception as exc:
        warning = f"Forex Factory unavailable: {exc}"

    if not events:
        cached_payload = load_cached_calendar_payload()
        if cached_payload:
            return calendar_payload_with_warning(
                cached_payload,
                f"{warning or 'Forex Factory returned no events'}; using latest saved Forex Factory calendar snapshot",
            )
        warning = warning or "No calendar provider returned scheduled macro events."
        return build_fallback_calendar_payload(days, warning)

    payload = group_events(events, source="Forex Factory weekly JSON export", warning=warning, days=days)
    if payload["count"] == 0:
        cached_payload = load_cached_calendar_payload()
        if cached_payload:
            return calendar_payload_with_warning(
                cached_payload,
                "Forex Factory returned no events inside the requested window; using latest saved Forex Factory calendar snapshot",
            )
        return build_fallback_calendar_payload(
            days,
            "Forex Factory returned no events inside the requested window",
        )
    save_calendar_payload(payload)
    return payload


def build_fallback_calendar_payload(days: int, warning: str) -> dict[str, Any]:
    fallback_warning = f"{warning}; using deterministic fallback risk markers, not scheduled release data"
    return group_events(
        build_calendar_fallback_events(days),
        source="Deterministic macro calendar fallback",
        warning=fallback_warning,
        days=days,
    )


def build_calendar_fallback_events(days: int) -> list[dict[str, Any]]:
    start = local_today()
    end = start + timedelta(days=days)
    events: list[dict[str, Any]] = []
    event_id = 1

    current = start
    while current <= end:
        for marker in FALLBACK_CALENDAR_MARKERS:
            if current.weekday() != marker["weekday"]:
                continue
            hour, minute = [int(part) for part in marker["time"].split(":")]
            marker_time = datetime(current.year, current.month, current.day, hour, minute, tzinfo=LOCAL_TZ)
            events.append(
                {
                    "id": event_id,
                    "time": marker["time"],
                    "date_time": marker_time.isoformat(),
                    "currency": marker["currency"],
                    "impact": marker["impact"],
                    "event_name": marker["event_name"],
                    "forecast": None,
                    "previous": None,
                    "actual": None,
                    "is_fallback": True,
                }
            )
            event_id += 1
        current += timedelta(days=1)

    return events


def normalize_forex_factory_event(index: int, item: dict[str, Any]) -> dict[str, Any] | None:
    raw_date = item.get("date")
    raw_time = item.get("time")
    event_name = item.get("title") or item.get("event") or item.get("name")
    if not raw_date or not event_name:
        return None

    parsed = None
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S%z", "%b %d, %Y %I:%M%p"):
        try:
            parsed = datetime.strptime(str(raw_date), fmt)
            break
        except ValueError:
            continue
    if parsed is None:
        try:
            parsed = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
        except ValueError:
            parsed = datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed_local = parsed.astimezone(LOCAL_TZ)

    impact = str(item.get("impact") or item.get("importance") or "LOW").upper()
    if "HIGH" in impact or impact == "RED":
        impact = "HIGH"
    elif "MED" in impact or impact == "ORANGE":
        impact = "MEDIUM"
    else:
        impact = "LOW"

    return {
        "id": index + 1,
        "time": parsed_local.strftime("%H:%M"),
        "provider_time": raw_time,
        "date_time": parsed_local.isoformat(),
        "currency": str(item.get("country") or item.get("currency") or "GLOBAL").upper(),
        "impact": impact,
        "event_name": str(event_name),
        "forecast": empty_to_none(item.get("forecast")),
        "previous": empty_to_none(item.get("previous")),
        "actual": empty_to_none(item.get("actual")),
    }


def local_today() -> date:
    return datetime.now(LOCAL_TZ).date()


def empty_to_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def group_events(events: list[dict[str, Any]], *, source: str, warning: str | None, days: int) -> dict[str, Any]:
    start = local_today()
    end = start + timedelta(days=days)
    events_by_day: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        try:
            event_day = datetime.fromisoformat(str(event["date_time"]).replace("Z", "+00:00")).astimezone(LOCAL_TZ).date()
        except ValueError:
            continue
        if event_day < start or event_day > end:
            continue
        key = event_day.isoformat()
        events_by_day.setdefault(key, []).append(event)

    for day_events in events_by_day.values():
        day_events.sort(key=lambda item: item.get("date_time") or "")

    count = sum(len(items) for items in events_by_day.values())
    updated_at = datetime.now(timezone.utc).isoformat()
    return {
        "source": source,
        "timezone": TIMEZONE_LABEL,
        "events_by_day": events_by_day,
        "count": count,
        "warning": warning,
        "updated_at": updated_at,
        "source_updated_at": updated_at,
    }


def save_calendar_payload(payload: dict[str, Any]) -> None:
    try:
        CALENDAR_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CALENDAR_CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        return


def load_cached_calendar_payload() -> dict[str, Any] | None:
    try:
        payload = json.loads(CALENDAR_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or not payload.get("events_by_day"):
        return None
    return payload


def calendar_payload_with_warning(payload: dict[str, Any], warning: str) -> dict[str, Any]:
    return {
        **payload,
        "warning": warning,
        "source_updated_at": payload.get("source_updated_at") or payload.get("updated_at"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def limit_calendar_payload(payload: dict[str, Any], days: int) -> dict[str, Any]:
    allowed = {
        (local_today() + timedelta(days=offset)).isoformat()
        for offset in range(days + 1)
    }
    filtered = {
        day: events
        for day, events in payload.get("events_by_day", {}).items()
        if day in allowed
    }
    return {
        **payload,
        "events_by_day": filtered,
        "count": sum(len(events) for events in filtered.values()),
    }


async def get_macro_news(days: int = 7, force: bool = False) -> dict[str, Any]:
    global _news_cache, _news_cache_at
    if not force and _news_cache and time.time() - _news_cache_at <= MACRO_CACHE_SECONDS:
        return limit_news_payload(_news_cache, days)

    results = await asyncio.gather(*(fetch_rss_feed(source, url) for source, url in NEWS_FEEDS), return_exceptions=True)
    items: list[dict[str, Any]] = []
    warnings: list[str] = []
    for result in results:
        if isinstance(result, Exception):
            warnings.append(str(result))
        else:
            items.extend(result)

    items = dedupe_news(items)
    items.sort(key=lambda item: item.get("published_at") or "", reverse=True)
    _news_cache = {
        "source": "RSS macro and market feeds",
        "timezone": TIMEZONE_LABEL,
        "items": items[:80],
        "count": len(items[:80]),
        "warnings": warnings,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _news_cache_at = time.time()
    return limit_news_payload(_news_cache, days)


async def fetch_rss_feed(source: str, url: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
        response = await client.get(url, headers={"User-Agent": "hedge-fund-station/1.0"})
    if response.status_code >= 400:
        raise RuntimeError(f"{source} feed unavailable: HTTP {response.status_code}")

    root = ET.fromstring(response.text)
    items: list[dict[str, Any]] = []
    for index, node in enumerate(root.findall(".//item")[:30]):
        title = text_or_empty(node.findtext("title"))
        link = text_or_empty(node.findtext("link"))
        description = text_or_empty(node.findtext("description"))
        published = parse_rss_datetime(node.findtext("pubDate"))
        if not title:
            continue
        items.append(
            {
                "id": hashlib.sha1(f"{source}:{title}:{link}".encode("utf-8")).hexdigest()[:16],
                "source": source,
                "title": title,
                "url": link or None,
                "summary": description[:320] if description else None,
                "published_at": published,
                "impact": classify_news_impact(title, description),
                "tags": classify_news_tags(title, description),
                "rank": index + 1,
            }
        )
    return items


def text_or_empty(value: str | None) -> str:
    return (value or "").strip()


def parse_rss_datetime(value: str | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z"):
        try:
            parsed = datetime.strptime(value, fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.isoformat()
        except ValueError:
            continue
    return datetime.now(timezone.utc).isoformat()


def classify_news_impact(title: str, description: str) -> str:
    text = f"{title} {description}".lower()
    high_terms = ["fed", "fomc", "inflation", "cpi", "jobs", "payroll", "tariff", "war", "bank", "etf", "sec"]
    medium_terms = ["oil", "yields", "dollar", "earnings", "rates", "bitcoin", "crypto", "treasury"]
    if any(term in text for term in high_terms):
        return "HIGH"
    if any(term in text for term in medium_terms):
        return "MEDIUM"
    return "LOW"


def classify_news_tags(title: str, description: str) -> list[str]:
    text = f"{title} {description}".lower()
    tags = []
    for tag, terms in {
        "rates": ["fed", "rate", "yield", "treasury"],
        "inflation": ["inflation", "cpi", "ppi"],
        "crypto": ["bitcoin", "crypto", "ether", "ethereum", "sec", "etf"],
        "risk": ["war", "tariff", "bank", "default", "crisis"],
    }.items():
        if any(term in text for term in terms):
            tags.append(tag)
    return tags or ["market"]


def dedupe_news(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in items:
        key = str(item.get("url") or item.get("title"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def limit_news_payload(payload: dict[str, Any], days: int) -> dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    filtered = []
    for item in payload.get("items", []):
        try:
            published = datetime.fromisoformat(str(item.get("published_at")).replace("Z", "+00:00"))
        except ValueError:
            published = datetime.now(timezone.utc)
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        if published >= cutoff:
            filtered.append(item)
    return {**payload, "items": filtered, "count": len(filtered)}


async def get_bank_holidays(countries: list[str] | None = None, days: int = 14, force: bool = False) -> dict[str, Any]:
    global _holidays_cache, _holidays_cache_at
    requested = [country.upper() for country in (countries or ["US", "CL", "GB", "JP", "DE"])]
    cache_key = ",".join(sorted(requested))
    if (
        not force
        and _holidays_cache
        and _holidays_cache.get("cache_key") == cache_key
        and time.time() - _holidays_cache_at <= MACRO_CACHE_SECONDS
    ):
        return limit_holiday_payload(_holidays_cache, days)

    year = date.today().year
    results = await asyncio.gather(*(fetch_country_holidays(country, year) for country in requested), return_exceptions=True)
    holidays: list[dict[str, Any]] = []
    warnings: list[str] = []
    for result in results:
        if isinstance(result, Exception):
            warnings.append(str(result))
        else:
            holidays.extend(result)

    holidays.sort(key=lambda item: item.get("date") or "")
    _holidays_cache = {
        "cache_key": cache_key,
        "source": "Nager.Date public holidays",
        "timezone": TIMEZONE_LABEL,
        "holidays": holidays,
        "count": len(holidays),
        "warnings": warnings,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _holidays_cache_at = time.time()
    return limit_holiday_payload(_holidays_cache, days)


async def fetch_country_holidays(country: str, year: int) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(f"https://date.nager.at/api/v3/PublicHolidays/{year}/{country}")
    if response.status_code >= 400:
        raise RuntimeError(f"Holiday feed unavailable for {country}: HTTP {response.status_code}")
    payload = response.json()
    return [
        {
            "date": item.get("date"),
            "country": country,
            "country_name": HOLIDAY_COUNTRIES.get(country, country),
            "name": item.get("name"),
            "local_name": item.get("localName"),
            "global": item.get("global"),
            "types": item.get("types") or [],
        }
        for item in payload
        if isinstance(item, dict)
    ]


def limit_holiday_payload(payload: dict[str, Any], days: int) -> dict[str, Any]:
    start = date.today()
    end = start + timedelta(days=days)
    filtered = []
    for item in payload.get("holidays", []):
        try:
            holiday_date = date.fromisoformat(str(item.get("date")))
        except ValueError:
            continue
        if start <= holiday_date <= end:
            filtered.append(item)
    return {**payload, "holidays": filtered, "count": len(filtered)}


async def get_calendar_analysis(days: int = 7, force: bool = False) -> dict[str, Any]:
    calendar, news, holidays = await asyncio.gather(
        get_calendar_week(days=days, force=force),
        get_macro_news(days=days, force=force),
        get_bank_holidays(days=days, force=force),
    )
    analysis = deterministic_analysis(calendar, news, holidays)
    return {
        "analysis": analysis,
        "ai": {"provider": "deterministic", "model": None, "fallbackUsed": False, "errors": []},
        "warning": calendar.get("warning"),
    }


async def get_calendar_intelligence(days: int = 7, force: bool = False) -> dict[str, Any]:
    calendar, news, holidays = await asyncio.gather(
        get_calendar_week(days=days, force=force),
        get_macro_news(days=days, force=force),
        get_bank_holidays(days=days, force=force),
    )
    deterministic = deterministic_analysis(calendar, news, holidays)
    quality = build_calendar_quality(calendar)
    canonical_events = canonicalize_calendar_events(calendar)
    today_desk = build_today_macro_desk(calendar, canonical_events, deterministic, quality)
    stand_aside_windows = build_stand_aside_windows(canonical_events)
    post_event_notes = build_post_event_notes(canonical_events)
    model_payload = await build_model_macro_read(
        calendar=calendar,
        news=news,
        holidays=holidays,
        quality=quality,
        deterministic=deterministic,
        canonical_events=canonical_events,
        stand_aside_windows=stand_aside_windows,
    )

    return {
        "quality": quality,
        "today_desk": today_desk,
        "canonical_events": canonical_events,
        "stand_aside_windows": stand_aside_windows,
        "post_event_notes": post_event_notes,
        "deterministic": deterministic,
        "model": model_payload["model"],
        "ai": model_payload["ai"],
        "calendar": calendar,
        "news": news,
        "holidays": holidays,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def build_calendar_quality(calendar: dict[str, Any]) -> dict[str, Any]:
    source = str(calendar.get("source") or "unknown")
    warning = str(calendar.get("warning") or "")
    source_updated_at = str(calendar.get("source_updated_at") or calendar.get("updated_at") or "")
    age_minutes = minutes_since_iso(source_updated_at)
    source_lower = source.lower()
    warning_lower = warning.lower()
    uses_fallback = "fallback" in source_lower or "fallback" in warning_lower
    uses_saved_snapshot = "saved" in warning_lower or "snapshot" in warning_lower
    provider = "Forex Factory" if "forex factory" in source_lower or uses_saved_snapshot else source

    if uses_fallback:
        status = "fallback"
        confidence = 25
    elif uses_saved_snapshot:
        status = "cached"
        confidence = 70
    elif age_minutes is None:
        status = "unknown"
        confidence = 50
    elif age_minutes <= 30:
        status = "fresh"
        confidence = 95
    elif age_minutes <= 6 * 60:
        status = "fresh"
        confidence = 85
    elif age_minutes <= 24 * 60:
        status = "stale"
        confidence = 60
    else:
        status = "stale"
        confidence = 40

    warnings: list[str] = []
    if warning:
        warnings.append(warning)
    if status in {"cached", "stale"}:
        warnings.append("Treat missing or changed events as possible; confirm before sizing up.")
    if uses_fallback:
        warnings.append("Fallback markers are not scheduled release data.")

    return {
        "provider": provider,
        "status": status,
        "confidence": confidence,
        "age_minutes": age_minutes,
        "source": source,
        "source_updated_at": source_updated_at or None,
        "served_at": calendar.get("updated_at"),
        "event_count": calendar.get("count", 0),
        "uses_saved_snapshot": uses_saved_snapshot,
        "uses_fallback": uses_fallback,
        "warnings": dedupe_strings(warnings),
    }


def minutes_since_iso(value: str) -> int | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return max(0, int((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds() // 60))


def canonicalize_calendar_events(calendar: dict[str, Any]) -> list[dict[str, Any]]:
    canonical: list[dict[str, Any]] = []
    for day, events in sorted(calendar.get("events_by_day", {}).items()):
        for event in events:
            event_id = f"{day}-{event.get('id')}"
            category = classify_event_category(str(event.get("event_name") or ""))
            crypto_importance = classify_crypto_importance(event, category)
            surprise = build_event_surprise(event)
            canonical.append(
                {
                    "event_id": event_id,
                    "date": day,
                    "time": event.get("time"),
                    "date_time": event.get("date_time"),
                    "currency": event.get("currency"),
                    "impact": event.get("impact"),
                    "event_name": event.get("event_name"),
                    "category": category,
                    "crypto_importance": crypto_importance,
                    "forecast": event.get("forecast"),
                    "previous": event.get("previous"),
                    "actual": event.get("actual"),
                    "surprise": surprise,
                    "source": calendar.get("source"),
                    "confidence": 25 if event.get("is_fallback") else None,
                    "is_fallback": bool(event.get("is_fallback")),
                }
            )
    return canonical


def classify_event_category(name: str) -> str:
    text = name.lower()
    categories = {
        "central_bank": ["fomc", "fed", "powell", "rate statement", "interest rate", "monetary policy", "ecb", "boe", "boj"],
        "inflation": ["cpi", "ppi", "inflation", "pce", "prices"],
        "labor": ["payroll", "unemployment", "jobless", "claims", "employment", "earnings", "jobs"],
        "growth": ["gdp", "retail sales", "pmi", "ism", "manufacturing", "services", "industrial production"],
        "liquidity": ["treasury", "auction", "budget", "bank holiday", "holiday", "bond"],
        "sentiment": ["confidence", "sentiment", "expectations"],
    }
    for category, terms in categories.items():
        if any(term in text for term in terms):
            return category
    return "macro"


def classify_crypto_importance(event: dict[str, Any], category: str) -> str:
    currency = str(event.get("currency") or "").upper()
    impact = str(event.get("impact") or "").upper()
    if event.get("is_fallback"):
        return "medium" if impact == "HIGH" else "low"
    if currency == "USD" and impact == "HIGH":
        return "high"
    if category in {"central_bank", "inflation", "labor"} and impact in {"HIGH", "MEDIUM"}:
        return "high" if currency in {"USD", "GLOBAL"} else "medium"
    if category in {"liquidity", "growth"} and impact == "HIGH":
        return "medium"
    if impact == "HIGH":
        return "medium"
    return "low"


def build_event_surprise(event: dict[str, Any]) -> dict[str, Any] | None:
    actual = parse_number(event.get("actual"))
    forecast = parse_number(event.get("forecast"))
    if actual is None or forecast is None:
        return None
    delta = actual - forecast
    direction = "above_forecast" if delta > 0 else "below_forecast" if delta < 0 else "in_line"
    return {
        "actual": actual,
        "forecast": forecast,
        "delta": round(delta, 4),
        "direction": direction,
    }


def parse_number(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    multiplier = 1.0
    if text.endswith("%"):
        text = text[:-1]
    elif text[-1:].upper() == "K":
        text = text[:-1]
        multiplier = 1_000.0
    elif text[-1:].upper() == "M":
        text = text[:-1]
        multiplier = 1_000_000.0
    elif text[-1:].upper() == "B":
        text = text[:-1]
        multiplier = 1_000_000_000.0
    try:
        return float(text) * multiplier
    except ValueError:
        return None


def build_today_macro_desk(
    calendar: dict[str, Any],
    canonical_events: list[dict[str, Any]],
    deterministic: dict[str, Any],
    quality: dict[str, Any],
) -> dict[str, Any]:
    today = local_today().isoformat()
    tomorrow = (local_today() + timedelta(days=1)).isoformat()
    today_events = [event for event in canonical_events if event.get("date") == today]
    tomorrow_events = [event for event in canonical_events if event.get("date") == tomorrow]
    high_events = [event for event in canonical_events if event.get("impact") == "HIGH"]
    high_today = [event for event in today_events if event.get("impact") == "HIGH"]
    posture = "normal"
    if quality.get("status") in {"fallback", "stale"}:
        posture = "verify_calendar_first"
    elif high_today:
        posture = "reduce_size_until_post_event"
    elif deterministic.get("overall_risk") == "HIGH":
        posture = "selective_risk_only"

    next_event = next((event for event in canonical_events if not is_past_event(event)), canonical_events[0] if canonical_events else None)
    return {
        "date": today,
        "posture": posture,
        "overall_risk": deterministic.get("overall_risk"),
        "source_status": quality.get("status"),
        "headline": build_macro_headline(quality, deterministic, high_today, next_event),
        "next_event": next_event,
        "today_event_count": len(today_events),
        "today_high_impact_count": len(high_today),
        "tomorrow_event_count": len(tomorrow_events),
        "week_high_impact_count": len(high_events),
        "what_to_watch": build_watch_list(canonical_events),
    }


def is_past_event(event: dict[str, Any]) -> bool:
    try:
        parsed = datetime.fromisoformat(str(event.get("date_time")).replace("Z", "+00:00"))
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=LOCAL_TZ)
    return parsed.astimezone(LOCAL_TZ) < datetime.now(LOCAL_TZ)


def build_macro_headline(
    quality: dict[str, Any],
    deterministic: dict[str, Any],
    high_today: list[dict[str, Any]],
    next_event: dict[str, Any] | None,
) -> str:
    if quality.get("status") == "fallback":
        return "Calendar source is degraded; verify scheduled releases before trusting a quiet tape."
    if quality.get("status") in {"cached", "stale"}:
        return "Calendar is from a saved snapshot; use it as awareness, not certainty."
    if high_today:
        names = ", ".join(str(event.get("event_name")) for event in high_today[:2])
        return f"High-impact macro risk today: {names}."
    if next_event:
        return f"Next macro checkpoint: {next_event.get('time')} {next_event.get('currency')} {next_event.get('event_name')}."
    return f"Macro baseline risk is {deterministic.get('overall_risk', 'UNKNOWN')} with no scheduled high-impact event visible."


def build_watch_list(canonical_events: list[dict[str, Any]]) -> list[str]:
    watch: list[str] = []
    for event in canonical_events:
        if event.get("crypto_importance") == "high":
            watch.append(f"{event['event_id']}: {event.get('event_name')} can affect USD/rates/risk appetite.")
        if len(watch) >= 6:
            break
    return watch


def build_stand_aside_windows(canonical_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    windows: list[dict[str, Any]] = []
    for event in canonical_events:
        if event.get("crypto_importance") != "high":
            continue
        try:
            event_time = datetime.fromisoformat(str(event.get("date_time")).replace("Z", "+00:00")).astimezone(LOCAL_TZ)
        except ValueError:
            continue
        before = 45 if event.get("category") in {"central_bank", "inflation", "labor"} else 30
        after = 45 if event.get("category") in {"central_bank", "inflation", "labor"} else 30
        windows.append(
            {
                "event_id": event.get("event_id"),
                "label": f"{event.get('currency')} {event.get('event_name')}",
                "start": (event_time - timedelta(minutes=before)).isoformat(),
                "end": (event_time + timedelta(minutes=after)).isoformat(),
                "reason": "High crypto-relevant macro event; avoid opening fresh risk until liquidity stabilizes.",
                "confidence": event.get("confidence") or 85,
            }
        )
    return windows[:12]


def build_post_event_notes(canonical_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    for event in canonical_events:
        surprise = event.get("surprise")
        if not surprise:
            continue
        direction = surprise.get("direction")
        notes.append(
            {
                "event_id": event.get("event_id"),
                "event_name": event.get("event_name"),
                "surprise": surprise,
                "read": "Hotter/stronger than forecast; watch USD/yields tightening pressure." if direction == "above_forecast" else "Softer than forecast; watch risk appetite and rates relief." if direction == "below_forecast" else "In line with forecast; price reaction matters more than the print.",
            }
        )
    return notes[:10]


async def build_model_macro_read(
    *,
    calendar: dict[str, Any],
    news: dict[str, Any],
    holidays: dict[str, Any],
    quality: dict[str, Any],
    deterministic: dict[str, Any],
    canonical_events: list[dict[str, Any]],
    stand_aside_windows: list[dict[str, Any]],
) -> dict[str, Any]:
    fallback = deterministic_model_read(quality, deterministic, canonical_events, stand_aside_windows)
    system_prompt = (
        "You are a hedge fund macro risk analyst for a crypto/derivatives desk. "
        "Return strict JSON only. You must not invent events. Cite only event_id values from canonical_events. "
        "If source quality is cached, stale, or fallback, explicitly say confidence is reduced. "
        "Do not give direct buy/sell instructions; focus on risk windows, what to watch, and trading posture."
    )
    user_payload = {
        "required_schema": {
            "headline": "one sentence",
            "confidence": 0,
            "posture": "normal|selective_risk_only|reduce_size_until_post_event|verify_calendar_first",
            "key_event_ids": ["event_id"],
            "watch_before": ["string"],
            "watch_during": ["string"],
            "watch_after": ["string"],
            "operator_notes": ["string"],
        },
        "quality": quality,
        "deterministic": deterministic,
        "canonical_events": canonical_events[:40],
        "stand_aside_windows": stand_aside_windows[:12],
        "news": {"items": news.get("items", [])[:12], "warnings": news.get("warnings", [])},
        "holidays": {"holidays": holidays.get("holidays", [])[:12], "warnings": holidays.get("warnings", [])},
    }
    try:
        model, ai_meta = await complete_json(system_prompt=system_prompt, user_payload=user_payload, max_tokens=900)
        model = normalize_model_read(model, fallback, {str(event["event_id"]) for event in canonical_events})
        return {"model": model, "ai": ai_meta}
    except AIProviderError as exc:
        return {
            "model": fallback,
            "ai": {
                "provider": "deterministic",
                "model": None,
                "fallbackUsed": False,
                "errors": [{"provider": exc.provider, "message": exc.message}],
            },
        }


def deterministic_model_read(
    quality: dict[str, Any],
    deterministic: dict[str, Any],
    canonical_events: list[dict[str, Any]],
    stand_aside_windows: list[dict[str, Any]],
) -> dict[str, Any]:
    key_events = [event for event in canonical_events if event.get("crypto_importance") == "high"][:5]
    confidence = min(int(quality.get("confidence") or 50), 85)
    if quality.get("status") in {"fallback", "stale"}:
        posture = "verify_calendar_first"
    elif stand_aside_windows:
        posture = "reduce_size_until_post_event"
    elif deterministic.get("overall_risk") == "HIGH":
        posture = "selective_risk_only"
    else:
        posture = "normal"
    return {
        "headline": build_macro_headline(quality, deterministic, [event for event in key_events if event.get("date") == local_today().isoformat()], key_events[0] if key_events else None),
        "confidence": confidence,
        "posture": posture,
        "key_event_ids": [event["event_id"] for event in key_events],
        "watch_before": ["Confirm source status is fresh before sizing up.", "Mark high-impact event times on the intraday plan."],
        "watch_during": ["Avoid opening fresh risk into high-impact release windows.", "Watch spread, liquidation pressure, and BTC reaction after the print."],
        "watch_after": ["Wait for post-event liquidity clarity before treating the move as signal.", "Record surprise vs forecast when actual data is available."],
        "operator_notes": deterministic.get("recommendations", []),
    }


def normalize_model_read(model: dict[str, Any], fallback: dict[str, Any], valid_event_ids: set[str]) -> dict[str, Any]:
    key_event_ids = [
        str(event_id)
        for event_id in model.get("key_event_ids", [])
        if str(event_id) in valid_event_ids
    ]
    confidence = model.get("confidence", fallback["confidence"])
    try:
        confidence_int = max(0, min(100, int(confidence)))
    except (TypeError, ValueError):
        confidence_int = fallback["confidence"]
    posture = str(model.get("posture") or fallback["posture"])
    if posture not in {"normal", "selective_risk_only", "reduce_size_until_post_event", "verify_calendar_first"}:
        posture = fallback["posture"]
    return {
        "headline": str(model.get("headline") or fallback["headline"]),
        "confidence": confidence_int,
        "posture": posture,
        "key_event_ids": key_event_ids or fallback["key_event_ids"],
        "watch_before": model.get("watch_before") if isinstance(model.get("watch_before"), list) else fallback["watch_before"],
        "watch_during": model.get("watch_during") if isinstance(model.get("watch_during"), list) else fallback["watch_during"],
        "watch_after": model.get("watch_after") if isinstance(model.get("watch_after"), list) else fallback["watch_after"],
        "operator_notes": model.get("operator_notes") if isinstance(model.get("operator_notes"), list) else fallback["operator_notes"],
    }


def dedupe_strings(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


async def get_weekly_brief(days: int = 7, force: bool = False) -> dict[str, Any]:
    global _brief_cache, _brief_cache_key, _brief_cache_at
    calendar, news, holidays = await asyncio.gather(
        get_calendar_week(days=days, force=force),
        get_macro_news(days=days, force=force),
        get_bank_holidays(days=days, force=force),
    )
    inputs = {"calendar": calendar, "news": news, "holidays": holidays, "days": days}
    cache_key = hashlib.sha1(str(inputs).encode("utf-8")).hexdigest()
    if not force and _brief_cache and _brief_cache_key == cache_key and time.time() - _brief_cache_at <= AI_BRIEF_CACHE_SECONDS:
        return _brief_cache

    deterministic = deterministic_analysis(calendar, news, holidays)
    system_prompt = (
        "You are a hedge fund macro risk analyst for a one-person crypto/derivatives desk. "
        "Return strict JSON only. Do not provide financial advice or direct trade instructions. "
        "Focus on weekly awareness: catalysts, bank holidays, liquidity, no-trade windows, and alerts."
    )
    user_payload = {
        "required_schema": {
            "overall_risk": "LOW|MEDIUM|HIGH",
            "executive_summary": "short paragraph",
            "critical_days": [{"date": "YYYY-MM-DD", "risk_level": "LOW|MEDIUM|HIGH", "why": "string", "trading_posture": "string"}],
            "watch_items": ["string"],
            "stand_aside_windows": ["string"],
            "bank_holiday_notes": ["string"],
            "news_catalysts": ["string"],
            "recommendations": ["string"],
        },
        "deterministic_baseline": deterministic,
        "calendar": calendar,
        "news": news,
        "holidays": holidays,
    }
    try:
        brief, ai_meta = await complete_json(system_prompt=system_prompt, user_payload=user_payload)
    except AIProviderError as exc:
        brief = {
            "overall_risk": deterministic["overall_risk"],
            "executive_summary": "AI providers are unavailable. Showing deterministic macro risk analysis.",
            "critical_days": [
                {
                    "date": item["date"],
                    "risk_level": item["risk_level"],
                    "why": item["trading_recommendation"],
                    "trading_posture": item["trading_recommendation"],
                }
                for item in deterministic["critical_days"]
            ],
            "watch_items": deterministic["recommendations"],
            "stand_aside_windows": [],
            "bank_holiday_notes": [f"{item['date']} {item['country']}: {item['name']}" for item in holidays.get("holidays", [])],
            "news_catalysts": [item["title"] for item in news.get("items", [])[:5]],
            "recommendations": deterministic["recommendations"],
        }
        ai_meta = {"provider": "deterministic", "model": None, "fallbackUsed": False, "errors": [{"provider": exc.provider, "message": exc.message}]}

    _brief_cache = {
        "brief": normalize_brief(brief, deterministic),
        "ai": ai_meta,
        "calendar": calendar,
        "news": news,
        "holidays": holidays,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _brief_cache_key = cache_key
    _brief_cache_at = time.time()
    return _brief_cache


def deterministic_analysis(calendar: dict[str, Any], news: dict[str, Any], holidays: dict[str, Any]) -> dict[str, Any]:
    critical_days: list[dict[str, Any]] = []
    event_clusters: list[dict[str, Any]] = []
    max_risk_score = 0
    for day, events in calendar.get("events_by_day", {}).items():
        high = sum(1 for event in events if event.get("impact") == "HIGH")
        medium = sum(1 for event in events if event.get("impact") == "MEDIUM")
        score = high * 3 + medium * 2 + max(0, len(events) - high - medium)
        max_risk_score = max(max_risk_score, score)
        if score >= 3:
            risk = "HIGH" if score >= 6 else "MEDIUM"
            critical_days.append(
                {
                    "date": day,
                    "risk_level": risk,
                    "trading_recommendation": "Reduce size and wait for post-event liquidity clarity." if risk == "HIGH" else "Stay alert; require cleaner confirmations.",
                    "event_count": len(events),
                }
            )
        if len(events) >= 3:
            event_clusters.append({"date": day, "time": events[0].get("time", "n/a"), "event_count": len(events), "risk": "HIGH" if high else "MEDIUM"})

    high_news = [item for item in news.get("items", []) if item.get("impact") == "HIGH"]
    if len(high_news) >= 4:
        max_risk_score = max(max_risk_score, 6)
    elif high_news:
        max_risk_score = max(max_risk_score, 3)
    if holidays.get("holidays"):
        max_risk_score = max(max_risk_score, 2)

    overall = "HIGH" if max_risk_score >= 6 else "MEDIUM" if max_risk_score >= 3 else "LOW"
    recommendations = []
    if calendar.get("warning"):
        recommendations.append(f"Calendar source warning: {calendar['warning']}. Do not treat an empty calendar as low risk.")
    if high_news:
        recommendations.append(f"{len(high_news)} high-impact news items in feed. Review catalysts before opening new trades.")
    if holidays.get("holidays"):
        recommendations.append("Bank holidays detected. Watch liquidity, settlement, and session handoff risk.")
    if not recommendations:
        recommendations.append("No major macro catalyst detected in available sources.")

    return {
        "overall_risk": overall,
        "critical_days": critical_days,
        "recommendations": recommendations,
        "event_clusters": event_clusters,
    }


def normalize_brief(brief: dict[str, Any], deterministic: dict[str, Any]) -> dict[str, Any]:
    return {
        "overall_risk": str(brief.get("overall_risk") or deterministic["overall_risk"]).upper(),
        "executive_summary": str(brief.get("executive_summary") or "Macro brief generated from available calendar, news, and holiday data."),
        "critical_days": brief.get("critical_days") if isinstance(brief.get("critical_days"), list) else [],
        "watch_items": brief.get("watch_items") if isinstance(brief.get("watch_items"), list) else [],
        "stand_aside_windows": brief.get("stand_aside_windows") if isinstance(brief.get("stand_aside_windows"), list) else [],
        "bank_holiday_notes": brief.get("bank_holiday_notes") if isinstance(brief.get("bank_holiday_notes"), list) else [],
        "news_catalysts": brief.get("news_catalysts") if isinstance(brief.get("news_catalysts"), list) else [],
        "recommendations": brief.get("recommendations") if isinstance(brief.get("recommendations"), list) else deterministic["recommendations"],
    }


async def test_ai_provider() -> dict[str, Any]:
    payload = {
        "test": True,
        "calendar": {"events_by_day": {}, "count": 0},
        "news": {"items": [{"title": "Federal Reserve policy expectations move yields", "impact": "HIGH"}]},
        "holidays": {"holidays": []},
    }
    try:
        result, meta = await complete_json(
            system_prompt="Return JSON only with keys ok, provider_note, and risk.",
            user_payload=payload,
            max_tokens=300,
        )
        return {"success": True, "result": result, "ai": meta, "status": provider_status()}
    except AIProviderError as exc:
        return {"success": False, "error": exc.message, "provider": exc.provider, "status": provider_status()}
