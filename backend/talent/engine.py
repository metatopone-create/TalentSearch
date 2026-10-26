"""The search run: plan → source queries → discovery (trace) → verification → summary.

Discovery and verification overlap: people are queued for verification as soon as a source returns them,
so the results table fills while the trace is still running. Every state change is published as an event
for the live view and kept on `SearchState` for later reads.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

import httpx

from .config import settings
from .llm import Claude, LLMError, strict_object
from .models import Candidate, ConditionCheck, Evidence, Plan, ReasonSentence, SearchState, Summary, TraceStep
from .sources import Lead, RawEvidence, SourceError, domain_of, domain_summary
from .sources.github import GitHub
from .sources.papers import search_papers
from .sources.web import fetch_homepage, search_web

Publish = Callable[[str, Any], None]


# Typical cost of one verification call; reserved up front so parallel checks can't overshoot the budget.
VERIFY_COST_GUESS = 0.02


class BudgetReached(Exception):
    pass


class Stopped(Exception):
    pass


# ---------- Prompts and schemas ----------

QUERY_SYSTEM = """You write search queries that find specific people matching a hiring plan.
- github_users: 1–2 GitHub user-search queries (GitHub qualifiers allowed, e.g. `location:"United States"`, \
`language:cuda`). Keep each one short: user search matches profile name, bio, location and login only.
- github_repos: 2–3 GitHub repository-search queries for the projects such people build or contribute to \
(e.g. `vllm`, `topic:quantization stars:>200`). We take owners and top contributors.
- papers: 2 short keyword queries for a research-paper index (no boolean operators).
- web: 1–2 web-search queries that surface team pages, talks, or blog posts naming individual people.
Respect the focus area if one is given."""

QUERY_SCHEMA = strict_object({k: {"type": "array", "items": {"type": "string"}}
                              for k in ("github_users", "github_repos", "papers", "web")})

VERIFY_SYSTEM = """You check one person against a hiring plan using ONLY the numbered evidence provided. \
You are careful and evidence-first: a recruiter will read your claims and click each reference.

Decide:
- status: "verified" if every Must condition is supported by the evidence AND at least two independent sources \
(different sites) agree this is the same person; "lead" if the person looks relevant but a Must condition is \
unconfirmed or only one source speaks for them; "no_match" if the evidence clearly shows a Must condition fails \
(for example they are based elsewhere); "insufficient" if the evidence is too thin or contradictory to tell who \
this is or what they do.
- score: 0–100 fit for the plan (Must conditions dominate; Preferred conditions and depth of work add).
- name, role, company, location: as best supported by evidence; "" when unknown. Location as "City, ST" or \
"City, Country".
- summary: one sentence, at most 22 words, semicolon-separated facts, e.g. "Maintains a popular inference kernel \
library; 2 papers on 4-bit quantization; US-based."
- reasons: 2–4 short sentences, each with the evidence ids that support it (e.g. ["e1","e3"]). Never state \
anything without a reference.
- checks: one entry per plan condition, in order, with met = yes | no | unknown and supporting evidence ids.
- tags: up to 4 short skill tags.
- exclusion: for no_match or insufficient, one sentence on why; otherwise "".
"""

VERIFY_SCHEMA = strict_object({
    "status": {"type": "string", "enum": ["verified", "lead", "no_match", "insufficient"]},
    "score": {"type": "integer"},
    "name": {"type": "string"},
    "role": {"type": "string"},
    "company": {"type": "string"},
    "location": {"type": "string"},
    "summary": {"type": "string"},
    "reasons": {"type": "array", "items": strict_object({"text": {"type": "string"},
                                                         "refs": {"type": "array", "items": {"type": "string"}}})},
    "checks": {"type": "array", "items": strict_object({
        "text": {"type": "string"},
        "met": {"type": "string", "enum": ["yes", "no", "unknown"]},
        "refs": {"type": "array", "items": {"type": "string"}},
    })},
    "tags": {"type": "array", "items": {"type": "string"}},
    "exclusion": {"type": "string"},
})

SUMMARY_SYSTEM = """You summarize a finished people search for a recruiter in plain, specific language.
- text: 2–3 sentences: where qualified people tend to work, which sub-areas are dense or thin, and how many were \
excluded and why. No hype.
- areas: 2–4 sub-areas of the plan with how many qualified people fall in each.
- followups: exactly 3 short follow-up searches phrased as button labels (e.g. "Expand to Canada")."""

SUMMARY_SCHEMA = strict_object({
    "text": {"type": "string"},
    "areas": {"type": "array", "items": strict_object({"name": {"type": "string"}, "count": {"type": "integer"}})},
    "followups": {"type": "array", "items": {"type": "string"}},
})


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def plan_text(plan: Plan) -> str:
    lines = [f"Request: {plan.query}", f"Goal: {plan.goal}"]
    if plan.focus and plan.focus.lower() != "any":
        lines.append(f"Focus area: {plan.focus}")
    lines.append("Conditions:")
    lines += [f"- [{c.importance.capitalize()}] {c.text}" for c in plan.conditions]
    return "\n".join(lines)


# ---------- The run ----------

class SearchRun:
    def __init__(self, state: SearchState, publish: Publish, claude: Claude | None = None,
                 http: httpx.AsyncClient | None = None):
        self.state = state
        self.publish = publish
        self.claude = claude or Claude()
        self.http = http
        self.stop_requested = False
        self.started = time.monotonic()
        self._leads: dict[str, Lead] = {}  # candidate id -> merged lead
        self._key_index: dict[str, str] = {}  # lead key -> candidate id
        self._queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._dirty: set[str] = set()  # candidates waiting for a (re)check
        self._checks: dict[str, int] = {}  # how many times each candidate was checked
        self._reserved = 0.0  # expected cost of verification calls in flight
        for c in state.candidates:  # resuming a saved search: rebuild what we knew about each person
            lead = Lead(name=c.name, github=c.links.get("github", "").rsplit("/", 1)[-1] or None,
                        homepage=c.links.get("homepage"), scholar=c.links.get("scholar"), role=c.role,
                        company=c.company, location=c.location, sources=set(c.sources),
                        evidence=[RawEvidence(kind=e.kind, title=e.title, url=e.url, description=e.description,
                                              meta=dict(e.meta)) for e in c.evidence])
            self._leads[c.id] = lead
            for k in lead.keys:
                self._key_index.setdefault(k, c.id)
        self._pending_queries: list[tuple[str, str]] | None = None  # (kind, query) not yet run

    # ----- bookkeeping -----

    def charge(self, source: str, dollars: float) -> None:
        self.state.cost = round(self.state.cost + dollars, 4)
        self.state.cost_by_source[source] = round(self.state.cost_by_source.get(source, 0.0) + dollars, 4)
        self.publish("progress", self.progress())

    def check_limits(self, upcoming: float = 0.0) -> None:
        """Raise if stopped, or if spend so far plus calls already in flight plus `upcoming` would pass the budget."""
        if self.stop_requested:
            raise Stopped()
        if self.state.cost + self._reserved + upcoming > self.state.budget:
            raise BudgetReached()

    def progress(self) -> dict[str, Any]:
        counts = {s: 0 for s in ("pending", "verified", "lead", "insufficient", "no_match")}
        for c in self.state.candidates:
            counts[c.status] += 1
        return {"cost": self.state.cost, "budget": self.state.budget, "sources_checked": self.state.sources_checked,
                "people": len(self.state.candidates), "counts": counts,
                "elapsed": round(time.monotonic() - self.started, 1)}

    def _step(self, action: str, query: str) -> TraceStep:
        step = TraceStep(id=uuid.uuid4().hex[:8], action=action, query=query)
        self.state.trace.append(step)
        self.publish("trace", step.model_dump())
        return step

    def _finish_step(self, step: TraceStep, started: float, *, urls: list[str] | None = None, found: str = "",
                     failed: str = "") -> None:
        step.seconds = round(time.monotonic() - started, 1)
        if failed:
            step.status, step.note = "failed", failed
        else:
            step.status, step.found = "done", found
            step.domains = domain_summary(urls or [])
            self.state.sources_checked += 1
        self.publish("trace", step.model_dump())
        self.publish("progress", self.progress())

    # ----- leads → candidates -----

    def _add_leads(self, leads: list[Lead]) -> tuple[int, int]:
        """Returns (new people, already-known people who gained evidence)."""
        new, updated = 0, 0
        for lead in leads:
            existing = next((self._key_index[k] for k in lead.keys if k in self._key_index), None)
            if existing:
                for k in lead.keys:
                    self._key_index.setdefault(k, existing)
                if self._leads[existing].merge(lead):
                    updated += 1
                    self._schedule(existing)
                continue
            if len(self._leads) >= settings.max_candidates:
                continue
            cid = uuid.uuid4().hex[:10]
            self._leads[cid] = lead
            for k in lead.keys:
                self._key_index[k] = cid
            candidate = Candidate(id=cid, name=lead.name, role=lead.role, company=lead.company,
                                  location=lead.location, sources=sorted(lead.sources))
            self.state.candidates.append(candidate)
            self.publish("candidate", candidate.model_dump())
            self._schedule(cid)
            new += 1
        return new, updated

    def _schedule(self, cid: str) -> None:
        """Queue a (re)check. New evidence about someone already checked earns them another look, up to a cap."""
        if cid in self._dirty or self._checks.get(cid, 0) >= 3:
            return
        self._dirty.add(cid)
        self._queue.put_nowait(cid)

    def _candidate(self, cid: str) -> Candidate:
        return next(c for c in self.state.candidates if c.id == cid)

    # ----- discovery -----

    async def _queries(self) -> list[tuple[str, str]]:
        if self._pending_queries is not None:
            return self._pending_queries
        step = self._step("Planned queries", self.state.plan.goal)
        started = time.monotonic()
        result = await self.claude.structured(QUERY_SYSTEM, plan_text(self.state.plan), QUERY_SCHEMA, effort="low",
                                              max_tokens=4000)
        self.charge("ai", result.cost)
        data = result.data
        # Interleave sources (round-robin) so early results come from several places.
        lanes = [[("github_repos", q) for q in data["github_repos"][:3]],
                 [("papers", q) for q in data["papers"][:2]],
                 [("github_users", q) for q in data["github_users"][:2]],
                 [("web", q) for q in data["web"][:2]]]
        queries = [lane[i] for i in range(3) for lane in lanes if i < len(lane)]
        self._finish_step(step, started, found=f"{len(queries)} queries")
        self._pending_queries = queries
        return queries

    async def _discover(self, github: GitHub) -> None:
        queries = await self._queries()
        while queries:
            self.check_limits()
            if self._verified_count() >= self.state.plan.target:
                break
            kind, query = queries[0]
            if kind == "web":
                self.check_limits(upcoming=0.05)  # two searches plus reading the results
            action ={"github_users": "Searched GitHub", "github_repos": "Searched GitHub",
                      "papers": "Searched papers", "web": "Searched the web"}[kind]
            step = self._step(action, query)
            started = time.monotonic()
            try:
                if kind == "github_users":
                    leads, urls = await github.search_users(query)
                elif kind == "github_repos":
                    leads, urls = await github.search_repos(query)
                elif kind == "papers":
                    leads, urls = await search_papers(self.http, query)
                else:
                    leads, urls, cost, searches = await search_web(self.claude, query, self.state.plan.goal)
                    self.charge("web", searches * settings.price_web_search)
                    self.charge("ai", cost - searches * settings.price_web_search)
            except (SourceError, LLMError) as exc:
                note = str(exc)
                if kind == "web":
                    note = "Web search unavailable — results from GitHub and papers only"
                self._finish_step(step, started, failed=note)
                queries.pop(0)
                continue
            new, updated = self._add_leads(leads)
            found = f"{new} new {'person' if new == 1 else 'people'}" + (f" · {updated} updated" if updated else "")
            self._finish_step(step, started, urls=urls, found=found)
            queries.pop(0)

    def _verified_count(self) -> int:
        return sum(1 for c in self.state.candidates if c.status == "verified")

    # ----- verification -----

    async def _enrich(self, lead: Lead, github: GitHub) -> None:
        if lead.github and not any(e.title == f"github.com/{lead.github}" for e in lead.evidence):
            try:
                lead.merge(await github.profile(lead.github))
            except SourceError:
                pass
        if lead.homepage and "homepage" not in lead.sources:
            self.check_limits()
            step = self._step("Checked homepage", lead.homepage.split("://", 1)[-1].removeprefix("www.").rstrip("/"))
            started = time.monotonic()
            try:
                evidence = await fetch_homepage(self.http, lead.homepage)
            except SourceError as exc:
                self._finish_step(step, started, failed=str(exc))
                return
            lead.evidence.append(evidence)
            lead.sources.add("homepage")
            self._finish_step(step, started, urls=[lead.homepage], found=f"read {lead.name}'s page")

    async def _verify(self, cid: str, github: GitHub) -> None:
        lead = self._leads[cid]
        await self._enrich(lead, github)
        self.check_limits(upcoming=VERIFY_COST_GUESS)
        self._reserved += VERIFY_COST_GUESS
        try:
            await self._check_person(cid, lead)
        finally:
            self._reserved -= VERIFY_COST_GUESS

    async def _check_person(self, cid: str, lead: Lead) -> None:
        evidence =[Evidence(id=f"e{i + 1}", kind=e.kind, title=e.title, url=e.url, description=e.description,
                             meta={k: v for k, v in e.meta.items() if v not in (None, "")})
                    for i, e in enumerate(lead.evidence[:14])]
        lines = [plan_text(self.state.plan), "", f"Person: {lead.name}"]
        lines += [f"Hint: {h}" for h in lead.hints[:4]]
        lines.append("Evidence:")
        for e in evidence:
            meta = ", ".join(f"{k}: {v}" for k, v in e.meta.items())
            lines.append(f"[{e.id}] ({e.kind}) {e.title} — {e.url}\n    {e.description[:1500]}" + (f"\n    {meta}" if meta else ""))
        result = await self.claude.structured(VERIFY_SYSTEM, "\n".join(lines), VERIFY_SCHEMA, effort="low",
                                              max_tokens=6000)
        self.charge("ai", result.cost)
        self._apply_verdict(cid, result.data, evidence, lead)

    def _apply_verdict(self, cid: str, data: dict, evidence: list[Evidence], lead: Lead) -> None:
        ids = {e.id for e in evidence}
        candidate = self._candidate(cid)
        status = data["status"]
        independent = {domain_of(e.url) for e in evidence}
        # Evidence-first guard: "verified" needs at least two independent sites behind it.
        if status == "verified" and len(independent) < 2:
            status = "lead"
        candidate.status = status
        candidate.score = max(0, min(100, int(data["score"])))
        candidate.name = data["name"] or candidate.name
        candidate.role = data["role"]
        candidate.company = data["company"]
        candidate.location = data["location"]
        candidate.summary = data["summary"]
        candidate.reasons = [ReasonSentence(text=r["text"], refs=[x for x in r["refs"] if x in ids])
                             for r in data["reasons"]]
        conds = self.state.plan.conditions
        candidate.checks = [ConditionCheck(text=conds[i].text if i < len(conds) else ch["text"],
                                           importance=conds[i].importance if i < len(conds) else "preferred",
                                           met=ch["met"], refs=[x for x in ch["refs"] if x in ids])
                            for i, ch in enumerate(data["checks"])]
        candidate.tags = data["tags"][:4]
        candidate.exclusion = data["exclusion"] if status in ("no_match", "insufficient") else ""
        candidate.evidence = evidence
        candidate.sources = sorted(lead.sources)
        candidate.links = {k: v for k, v in (("github", f"https://github.com/{lead.github}" if lead.github else None),
                                              ("homepage", lead.homepage), ("scholar", lead.scholar)) if v}
        self.publish("candidate", candidate.model_dump())
        self.publish("progress", self.progress())

    async def _verify_worker(self, github: GitHub) -> None:
        while True:
            cid = await self._queue.get()
            if cid is None:
                return
            if cid not in self._dirty:
                continue
            self._dirty.discard(cid)
            self._checks[cid] = self._checks.get(cid, 0) + 1
            try:
                await self._verify(cid, github)
            except (LLMError, SourceError) as exc:
                candidate = self._candidate(cid)
                candidate.status = "insufficient"
                candidate.exclusion = f"Could not be checked: {exc}"
                self.publish("candidate", candidate.model_dump())

    # ----- summary -----

    async def _summarize(self) -> None:
        lines = [plan_text(self.state.plan), "", "Results:"]
        for c in self.state.candidates:
            lines.append(f"- {c.status}: {c.name}, {c.role} at {c.company}, {c.location}; tags {', '.join(c.tags)}"
                         + (f"; excluded because {c.exclusion}" if c.exclusion else ""))
        if not self.state.candidates:
            self.state.summary = Summary(text="No one was found for this plan.", followups=[])
            return
        result = await self.claude.structured(SUMMARY_SYSTEM, "\n".join(lines), SUMMARY_SCHEMA, effort="low",
                                              max_tokens=3000)
        self.charge("ai", result.cost)
        data = result.data
        self.state.summary = Summary(text=data["text"], areas=[(a["name"], a["count"]) for a in data["areas"]][:4],
                                     followups=data["followups"][:3])

    # ----- entry point -----

    async def run(self) -> SearchState:
        """Run (or resume, after a budget stop) until the target is met, sources run out, or a limit hits."""
        self.state.status = "running"
        self.stop_requested = False
        self._queue = asyncio.Queue()
        self._dirty.clear()
        self.publish("status", {"status": "running"})
        own_http = self.http is None
        if own_http:
            self.http = httpx.AsyncClient()
        github = GitHub(self.http)
        workers = [asyncio.create_task(self._verify_worker(github)) for _ in range(settings.verify_concurrency)]
        for c in self.state.candidates:  # resuming: re-queue anyone still pending
            if c.status == "pending":
                self._schedule(c.id)
        try:
            try:
                await self._discover(github)
            finally:
                for _ in workers:
                    self._queue.put_nowait(None)
                results = await asyncio.gather(*workers, return_exceptions=True)
            for r in results:
                if isinstance(r, (BudgetReached, Stopped)):
                    raise r
            self.check_limits()
            await self._summarize()
            self.state.status = "done"
        except BudgetReached:
            self.state.status = "budget"
        except Stopped:
            self.state.status = "stopped"
        except LLMError as exc:
            self.state.status = "failed"
            self.state.error = str(exc)
        finally:
            for w in workers:
                w.cancel()
            if own_http:
                await self.http.aclose()
                self.http = None
        self.state.finished_at = now_iso()
        self.publish("progress", self.progress())
        self.publish("status", {"status": self.state.status, "error": self.state.error,
                                "summary": self.state.summary.model_dump() if self.state.summary else None})
        return self.state


RunFactory = Callable[[SearchState, Publish], Awaitable[SearchState]]
