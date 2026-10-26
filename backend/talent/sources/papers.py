"""OpenAlex works search: authors of relevant recent papers, with venue, year and citation counts."""

from __future__ import annotations

import httpx

from ..config import settings
from . import Lead, RawEvidence, SourceError

API = "https://api.openalex.org/works"


async def search_papers(http: httpx.AsyncClient, query: str, since_year: int = 2021, limit: int = 12,
                        authors_per_paper: int = 3) -> tuple[list[Lead], list[str]]:
    params = {
        "search": query,
        "filter": f"from_publication_date:{since_year}-01-01",
        "sort": "cited_by_count:desc",
        "per_page": limit,
    }
    if settings.openalex_mailto:
        params["mailto"] = settings.openalex_mailto
    try:
        response = await http.get(API, params=params, timeout=25)
    except httpx.HTTPError as exc:
        raise SourceError(f"Paper search unreachable: {exc}") from exc
    if response.status_code >= 400:
        raise SourceError(f"Paper search returned {response.status_code}")
    leads: list[Lead] = []
    urls: list[str] = []
    for work in response.json().get("results", []):
        url = (work.get("primary_location") or {}).get("landing_page_url") or work.get("doi") or work.get("id")
        urls.append(url)
        venue = ((work.get("primary_location") or {}).get("source") or {}).get("display_name") or ""
        authorships = work.get("authorships") or []
        names = [a["author"]["display_name"] for a in authorships if a.get("author")]
        evidence = RawEvidence(
            kind="paper",
            title=work.get("display_name") or work.get("title") or "Untitled",
            url=url,
            description=", ".join(names[:4]) + (" et al." if len(names) > 4 else ""),
            meta={"venue": venue, "year": work.get("publication_year"), "citations": work.get("cited_by_count")},
        )
        for authorship in authorships[:authors_per_paper]:
            author = authorship.get("author") or {}
            if not author.get("display_name"):
                continue
            institutions = authorship.get("institutions") or []
            inst = institutions[0] if institutions else {}
            lead = Lead(
                name=author["display_name"],
                scholar=author.get("id"),
                company=inst.get("display_name", ""),
                location=inst.get("country_code") or "",
                sources={"papers"},
                evidence=[evidence],
            )
            if inst.get("country_code"):
                lead.hints.append(f"Affiliation on paper: {inst.get('display_name')} ({inst['country_code']})")
            leads.append(lead)
    return leads, urls
