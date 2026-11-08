"""Fetch layer over the published Sardegna MeteoLive data repository.

Short TTL in-memory cache + last-good fallback: a failing source never wipes
what was already validly downloaded, and the caller is told it is serving a
retained copy (``retained=True``).
"""

import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DATA_BASE = "https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/main/"
RADAR_API = "https://radar-api.protezionecivile.it"

DEFAULT_TTL = 60  # seconds — the collectors publish every ~10 min, no need to hammer GitHub


@dataclass
class Fetched:
    data: Any
    fetched_at: float
    retained: bool = False  # True when serving last-good copy after a failed refresh
    error: str | None = None


_cache: dict[str, Fetched] = {}
_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=20.0, follow_redirects=True,
                                    headers={"User-Agent": "SardegnaMeteoLive/2.0"})
    return _client


async def fetch_json(url: str, ttl: int = DEFAULT_TTL) -> Fetched | None:
    now = time.time()
    hit = _cache.get(url)
    if hit and not hit.retained and now - hit.fetched_at < ttl:
        return hit
    try:
        bust = f"{'&' if '?' in url else '?'}t={int(now // ttl)}"  # bust CDN caches between TTL windows
        r = await _http().get(url + bust)
        r.raise_for_status()
        entry = Fetched(data=r.json(), fetched_at=now)
        _cache[url] = entry
        return entry
    except Exception as exc:  # network / JSON errors — keep the last valid copy
        logger.warning("fetch %s failed: %s", url, exc)
        if hit:
            hit.retained = True
            hit.error = str(exc)[:200]
            return hit
        return None


async def fetch_data(path: str, ttl: int = DEFAULT_TTL) -> Fetched | None:
    return await fetch_json(DATA_BASE + path, ttl)
