"""SQLite persistence for finished and running searches, and the monthly cost report (P6)."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import SearchState

SCHEMA = """
create table if not exists searches (
  id text primary key,
  created_at text not null,
  query text not null,
  status text not null,
  cost real not null,
  people integer not null,
  verified integer not null,
  seconds real,
  state text not null
);
create table if not exists extra_costs (
  at text not null,
  source text not null,
  dollars real not null
);
"""


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def save(self, state: SearchState) -> None:
        seconds = None
        if state.finished_at:
            seconds = (datetime.fromisoformat(state.finished_at) - datetime.fromisoformat(state.created_at)).total_seconds()
        verified = sum(1 for c in state.candidates if c.status == "verified")
        self.db.execute(
            "insert or replace into searches values (?,?,?,?,?,?,?,?,?)",
            (state.id, state.created_at, state.plan.query, state.status, state.cost, len(state.candidates), verified,
             seconds, state.model_dump_json()),
        )
        self.db.commit()

    def get(self, search_id: str) -> SearchState | None:
        row = self.db.execute("select state from searches where id = ?", (search_id,)).fetchone()
        return SearchState.model_validate_json(row["state"]) if row else None

    def history(self, limit: int = 50) -> list[dict]:
        rows = self.db.execute(
            "select id, created_at, query, status, cost, people, verified, seconds from searches "
            "order by created_at desc limit ?", (limit,)).fetchall()
        return [dict(r) for r in rows]

    def add_cost(self, source: str, dollars: float) -> None:
        self.db.execute("insert into extra_costs values (?,?,?)",
                        (datetime.now(timezone.utc).isoformat(timespec="seconds"), source, dollars))
        self.db.commit()

    def months(self) -> list[str]:
        rows = self.db.execute("select distinct substr(created_at, 1, 7) m from searches order by m desc").fetchall()
        return [r["m"] for r in rows]

    def report(self, month: str) -> dict:
        """Totals for one month (YYYY-MM)."""
        rows = self.db.execute(
            "select id, created_at, query, status, cost, people, verified, seconds, state from searches "
            "where substr(created_at, 1, 7) = ? order by created_at desc", (month,)).fetchall()
        by_source = {"github": 0.0, "papers": 0.0, "web": 0.0, "homepage": 0.0, "ai": 0.0}
        for r in rows:
            for source, dollars in json.loads(r["state"]).get("cost_by_source", {}).items():
                by_source[source] = by_source.get(source, 0.0) + dollars
        extra = self.db.execute("select source, sum(dollars) d from extra_costs where substr(at, 1, 7) = ? "
                                "group by source", (month,)).fetchall()
        for e in extra:
            by_source[e["source"]] = by_source.get(e["source"], 0.0) + (e["d"] or 0.0)
        total = sum(by_source.values())
        searches = len(rows)
        verified = sum(r["verified"] for r in rows)
        return {
            "month": month,
            "total": round(total, 4),
            "searches": searches,
            "avg_per_search": round(total / searches, 4) if searches else 0.0,
            "per_verified": round(total / verified, 4) if verified else None,
            "verified": verified,
            "budget_stops": sum(1 for r in rows if r["status"] == "budget"),
            "by_source": {k: round(v, 4) for k, v in by_source.items()},
            "rows": [{k: r[k] for k in ("id", "created_at", "query", "status", "cost", "people", "verified", "seconds")}
                     for r in rows],
        }
