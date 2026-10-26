"""Turns a one-sentence request into a reviewable search plan (P2)."""

from __future__ import annotations

from .llm import Claude, strict_object
from .models import Clarifying, Condition, Estimate, Plan

PLAN_SYSTEM = """You turn a recruiter's one-sentence request into a search plan for finding technical people \
(engineers, researchers) using GitHub, research papers, personal homepages and web search.

Return:
- goal: one plain sentence describing who to find and why they'd fit.
- conditions: 3 to 6 short, checkable conditions. Mark a condition "must" only when the request clearly \
requires it (role, core skill, location if stated); everything else is "preferred". Each condition should be \
something public evidence can confirm (code, papers, talks, profiles), written in sentence case.
- clarifying: at most one question, only when the request is ambiguous in a way that changes who qualifies. \
Give 2 to 4 short options, the last one being "Any". If nothing is ambiguous, return an empty question and no options.
- target: how many qualified people to aim for; 20 unless the request says otherwise."""

PLAN_SCHEMA = strict_object(
    {
        "goal": {"type": "string"},
        "conditions": {
            "type": "array",
            "items": strict_object(
                {"text": {"type": "string"}, "importance": {"type": "string", "enum": ["must", "preferred"]}}
            ),
        },
        "clarifying": strict_object(
            {"question": {"type": "string"}, "options": {"type": "array", "items": {"type": "string"}}}
        ),
        "target": {"type": "integer"},
    }
)


def estimate(target: int) -> Estimate:
    """Rough pre-search estimate. Verification dominates: about $0.02 and 3 seconds per person checked,
    and roughly two people are checked per qualified person found."""
    checked = max(10, int(target * 1.6))
    cost = 0.08 + checked * 0.016
    minutes = max(1.0, round(checked * 3.5 / 60 / 2) * 1.0)  # verification runs in parallel
    return Estimate(cost=round(cost, 2), minutes=minutes)


async def make_plan(claude: Claude, query: str) -> tuple[Plan, float]:
    result = await claude.structured(PLAN_SYSTEM, f"Request: {query}", PLAN_SCHEMA, effort="low", max_tokens=4000)
    data = result.data
    clarifying = None
    question = (data.get("clarifying") or {}).get("question", "").strip()
    options = [o for o in (data.get("clarifying") or {}).get("options", []) if o.strip()]
    if question and len(options) >= 2:
        clarifying = Clarifying(question=question, options=options[:4])
    target = max(5, min(int(data.get("target") or 20), 100))
    plan = Plan(
        query=query,
        goal=data["goal"],
        conditions=[Condition(**c) for c in data["conditions"]][:8],
        clarifying=clarifying,
        target=target,
        estimate=estimate(target),
    )
    return plan, result.cost
