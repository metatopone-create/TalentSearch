"""Runtime settings, read once from environment variables."""

import os
from dataclasses import dataclass, field
from pathlib import Path


def _flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    # Claude model used for planning, verification and summaries.
    model: str = field(default_factory=lambda: os.environ.get("TS_MODEL", "claude-opus-5-5"))
    # Dollars per million tokens for the model above (input, output). Used for cost tracking only.
    price_in: float = field(default_factory=lambda: float(os.environ.get("TS_PRICE_IN", "4.0")))
    price_out: float = field(default_factory=lambda: float(os.environ.get("TS_PRICE_OUT", "20.0")))
    # Claude web search is billed per search on top of tokens.
    price_web_search: float = field(default_factory=lambda: float(os.environ.get("TS_PRICE_WEB_SEARCH", "0.01")))
    # Hard stop for one search, in dollars. The user can continue past it from the UI.
    budget_per_search: float = field(default_factory=lambda: float(os.environ.get("TS_BUDGET", "1.00")))
    github_token: str | None = field(default_factory=lambda: os.environ.get("GITHUB_TOKEN") or None)
    # Contact email sent to OpenAlex so requests go to its polite pool.
    openalex_mailto: str | None = field(default_factory=lambda: os.environ.get("OPENALEX_MAILTO") or None)
    # Demo mode replays a scripted search and never calls external services.
    demo: bool = field(default_factory=lambda: _flag("TS_DEMO"))
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("TS_DATA_DIR", "data")))
    # How many candidates are verified at the same time.
    verify_concurrency: int = field(default_factory=lambda: int(os.environ.get("TS_VERIFY_CONCURRENCY", "4")))
    # Upper bound on people sent to verification in one search.
    max_candidates: int = field(default_factory=lambda: int(os.environ.get("TS_MAX_CANDIDATES", "40")))


settings = Settings()
