"""Web discovery through Claude's web search tool, and homepage fetching for verification."""

from __future__ import annotations

import html
import re
from datetime import date

import httpx

from ..llm import Claude
from . import Lead, RawEvidence, SourceError, domain_of

WEB_SYSTEM = """You find specific people on the public web for a recruiter. Search, then reply with ONLY a JSON \
array (no prose) of up to 8 real people you found, each:
{"name": str, "role": str, "company": str, "location": str, "url": str, "page_title": str, "snippet": str}
`url` must be a page from your search results that mentions the person; `snippet` quotes or closely \
paraphrases what that page says about them. Use "" for anything the page doesn't state. Never invent people."""


async def search_web(claude: Claude, query: str, goal: str) -> tuple[list[Lead], list[str], float, int]:
    result = await claude.web_search(WEB_SYSTEM, f"Who we're looking for: {goal}\nSearch for: {query}", max_uses=2)
    people = result.data if isinstance(result.data, list) else []
    leads: list[Lead] = []
    allowed = {u.rstrip("/") for u in result.urls}
    allowed_domains = {domain_of(u) for u in result.urls}
    today = date.today().isoformat()
    for person in people:
        if not isinstance(person, dict) or not person.get("name"):
            continue
        url = str(person.get("url") or "")
        # Only keep people tied to a page (or at least a site) the search actually returned.
        if url.rstrip("/") not in allowed and domain_of(url) not in allowed_domains:
            continue
        leads.append(
            Lead(
                name=person["name"],
                role=person.get("role", ""),
                company=person.get("company", ""),
                location=person.get("location", ""),
                sources={"web"},
                evidence=[RawEvidence(kind="web", title=person.get("page_title") or domain_of(url), url=url,
                                      description=person.get("snippet", ""),
                                      meta={"domain": domain_of(url), "fetched": today})],
            )
        )
    return leads, result.urls, result.cost, result.web_searches


_TAG = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>|<[^>]+>", re.S | re.I)
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)


async def fetch_homepage(http: httpx.AsyncClient, url: str, max_chars: int = 5000) -> RawEvidence:
    try:
        response = await http.get(url, timeout=15, follow_redirects=True,
                                  headers={"User-Agent": "TalentSearch/0.1 (+evidence check)"})
    except httpx.HTTPError as exc:
        raise SourceError(f"Homepage unreachable: {exc}") from exc
    if response.status_code >= 400 or "html" not in response.headers.get("content-type", "html"):
        raise SourceError(f"Homepage returned {response.status_code}")
    page = response.text
    title_match = _TITLE.search(page)
    title = html.unescape(title_match.group(1)).strip() if title_match else domain_of(url)
    text = re.sub(r"\s+", " ", html.unescape(_TAG.sub(" ", page))).strip()
    return RawEvidence(kind="web", title=title[:140], url=str(response.url), description=text[:max_chars],
                       meta={"domain": domain_of(url), "fetched": date.today().isoformat()})
