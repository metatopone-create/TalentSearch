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
create table if not exists shortlist (
  id text primary key,
  search_id text not null,
  candidate_id text not null,
  added_at text not null,
  note text not null default '',
  candidate text not null,
  unique (search_id, candidate_id)
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

    # ----- shortlist (候选名单) -----

    def shortlist(self) -> list[dict]:
        rows = self.db.execute(
            "select s.id, s.search_id, s.candidate_id, s.added_at, s.note, s.candidate, q.query "
            "from shortlist s left join searches q on q.id = s.search_id order by s.added_at desc").fetchall()
        return [{"id": r["id"], "search_id": r["search_id"], "candidate_id": r["candidate_id"],
                 "added_at": r["added_at"], "note": r["note"], "query": r["query"] or "",
                 "candidate": json.loads(r["candidate"])} for r in rows]

    def shortlist_keys(self, search_id: str) -> list[str]:
        rows = self.db.execute("select candidate_id from shortlist where search_id = ?", (search_id,)).fetchall()
        return [r["candidate_id"] for r in rows]

    def add_to_shortlist(self, entry_id: str, search_id: str, candidate: dict, note: str = "") -> None:
        self.db.execute(
            "insert into shortlist (id, search_id, candidate_id, added_at, note, candidate) values (?,?,?,?,?,?) "
            "on conflict (search_id, candidate_id) do update set candidate = excluded.candidate",
            (entry_id, search_id, candidate["id"], datetime.now(timezone.utc).isoformat(timespec="seconds"), note,
             json.dumps(candidate)))
        self.db.commit()

    def update_shortlist_note(self, entry_id: str, note: str) -> bool:
        cur = self.db.execute("update shortlist set note = ? where id = ?", (note, entry_id))
        self.db.commit()
        return cur.rowcount > 0

    def remove_from_shortlist(self, search_id: str, candidate_id: str) -> None:
        self.db.execute("delete from shortlist where search_id = ? and candidate_id = ?", (search_id, candidate_id))
        self.db.commit()

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
