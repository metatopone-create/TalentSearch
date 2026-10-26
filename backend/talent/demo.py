"""Demo mode: the real engine and source code, run against scripted data.

`DemoClaude` answers the planner, query, verification and summary prompts from fixtures, and
`demo_http()` serves GitHub, OpenAlex and homepage responses through an in-process transport.
Nothing leaves the machine and nothing is billed; costs shown are illustrative.
All people and companies here are fictional.
"""

from __future__ import annotations

import asyncio
import random
import re
from typing import Any

import httpx

from .engine import QUERY_SYSTEM, SUMMARY_SYSTEM, VERIFY_SYSTEM
from .extras import ASK_SYSTEM, PROFILE_SYSTEM
from .llm import CallResult, LLMError
from .planner import PLAN_SYSTEM
from .sources.web import WEB_SYSTEM

# login, name, company, location, blog, bio, repos [(name, stars, lang, desc)]
PEOPLE: list[dict[str, Any]] = [
    dict(login="praman", name="Priya Raman", company="Northwind AI", location="Seattle, WA", blog="priyaraman.dev",
         bio="Kernels, quantization and serving for LLMs.",
         repos=[("fastkern", 3400, "Cuda", "Fused attention and dequant kernels for 4-bit LLM serving")],
         verdict=("verified", 94, "Senior ML Engineer", "Maintains a popular inference kernel library; 2 papers on 4-bit quantization; US-based.",
                  ["CUDA", "Quantization", "vLLM", "Serving"])),
    dict(login="mfeld", name="Marcus Feld", company="Halcyon Cloud", location="San Francisco, CA", blog="",
         email="marcus@halcyon.example",
         bio="Inference @ Halcyon. Batching schedulers.",
         repos=[("batchwise", 610, "Python", "Continuous batching simulator")],
         verdict=("verified", 91, "Staff Engineer, Inference", "Core contributor to an open-source serving engine (140 merged PRs); talk on continuous batching.",
                  ["vLLM", "Serving", "Batching"])),
    dict(login="esorokina", name="Elena Sorokina", company="Lattice Labs", location="Boston, MA", blog="esorokina.github.io",
         bio="Research scientist. Efficient inference.",
         repos=[("kvsqueeze", 1250, "Python", "Reference code for KV-cache compression")],
         verdict=("verified", 88, "Research Scientist", "First author of an ICML paper on KV-cache compression; maintains the reference code.",
                  ["KV cache", "Quantization", "PyTorch"])),
    dict(login="dokafor", name="Daniel Okafor", company="", location="", blog="",
         bio="GPU plugins.", repos=[("trt-plugins-extra", 140, "C++", "Extra TensorRT-LLM plugins")],
         verdict=("lead", 72, "ML Systems Engineer", "Commits to TensorRT-LLM plugins; employer and location only from a 2024 talk.",
                  ["TensorRT-LLM", "CUDA"])),
    dict(login="hkobayashi", name="Hana Kobayashi", company="Eastbrook University", location="Pittsburgh, PA", blog="hkobayashi.net",
         bio="PhD student. Speculative decoding.", repos=[("specdec-bench", 420, "Python", "Benchmarks for speculative decoding")],
         verdict=("verified", 84, "PhD candidate", "3 papers on speculative decoding; homepage confirms US-based, graduating 2027.",
                  ["Speculative decoding", "Serving"])),
    dict(login="abello", name="Aisha Bello", company="Corvid Systems", location="United States", blog="",
         bio="Inference engineer. Quantization toolkit maintainer.",
         repos=[("quantkit", 2100, "C++", "Post-training quantization toolkit for ONNX and PyTorch")],
         verdict=("verified", 82, "Inference Engineer", "Maintains a quantization toolkit (2.1k stars); last commit 3 days ago.",
                  ["Quantization", "ONNX", "C++"])),
    dict(login="trivera", name="Tomás Rivera", company="Quillstack", location="New York, NY", blog="tomasrivera.blog",
         bio="", repos=[],
         verdict=("lead", 66, "Senior Software Engineer", "Blog posts on GPU kernel tuning; no code or papers found to confirm depth.",
                  ["Triton", "CUDA"])),
    dict(login="smarchetti", name="Sofia Marchetti", company="Polaris Research", location="Palo Alto, CA", blog="sofiamarchetti.io",
         bio="Batching and paged attention.", repos=[("paged-sched", 980, "Python", "Batching scheduler with paged attention")],
         verdict=("verified", 86, "Research Engineer", "Built the batching scheduler at Polaris; workshop paper on paged attention.",
                  ["Serving", "CUDA", "Scheduling"])),
    dict(login="klindqvist", name="Kevin Lindqvist", company="Ardent Silicon", location="Santa Clara, CA", blog="",
         bio="Performance engineer.", repos=[("fp8-gemm", 860, "Cuda", "FP8 GEMM and attention kernels")],
         verdict=("verified", 79, "Performance Engineer", "Wrote the FP8 kernels in a public inference repo; location from company team page.",
                  ["FP8", "CUDA"])),
    dict(login="rdeshmukh", name="Ravi Deshmukh", company="Kestrel Data", location="Chicago, IL", blog="",
         bio="Inference platform lead.", repos=[("serving-bench", 330, "Go", "Load tests for model servers")],
         verdict=("verified", 80, "Staff ML Engineer", "Leads the inference platform team; 2 contributions to TensorRT-LLM.",
                  ["TensorRT-LLM", "Serving"])),
    dict(login="jweiss", name="Jonah Weiss", company="", location="", blog="",
         bio="", repos=[],
         verdict=("lead", 58, "Software Engineer", "6 merged PRs to a serving framework; current role and location unconfirmed.",
                  ["vLLM"])),
    dict(login="lachterberg", name="Liam Achterberg", company="Maplewood AI", location="Toronto, ON", blog="",
         bio="Inference engineer.", repos=[("onnx-fastpath", 210, "C++", "ONNX runtime fast paths")],
         verdict=("no_match", 74, "Inference Engineer", "Strong inference work; based in Toronto.", ["ONNX", "Serving"]),
         exclusion="Based in Toronto, ON. Misses Must: Based in the US."),
    dict(login="jcastellano", name="J. Castellano", company="", location="", blog="",
         bio="cuda stuff", repos=[],
         verdict=("insufficient", 30, "", "Only a forum-style profile mentioning CUDA.", ["CUDA"]),
         exclusion="Only a profile mentioning CUDA; no code, papers or employer found."),
]

PAPERS = [
    dict(title="Outlier-aware 4-bit weight quantization for decoder-only models", venue="MLSys", year=2025,
         citations=212, authors=[("Priya Raman", "Northwind AI", "US"), ("Jon Ostrander", "Northwind AI", "US")]),
    dict(title="Squeezing the KV cache without retraining", venue="ICML", year=2025, citations=158,
         authors=[("Elena Sorokina", "Lattice Labs", "US"), ("Amir Mehta", "Lattice Labs", "US")]),
    dict(title="Draft trees for faster speculative decoding", venue="NeurIPS", year=2025, citations=97,
         authors=[("Hana Kobayashi", "Eastbrook University", "US")]),
    dict(title="Paged attention schedulers in practice", venue="NeurIPS Workshop", year=2024, citations=41,
         authors=[("Sofia Marchetti", "Polaris Research", "US")]),
]

HOMEPAGES = {
    "priyaraman.dev": ("Priya Raman — about", "Senior ML engineer at Northwind AI in Seattle. Kernels, quantization, serving. "
                       '<a href="mailto:priya@priyaraman.dev">priya@priyaraman.dev</a>'),
    "esorokina.github.io": ("Elena Sorokina", "Research scientist at Lattice Labs, Boston. Efficient inference, KV caches."),
    "hkobayashi.net": ("Hana Kobayashi", "PhD candidate at Eastbrook University, Pittsburgh. Graduating 2027."),
    "tomasrivera.blog": ("Notes on GPU kernel tuning", "Tomás writes about Triton and CUDA tuning. Engineer at Quillstack, NYC."),
    "sofiamarchetti.io": ("Sofia Marchetti", "Research engineer at Polaris Research, Palo Alto."),
}

WEB_PEOPLE = [
    dict(name="Kevin Lindqvist", role="Performance Engineer", company="Ardent Silicon", location="Santa Clara, CA",
         url="https://ardentsilicon.example/team", page_title="Our team — Ardent Silicon",
         snippet="Kevin Lindqvist, Performance Engineer, Santa Clara"),
    dict(name="Marcus Feld", role="Staff Engineer", company="Halcyon Cloud", location="San Francisco, CA",
         url="https://halcyon.example/blog/batching", page_title="How we batch at Halcyon",
         snippet="Marcus Feld walks through our continuous batching scheduler."),
    dict(name="Daniel Okafor", role="ML Systems Engineer", company="Brightwater Compute", location="Austin, TX",
         url="https://gpuconf.example/2024/speakers", page_title="Speakers 2024",
         snippet="Daniel Okafor (Brightwater Compute, Austin) on TensorRT-LLM plugins."),
]

BY_LOGIN = {p["login"]: p for p in PEOPLE}
BY_NAME = {p["name"]: p for p in PEOPLE}


def _sleep(lo: float, hi: float):
    return asyncio.sleep(random.uniform(lo, hi))


# ---------- HTTP fixtures ----------

def _user_json(p: dict) -> dict:
    return {"login": p["login"], "type": "User", "name": p["name"], "company": p["company"] or None,
            "location": p["location"] or None, "blog": p["blog"], "bio": p["bio"] or None,
            "html_url": f"https://github.com/{p['login']}", "followers": 40 + len(p["name"]) * 9,
            "email": p.get("email"),
            "public_repos": 12}


def _repo_json(p: dict, repo: tuple) -> dict:
    name, stars, lang, desc = repo
    return {"full_name": f"{p['login']}/{name}", "html_url": f"https://github.com/{p['login']}/{name}",
            "stargazers_count": stars, "language": lang, "description": desc, "fork": False,
            "pushed_at": "2026-10-22T10:00:00Z"}


SHARED_REPOS = {
    "serving-engine/serve": ["mfeld", "praman", "jweiss", "rdeshmukh", "smarchetti"],
    "quantlab/quantkit": ["abello", "praman", "esorokina", "jcastellano"],
    "trt-community/plugins": ["dokafor", "klindqvist", "rdeshmukh", "lachterberg"],
}


async def _handler(request: httpx.Request) -> httpx.Response:
    url = request.url
    host, path = url.host, url.path
    await _sleep(0.15, 0.5)
    if host == "api.github.com":
        if path == "/search/repositories":
            q = url.params.get("q", "").lower()
            names = list(SHARED_REPOS)
            if "quant" in q:
                names = ["quantlab/quantkit"] + [n for n in names if n != "quantlab/quantkit"]
            elif "tensorrt" in q or "trt" in q:
                names = ["trt-community/plugins"] + [n for n in names if n != "trt-community/plugins"]
            items = [{"full_name": n, "html_url": f"https://github.com/{n}", "stargazers_count": 9000 - i * 2000,
                      "language": "Python", "description": f"{n.split('/')[1]} project"} for i, n in enumerate(names)]
            return httpx.Response(200, json={"items": items})
        m = re.fullmatch(r"/repos/(.+/.+)/contributors", path)
        if m:
            logins = SHARED_REPOS.get(m.group(1), [])
            return httpx.Response(200, json=[{"login": l, "type": "User", "contributions": 140 - i * 23}
                                             for i, l in enumerate(logins)])
        if path == "/search/users":
            picks = ["hkobayashi", "trivera", "klindqvist", "esorokina"]
            return httpx.Response(200, json={"items": [{"login": l, "type": "User"} for l in picks]})
        m = re.fullmatch(r"/users/([^/]+)(/repos)?", path)
        if m and m.group(1) in BY_LOGIN:
            p = BY_LOGIN[m.group(1)]
            if m.group(2):
                return httpx.Response(200, json=[_repo_json(p, r) for r in p["repos"]])
            return httpx.Response(200, json=_user_json(p))
        return httpx.Response(404, json={})
    if host == "api.openalex.org":
        results = []
        for i, paper in enumerate(PAPERS):
            results.append({
                "id": f"https://openalex.org/W{1000 + i}", "display_name": paper["title"],
                "publication_year": paper["year"], "cited_by_count": paper["citations"],
                "primary_location": {"landing_page_url": f"https://arxiv.org/abs/2501.{10000 + i}",
                                     "source": {"display_name": paper["venue"]}},
                "authorships": [{"author": {"display_name": a, "id": f"https://openalex.org/A{hash(a) % 10**6}"},
                                 "institutions": [{"display_name": inst, "country_code": cc}]}
                                for a, inst, cc in paper["authors"]],
            })
        return httpx.Response(200, json={"results": results})
    home = HOMEPAGES.get(host.removeprefix("www."))
    if home:
        title, text = home
        return httpx.Response(200, headers={"content-type": "text/html"},
                              text=f"<html><head><title>{title}</title></head><body><p>{text}</p></body></html>")
    return httpx.Response(404, text="not found")


def demo_http() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(_handler))


# ---------- Scripted Claude ----------

class DemoClaude:
    """Answers each engine prompt from fixtures, with realistic delays and illustrative costs."""

    def __init__(self, fail_web: bool = False, speed: float = 1.0):
        self.fail_web = fail_web
        self.speed = speed

    async def _wait(self, lo: float, hi: float) -> None:
        await asyncio.sleep(random.uniform(lo, hi) * self.speed)

    async def structured(self, system: str, user: str, schema: dict, effort: str = "low",
                         max_tokens: int = 16000) -> CallResult:
        if system == PLAN_SYSTEM:
            await self._wait(0.6, 1.0)
            return CallResult(data=_demo_plan(user.removeprefix("Request: ")), cost=0.006)
        if system == QUERY_SYSTEM:
            await self._wait(0.5, 0.9)
            return CallResult(cost=0.008, data={
                "github_users": ['"inference" OR "serving" language:cuda location:US'],
                "github_repos": ["serving engine stars:>500", "topic:quantization stars:>200", "tensorrt-llm plugins"],
                "papers": ["4-bit quantization LLM inference", "KV-cache compression speculative decoding"],
                "web": ['"inference engineer" kernel optimization US'],
            })
        if system == VERIFY_SYSTEM:
            await self._wait(1.2, 2.6)
            return CallResult(data=_demo_verdict(user), cost=0.014)
        if system == SUMMARY_SYSTEM:
            await self._wait(0.8, 1.2)
            return CallResult(cost=0.02, data={
                "text": "Most candidates work at inference startups and large cloud providers. Serving systems is the "
                        "densest area; quantization is thin. 2 people were excluded: one is based outside the US, "
                        "one had too little evidence.",
                "areas": [{"name": "Serving systems", "count": 5}, {"name": "GPU kernels", "count": 3},
                          {"name": "Quantization", "count": 2}],
                "followups": ["Find more quantization specialists", "Expand to Canada",
                              "Only show people active in the last 6 months"],
            })
        if system == ASK_SYSTEM:
            await self._wait(0.6, 1.0)
            return CallResult(data=_demo_ask(user), cost=0.004)
        if system.startswith(PROFILE_SYSTEM.split("{")[0]):
            await self._wait(1.0, 1.6)
            return CallResult(data=_demo_profile(user, "Chinese" in system), cost=0.012)
        raise LLMError("Demo mode has no answer for this prompt")

    async def web_search(self, system: str, user: str, max_uses: int = 3, effort: str = "low") -> CallResult:
        assert system == WEB_SYSTEM
        await self._wait(1.5, 2.5)
        if self.fail_web:
            raise LLMError("Web search unavailable (unavailable)")
        return CallResult(data=WEB_PEOPLE, cost=0.03, web_searches=2, urls=[p["url"] for p in WEB_PEOPLE])


def _demo_plan(query: str) -> dict:
    from .models import Clarifying, Condition, Plan
    from .planner import estimate

    if re.search(r"infer|serving|llm", query, re.I):
        conditions = [Condition(text="Works on LLM inference or serving", importance="must"),
                      Condition(text="Based in the US", importance="must"),
                      Condition(text="Has open-source contributions (vLLM, TensorRT-LLM, etc.)", importance="preferred"),
                      Condition(text="Published on model compression or quantization", importance="preferred")]
        clarifying = Clarifying(question="Focus on which area?",
                                options=["GPU kernels", "Serving systems", "Quantization", "Any"])
        goal = "Find US-based engineers who make LLM inference faster or cheaper in production."
    else:
        conditions = [Condition(text=f"Matches the role: {query}", importance="must"),
                      Condition(text="Public work (code, papers or talks) in this area", importance="preferred")]
        clarifying = None
        goal = f"Find people who fit: {query}."
    return Plan(query=query, goal=goal, conditions=conditions, clarifying=clarifying, target=20,
                estimate=estimate(20)).model_dump()


def _demo_verdict(prompt: str) -> dict:
    name = re.search(r"^Person: (.+)$", prompt, re.M).group(1).strip()
    ids_by_kind: dict[str, list[str]] = {}
    for eid, kind in re.findall(r"^\[(e\d+)\] \((\w+)\)", prompt, re.M):
        ids_by_kind.setdefault(kind, []).append(eid)
    first = lambda kind: ids_by_kind.get(kind, [])[:1]  # noqa: E731
    any_ids = [i for ids in ids_by_kind.values() for i in ids]
    conditions = re.findall(r"^- \[(Must|Preferred)\] (.+)$", prompt, re.M)

    person = BY_NAME.get(name)
    if person is None:  # someone the fixtures only know from a paper's author list
        return {"status": "lead", "score": 61, "name": name, "role": "Researcher", "company": "", "location": "",
                "summary": "Co-author on a relevant paper; no other source found yet.",
                "reasons": [{"text": "Co-authored a relevant paper.", "refs": first("paper") or any_ids[:1]}],
                "checks": [{"text": t, "met": "unknown", "refs": []} for _, t in conditions],
                "tags": ["Research"], "exclusion": ""}
    status, score, role, summary, tags = person["verdict"]
    code, paper, web = first("code"), first("paper"), first("web")
    reasons = [{"text": summary.split(";")[0].strip() + ".", "refs": code or paper or web}]
    if paper:
        reasons.append({"text": f"Author of “{_paper_title(prompt, paper[0])}”.", "refs": paper})
    if web:
        reasons.append({"text": "A second, independent page names the same person and role.", "refs": web})
    met = "yes" if status == "verified" else ("no" if status == "no_match" else "unknown")
    checks = []
    for i, (importance, text) in enumerate(conditions):
        value = "yes" if (status == "verified" or i == 0) and status != "insufficient" else met
        if status == "no_match" and "US" in text:
            value = "no"
        checks.append({"text": text, "met": value, "refs": (code + web)[:2] if value == "yes" else []})
    return {"status": status, "score": score, "name": name, "role": role, "company": person["company"],
            "location": person["location"], "summary": summary, "reasons": reasons, "checks": checks, "tags": tags,
            "exclusion": person.get("exclusion", "")}


def _paper_title(prompt: str, eid: str) -> str:
    m = re.search(rf"^\[{eid}\] \(paper\) (.+?) — ", prompt, re.M)
    return m.group(1) if m else "a relevant paper"



def _demo_ask(prompt: str) -> dict:
    message = prompt.rsplit("Recruiter: ", 1)[-1].strip()
    zh = bool(re.search(r"[\u4e00-\u9fff]", message))
    rows = re.findall(r"^\[(\w+)\] ([^|]+) \| (\w+) \| score (\w+)", prompt, re.M)
    verified = [(cid, name.strip(), int(score)) for cid, name, status, score in rows if status == "verified"]
    verified.sort(key=lambda r: -r[2])
    blank = {"highlights": [], "options": [], "new_query": ""}
    if re.search(r"华人|华裔|中国人|chinese|asian|race|ethnic|种族|民族|国籍|女性|男性|年龄|gender|\bage\b", message, re.I):
        return {**blank, "kind": "clarify",
                "text": ("我不能按种族、民族或国籍来判断或筛选候选人——这不是公平、合法的招聘依据，凭姓名猜测也不可靠。"
                         "如果和岗位相关，我可以按这些条件帮你看：" if zh else
                         "I can't infer or filter people by race, ethnicity or national origin — it isn't a fair or "
                         "lawful basis for hiring, and guessing from names is unreliable. If it matters for the role, "
                         "I can look at:"),
                "options": (["资料里写明会说中文", "在某个城市", "资料里写明有美国工作许可", "其他（自己输入）"] if zh else
                            ["States they speak Mandarin", "Based in a specific city", "States US work authorization",
                             "Something else (type it)"])}
    if re.search(r"canada|加拿大|more|更多|expand|扩大|另外|other companies|startup|初创", message, re.I):
        base = re.search(r"^Request: (.+)$", prompt, re.M).group(1)
        change = "including Canada" if re.search(r"canada|加拿大", message, re.I) else "with more candidates in the same area"
        return {**blank, "kind": "refine", "new_query": f"{base}, {change}",
                "text": ("好的，我会按新条件重新规划一次搜索：" if zh else "I'll plan a new search for: ")
                        + f"{base}, {change}"}
    if re.search(r"^(他们|她们|they|them)\b|他们|那家|that company", message, re.I) and not verified:
        return {**blank, "kind": "clarify",
                "text": "您说的“他们”具体指哪些人？" if zh else "Who do you mean by “they”?",
                "options": ["已核验的候选人", "某家公司的人", "其他（自己输入）"] if zh else
                           ["The verified candidates", "People at one company", "Something else (type it)"]}
    top = verified[:3]
    names = ", ".join(n for _, n, _ in top)
    return {**blank, "kind": "answer", "highlights": [c for c, _, _ in top],
            "text": (f"共有 {len(verified)} 位已核验。匹配度最高的是 {names}。" if zh else
                     f"{len(verified)} people are verified. The strongest matches are {names}.")}


def _demo_profile(prompt: str, zh: bool) -> dict:
    head = re.search(r"^Person: (.+?) \((.*)\)$", prompt, re.M)
    name, detail = head.group(1), head.group(2)
    ev = re.findall(r"^\[(e\d+)\] \((\w+)\) (.+?) — ", prompt, re.M)
    by_kind = {}
    for eid, kind, title in ev:
        by_kind.setdefault(kind, []).append((eid, title))
    code = by_kind.get("code", [])
    papers = by_kind.get("paper", [])
    web = by_kind.get("web", [])
    exp = []
    for eid, title in code[1:3]:
        exp.append({"text": (f"维护或贡献了 {title}。" if zh else f"Maintains or contributes to {title}."), "refs": [eid]})
    for eid, title in papers[:2]:
        exp.append({"text": (f"论文作者：《{title}》。" if zh else f"Author of “{title}”."), "refs": [eid]})
    for eid, title in web[:1]:
        exp.append({"text": (f"个人或公司页面「{title}」确认了当前职位。" if zh else f"“{title}” confirms the current role."), "refs": [eid]})
    first = [e for e, _, _ in ev[:2]]
    return {
        "headline": detail.replace(", ", " · ").strip(" ·"),
        "summary": [{"text": (f"{name} 的公开工作集中在大模型推理和服务方向。" if zh else
                              f"{name}'s public work centers on LLM inference and serving."), "refs": first}],
        "experience": exp or [{"text": "公开资料较少。" if zh else "Little public material.", "refs": first[:1]}],
        "strengths": (["推理性能优化", "开源贡献", "有论文支撑"] if zh else
                      ["Inference performance", "Open-source track record", "Published work"])[: 2 + bool(papers)],
        "open_questions": (["目前的职级和团队规模？", "是否考虑新机会、时间点？", "是否愿意搬迁或远程？"] if zh else
                           ["Current level and team size?", "Open to a move, and when?", "Relocation or remote?"]),
        "outreach": (f"看到你在 {code[1][1] if len(code) > 1 else '推理'} 上的工作，想和你聊聊一个相关的机会。" if zh else
                     f"Your work on {code[1][1] if len(code) > 1 else 'inference'} caught my eye — I'd love to tell you about a related role."),
    }
