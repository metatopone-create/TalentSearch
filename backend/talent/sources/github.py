"""GitHub REST API: find people by user search or through the repositories they maintain or contribute to."""

from __future__ import annotations

import asyncio

import httpx

from ..config import settings
from . import Lead, RawEvidence, SourceError

API = "https://api.github.com"


def _headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


class GitHub:
    def __init__(self, http: httpx.AsyncClient):
        self.http = http
        self._profiles: dict[str, Lead] = {}

    async def _get(self, path: str, params: dict | None = None) -> object:
        try:
            response = await self.http.get(API + path, params=params, headers=_headers(), timeout=20)
        except httpx.HTTPError as exc:
            raise SourceError(f"GitHub unreachable: {exc}") from exc
        if response.status_code == 403 and response.headers.get("x-ratelimit-remaining") == "0":
            raise SourceError("GitHub rate limit reached — set GITHUB_TOKEN for higher limits")
        if response.status_code >= 400:
            raise SourceError(f"GitHub returned {response.status_code}")
        return response.json()

    async def profile(self, login: str) -> Lead:
        """A person's profile plus their most-starred recent repositories, as one lead."""
        if login in self._profiles:
            return self._profiles[login]
        user, repos = await asyncio.gather(
            self._get(f"/users/{login}"),
            self._get(f"/users/{login}/repos", {"sort": "pushed", "per_page": 30, "type": "owner"}),
        )
        assert isinstance(user, dict) and isinstance(repos, list)
        lead = Lead(
            name=user.get("name") or login,
            github=login,
            homepage=_normal_url(user.get("blog")),
            company=(user.get("company") or "").lstrip("@").strip(),
            location=user.get("location") or "",
            sources={"github"},
        )
        if user.get("bio"):
            lead.hints.append(f"GitHub bio: {user['bio']}")
        lead.evidence.append(
            RawEvidence(
                kind="code",
                title=f"github.com/{login}",
                url=user.get("html_url") or f"https://github.com/{login}",
                description=user.get("bio") or "GitHub profile",
                meta={"followers": user.get("followers"), "public_repos": user.get("public_repos"),
                      "location": user.get("location"), "company": user.get("company")},
            )
        )
        own = [r for r in repos if not r.get("fork")]
        own.sort(key=lambda r: r.get("stargazers_count", 0), reverse=True)
        for repo in own[:4]:
            lead.evidence.append(_repo_evidence(repo))
        self._profiles[login] = lead
        return lead

    async def search_users(self, query: str, limit: int = 8) -> tuple[list[Lead], list[str]]:
        data = await self._get("/search/users", {"q": query, "per_page": limit})
        assert isinstance(data, dict)
        logins = [item["login"] for item in data.get("items", []) if item.get("type") == "User"]
        leads = await self._profiles_for(logins)
        return leads, [f"https://github.com/{l}" for l in logins]

    async def search_repos(self, query: str, repos: int = 3, per_repo: int = 5) -> tuple[list[Lead], list[str]]:
        """Owners and top contributors of the best matching repositories."""
        data = await self._get("/search/repositories", {"q": query, "sort": "stars", "per_page": repos})
        assert isinstance(data, dict)
        logins: list[str] = []
        urls: list[str] = []
        repo_evidence: dict[str, list[RawEvidence]] = {}
        for repo in data.get("items", [])[:repos]:
            urls.append(repo["html_url"])
            contributors = await self._get(f"/repos/{repo['full_name']}/contributors", {"per_page": per_repo})
            assert isinstance(contributors, list)
            for person in contributors:
                if person.get("type") != "User":
                    continue
                login = person["login"]
                if login not in logins:
                    logins.append(login)
                repo_evidence.setdefault(login, []).append(
                    RawEvidence(
                        kind="code",
                        title=repo["full_name"],
                        url=f"{repo['html_url']}/commits?author={login}",
                        description=f"{person.get('contributions', 0)} commits · {repo.get('description') or ''}".strip(" ·"),
                        meta={"stars": repo.get("stargazers_count"), "language": repo.get("language"),
                              "contributions": person.get("contributions")},
                    )
                )
        leads = await self._profiles_for(logins)
        for lead in leads:
            existing = {e.url for e in lead.evidence}
            lead.evidence.extend(e for e in repo_evidence.get(lead.github or "", []) if e.url not in existing)
        return leads, urls

    async def _profiles_for(self, logins: list[str]) -> list[Lead]:
        results = await asyncio.gather(*(self.profile(l) for l in logins), return_exceptions=True)
        return [r for r in results if isinstance(r, Lead)]


def _repo_evidence(repo: dict) -> RawEvidence:
    return RawEvidence(
        kind="code",
        title=repo["full_name"],
        url=repo["html_url"],
        description=repo.get("description") or "",
        meta={"stars": repo.get("stargazers_count"), "language": repo.get("language"),
              "pushed_at": (repo.get("pushed_at") or "")[:10]},
    )


def _normal_url(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    return value if value.startswith("http") else "https://" + value
