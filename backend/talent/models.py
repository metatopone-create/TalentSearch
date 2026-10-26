"""Data shapes shared by the planner, the search engine and the API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Importance = Literal["must", "preferred"]
Status = Literal["pending", "verified", "lead", "insufficient", "no_match"]
SourceKind = Literal["github", "papers", "web", "homepage"]


# ---------- Plan (P2) ----------

class Condition(BaseModel):
    text: str
    importance: Importance


class Clarifying(BaseModel):
    question: str
    options: list[str]


class Estimate(BaseModel):
    cost: float
    minutes: float


class Plan(BaseModel):
    query: str
    goal: str
    conditions: list[Condition]
    clarifying: Clarifying | None = None
    focus: str | None = None
    target: int = 20
    estimate: Estimate | None = None


# ---------- Evidence and candidates (P3–P5) ----------

class Evidence(BaseModel):
    id: str  # "e1", "e2", ... unique within one candidate
    kind: Literal["code", "paper", "web"]
    title: str
    url: str
    description: str = ""
    # Code: stars, language, last commit. Papers: venue, year, citations. Web: domain, fetched.
    meta: dict[str, str | int | float | None] = Field(default_factory=dict)


class ReasonSentence(BaseModel):
    text: str
    refs: list[str]  # evidence ids


class ConditionCheck(BaseModel):
    text: str
    importance: Importance
    met: Literal["yes", "no", "unknown"]
    refs: list[str]


class Candidate(BaseModel):
    id: str
    name: str
    role: str = ""
    company: str = ""
    location: str = ""
    status: Status = "pending"
    score: int | None = None
    summary: str = ""  # one-line reason shown in the table
    reasons: list[ReasonSentence] = Field(default_factory=list)
    checks: list[ConditionCheck] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    sources: list[SourceKind] = Field(default_factory=list)
    links: dict[str, str] = Field(default_factory=dict)  # github, homepage, scholar
    evidence: list[Evidence] = Field(default_factory=list)
    exclusion: str = ""  # why not included, for insufficient / no_match


# ---------- Trace (P3 left column) ----------

class TraceStep(BaseModel):
    id: str
    action: str  # "Searched GitHub", "Searched papers", "Searched the web", "Checked homepage"
    query: str
    status: Literal["running", "done", "failed"] = "running"
    domains: list[str] = Field(default_factory=list)  # "github.com +12"
    found: str = ""  # "4 new people"
    seconds: float | None = None
    note: str = ""  # failure explanation


# ---------- Search ----------

class Summary(BaseModel):
    text: str
    areas: list[tuple[str, int]] = Field(default_factory=list)
    followups: list[str] = Field(default_factory=list)


class SearchState(BaseModel):
    id: str
    plan: Plan
    status: Literal["running", "done", "stopped", "budget", "failed"] = "running"
    created_at: str
    finished_at: str | None = None
    cost: float = 0.0
    budget: float = 1.0
    cost_by_source: dict[str, float] = Field(default_factory=dict)
    sources_checked: int = 0
    trace: list[TraceStep] = Field(default_factory=list)
    candidates: list[Candidate] = Field(default_factory=list)
    summary: Summary | None = None
    error: str = ""
