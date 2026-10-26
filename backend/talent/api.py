"""HTTP API and static web app.

POST /api/plan                      request → plan to review (P2)
POST /api/searches                  start a search from a reviewed plan
GET  /api/searches/{id}             full state (P4)
GET  /api/searches/{id}/events      live updates as server-sent events (P3)
POST /api/searches/{id}/stop        stop now, keep results
POST /api/searches/{id}/continue    raise the budget by one more limit and resume
GET  /api/searches/{id}/export.csv  results as CSV
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

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import settings
from .engine import SearchRun, now_iso
from .llm import Claude, LLMError
from .models import Plan, SearchState
from .planner import estimate, make_plan
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


@app.get("/api/searches/{search_id}/export.csv")
def export(search_id: str) -> Response:
    state = _state(search_id)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["name", "status", "score", "role", "company", "location", "why", "tags", "github", "homepage",
                     "scholar", "evidence"])
    for c in sorted(state.candidates, key=lambda c: -(c.score or 0)):
        writer.writerow([c.name, c.status, c.score if c.score is not None else "", c.role, c.company, c.location,
                         c.summary or c.exclusion, "; ".join(c.tags), c.links.get("github", ""),
                         c.links.get("homepage", ""), c.links.get("scholar", ""),
                         " ".join(e.url for e in c.evidence)])
    filename = f"talent-search-{state.id}.csv"
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


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
