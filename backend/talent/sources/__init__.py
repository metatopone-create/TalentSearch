"""People discovery and enrichment sources.

Each discovery function returns `Lead`s: a person seen in one place, with the evidence that place gave us.
The engine merges leads that point at the same person before verification.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse


class SourceError(RuntimeError):
    """A source could not be reached or refused the request."""


@dataclass
class RawEvidence:
    kind: str  # code | paper | web
    title: str
    url: str
    description: str = ""
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class Lead:
    name: str
    github: str | None = None
    homepage: str | None = None
    scholar: str | None = None
    role: str = ""
    company: str = ""
    location: str = ""
    sources: set[str] = field(default_factory=set)  # github | papers | web | homepage
    evidence: list[RawEvidence] = field(default_factory=list)
    hints: list[str] = field(default_factory=list)

    @property
    def keys(self) -> set[str]:
        keys = set()
        if self.github:
            keys.add("gh:" + self.github.lower())
        if self.homepage:
            keys.add("hp:" + domain_of(self.homepage) + urlparse(self.homepage).path.rstrip("/"))
        if self.name:
            keys.add("nm:" + normalize_name(self.name))
        return keys

    def merge(self, other: Lead) -> int:
        """Fold another sighting of the same person in; returns how many new evidence items it added."""
        self.github = self.github or other.github
        self.homepage = self.homepage or other.homepage
        self.scholar = self.scholar or other.scholar
        self.role = self.role or other.role
        self.company = self.company or other.company
        self.location = self.location or other.location
        if len(other.name) > len(self.name):
            self.name = other.name
        self.sources |= other.sources
        seen = {e.url for e in self.evidence}
        added = [e for e in other.evidence if e.url not in seen]
        self.evidence.extend(added)
        self.hints.extend(h for h in other.hints if h not in self.hints)
        return len(added)


def normalize_name(name: str) -> str:
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    parts = re.findall(r"[a-z]+", text)
    if len(parts) >= 2:
        return f"{parts[0]} {parts[-1]}"
    return " ".join(parts)


def domain_of(url: str) -> str:
    host = urlparse(url if "://" in url else "https://" + url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def domain_summary(urls: list[str], limit: int = 2) -> list[str]:
    """['github.com +12', 'arxiv.org +3'] style chips for the trace."""
    counts: dict[str, int] = {}
    for url in urls:
        d = domain_of(url)
        if d:
            counts[d] = counts.get(d, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])
    chips = [f"{d} +{n - 1}" if n > 1 else d for d, n in ranked[:limit]]
    if len(ranked) > limit:
        chips.append(f"{len(ranked) - limit} more domains")
    return chips
