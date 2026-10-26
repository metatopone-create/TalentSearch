# Talent Search

Find AI talent from one sentence. You describe who you're looking for; the app turns it into a plan you review,
searches GitHub, papers, personal homepages and the web, checks each person against your conditions, and gives
you a shortlist where every claim links to its source. "Verified" is kept separate from "Lead only".

Internal MVP, desktop first. Product name is a placeholder.

## Run it

Requires Python 3.11+.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

**Demo mode** — no keys, nothing billed. Runs the real engine against built-in sample data (fictional people):

```bash
cd backend
TS_DEMO=1 ../.venv/bin/uvicorn talent.api:app --port 8000
```

Open http://localhost:8000.

**Real mode** — searches live sources and calls Claude:

```bash
cd backend
export ANTHROPIC_API_KEY=sk-ant-...      # required
export GITHUB_TOKEN=ghp_...              # strongly recommended: unauthenticated GitHub allows 60 requests/hour
export OPENALEX_MAILTO=you@example.com   # optional: faster paper search
../.venv/bin/uvicorn talent.api:app --port 8000
```

### Settings (environment variables)

| Variable | Default | What it does |
| --- | --- | --- |
| `TS_MODEL` | `claude-opus-5-5` | Claude model for planning, verification and summaries |
| `TS_PRICE_IN` / `TS_PRICE_OUT` | `4.0` / `20.0` | $ per million tokens for that model, used in the cost report |
| `TS_BUDGET` | `1.00` | Per-search spending limit in dollars; the search pauses there and offers "Continue" |
| `TS_MAX_CANDIDATES` | `40` | Most people checked in one search |
| `TS_VERIFY_CONCURRENCY` | `4` | People checked in parallel |
| `TS_DATA_DIR` | `data` | Where the SQLite database lives |
| `TS_DEMO` | off | `1` for demo mode |

### Tests

```bash
cd backend && ../.venv/bin/python -m pytest -q
```

The tests run the full engine and API in demo mode. They don't call Claude, GitHub or OpenAlex.

## How it works

```
request ──► plan (Claude) ──► you edit Must / Preferred, focus, target
                                   │
                                   ▼
             source queries (Claude) ──► discovery ──────────────┐   live trace (SSE)
             GitHub users / repos+contributors · OpenAlex papers  │──► results table
             · web (Claude web search)                             │
                                   │ people, merged by GitHub login / homepage / name
                                   ▼
             verification (parallel): GitHub profile, homepage fetch,
             then Claude scores the person against the plan using ONLY numbered evidence
                                   │
                                   ▼
             summary + follow-ups (Claude) ──► results, CSV export, cost ledger
```

Rules that keep it evidence-first:

- Claude sees evidence as numbered items and must cite them; references that point at nothing are dropped.
- "Verified" needs every Must condition supported **and** at least two independent sites. With only one site the
  person stays "Lead only", even if the model says otherwise.
- New evidence about someone already checked (for example, a web page found later) triggers a re-check.
- Failed sources are shown in the trace and the search carries on with what's left.
- Cost is tracked per source. Parallel checks reserve their expected cost, so a search stops at its limit instead
  of overshooting it.

## Layout

```
backend/talent/
  api.py        FastAPI routes, SSE stream, CSV export, static web app
  engine.py     the search run: queries → discovery → verification → summary
  planner.py    request → plan
  llm.py        Anthropic SDK wrapper: structured JSON calls, web search, cost accounting
  sources/      github.py, papers.py (OpenAlex), web.py (Claude web search, homepage fetch)
  store.py      SQLite: searches, history, monthly cost report
  demo.py       scripted Claude + mocked HTTP for demo mode and tests
backend/tests/  engine and API tests (demo mode)
web/            index.html, app.css, app.js — no build step
design/         Claude Design canvas source: tokens, components, P1–P7 screens
```

Design canvas: https://claude.ai/artifact/FznNsTAAgNPhA78LDv489C

## Known limits (MVP)

- A running search lives in server memory; if the server restarts mid-search, reopen it from History and press
  Continue to resume from what was saved.
- Homepage fetching reads plain HTML only; pages that render with JavaScript yield little text.
- The pre-search estimate is a rough formula; the cost report shows actual spend.
- Single user, no login (out of scope for this phase).
