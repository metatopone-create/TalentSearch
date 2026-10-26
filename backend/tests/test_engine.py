import asyncio

import pytest

from talent.demo import DemoClaude, _demo_plan, demo_http
from talent.engine import SearchRun, now_iso
from talent.models import Plan, SearchState


def make_state(budget: float = 1.0) -> SearchState:
    plan = Plan(**_demo_plan("LLM inference optimization engineers in the US"))
    return SearchState(id="t", plan=plan, created_at=now_iso(), budget=budget)


async def run_demo(state: SearchState, **claude_kwargs) -> tuple[SearchState, list[tuple[str, dict]]]:
    events: list[tuple[str, dict]] = []
    async with demo_http() as http:
        run = SearchRun(state, lambda k, d: events.append((k, d)), claude=DemoClaude(speed=0.02, **claude_kwargs),
                        http=http)
        await run.run()
    return state, events


def test_full_search_finishes_with_evidence_backed_results():
    state, events = asyncio.run(run_demo(make_state()))
    assert state.status == "done"
    assert state.summary and len(state.summary.followups) == 3
    by_name = {c.name: c for c in state.candidates}
    # Found on GitHub, a paper and her homepage: three independent sites.
    priya = by_name["Priya Raman"]
    assert priya.status == "verified" and priya.score == 94
    assert {"github", "papers", "homepage"} <= set(priya.sources)
    # Every reference in a reason points at real evidence.
    for c in state.candidates:
        ids = {e.id for e in c.evidence}
        for r in c.reasons:
            assert set(r.refs) <= ids
    # Excluded people keep the reason they were excluded.
    assert by_name["Liam Achterberg"].status == "no_match"
    assert "Toronto" in by_name["Liam Achterberg"].exclusion
    kinds = {k for k, _ in events}
    assert {"trace", "candidate", "progress", "status"} <= kinds


def test_verified_requires_two_independent_sites():
    state, _ = asyncio.run(run_demo(make_state()))
    for c in state.candidates:
        if c.status == "verified":
            assert len({e.url.split("/")[2] for e in c.evidence}) >= 2, c.name
    # The fixture marks Aisha verified, but only GitHub speaks for her, so she stays a lead.
    aisha = next(c for c in state.candidates if c.name == "Aisha Bello")
    assert aisha.status == "lead"


def test_new_evidence_triggers_recheck():
    # Marcus is first seen on GitHub only; the web step later adds his team blog post.
    state, _ = asyncio.run(run_demo(make_state()))
    marcus = next(c for c in state.candidates if c.name == "Marcus Feld")
    assert "web" in marcus.sources and marcus.status == "verified"


def test_failed_web_search_is_reported_and_search_continues():
    state, _ = asyncio.run(run_demo(make_state(), fail_web=True))
    assert state.status == "done"
    failed = [s for s in state.trace if s.status == "failed"]
    assert failed and failed[0].note == "Web search unavailable — results from GitHub and papers only"
    assert any(c.status == "verified" for c in state.candidates)


def test_budget_limit_stops_and_resumes():
    state = make_state(budget=0.05)
    state, _ = asyncio.run(run_demo(state))
    assert state.status == "budget"
    # Parallel checks reserve their cost up front, so the limit is not overshot by more than one guess.
    assert state.cost <= 0.05 + 0.02
    found = len(state.candidates)
    assert found > 0

    async def resume():
        state.budget = state.cost + 5
        async with demo_http() as http:
            run = SearchRun(state, lambda k, d: None, claude=DemoClaude(speed=0.02), http=http)
            await run.run()

    asyncio.run(resume())
    assert state.status == "done"
    assert not [c for c in state.candidates if c.status == "pending"]


@pytest.mark.parametrize("budget", [1.0])
def test_cost_is_tracked_by_source(budget):
    state, _ = asyncio.run(run_demo(make_state(budget)))
    assert state.cost == pytest.approx(sum(state.cost_by_source.values()), abs=1e-3)
    assert state.cost_by_source["web"] == pytest.approx(0.02)
