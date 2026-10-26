"""HTTP API and static web app.

POST /api/plan                      request → plan to review (P2)
POST /api/searches                  start a search from a reviewed plan
GET  /api/searches/{id}             full state (P4)
GET  /api/searches/{id}/events      live updates as server-sent events (P3)
POST /api/searches/{id}/stop        stop now, keep results
POST /api/searches/{id}/continue    raise the budget by one more limit and resume
GET  /api/searches/{id}/export.csv  results as CSV (?ids=a,b for a selection)
POST /api/searches/{id}/ask         follow-up chat about the results
POST /api/searches/{id}/candidates/{cid}/profile   generate a one-page profile
POST /api/searches/{id}/candidates/{cid}/email     look up a public email
POST /api/searches/{id}/emails      look up public emails for several people
GET/POST /api/shortlist, DELETE /api/shortlist/{search}/{cid}, PATCH /api/shortlist/{entry}
GET  /api/history                   past searches
GET  /api/cost?month=YYYY-MM        cost report (P6)
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import extras
from .config import settings
from .engine import SearchRun, now_iso
from .llm import Claude, LLMError
from .models import Candidate, ChatMessage, Plan, SearchState
from .planner import estimate, make_plan
from .sources import SourceError
from .store import Store

WEB_DIR = Path(__file__).resolve().parents[2] / "web"
FINAL = {"done", "stopped", "budget", "failed"}


@dataclass
class Live:
    run: SearchRun
    task: asyncio.Task | None = None
    listeners: list[asyncio.Queue] = field(default_factory=list)


app = FastAPI(title="Talent Search")
store = Store(settings.data_dir / "talent.db")
live: dict[str, Live] = {}


def make_claude() -> Any:
    if settings.demo:
        from .demo import DemoClaude
        return DemoClaude()
    return Claude()


def make_http():
    if settings.demo:
        from .demo import demo_http
        return demo_http()
    return None  # the engine opens its own client


# ---------- plan ----------

class PlanRequest(BaseModel):
    query: str


@app.get("/api/config")
def config() -> dict:
    return {"demo": settings.demo, "budget": settings.budget_per_search, "model": settings.model}


@app.post("/api/plan")
async def plan(body: PlanRequest) -> dict:
    query = body.query.strip()
    if len(query) < 4:
        raise HTTPException(400, "Describe who you're looking for in a few words.")
    try:
        result, cost = await make_plan(make_claude(), query)
    except LLMError as exc:
        raise HTTPException(502, str(exc)) from exc
    if not settings.demo:
        store.add_cost("ai", cost)
    return result.model_dump()


# ---------- searches ----------

def _publisher(search_id: str):
    def publish(kind: str, data: Any) -> None:
        entry = live.get(search_id)
        if not entry:
            return
        for queue in entry.listeners:
            queue.put_nowait((kind, data))
        if kind == "status" and data.get("status") in FINAL:
            store.save(entry.run.state)
    return publish


async def _run(search_id: str) -> None:
    entry = live[search_id]
    http = make_http()
    entry.run.http = http
    try:
        await entry.run.run()
    finally:
        if http is not None:
            await http.aclose()
        entry.run.http = None
        store.save(entry.run.state)


@app.post("/api/searches")
async def start(plan: Plan) -> dict:
    plan.target = max(5, min(plan.target, 100))
    plan.estimate = estimate(plan.target)
    state = SearchState(id=uuid.uuid4().hex[:12], plan=plan, created_at=now_iso(), budget=settings.budget_per_search)
    search_id = state.id
    live[search_id] = Live(run=SearchRun(state, _publisher(search_id), claude=make_claude()))
    store.save(state)
    live[search_id].task = asyncio.create_task(_run(search_id))
    return {"id": search_id}


def _state(search_id: str) -> SearchState:
    if search_id in live:
        return live[search_id].run.state
    state = store.get(search_id)
    if not state:
        raise HTTPException(404, "Search not found")
    return state


@app.get("/api/searches/{search_id}")
def get_search(search_id: str) -> dict:
    state = _state(search_id)
    data = state.model_dump()
    data["progress"] = live[search_id].run.progress() if search_id in live else None
    data["shortlisted"] = store.shortlist_keys(search_id)
    return data


@app.get("/api/searches/{search_id}/events")
async def events(search_id: str) -> StreamingResponse:
    state = _state(search_id)
    entry = live.get(search_id)

    async def stream():
        running = bool(entry and entry.task and not entry.task.done())
        queue: asyncio.Queue = asyncio.Queue()
        if running:
            entry.listeners.append(queue)  # subscribe before the snapshot so no event falls in between
        snapshot = state.model_dump()
        snapshot["progress"] = entry.run.progress() if entry else None
        yield f"event: snapshot\ndata: {json.dumps(snapshot)}\n\n"
        if not running:
            return
        try:
            while True:
                try:
                    kind, data = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield f"event: {kind}\ndata: {json.dumps(data)}\n\n"
                if kind == "status" and data.get("status") in FINAL:
                    return
        finally:
            entry.listeners.remove(queue)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/searches/{search_id}/stop")
async def stop(search_id: str) -> dict:
    entry = live.get(search_id)
    if not entry or not entry.task or entry.task.done():
        raise HTTPException(409, "This search is not running")
    entry.run.stop_requested = True
    return {"ok": True}


@app.post("/api/searches/{search_id}/continue")
async def resume(search_id: str) -> dict:
    entry = live.get(search_id)
    if not entry:  # after a server restart: pick the saved search back up
        state = store.get(search_id)
        if not state:
            raise HTTPException(404, "Search not found")
        entry = live[search_id] = Live(run=SearchRun(state, _publisher(search_id), claude=make_claude()))
    if entry.task and not entry.task.done():
        raise HTTPException(409, "This search is still running")
    entry.run.state.budget = round(entry.run.state.cost + settings.budget_per_search, 2)
    entry.run.state.finished_at = None
    entry.run.state.status = "running"  # so a page that reconnects right away sees it as live
    entry.task = asyncio.create_task(_run(search_id))
    return {"ok": True, "budget": entry.run.state.budget}


def _csv(candidates: list[dict], filename: str, extra: list[tuple[str, list[str]]] | None = None) -> Response:
    out = io.StringIO()
    writer = csv.writer(out)
    extra = extra or []
    writer.writerow(["name", "status", "score", "role", "company", "location", "why", "tags", "email",
                     "email_source", "github", "homepage", "scholar", "evidence", *[name for name, _ in extra]])
    for i, c in enumerate(candidates):
        links = c.get("links", {})
        writer.writerow([c["name"], c["status"], c["score"] if c.get("score") is not None else "", c["role"],
                         c["company"], c["location"], c["summary"] or c["exclusion"], "; ".join(c["tags"]),
                         c.get("email", ""), c.get("email_source", ""), links.get("github", ""),
                         links.get("homepage", ""), links.get("scholar", ""),
                         " ".join(e["url"] for e in c["evidence"]), *[values[i] for _, values in extra]])
    # BOM so Excel opens UTF-8 (Chinese, accented names) correctly.
    return Response("﻿" + out.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/api/searches/{search_id}/export.csv")
def export(search_id: str, ids: str = "") -> Response:
    state = _state(search_id)
    chosen = set(filter(None, ids.split(",")))
    people = [c for c in state.candidates if not chosen or c.id in chosen]
    people.sort(key=lambda c: -(c.score or 0))
    return _csv([c.model_dump() for c in people], f"talent-search-{state.id}.csv")


# ---------- work on results: chat, profiles, emails ----------

class AskRequest(BaseModel):
    message: str


def _charge(state: SearchState, dollars: float) -> None:
    if settings.demo:
        return
    state.cost = round(state.cost + dollars, 4)
    state.cost_by_source["ai"] = round(state.cost_by_source.get("ai", 0.0) + dollars, 4)


def _candidate_of(state: SearchState, candidate_id: str) -> Candidate:
    c = next((c for c in state.candidates if c.id == candidate_id), None)
    if not c:
        raise HTTPException(404, "Candidate not found")
    return c


def _changed(state: SearchState, candidate: Candidate | None = None) -> None:
    """Persist, and tell any open live view about an updated candidate."""
    store.save(state)
    if candidate is not None and state.id in live:
        _publisher(state.id)("candidate", candidate.model_dump())


@app.post("/api/searches/{search_id}/ask")
async def ask_search(search_id: str, body: AskRequest) -> dict:
    state = _state(search_id)
    message = body.message.strip()
    if not message:
        raise HTTPException(400, "Type a question or a change to the search.")
    try:
        reply, cost = await extras.ask(make_claude(), state, message)
    except LLMError as exc:
        raise HTTPException(502, str(exc)) from exc
    state.messages += [ChatMessage(role="user", text=message, at=now_iso()), reply]
    _charge(state, cost)
    _changed(state)
    return reply.model_dump()


@app.post("/api/searches/{search_id}/candidates/{candidate_id}/profile")
async def profile(search_id: str, candidate_id: str, lang: str = "en") -> dict:
    state = _state(search_id)
    c = _candidate_of(state, candidate_id)
    if not c.evidence:
        raise HTTPException(409, "This person hasn't been checked yet, so there's no evidence to write from.")
    try:
        c.profile, cost = await extras.make_profile(make_claude(), state, c, "zh" if lang == "zh" else "en")
    except LLMError as exc:
        raise HTTPException(502, str(exc)) from exc
    _charge(state, cost)
    _changed(state, c)
    return c.model_dump()


async def _lookup_email(http: httpx.AsyncClient, c: Candidate) -> None:
    try:
        c.email, c.email_source = await extras.find_public_email(http, c)
    except SourceError:
        c.email, c.email_source = "", ""
    c.email_checked = True


@app.post("/api/searches/{search_id}/candidates/{candidate_id}/email")
async def email(search_id: str, candidate_id: str) -> dict:
    state = _state(search_id)
    c = _candidate_of(state, candidate_id)
    async with (make_http() or httpx.AsyncClient()) as http:
        await _lookup_email(http, c)
    _changed(state, c)
    return c.model_dump()


class IdsRequest(BaseModel):
    candidate_ids: list[str]


@app.post("/api/searches/{search_id}/emails")
async def emails(search_id: str, body: IdsRequest) -> list[dict]:
    state = _state(search_id)
    people = [_candidate_of(state, cid) for cid in body.candidate_ids[:50]]
    gate = asyncio.Semaphore(4)

    async def one(c: Candidate) -> None:
        async with gate:
            await _lookup_email(http, c)

    async with (make_http() or httpx.AsyncClient()) as http:
        await asyncio.gather(*(one(c) for c in people))
    for c in people:
        _changed(state, c)
    return [c.model_dump() for c in people]


# ---------- shortlist (候选名单) ----------

class ShortlistAdd(BaseModel):
    search_id: str
    candidate_ids: list[str]


class NoteRequest(BaseModel):
    note: str


@app.get("/api/shortlist")
def shortlist() -> list[dict]:
    return store.shortlist()


@app.post("/api/shortlist")
def shortlist_add(body: ShortlistAdd) -> dict:
    state = _state(body.search_id)
    for cid in body.candidate_ids:
        store.add_to_shortlist(uuid.uuid4().hex[:12], state.id, _candidate_of(state, cid).model_dump())
    return {"shortlisted": store.shortlist_keys(state.id)}


@app.delete("/api/shortlist/{search_id}/{candidate_id}")
def shortlist_remove(search_id: str, candidate_id: str) -> dict:
    store.remove_from_shortlist(search_id, candidate_id)
    return {"shortlisted": store.shortlist_keys(search_id)}


@app.patch("/api/shortlist/{entry_id}")
def shortlist_note(entry_id: str, body: NoteRequest) -> dict:
    if not store.update_shortlist_note(entry_id, body.note[:2000]):
        raise HTTPException(404, "Not on the shortlist")
    return {"ok": True}


@app.get("/api/shortlist/export.csv")
def shortlist_export() -> Response:
    entries = store.shortlist()
    return _csv([e["candidate"] for e in entries], "talent-shortlist.csv",
                extra=[("note", [e["note"] for e in entries]), ("search", [e["query"] for e in entries])])


@app.get("/api/history")
def history() -> list[dict]:
    return store.history()


@app.get("/api/cost")
def cost(month: str | None = None) -> dict:
    month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    report = store.report(month)
    report["months"] = sorted(set(store.months()) | {month}, reverse=True)
    report["budget"] = settings.budget_per_search
    return report


# ---------- web app ----------

if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")
