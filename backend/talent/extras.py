"""Work on a finished result list: follow-up chat, candidate profiles, and public contact emails."""

from __future__ import annotations

import re

import httpx

from .engine import now_iso, plan_text
from .llm import Claude, strict_object
from .models import Candidate, ChatMessage, Profile, ReasonSentence, SearchState
from .sources import SourceError
from .sources.github import API as GITHUB_API, api_headers as github_headers

# ---------- Follow-up chat ----------

ASK_SYSTEM = """You help a recruiter work with a candidate list that a search just produced. Reply in the \
language of the recruiter's latest message.

Choose one kind:
- "answer": the question can be answered from the list below. Answer in 1–3 sentences and put the ids of the \
candidates you mean in `highlights`. Only use what the list says; if it doesn't say, answer that it isn't known.
- "refine": the recruiter wants different or more people (another place, skill, seniority, company type). Write \
`new_query`: one complete search request in English that combines the original request with the change. Say in \
`text` what the new search will look for.
- "clarify": the message is ambiguous (for example "them" or "that company" without a clear referent). Ask one \
short question in `text` and give 2–4 short `options`, the last one inviting them to type their own.

Never infer, guess, or filter by race, ethnicity, national origin, religion, sex, age, disability or other \
protected characteristics — not from names, photos, schools or anything else. If asked to, say plainly that you \
can't help with that because it isn't a fair or lawful basis for hiring decisions, and offer job-related \
alternatives as `options` (for example: languages the person states they speak, location, stated work \
authorization). Use kind "clarify" for that reply.

Use "" for unused text fields and [] for unused lists."""

ASK_SCHEMA = strict_object({
    "kind": {"type": "string", "enum": ["answer", "refine", "clarify"]},
    "text": {"type": "string"},
    "highlights": {"type": "array", "items": {"type": "string"}},
    "options": {"type": "array", "items": {"type": "string"}},
    "new_query": {"type": "string"},
})


def _candidate_line(c: Candidate) -> str:
    checks = "; ".join(f"{ch.text}: {ch.met}" for ch in c.checks)
    return (f"[{c.id}] {c.name} | {c.status} | score {c.score} | {c.role} at {c.company} | {c.location} | "
            f"tags: {', '.join(c.tags)} | {c.summary or c.exclusion} | checks: {checks}"
            + (f" | public email on file" if c.email else ""))


async def ask(claude: Claude, state: SearchState, message: str) -> tuple[ChatMessage, float]:
    history = "\n".join(f"{m.role}: {m.text}" for m in state.messages[-8:])
    prompt = "\n".join([
        plan_text(state.plan), "", "Candidates:", *(_candidate_line(c) for c in state.candidates), "",
        "Conversation so far:" if history else "", history, "", f"Recruiter: {message}",
    ])
    result = await claude.structured(ASK_SYSTEM, prompt, ASK_SCHEMA, effort="low", max_tokens=3000)
    data = result.data
    ids = {c.id for c in state.candidates}
    reply = ChatMessage(
        role="assistant",
        kind=data["kind"],
        text=data["text"],
        highlights=[h for h in data["highlights"] if h in ids],
        options=[o for o in data["options"] if o.strip()][:4],
        new_query=data["new_query"].strip() if data["kind"] == "refine" else "",
        at=now_iso(),
    )
    return reply, result.cost


# ---------- Profile (生成档案) ----------

PROFILE_SYSTEM = """You write a one-page candidate profile for a recruiter, using ONLY the numbered evidence. \
Write in {language}. Be specific and plain; no hype, no guesses presented as facts.
- headline: role · company · location, as supported.
- summary: 2–3 sentences, each with the evidence ids that support it.
- experience: 3–6 sentences about concrete work (projects, papers, roles), each with evidence ids.
- strengths: 2–4 short phrases tied to the hiring plan.
- open_questions: 2–4 things the evidence does NOT settle that are worth asking in a first call (current role, \
seniority, interest, location details). Never ask about protected characteristics.
- outreach: one opening line for a first message that references their actual work."""

PROFILE_SCHEMA = strict_object({
    "headline": {"type": "string"},
    "summary": {"type": "array", "items": strict_object({"text": {"type": "string"},
                                                         "refs": {"type": "array", "items": {"type": "string"}}})},
    "experience": {"type": "array", "items": strict_object({"text": {"type": "string"},
                                                            "refs": {"type": "array", "items": {"type": "string"}}})},
    "strengths": {"type": "array", "items": {"type": "string"}},
    "open_questions": {"type": "array", "items": {"type": "string"}},
    "outreach": {"type": "string"},
})


async def make_profile(claude: Claude, state: SearchState, c: Candidate, lang: str) -> tuple[Profile, float]:
    lines = [plan_text(state.plan), "", f"Person: {c.name} ({c.role}, {c.company}, {c.location})",
             f"Assessment: {c.status}, score {c.score}. {c.summary}", "Evidence:"]
    for e in c.evidence:
        meta = ", ".join(f"{k}: {v}" for k, v in e.meta.items())
        lines.append(f"[{e.id}] ({e.kind}) {e.title} — {e.url}\n    {e.description[:1500]}" + (f"\n    {meta}" if meta else ""))
    language = "Simplified Chinese" if lang == "zh" else "English"
    result = await claude.structured(PROFILE_SYSTEM.format(language=language), "\n".join(lines), PROFILE_SCHEMA,
                                     effort="low", max_tokens=5000)
    d = result.data
    ids = {e.id for e in c.evidence}
    cite = lambda rows: [ReasonSentence(text=r["text"], refs=[x for x in r["refs"] if x in ids]) for r in rows]  # noqa: E731
    profile = Profile(headline=d["headline"], summary=cite(d["summary"]), experience=cite(d["experience"]),
                      strengths=d["strengths"][:4], open_questions=d["open_questions"][:4], outreach=d["outreach"],
                      lang=lang, generated_at=now_iso())
    return profile, result.cost


# ---------- Public email (获取邮箱) ----------

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
IGNORED = ("noreply", "no-reply", "example.com", "users.noreply.github.com", "sentry", "wixpress")


def _usable(addr: str) -> bool:
    low = addr.lower()
    return not any(x in low for x in IGNORED) and not low.endswith((".png", ".jpg", ".svg", ".gif"))


async def find_public_email(http: httpx.AsyncClient, c: Candidate) -> tuple[str, str]:
    """An address the person published on their GitHub profile or homepage, and the page it's on.
    Returns ("", "") when none is published. Never guesses address patterns."""
    login = c.links.get("github", "").rstrip("/").rsplit("/", 1)[-1] if c.links.get("github") else ""
    if login:
        try:
            r = await http.get(f"{GITHUB_API}/users/{login}", headers=github_headers(), timeout=15)
            if r.status_code == 200:
                addr = (r.json().get("email") or "").strip()
                if addr and _usable(addr):
                    return addr, f"https://github.com/{login}"
        except httpx.HTTPError:
            pass
    homepage = c.links.get("homepage")
    if homepage:
        try:
            r = await http.get(homepage, timeout=15, follow_redirects=True,
                               headers={"User-Agent": "TalentSearch/0.1 (+contact lookup)"})
        except httpx.HTTPError as exc:
            raise SourceError(f"Homepage unreachable: {exc}") from exc
        if r.status_code < 400:
            page = r.text
            for addr in re.findall(r"mailto:([^\"'?>\s]+)", page) + EMAIL.findall(page):
                addr = addr.strip()
                if EMAIL.fullmatch(addr) and _usable(addr):
                    return addr, str(r.url)
    return "", ""
