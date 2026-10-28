"use strict";
// Talent Search web app: search home (P1), plan review (P2), live search (P3), results with follow-up chat (P4),
// candidate drawer with profile and contact (P5), shortlist, history, cost report (P6), empty and error states (P7).
// No build step. All interface text goes through t() so it can switch between English and Chinese.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");
const money = (n, d = 2) => (n == null ? "—" : "$" + Number(n).toFixed(d));
const FINAL = ["done", "stopped", "budget", "failed"];

// ---------- Language ----------

const ZH = {
  "Search": "搜索", "Shortlist": "候选名单", "History": "历史记录", "Cost report": "成本报表",
  "Spent this month": "本月已花费", "Demo data · no API calls": "演示数据 · 不调用接口",
  "Every search replays one recorded sample run with fictional people.": "每次搜索都会回放同一组录制好的示例结果，人物均为虚构。",
  "{n} searches": "{n} 次搜索", "{n} search": "{n} 次搜索",
  "Who are you looking for?": "你想找什么样的人？",
  "Describe who you're looking for — role, skills, location, experience": "描述你要找的人——职位、技能、地点、经验",
  "Search request": "搜索需求", "Plan search": "生成搜索计划",
  "You'll review the plan and cost before anything is spent.": "开始花钱之前，你会先看到计划和预估费用。",
  "Describe who you're looking for in a few words.": "用几个词描述你要找的人。",
  "Reading your request…": "正在理解你的需求…", "Try an example": "试试这些例子",
  "LLM inference optimization engineers in the US": "美国做大模型推理优化的工程师",
  "PhD researchers in computer vision, California": "加州计算机视觉方向的博士研究员",
  "Full-stack engineers who contribute to open-source AI agent frameworks": "给开源 AI Agent 框架贡献代码的全栈工程师",
  "Engineers experienced with on-device model deployment on iOS (Core ML)": "有 iOS 端侧模型部署（Core ML）经验的工程师",
  "Edit request": "修改需求", "Review the search plan": "确认搜索计划",
  "From your request {q}. Nothing is spent until you start.": "根据你的需求 {q} 生成。开始之前不会产生费用。",
  "Goal": "核心目标", "Conditions": "条件", "Must = required to qualify. Preferred = raises the score.": "必须 = 不满足就不合格；优先 = 满足会加分。",
  "Condition {n}": "条件 {n}", "Must": "必须", "Preferred": "优先", "Remove condition": "删除条件", "Add condition": "添加条件",
  "How many people": "目标人数", "qualified candidates, then the search stops": "位合格候选人，达到后停止搜索",
  "Where it will look": "搜索范围", "free": "免费", "~$0.01 / search": "约 $0.01 / 次", "most of the cost": "主要费用",
  "Papers (OpenAlex)": "论文（OpenAlex）", "Web search": "网页搜索", "Personal homepages": "个人主页", "AI verification": "AI 核验",
  "A person is marked Verified only when every Must condition has evidence and at least two independent sites agree.":
    "只有每个“必须”条件都有证据、且至少两个独立网站互相印证时，才会标为“已核验”。",
  "Estimated cost {c} · about {m} min": "预估费用 {c} · 约 {m} 分钟",
  "Stops automatically at your {b} per-search limit.": "单次搜索达到 {b} 上限会自动停止。",
  "Back": "返回", "Start search": "开始搜索", "Add at least one condition.": "至少保留一个条件。",
  "Loading search…": "正在加载…", "{a} must · {b} preferred": "{a} 个必须 · {b} 个优先", "focus: {f}": "侧重：{f}",
  "target {n}": "目标 {n} 人", "finished {d}": "完成于 {d}", "Stop search": "停止搜索", "Export CSV": "导出 CSV",
  "Share": "分享", "Link copied": "链接已复制", "Copied": "已复制",
  "Search trace": "搜索轨迹", "{t} elapsed": "已用时 {t}", "people found": "已找到", "sources checked": "已查来源",
  "of {b} limit": "上限 {b}", "running…": "进行中…", "failed": "失败",
  "Verifying {p} of {n} · {v} verified so far": "正在核验 {n} 人中的 {p} 人 · 已核验 {v} 人",
  "Searching more sources · {v} of {t} verified": "继续搜索更多来源 · 已核验 {v}/{t}",
  "Searching sources · verification starts as people come in": "正在搜索来源 · 找到人后立即开始核验",
  "{n} verified": "{n} 已核验", "{n} lead only": "{n} 仅线索", "{n} pending": "{n} 待验证", "{n} not included": "{n} 未纳入",
  "{n} qualified": "{n} 合格", "Only verified": "只看已核验", "Sort": "排序", "Match score": "匹配度", "Status": "状态", "Name": "姓名",
  "Candidate": "候选人", "Match": "匹配", "Why they match": "匹配理由", "Evidence": "证据来源", "Contact": "联系方式",
  "Candidates": "候选人", "No score yet": "暂无分数", "Checking sources…": "正在核查来源…",
  "Rows keep their place while the search runs.": "搜索进行中，行的位置不会变动。",
  "People appear here as soon as a source returns them.": "一旦有来源返回结果，人就会出现在这里。",
  "Verified": "已核验", "Lead only": "仅线索", "Pending": "待验证", "Not enough evidence": "证据不足", "Didn't match": "不符合",
  "Select {name}": "选择 {name}", "Select all": "全选", "{n} selected": "已选 {n} 人", "Save to shortlist": "加入候选名单",
  "Find emails": "获取邮箱", "Export selected": "导出所选", "Clear": "清除", "Find email": "获取邮箱",
  "Not published": "未公开", "Looking…": "查找中…", "Copy email": "复制邮箱", "from {d}": "来自 {d}",
  "Saved {n} to shortlist": "已将 {n} 人加入候选名单", "Found {f} of {n} emails": "{n} 人中找到 {f} 个邮箱",
  "Showing {n} from your question": "按你的问题显示 {n} 人", "Show these {n}": "只看这 {n} 人", "Plan this search": "按这个生成新搜索",
  "Ask about these results or change the search": "就这些结果提问，或调整搜索",
  "Send": "发送", "Thinking…": "思考中…",
  "Stopped at your {b} limit. {n} people found.": "已达到 {b} 上限，共找到 {n} 人。",
  "{v} are verified and {l} are lead only. {p} were still pending.": "{v} 人已核验，{l} 人仅线索，{p} 人尚未核验。",
  "Continue for another {b}": "再花 {b} 继续", "The search stopped because of an error": "搜索因错误中止",
  "Results found before the error are kept below.": "出错前找到的结果保留在下方。",
  "You stopped this search. {n} people found so far are kept below.": "你已停止搜索，已找到的 {n} 人保留在下方。",
  "Web search unavailable": "网页搜索不可用",
  "Results come from GitHub and papers only. Fewer people can be confirmed by location, so more will stay Lead only.":
    "结果只来自 GitHub 和论文。能确认地点的人会变少，所以更多人会停留在“仅线索”。",
  "Search trace · {n} steps": "搜索轨迹 · {n} 步", "{d} · {s} sources · {c}": "{d} · {s} 个来源 · {c}", "Show": "展开", "Hide": "收起",
  "Summary": "总结", "Qualified by area": "各方向合格人数", "Next searches": "推荐追问",
  "Each opens a new plan to review first.": "每个都会先生成新计划供你确认。",
  "No summary for this search because it didn't finish.": "搜索未完成，没有总结。", "No summary for this search.": "这次搜索没有总结。",
  "Not checked before the search ended.": "搜索结束前未来得及核验。", "Role unknown": "职位未知",
  "No one met every Must condition": "没有人满足全部“必须”条件",
  "The search checked {n} sources but found no one who fits. Loosening one condition usually helps.": "共查了 {n} 个来源，但没有合适的人。放宽一个条件通常会有帮助。",
  "Try loosening one condition": "试试放宽一个条件", "Remove “{c}”": "去掉“{c}”",
  "You'll review the new plan before anything is spent.": "开始花钱之前，你会先确认新计划。",
  "Previous candidate": "上一位", "Next candidate": "下一位", "Close details": "关闭详情", "{i} of {n} · ↑↓ to move": "第 {i}/{n} 位 · ↑↓ 切换",
  "Gathering more details…": "正在补全资料…", "Code": "代码", "Papers": "论文", "Web": "网页", "GitHub": "GitHub", "Homepage": "个人主页",
  "Met": "满足", "Not met": "不满足", "Unknown": "未知", "(opens in new tab)": "（在新标签页打开）",
  "Saved": "已收藏", "Generate profile": "生成档案", "Regenerate": "重新生成", "Writing profile…": "正在生成档案…",
  "Profile": "档案", "Experience": "经历", "Strengths": "优势", "Ask in a first call": "首次沟通可以问", "Opening line": "开场白", "Copy": "复制",
  "commits": "次提交", "followers": "关注者", "pushed {d}": "最近推送 {d}", "citations": "次引用", "fetched {d}": "抓取于 {d}",
  "Loading…": "加载中…", "Done": "完成", "Stopped": "已停止", "Budget limit": "达到预算", "Failed": "失败", "Running": "进行中",
  "No searches yet.": "还没有搜索记录。", "Start one": "开始搜索", "Request": "需求", "When": "时间", "People": "人数", "Cost": "费用", "Time": "耗时",
  "Past searches": "历史搜索",
  "GitHub, papers and homepages are free; you pay for web search and AI verification. Per-search limit {b}.":
    "GitHub、论文和个人主页免费；网页搜索和 AI 核验收费。单次上限 {b}。",
  "Month": "月份", "Totals": "汇总", "Searches": "搜索次数", "{n} stopped at budget limit": "{n} 次因预算停止", "Average per search": "平均每次",
  "Per verified candidate": "每位已核验候选人", "Searches this month": "本月搜索", "Stopped at budget limit": "因预算停止",
  "No results": "无结果", "No searches this month.": "本月没有搜索。", "By source": "按来源",
  "Free": "免费", "Billed per search": "按次计费", "Planning, reading sources, scoring": "规划、阅读来源、打分", "Total": "合计",
  "Homepage fetches": "个人主页抓取",
  "Saved people from all searches. Notes save when you leave the box.": "所有搜索中收藏的人。备注在离开输入框时自动保存。",
  "No one saved yet. Open a search and press Save to shortlist.": "还没有收藏。打开一次搜索，点“加入候选名单”。",
  "Note": "备注", "From search": "来自搜索", "Remove from shortlist": "从候选名单移除", "Add a note": "添加备注",
};
let LANG = (() => {
  try { const saved = localStorage.getItem("ts-lang"); if (saved) return saved; } catch { /* ignore */ }
  return navigator.language?.startsWith("zh") ? "zh" : "en";
})();
function t(s, p) {
  let out = (LANG === "zh" && ZH[s]) || s;
  if (p) out = out.replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));
  return out;
}
const tz = (s, p) => esc(t(s, p)); // translated and escaped, for HTML

function applyLang() {
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
  $$("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
  $$("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === LANG));
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new Error((data && data.detail) || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
async function copy(text, msg = t("Copied")) {
  try { await navigator.clipboard.writeText(text); toast(msg); } catch { prompt("", text); }
}

// ---------- Icons ----------

const I = {
  search: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"></circle><path d="M10.5 10.5 14 14"></path></svg>',
  list: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h6"></path></svg>',
  stop: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1"></rect></svg>',
  download: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"></path></svg>',
  plus: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"></path></svg>',
  trash: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"></path></svg>',
  close: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"></path></svg>',
  up: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4"></path></svg>',
  down: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"></path></svg>',
  ext: '<svg class="ic" viewBox="0 0 16 16" style="width:14px;height:14px" aria-hidden="true"><path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5V13H3V4.5h3.5"></path></svg>',
  bookmark: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5h7v11L8 11l-3.5 2.5z"></path></svg>',
  bookmarked: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5h7v11L8 11l-3.5 2.5z" fill="currentColor"></path></svg>',
  mail: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1"></rect><path d="M2.5 4.5 8 9l5.5-4.5"></path></svg>',
  doc: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h5.5L12 4.5V14H4z"></path><path d="M6 7h4M6 9.5h4M6 12h2.5"></path></svg>',
  share: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="8" r="1.8"></circle><circle cx="12" cy="4" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><path d="M5.6 7.2 10.4 4.8M5.6 8.8l4.8 2.4"></path></svg>',
  copy: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1"></rect><path d="M3 10.5V3.5a1 1 0 0 1 1-1h6.5"></path></svg>',
  send: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10M8.5 4l4 4-4 4"></path></svg>',
  github: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"></path></svg>',
  papers: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h5.5L12 4.5V14H4z"></path><path d="M6 7h4M6 9.5h4"></path></svg>',
  homepage: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7.5 8 3l5.5 4.5v6h-11z"></path><path d="M6.5 13.5V10h3v3.5"></path></svg>',
  web: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M2 8h12M8 2c2.2 2 2.2 10 0 12M8 2c-2.2 2-2.2 10 0 12"></path></svg>',
};
const SRC_LABEL = { github: "GitHub", papers: "Papers", homepage: "Homepage", web: "Web" };
const srcIcon = (s) => `<span title="${tz(SRC_LABEL[s] || s)}" role="img" aria-label="${tz(SRC_LABEL[s] || s)}">${I[s] || ""}</span>`;

const STATUS = {
  verified: { label: "Verified", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="currentColor"></circle><path d="M5.2 8.3l1.9 1.9 3.7-4" fill="none" stroke="var(--verified-soft)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>' },
  lead: { label: "Lead only", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4"></circle><path d="M8 2.2a5.8 5.8 0 0 1 0 11.6z" fill="currentColor"></path></svg>' },
  pending: { label: "Pending", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.6 2.1"></circle></svg>' },
  insufficient: { label: "Not enough evidence", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4"></circle><path d="M5.3 8h5.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>' },
  no_match: { label: "Didn't match", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4"></circle><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>' },
};
const badge = (status) => `<span class="badge b-${status}">${STATUS[status].svg}${tz(STATUS[status].label)}</span>`;
const scoreColor = (s) => `var(--score-${s < 50 ? 1 : s < 65 ? 2 : s < 80 ? 3 : s < 90 ? 4 : 5})`;
const initials = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const fmtDur = (s) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

// ---------- App state ----------

const app = { config: null, view: null, es: null, search: null, plan: null };

function loadPlan() {
  try { return JSON.parse(sessionStorage.getItem("ts-plan") || "null"); } catch { return null; }
}
function savePlan(plan) {
  try { sessionStorage.setItem("ts-plan", JSON.stringify(plan)); } catch { /* private mode */ }
  app.plan = plan;
}

async function refreshSpend() {
  try {
    const r = await api("/api/cost");
    $("#month-spent").textContent = money(r.total);
    $("#month-searches").textContent = t(r.searches === 1 ? "{n} search" : "{n} searches", { n: r.searches });
  } catch { /* nav footer is best-effort */ }
}
async function refreshShortlistCount() {
  try { const n = (await api("/api/shortlist")).length; $("#shortlist-count").textContent = n || ""; } catch { /* best-effort */ }
}

function setNav(which) {
  $$(".nav-a").forEach((a) => {
    a.classList.toggle("on", a.dataset.nav === which);
    a.toggleAttribute("aria-current", a.dataset.nav === which);
  });
}

// ---------- Router ----------

function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "search" && parts[1]) {
    const cid = parts[2] === "c" ? parts[3] : null;
    if (app.view !== "search" || app.search?.id !== parts[1]) showSearch(parts[1]);
    renderDrawer(cid);
    return;
  }
  closeStream();
  renderDrawer(null);
  if (parts[0] === "plan") return showPlan();
  if (parts[0] === "shortlist") return showShortlist();
  if (parts[0] === "history") return showHistory();
  if (parts[0] === "cost") return showCost();
  return showHome();
}

function rerender() {
  applyLang();
  if (app.view === "search" && app.search?.state) { renderSearch(); renderDrawer(app.search.drawer); return; }
  route();
}

function closeStream() {
  if (app.es) { app.es.close(); app.es = null; }
  app.search = null;
}

// ---------- P1 Home ----------

function showHome() {
  app.view = "home";
  setNav("search");
  const examples = ["LLM inference optimization engineers in the US", "PhD researchers in computer vision, California",
    "Full-stack engineers who contribute to open-source AI agent frameworks", "Engineers experienced with on-device model deployment on iOS (Core ML)"];
  $("#view").innerHTML = `
  <main class="home"><div class="home-inner">
    <div style="display:flex;flex-direction:column;gap:16px">
      <h1 class="display">${tz("Who are you looking for?")}</h1>
      <form class="searchbox" id="home-form">
        <label for="q" class="sr">${tz("Search request")}</label>
        <textarea id="q" rows="3" placeholder="${tz("Describe who you're looking for — role, skills, location, experience")}"></textarea>
        <div class="searchbox-foot">
          <span class="sm muted" id="home-note">${tz("You'll review the plan and cost before anything is spent.")}</span>
          <button class="btn btn-p" style="height:36px;padding:0 16px">${I.search}${tz("Plan search")}</button>
        </div>
      </form>
    </div>
    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="heading">${tz("Try an example")}</h2>
      <div style="border-top:1px solid var(--line)">
        ${examples.map((e) => `<button type="button" class="ex" data-ex="${tz(e)}">${I.list}<span>${tz(e)}</span></button>`).join("")}
      </div>
    </section>
  </div></main>`;
  const q = $("#q");
  $$(".ex").forEach((b) => b.addEventListener("click", () => { q.value = b.dataset.ex; q.focus(); }));
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#home-form").requestSubmit(); } });
  $("#home-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = q.value.trim();
    const note = $("#home-note");
    if (query.length < 4) { note.textContent = t("Describe who you're looking for in a few words."); q.focus(); return; }
    await planFrom(query, e.submitter || $("#home-form button"), note);
  });
  q.focus();
}

async function planFrom(query, btn, note) {
  if (btn) btn.disabled = true;
  if (note) note.textContent = t("Reading your request…");
  try {
    savePlan(await api("/api/plan", { method: "POST", body: { query } }));
    location.hash = "#/plan";
  } catch (err) {
    if (note) note.textContent = err.message; else toast(err.message);
    if (btn) btn.disabled = false;
  }
}

// ---------- P2 Plan review ----------

function estimate(target) {
  const checked = Math.max(10, Math.floor(target * 1.6));
  return { cost: 0.08 + checked * 0.016, minutes: Math.max(1, Math.round((checked * 3.5) / 60 / 2)) };
}

function showPlan() {
  app.view = "plan";
  setNav("search");
  const plan = app.plan || loadPlan();
  if (!plan) { location.hash = "#/"; return; }
  app.plan = plan;
  const budget = app.config?.budget ?? 1;
  const v = $("#view");
  const render = () => {
    const est = estimate(plan.target);
    v.innerHTML = `
    <header class="page-head">
      <a href="#/" class="sm">${tz("Edit request")}</a>
      <h1 class="title">${tz("Review the search plan")}</h1>
      <p class="muted">${t("From your request {q}. Nothing is spent until you start.", { q: "\u0000" }).split("\u0000").map(esc).join(`<span class="mono sm" style="color:var(--ink)">“${esc(plan.query)}”</span>`)}</p>
    </header>
    <div class="plan-body">
      <form class="plan-form" id="plan-form">
        <div style="display:flex;flex-direction:column;gap:8px">
          <label for="goal" class="heading">${tz("Goal")}</label>
          <input id="goal" class="input" value="${esc(plan.goal)}">
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><h2 class="heading">${tz("Conditions")}</h2><span class="sm muted">${tz("Must = required to qualify. Preferred = raises the score.")}</span></div>
          <div class="cond-list">
            ${plan.conditions.map((c, i) => `
            <div class="cond">
              <label class="sr" for="c${i}">${tz("Condition {n}", { n: i + 1 })}</label>
              <input id="c${i}" data-i="${i}" class="cond-text" value="${esc(c.text)}">
              <div class="seg" role="group" aria-label="${tz("Must")} / ${tz("Preferred")}">
                <button type="button" data-i="${i}" data-imp="must" aria-pressed="${c.importance === "must"}">${tz("Must")}</button>
                <button type="button" data-i="${i}" data-imp="preferred" aria-pressed="${c.importance === "preferred"}">${tz("Preferred")}</button>
              </div>
              <button type="button" class="btn btn-q btn-icon" data-rm="${i}" aria-label="${tz("Remove condition")}" style="color:var(--muted)">${I.trash}</button>
            </div>`).join("")}
            <div style="padding:6px"><button type="button" class="btn btn-q" id="add-cond">${I.plus}${tz("Add condition")}</button></div>
          </div>
        </div>
        ${plan.clarifying ? `
        <fieldset style="margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:10px">
          <legend class="heading" style="padding:0;margin-bottom:4px">${esc(plan.clarifying.question)}</legend>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${plan.clarifying.options.map((o) => `<button type="button" class="opt" data-focus="${esc(o)}" aria-pressed="${(plan.focus || "Any") === o}">${esc(o)}</button>`).join("")}
          </div>
        </fieldset>` : ""}
        <div style="display:flex;flex-direction:column;gap:8px">
          <label for="target" class="heading">${tz("How many people")}</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input id="target" type="number" min="5" max="100" value="${plan.target}" class="input mono" style="width:88px">
            <span class="sm muted">${tz("qualified candidates, then the search stops")}</span>
          </div>
        </div>
      </form>
      <aside class="plan-side" aria-label="${tz("Where it will look")}">
        <h2 class="heading">${tz("Where it will look")}</h2>
        <div style="border-top:1px solid var(--line)">
          <div class="src-row">${I.github}<span style="flex:1">GitHub</span><span class="mono xs muted">${tz("free")}</span></div>
          <div class="src-row">${I.papers}<span style="flex:1">${tz("Papers (OpenAlex)")}</span><span class="mono xs muted">${tz("free")}</span></div>
          <div class="src-row">${I.web}<span style="flex:1">${tz("Web search")}</span><span class="mono xs muted">${tz("~$0.01 / search")}</span></div>
          <div class="src-row">${I.homepage}<span style="flex:1">${tz("Personal homepages")}</span><span class="mono xs muted">${tz("free")}</span></div>
          <div class="src-row">${I.search}<span style="flex:1">${tz("AI verification")}</span><span class="mono xs muted">${tz("most of the cost")}</span></div>
        </div>
        <p class="sm muted">${tz("A person is marked Verified only when every Must condition has evidence and at least two independent sites agree.")}</p>
      </aside>
    </div>
    <footer class="sticky-foot">
      <div style="display:flex;flex-direction:column;gap:2px;flex:1 1 auto">
        <span>${tz("Estimated cost {c} · about {m} min", { c: "~" + money(est.cost), m: est.minutes })}</span>
        <span class="sm muted">${tz("Stops automatically at your {b} per-search limit.", { b: money(budget) })}</span>
      </div>
      <span class="sm" id="plan-err" role="alert" style="color:var(--insufficient)"></span>
      <a href="#/" class="btn">${tz("Back")}</a>
      <button type="button" class="btn btn-p" id="start" style="height:36px;padding:0 18px">${tz("Start search")}</button>
    </footer>`;
    bind();
  };
  const sync = () => {
    plan.goal = $("#goal").value;
    $$(".cond-text").forEach((inp) => { plan.conditions[+inp.dataset.i].text = inp.value; });
    plan.target = Math.max(5, Math.min(100, parseInt($("#target").value, 10) || 20));
    savePlan(plan);
  };
  const bind = () => {
    $$(".seg button[data-imp]").forEach((b) => b.addEventListener("click", () => { sync(); plan.conditions[+b.dataset.i].importance = b.dataset.imp; render(); }));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", () => { sync(); plan.conditions.splice(+b.dataset.rm, 1); render(); }));
    $("#add-cond").addEventListener("click", () => {
      sync();
      plan.conditions.push({ text: "", importance: "preferred" });
      render();
      $(`#c${plan.conditions.length - 1}`).focus();
    });
    $$("[data-focus]").forEach((b) => b.addEventListener("click", () => { sync(); plan.focus = b.dataset.focus; render(); }));
    $("#target").addEventListener("change", () => { sync(); render(); });
    $("#start").addEventListener("click", async (e) => {
      sync();
      plan.conditions = plan.conditions.filter((c) => c.text.trim());
      if (!plan.conditions.length) { $("#plan-err").textContent = t("Add at least one condition."); return; }
      e.target.disabled = true;
      try {
        const { id } = await api("/api/searches", { method: "POST", body: plan });
        location.hash = `#/search/${id}`;
      } catch (err) {
        $("#plan-err").textContent = err.message;
        e.target.disabled = false;
      }
    });
  };
  render();
}

// ---------- P3 / P4 Search ----------

function showSearch(id) {
  closeStream();
  app.view = "search";
  setNav("search");
  app.search = { id, state: null, progress: null, sel: null, sort: "score", onlyVerified: false, traceOpen: false,
    picked: new Set(), filterIds: null, shortlisted: new Set(), busy: new Set(), asking: false };
  $("#view").innerHTML = `<div class="page"><p class="muted">${tz("Loading search…")}</p></div>`;
  const es = new EventSource(`/api/searches/${id}/events`);
  app.es = es;
  const S = app.search;
  api(`/api/searches/${id}`).then((d) => { S.shortlisted = new Set(d.shortlisted || []); if (S.state && FINAL.includes(S.state.status)) renderSearch(); }).catch(() => {});
  es.addEventListener("snapshot", (e) => {
    const data = JSON.parse(e.data);
    S.state = data;
    S.progress = data.progress || progressFrom(data);
    renderSearch();
    renderDrawer(S.drawer);
    if (FINAL.includes(data.status)) es.close();
  });
  es.addEventListener("trace", (e) => upsertStep(JSON.parse(e.data)));
  es.addEventListener("candidate", (e) => upsertCandidate(JSON.parse(e.data)));
  es.addEventListener("progress", (e) => { S.progress = JSON.parse(e.data); S.state.cost = S.progress.cost; S.state.budget = S.progress.budget; renderReadouts(); });
  es.addEventListener("status", (e) => {
    const data = JSON.parse(e.data);
    S.state.status = data.status;
    if (data.summary) S.state.summary = data.summary;
    if (data.error) S.state.error = data.error;
    if (FINAL.includes(data.status)) {
      es.close();
      // Pull the saved final state so totals (sources, timing, cost) match what was stored.
      api(`/api/searches/${id}`).then((full) => { S.state = full; S.progress = progressFrom(full); S.shortlisted = new Set(full.shortlisted || []); })
        .catch(() => {}).finally(() => { renderSearch(); renderDrawer(S.drawer); refreshSpend(); });
    } else renderSearch();
  });
  es.onerror = () => { if (S.state && FINAL.includes(S.state.status)) es.close(); };
}

function progressFrom(state) {
  const counts = { pending: 0, verified: 0, lead: 0, insufficient: 0, no_match: 0 };
  state.candidates.forEach((c) => { counts[c.status] += 1; });
  return { cost: state.cost, budget: state.budget, sources_checked: state.sources_checked, people: state.candidates.length, counts, elapsed: null };
}

const isFinal = () => FINAL.includes(app.search?.state?.status);

function renderSearch() {
  const S = app.search;
  const st = S.state;
  const final = isFinal();
  const conds = st.plan.conditions;
  const must = conds.filter((c) => c.importance === "must").length;
  const meta = [tz("{a} must · {b} preferred", { a: must, b: conds.length - must })];
  if (st.plan.focus && st.plan.focus !== "Any") meta.push(tz("focus: {f}", { f: st.plan.focus }));
  meta.push(tz("target {n}", { n: st.plan.target }));
  if (final && st.finished_at) meta.push(tz("finished {d}", { d: new Date(st.finished_at).toLocaleString(LANG === "zh" ? "zh-CN" : "en-US") }));
  const chatScroll = $("#chat-scroll")?.scrollTop;
  $("#view").innerHTML = `
  <div class="search">
    ${final ? chatColumn(st) : traceColumn(st)}
    <main class="results">
      <header class="results-head">
        <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
          <h1 class="title">${esc(st.plan.query)}</h1>
          <span class="sm muted">${meta.join(" · ")}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" id="share">${I.share}${tz("Share")}</button>
          ${final
            ? `<a class="btn" href="/api/searches/${esc(st.id)}/export.csv">${I.download}${tz("Export CSV")}</a>`
            : `<button type="button" class="btn" id="stop">${I.stop}${tz("Stop search")}</button>`}
        </div>
      </header>
      ${statusCallout(st)}
      <div class="toolbar" id="toolbar">${toolbar(st)}</div>
      <div id="bulk">${bulkBar()}</div>
      <div class="table-wrap" id="table-wrap">
        ${st.candidates.length || !final ? `
        <div class="table" role="table" aria-label="${tz("Candidates")}" id="table">
          ${headRow()}
          <div id="rows" role="rowgroup">${visibleRows(st).map((c) => rowHtml(c)).join("")}</div>
        </div>
        ${!final ? `<p class="sm muted" style="padding:12px 24px" id="rows-note">${tz(st.candidates.length ? "Rows keep their place while the search runs." : "People appear here as soon as a source returns them.")}</p>` : ""}
        ${final ? excludedHtml(st) : ""}` : emptyHtml(st)}
      </div>
    </main>
  </div>`;
  if (chatScroll != null && $("#chat-scroll")) $("#chat-scroll").scrollTop = chatScroll;
  else if ($("#chat-scroll")) $("#chat-scroll").scrollTop = $("#chat-scroll").scrollHeight;
  bindSearch();
}

function headRow() {
  const final = isFinal();
  const rows = visibleRows(app.search.state);
  const all = final && rows.length && rows.every((c) => app.search.picked.has(c.id));
  return `<div class="rw head${final ? " x" : ""}" role="row">
    ${final ? `<span role="columnheader"><input type="checkbox" id="pick-all" ${all ? "checked" : ""} aria-label="${tz("Select all")}"></span>` : ""}
    <span role="columnheader">${tz("Candidate")}</span><span role="columnheader">${tz("Status")}</span><span role="columnheader">${tz("Match")}</span><span role="columnheader">${tz("Why they match")}</span><span role="columnheader">${tz("Evidence")}</span>
    ${final ? `<span role="columnheader">${tz("Contact")}</span>` : ""}
  </div>`;
}

function traceColumn(st) {
  return `
  <section class="trace" aria-label="${tz("Search trace")}">
    <div class="trace-head">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="heading">${tz("Search trace")}</h2><span class="mono xs tmuted" id="elapsed"></span></div>
      <p class="readouts" aria-live="polite" id="readouts"></p>
      <div style="display:flex;flex-direction:column;gap:6px">
        <span class="bar"><span id="pbar" style="width:0%"></span></span>
        <span class="xs tmuted" id="phase"></span>
      </div>
    </div>
    <div class="trace-scroll"><ol class="trace-list" id="trace-list">${st.trace.map((s) => stepHtml(s)).join("")}</ol></div>
  </section>`;
}

function stepHtml(s, enter = false) {
  const dur = s.status === "running" ? `<span class="mono xs" style="color:var(--trace-accent)">${tz("running…")}</span>`
    : s.status === "failed" ? `<span class="mono xs tfail">${tz("failed")}${s.seconds != null ? ` · ${s.seconds}s` : ""}</span>`
    : `<span class="mono xs tmuted">${s.seconds ?? ""}s</span>`;
  const node = s.status === "failed"
    ? `<svg style="margin-top:1px;width:14px;height:14px;color:var(--trace-failed);position:relative" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="var(--trace)" stroke="currentColor" stroke-width="1.4"></circle><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>`
    : `<span class="dot${s.status === "running" ? " run" : ""}"></span>`;
  return `
  <li class="tstep${enter ? " enter" : ""}" data-step="${esc(s.id)}">
    <div class="tnode">${node}</div>
    <div class="tbody">
      <div class="tline"><span style="font-weight:500">${esc(s.action)}</span>${dur}</div>
      <span class="tq">${esc(s.query)}</span>
      ${s.status === "failed" ? `<span class="sm tfail">${esc(s.note)}</span>` : ""}
      ${s.domains.length || s.found ? `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${s.domains.map((d) => `<span class="chip">${esc(d)}</span>`).join("")}<span class="xs tmuted" style="margin-left:2px">${esc(s.found)}</span></div>` : ""}
    </div>
  </li>`;
}

function upsertStep(step) {
  const S = app.search;
  if (!S?.state) return;
  const i = S.state.trace.findIndex((s) => s.id === step.id);
  if (i >= 0) S.state.trace[i] = step; else S.state.trace.push(step);
  const list = $("#trace-list");
  if (!list) return;
  const el = list.querySelector(`[data-step="${CSS.escape(step.id)}"]`);
  if (el) el.outerHTML = stepHtml(step);
  else list.insertAdjacentHTML("beforeend", stepHtml(step, true));
}

function renderReadouts() {
  const S = app.search;
  const p = S?.progress;
  if (!p || !$("#readouts")) { const tb = $("#toolbar"); if (tb && S) { tb.innerHTML = toolbar(S.state); } return; }
  const target = S.state.plan.target;
  $("#readouts").innerHTML = `
    <span><span class="readout">${p.people}</span><span class="xs tmuted">${tz("people found")}</span></span>
    <span><span class="readout">${p.sources_checked}</span><span class="xs tmuted">${tz("sources checked")}</span></span>
    <span><span class="readout">${money(p.cost)}</span><span class="xs tmuted">${tz("of {b} limit", { b: money(p.budget) })}</span></span>`;
  if (p.elapsed != null) $("#elapsed").textContent = t("{t} elapsed", { t: fmtDur(p.elapsed) });
  const pct = Math.min(98, Math.round(Math.max(p.counts.verified / target, (p.people - p.counts.pending) / Math.max(p.people, 1) * 0.5) * 100));
  $("#pbar").style.width = `${p.people ? pct : 3}%`;
  $("#phase").textContent = p.counts.pending
    ? t("Verifying {p} of {n} · {v} verified so far", { p: p.counts.pending, n: p.people, v: p.counts.verified })
    : p.people ? t("Searching more sources · {v} of {t} verified", { v: p.counts.verified, t: target }) : t("Searching sources · verification starts as people come in");
  $("#toolbar").innerHTML = toolbar(S.state);
}

const num = (n) => `<b class="mono" style="font-weight:500">${n}</b>`;
const withNum = (key, n) => tz(key, { n: "\u0000" }).split("\u0000").join(num(n));

function toolbar(st) {
  const S = app.search;
  const c = (isFinal() ? progressFrom(st) : S.progress || progressFrom(st)).counts;
  if (!isFinal()) {
    return `<span>${withNum("{n} verified", c.verified)}</span><span>${withNum("{n} lead only", c.lead)}</span><span>${withNum("{n} pending", c.pending)}</span>${c.insufficient + c.no_match ? `<span>${withNum("{n} not included", c.insufficient + c.no_match)}</span>` : ""}`;
  }
  return `
    <span style="display:inline-flex;gap:6px;align-items:center;color:var(--verified)">${STATUS.verified.svg}<span style="color:var(--ink)">${withNum("{n} qualified", c.verified)}</span></span>
    <span style="display:inline-flex;gap:6px;align-items:center;color:var(--lead)">${STATUS.lead.svg}<span style="color:var(--ink)">${withNum("{n} lead only", c.lead)}</span></span>
    <span style="display:inline-flex;gap:6px;align-items:center;color:var(--muted)">${STATUS.no_match.svg}<a href="#excluded" id="to-excluded">${withNum("{n} not included", c.insufficient + c.no_match + c.pending)}</a></span>
    ${S.filterIds ? `<span class="filter-chip sm">${tz("Showing {n} from your question", { n: S.filterIds.size })}<button type="button" class="btn btn-q btn-icon" id="clear-filter" aria-label="${tz("Clear")}" style="height:22px;width:22px">${I.close}</button></span>` : ""}
    <span style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <label class="btn" style="gap:8px"><input type="checkbox" id="only-v" ${S.onlyVerified ? "checked" : ""} style="margin:0;accent-color:var(--cobalt)">${tz("Only verified")}</label>
      <label for="sort" class="sm muted">${tz("Sort")}</label>
      <select id="sort" class="input" style="height:32px;padding:0 8px;font-size:13px">
        <option value="score" ${S.sort === "score" ? "selected" : ""}>${tz("Match score")}</option>
        <option value="status" ${S.sort === "status" ? "selected" : ""}>${tz("Status")}</option>
        <option value="name" ${S.sort === "name" ? "selected" : ""}>${tz("Name")}</option>
      </select>
    </span>`;
}

function bulkBar() {
  const S = app.search;
  if (!isFinal() || !S.picked.size) return "";
  return `<div class="bulk" role="region" aria-label="${tz("{n} selected", { n: S.picked.size })}">
    <span style="font-weight:500;margin-right:8px">${tz("{n} selected", { n: S.picked.size })}</span>
    <button type="button" class="btn" id="bulk-save">${I.bookmark}${tz("Save to shortlist")}</button>
    <button type="button" class="btn" id="bulk-email">${I.mail}${tz("Find emails")}</button>
    <a class="btn" href="/api/searches/${esc(S.id)}/export.csv?ids=${[...S.picked].map(encodeURIComponent).join(",")}">${I.download}${tz("Export selected")}</a>
    <button type="button" class="btn btn-q" id="bulk-clear">${tz("Clear")}</button>
  </div>`;
}

function visibleRows(st) {
  const S = app.search;
  if (!isFinal()) return st.candidates; // arrival order while running
  let rows = st.candidates.filter((c) => c.status === "verified" || c.status === "lead");
  if (S.onlyVerified) rows = rows.filter((c) => c.status === "verified");
  if (S.filterIds) rows = rows.filter((c) => S.filterIds.has(c.id));
  const rank = { verified: 0, lead: 1 };
  const by = {
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
    status: (a, b) => rank[a.status] - rank[b.status] || (b.score ?? -1) - (a.score ?? -1),
    name: (a, b) => a.name.localeCompare(b.name),
  }[S.sort];
  return [...rows].sort(by);
}

function contactCell(c) {
  const S = app.search;
  if (c.email) {
    return `<div class="contact"><span class="addr">${esc(c.email)}</span><span style="display:flex;gap:6px;align-items:center"><button type="button" class="btn btn-q btn-icon" data-copy="${esc(c.email)}" aria-label="${tz("Copy email")}" style="height:22px;width:22px">${I.copy}</button><a class="xs muted" href="${esc(safeUrl(c.email_source))}" target="_blank" rel="noopener noreferrer">${tz("from {d}", { d: domainOf(c.email_source) })}</a></span></div>`;
  }
  if (S.busy.has("email:" + c.id)) return `<span class="xs muted">${tz("Looking…")}</span>`;
  if (c.email_checked) return `<span class="xs muted">${tz("Not published")}</span>`;
  return `<button type="button" class="btn" data-email="${esc(c.id)}" style="height:28px;padding:0 8px">${I.mail}${tz("Find email")}</button>`;
}

function rowHtml(c, enter = false) {
  const S = app.search;
  const final = isFinal();
  const pending = c.status === "pending";
  const sub = [c.role, c.company].filter(Boolean).join(" · ");
  const why = pending ? t("Checking sources…") : c.summary || c.exclusion;
  const hl = S.highlight?.has(c.id);
  return `
  <div class="rw cand${final ? " x" : ""}${S.sel === c.id ? " sel" : ""}${hl ? " hl" : ""}${enter ? " enter" : ""}" role="row" tabindex="0" data-id="${esc(c.id)}" aria-selected="${S.sel === c.id}">
    ${final ? `<span role="cell"><input type="checkbox" data-pick="${esc(c.id)}" ${S.picked.has(c.id) ? "checked" : ""} aria-label="${tz("Select {name}", { name: c.name })}"></span>` : ""}
    <div role="cell" style="display:flex;gap:10px;min-width:0"><span class="av" aria-hidden="true">${esc(initials(c.name))}</span><div style="display:flex;flex-direction:column;min-width:0"><a class="nm" href="#/search/${esc(S.id)}/c/${esc(c.id)}" tabindex="-1">${esc(c.name)}${S.shortlisted.has(c.id) ? ` <span style="color:var(--cobalt);display:inline-flex;vertical-align:-2px" title="${tz("Saved")}">${I.bookmarked}</span>` : ""}</a>${sub ? `<span class="sub2">${esc(sub)}</span>` : ""}${c.location ? `<span class="sub2">${esc(c.location)}</span>` : ""}</div></div>
    <div role="cell">${badge(c.status)}</div>
    <div role="cell">${c.score != null && !pending ? `<div class="score"><span class="mono" style="font-weight:500">${c.score}</span><span class="sbar"><span style="width:${c.score}%;background:${scoreColor(c.score)}"></span></span></div>` : `<span class="mono muted" aria-label="${tz("No score yet")}">—</span>`}</div>
    <div role="cell" style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="why${pending ? " muted" : ""}">${esc(why)}</span>${c.tags.length ? `<div class="tags">${c.tags.map((tg) => `<span class="tag">${esc(tg)}</span>`).join("")}</div>` : ""}</div>
    <div role="cell" class="srcs">${c.sources.map(srcIcon).join("")}</div>
    ${final ? `<div role="cell">${contactCell(c)}</div>` : ""}
  </div>`;
}

function upsertCandidate(c) {
  const S = app.search;
  if (!S?.state) return;
  const list = S.state.candidates;
  const i = list.findIndex((x) => x.id === c.id);
  const prev = i >= 0 ? list[i] : null;
  if (i >= 0) list[i] = c; else list.push(c);
  if (S.drawer === c.id) renderDrawer(c.id);
  const rows = $("#rows");
  if (!rows) return;
  const el = rows.querySelector(`[data-id="${CSS.escape(c.id)}"]`);
  if (isFinal()) { if (el) replaceRow(el, c); return; }
  if (el) {
    const fresh = replaceRow(el, c);
    if (prev && prev.status !== c.status) {
      // One-time tint when a status settles, then fade back over 1.4s.
      fresh.classList.add("flash");
      requestAnimationFrame(() => requestAnimationFrame(() => fresh.classList.remove("flash")));
    }
  } else {
    rows.insertAdjacentHTML("beforeend", rowHtml(c, true));
    bindRow(rows.lastElementChild);
    const note = $("#rows-note");
    if (note) note.textContent = t("Rows keep their place while the search runs.");
  }
}

function replaceRow(el, c) {
  const hadFocus = document.activeElement === el;
  const parent = el.parentElement;
  el.outerHTML = rowHtml(c);
  const fresh = parent.querySelector(`[data-id="${CSS.escape(c.id)}"]`);
  bindRow(fresh);
  if (hadFocus) fresh.focus();
  return fresh;
}

function bindRow(el) {
  el.addEventListener("click", (e) => {
    if (e.target.closest("input, button, a:not(.nm)")) return;
    e.preventDefault();
    location.hash = `#/search/${app.search.id}/c/${el.dataset.id}`;
  });
  el.addEventListener("keydown", (e) => {
    if (e.target !== el) return;
    if (e.key === "Enter") { e.preventDefault(); location.hash = `#/search/${app.search.id}/c/${el.dataset.id}`; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const sib = e.key === "ArrowDown" ? el.nextElementSibling : el.previousElementSibling;
      if (sib?.classList.contains("cand")) {
        sib.focus();
        if (app.search.drawer) location.hash = `#/search/${app.search.id}/c/${sib.dataset.id}`;
      }
    }
  });
}

function refreshTable() {
  const S = app.search;
  const rows = $("#rows");
  if (!rows) return;
  rows.innerHTML = visibleRows(S.state).map((c) => rowHtml(c)).join("");
  $$("#rows .cand").forEach(bindRow);
  $("#table .head").outerHTML = headRow();
  $("#toolbar").innerHTML = toolbar(S.state);
  $("#bulk").innerHTML = bulkBar();
}

async function findEmails(ids) {
  const S = app.search;
  ids.forEach((id) => S.busy.add("email:" + id));
  refreshTable();
  try {
    const found = await api(`/api/searches/${S.id}/emails`, { method: "POST", body: { candidate_ids: ids } });
    found.forEach((c) => { const i = S.state.candidates.findIndex((x) => x.id === c.id); if (i >= 0) S.state.candidates[i] = c; });
    if (ids.length > 1) toast(t("Found {f} of {n} emails", { f: found.filter((c) => c.email).length, n: found.length }));
  } catch (err) { toast(err.message); }
  ids.forEach((id) => S.busy.delete("email:" + id));
  refreshTable();
  renderDrawer(S.drawer);
}

async function setShortlisted(ids, on) {
  const S = app.search;
  try {
    let r;
    if (on) r = await api("/api/shortlist", { method: "POST", body: { search_id: S.id, candidate_ids: ids } });
    else for (const id of ids) r = await api(`/api/shortlist/${S.id}/${id}`, { method: "DELETE" });
    S.shortlisted = new Set(r.shortlisted);
    if (on) toast(t("Saved {n} to shortlist", { n: ids.length }));
    refreshTable();
    renderDrawer(S.drawer);
    refreshShortlistCount();
  } catch (err) { toast(err.message); }
}

function bindSearch() {
  const S = app.search;
  $$("#rows .cand").forEach(bindRow);
  $("#share").addEventListener("click", () => copy(`${location.origin}/#/search/${S.id}`, t("Link copied")));
  $("#stop")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { await api(`/api/searches/${S.id}/stop`, { method: "POST" }); } catch (err) { e.target.disabled = false; toast(err.message); }
  });
  $("#continue")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await api(`/api/searches/${S.id}/continue`, { method: "POST" });
      showSearch(S.id);
    } catch (err) { e.target.disabled = false; $("#callout-err").textContent = err.message; }
  });
  $("#chat-form")?.addEventListener("submit", (e) => { e.preventDefault(); sendChat($("#chat-text").value); });
  $("#chat-text")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chat-form").requestSubmit(); } });
  $("#trace-toggle")?.addEventListener("click", () => {
    S.traceOpen = !S.traceOpen;
    $("#trace-full").hidden = !S.traceOpen;
    $("#trace-toggle").setAttribute("aria-expanded", S.traceOpen);
    $("#trace-toggle-label").textContent = t(S.traceOpen ? "Hide" : "Show");
  });
  renderReadouts();
}

// Delegated handlers for the search view, registered once at startup.
function onSearchChange(e) {
  const S = app.search;
  if (app.view !== "search" || !S) return;
  if (e.target.id === "only-v") { S.onlyVerified = e.target.checked; refreshTable(); }
  if (e.target.id === "sort") { S.sort = e.target.value; refreshTable(); }
  if (e.target.id === "pick-all") {
    visibleRows(S.state).forEach((c) => (e.target.checked ? S.picked.add(c.id) : S.picked.delete(c.id)));
    refreshTable();
  }
  if (e.target.dataset.pick) {
    if (e.target.checked) S.picked.add(e.target.dataset.pick); else S.picked.delete(e.target.dataset.pick);
    $("#bulk").innerHTML = bulkBar();
    $("#table .head").outerHTML = headRow();
  }
}

function onSearchClick(e) {
  const S = app.search;
  if (app.view !== "search" || !S) return;
  const b = e.target.closest("button, a");
  if (!b) return;
  if (b.dataset.email) findEmails([b.dataset.email]);
  else if (b.dataset.copy) copy(b.dataset.copy);
  else if (b.id === "bulk-save") setShortlisted([...S.picked], true);
  else if (b.id === "bulk-email") findEmails([...S.picked].filter((id) => !S.state.candidates.find((c) => c.id === id)?.email_checked));
  else if (b.id === "bulk-clear") { S.picked.clear(); refreshTable(); }
  else if (b.id === "clear-filter") { S.filterIds = null; S.highlight = null; refreshTable(); }
  else if (b.id === "to-excluded") { const d = $("#excluded"); if (d) d.open = true; }
  else if (b.dataset.show) { S.filterIds = new Set(b.dataset.show.split(",")); S.highlight = new Set(S.filterIds); refreshTable(); }
  else if (b.dataset.plan) planFrom(b.dataset.plan, b, null);
  else if (b.dataset.option) sendChat(b.dataset.option);
  else if (b.dataset.followup) planFrom(`${S.state.plan.query}. ${b.dataset.followup}`, b, null);
  else if (b.dataset.loosen) loosen(+b.dataset.loosen);
}

function statusCallout(st) {
  const failedWeb = st.trace.some((s) => s.status === "failed" && s.action === "Searched the web");
  const n = (s) => st.candidates.filter((c) => c.status === s).length;
  const parts = [];
  if (st.status === "budget") {
    parts.push(`
    <div class="callout warn" role="status" style="margin:16px 24px 0">
      <span class="heading">${tz("Stopped at your {b} limit. {n} people found.", { b: money(st.budget), n: st.candidates.length })}</span>
      <span class="sm">${tz("{v} are verified and {l} are lead only. {p} were still pending.", { v: n("verified"), l: n("lead"), p: n("pending") })}</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="btn btn-p" id="continue">${tz("Continue for another {b}", { b: money(app.config?.budget ?? 1) })}</button><span class="sm" id="callout-err" role="alert"></span></div>
    </div>`);
  }
  if (st.status === "failed") {
    parts.push(`<div class="callout err" role="alert" style="margin:16px 24px 0"><span class="heading" style="color:var(--insufficient)">${tz("The search stopped because of an error")}</span><span class="sm">${esc(st.error)}</span><span class="sm">${tz("Results found before the error are kept below.")}</span></div>`);
  }
  if (st.status === "stopped") {
    parts.push(`<div class="callout warn" role="status" style="margin:16px 24px 0"><span class="sm">${tz("You stopped this search. {n} people found so far are kept below.", { n: st.candidates.length })}</span></div>`);
  }
  if (failedWeb) {
    parts.push(`<div class="callout err" role="status" style="margin:16px 24px 0"><span style="color:var(--insufficient);font-weight:600">${tz("Web search unavailable")}</span><span class="sm">${tz("Results come from GitHub and papers only. Fewer people can be confirmed by location, so more will stay Lead only.")}</span></div>`);
  }
  return parts.join("");
}

// ----- Follow-up chat (left column once the search ends) -----

function chatColumn(st) {
  const S = app.search;
  const sum = st.summary;
  const secs = st.finished_at ? Math.max(0, (new Date(st.finished_at) - new Date(st.created_at)) / 1000) : null;
  const max = Math.max(1, ...(sum?.areas || []).map((a) => a[1]));
  const msgs = (st.messages || []).map((m) => (m.role === "user"
    ? `<div class="msg-user">${esc(m.text)}</div>`
    : `<div class="msg-bot">
        <p style="line-height:21px">${esc(m.text)}</p>
        ${m.kind === "answer" && m.highlights.length ? `<div class="chips"><button type="button" class="chip-btn" data-show="${esc(m.highlights.join(","))}">${tz("Show these {n}", { n: m.highlights.length })}</button></div>` : ""}
        ${m.kind === "refine" && m.new_query ? `<div class="chips"><button type="button" class="chip-btn" data-plan="${esc(m.new_query)}">${I.search} ${tz("Plan this search")}</button></div>` : ""}
        ${m.options.length ? `<div class="chips">${m.options.map((o) => `<button type="button" class="chip-btn" data-option="${esc(o)}">${esc(o)}</button>`).join("")}</div>` : ""}
      </div>`)).join("");
  return `
  <aside class="summary-col" aria-label="${tz("Summary")}">
    <button type="button" class="trace-collapsed" id="trace-toggle" aria-expanded="${S.traceOpen}" aria-controls="trace-full">
      <span class="dot" style="margin:0;flex:none"></span>
      <span style="display:flex;flex-direction:column;flex:1 1 auto"><span class="sm" style="font-weight:500">${tz("Search trace · {n} steps", { n: st.trace.length })}</span><span class="mono xs tmuted">${tz("{d} · {s} sources · {c}", { d: fmtDur(secs), s: st.sources_checked, c: money(st.cost) })}</span></span>
      <span class="sm" style="color:var(--trace-accent)" id="trace-toggle-label">${tz(S.traceOpen ? "Hide" : "Show")}</span>
    </button>
    <div id="trace-full" ${S.traceOpen ? "" : "hidden"} style="background:var(--trace);color:var(--trace-ink);max-height:45vh;overflow-y:auto"><ol class="trace-list">${st.trace.map((s) => stepHtml(s)).join("")}</ol></div>
    <div class="chat">
      <div class="chat-scroll" id="chat-scroll" aria-live="polite">
        ${sum ? `
        <section class="msg-bot"><h2 class="heading">${tz("Summary")}</h2><p style="line-height:21px">${esc(sum.text)}</p></section>
        ${sum.areas.length ? `<section style="display:flex;flex-direction:column;gap:10px"><h2 class="heading">${tz("Qualified by area")}</h2>
          <div style="display:grid;grid-template-columns:120px 1fr 28px;gap:8px 10px;align-items:center" class="sm">
          ${sum.areas.map(([name, n]) => `<span>${esc(name)}</span><span class="sbar" style="width:auto;height:6px"><span style="height:6px;width:${(n / max) * 100}%;background:var(--score-4)"></span></span><span class="mono num">${n}</span>`).join("")}
          </div></section>` : ""}
        ${sum.followups.length ? `<section style="display:flex;flex-direction:column;gap:8px"><h2 class="heading">${tz("Next searches")}</h2>
          ${sum.followups.map((f) => `<button type="button" class="fu" data-followup="${esc(f)}">${I.search}${esc(f)}</button>`).join("")}
          <span class="xs muted">${tz("Each opens a new plan to review first.")}</span></section>` : ""}`
        : `<p class="muted sm">${tz(st.status === "done" ? "No summary for this search." : "No summary for this search because it didn't finish.")}</p>`}
        ${msgs}
        ${S.asking ? `<p class="sm muted">${tz("Thinking…")}</p>` : ""}
      </div>
      <form class="chat-input" id="chat-form">
        <label for="chat-text" class="sr">${tz("Ask about these results or change the search")}</label>
        <textarea id="chat-text" rows="1" placeholder="${tz("Ask about these results or change the search")}" ${S.asking ? "disabled" : ""}></textarea>
        <button class="btn btn-p btn-icon" aria-label="${tz("Send")}" ${S.asking ? "disabled" : ""} style="height:36px;width:36px">${I.send}</button>
      </form>
    </div>
  </aside>`;
}

async function sendChat(text) {
  const S = app.search;
  text = (text || "").trim();
  if (!text || S.asking) return;
  if (/type it|自己输入|请补充/i.test(text)) { $("#chat-text")?.focus(); return; }
  S.state.messages = [...(S.state.messages || []), { role: "user", text, kind: "answer", highlights: [], options: [], new_query: "" }];
  S.asking = true;
  renderSearch();
  try {
    const reply = await api(`/api/searches/${S.id}/ask`, { method: "POST", body: { message: text } });
    S.state.messages.push(reply);
    if (reply.kind === "answer" && reply.highlights.length) S.highlight = new Set(reply.highlights);
  } catch (err) {
    S.state.messages.push({ role: "assistant", text: err.message, kind: "answer", highlights: [], options: [], new_query: "" });
  }
  S.asking = false;
  renderSearch();
  $("#chat-scroll").scrollTop = $("#chat-scroll").scrollHeight;
  $("#chat-text")?.focus();
}

function excludedHtml(st) {
  const groups = [
    ["no_match", st.candidates.filter((c) => c.status === "no_match")],
    ["insufficient", st.candidates.filter((c) => c.status === "insufficient" || c.status === "pending")],
  ];
  const total = groups.reduce((n, g) => n + g[1].length, 0);
  if (!total) return "";
  return `
  <details class="excl" id="excluded">
    <summary>${tz("{n} not included", { n: total })}</summary>
    ${groups.filter((g) => g[1].length).map(([status, list]) => `
      <h3 class="xh">${badge(status)}<span class="mono">${list.length}</span></h3>
      ${list.map((c) => `<div class="xr"><div style="display:flex;flex-direction:column"><a class="nm" href="#/search/${esc(st.id)}/c/${esc(c.id)}">${esc(c.name)}</a><span class="sub2">${esc([c.role, c.company].filter(Boolean).join(" · ") || t("Role unknown"))}</span></div><span class="sm">${esc(c.exclusion || (c.status === "pending" ? t("Not checked before the search ended.") : t(STATUS[status].label)))}</span></div>`).join("")}
    `).join("")}
  </details>`;
}

function emptyHtml(st) {
  const musts = st.plan.conditions.map((c, i) => [c, i]).filter(([c]) => c.importance === "must");
  return `
  <div class="empty">
    <h2 class="title">${tz("No one met every Must condition")}</h2>
    <p>${tz("The search checked {n} sources but found no one who fits. Loosening one condition usually helps.", { n: st.sources_checked })}</p>
    ${musts.length ? `<span class="sm" style="font-weight:500">${tz("Try loosening one condition")}</span>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${musts.map(([c, i]) => `<button type="button" class="btn" data-loosen="${i}">${tz("Remove “{c}”", { c: c.text })}</button>`).join("")}</div>` : ""}
    <span class="xs muted">${tz("You'll review the new plan before anything is spent.")}</span>
  </div>`;
}

function loosen(i) {
  const plan = structuredClone(app.search.state.plan);
  plan.conditions.splice(i, 1);
  savePlan(plan);
  location.hash = "#/plan";
}

// ---------- P5 Drawer ----------

function renderDrawer(cid) {
  const root = $("#drawer-root");
  const S = app.search;
  if (S) S.drawer = cid;
  $$("#rows .cand").forEach((r) => { r.classList.toggle("sel", r.dataset.id === cid); r.setAttribute("aria-selected", r.dataset.id === cid); });
  if (S) S.sel = cid;
  if (!cid || !S?.state) { root.innerHTML = ""; return; }
  const c = S.state.candidates.find((x) => x.id === cid);
  if (!c) { root.innerHTML = ""; return; }
  const order = $$("#rows .cand").map((r) => r.dataset.id);
  const pos = order.indexOf(cid);
  const pending = c.status === "pending";
  const evById = Object.fromEntries(c.evidence.map((e) => [e.id, e]));
  const refs = (ids) => ids.filter((r) => evById[r]).map((r) => `<a class="ref" href="#ev-${esc(r)}" data-ref="${esc(r)}">${esc(r.slice(1))}</a>`).join("");
  const links = [["github", "GitHub"], ["homepage", "Homepage"], ["scholar", "Papers"]].filter(([k]) => c.links[k]);
  const saved = S.shortlisted.has(c.id);
  const writing = S.busy.has("profile:" + c.id);
  const group = (kind, label, icon) => {
    const items = c.evidence.filter((e) => e.kind === kind);
    if (!items.length && !pending) return "";
    return `
    <section style="display:flex;flex-direction:column;gap:4px">
      <h3 class="heading" style="display:flex;align-items:center;gap:8px"><span class="muted" style="display:flex">${icon}</span>${tz(label)}</h3>
      <div style="border-top:1px solid var(--line);margin-top:6px">
      ${items.length ? items.map((e) => `
        <div class="ev" id="ev-${esc(e.id)}">
          <span class="ref" style="margin:0">${esc(e.id.slice(1))}</span>
          <div style="display:flex;flex-direction:column;gap:2px;min-width:0"><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer" class="sm${kind === "code" ? " mono" : ""}" style="font-weight:500">${esc(e.title)}</a><span class="sm muted" style="overflow-wrap:anywhere">${esc(e.description.length > 220 ? e.description.slice(0, 220) + "…" : e.description)}</span></div>
          <span class="mono xs muted" style="text-align:right;white-space:pre-line">${esc(metaText(e))}</span>
        </div>`).join("") : `<div aria-hidden="true" style="display:flex;flex-direction:column;gap:8px;padding:14px 0"><span class="sk" style="width:86%"></span><span class="sk" style="width:52%"></span></div>`}
      </div>
    </section>`;
  };
  const p = c.profile;
  const scroll = $(".drawer-body", root)?.scrollTop;
  root.innerHTML = `
  <aside class="drawer" role="dialog" aria-modal="false" aria-labelledby="dname">
    <div class="drawer-top">
      <button type="button" class="btn btn-icon" id="d-prev" aria-label="${tz("Previous candidate")}" ${pos <= 0 ? "disabled" : ""}>${I.up}</button>
      <button type="button" class="btn btn-icon" id="d-next" aria-label="${tz("Next candidate")}" ${pos < 0 || pos >= order.length - 1 ? "disabled" : ""}>${I.down}</button>
      <span class="mono xs muted">${pos >= 0 ? tz("{i} of {n} · ↑↓ to move", { i: pos + 1, n: order.length }) : ""}</span>
      <button type="button" class="btn btn-icon" id="d-close" style="margin-left:auto;border-color:transparent" aria-label="${tz("Close details")}">${I.close}</button>
    </div>
    <div class="drawer-body">
      <section style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;gap:14px;align-items:flex-start">
          <span class="av" style="width:48px;height:48px;font-size:16px" aria-hidden="true">${esc(initials(c.name))}</span>
          <div style="display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0">
            <h2 id="dname" class="title">${esc(c.name)}</h2>
            ${[c.role, c.company].filter(Boolean).length ? `<span class="muted">${esc([c.role, c.company].filter(Boolean).join(" · "))}</span>` : ""}
            ${c.location ? `<span class="muted">${esc(c.location)}</span>` : ""}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            ${badge(c.status)}
            ${c.score != null && !pending ? `<span style="display:flex;align-items:center;gap:8px"><span class="xs muted">${tz("Match")}</span><span class="mono" style="font-size:20px;line-height:24px;font-weight:500">${c.score}</span></span><span class="sbar" style="width:72px"><span style="width:${c.score}%;background:${scoreColor(c.score)}"></span></span>` : ""}
          </div>
        </div>
        ${isFinal() && !pending ? `<div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" class="btn${saved ? "" : " btn-p"}" id="d-save" aria-pressed="${saved}">${saved ? I.bookmarked : I.bookmark}${tz(saved ? "Saved" : "Save to shortlist")}</button>
          <button type="button" class="btn" id="d-profile" ${writing ? "disabled" : ""}>${I.doc}${tz(writing ? "Writing profile…" : p ? "Regenerate" : "Generate profile")}</button>
          ${c.email ? `<button type="button" class="btn" data-copy="${esc(c.email)}">${I.copy}<span class="mono xs">${esc(c.email)}</span></button>`
            : c.email_checked ? `<span class="btn" aria-disabled="true" style="color:var(--muted);cursor:default">${I.mail}${tz("Not published")}</span>`
            : `<button type="button" class="btn" data-email="${esc(c.id)}" ${S.busy.has("email:" + c.id) ? "disabled" : ""}>${I.mail}${tz(S.busy.has("email:" + c.id) ? "Looking…" : "Find email")}</button>`}
        </div>` : ""}
        ${c.email && c.email_source ? `<span class="xs muted">${tz("from {d}", { d: "" })}<a href="${esc(safeUrl(c.email_source))}" target="_blank" rel="noopener noreferrer">${esc(c.email_source)}</a></span>` : ""}
        ${links.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${links.map(([k, label]) => `<a class="btn" style="color:var(--cobalt)" href="${esc(safeUrl(c.links[k]))}" target="_blank" rel="noopener noreferrer">${tz(label)}${I.ext}<span class="sr">${tz("(opens in new tab)")}</span></a>`).join("")}</div>` : ""}
        ${pending ? `<p role="status" class="sm muted" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--paper);border-radius:4px">${STATUS.pending.svg}${tz("Gathering more details…")}</p>` : ""}
        ${c.exclusion ? `<p class="sm" style="padding:8px 10px;background:var(--${c.status === "insufficient" ? "insufficient" : "pending"}-soft);border-radius:4px">${esc(c.exclusion)}</p>` : ""}
      </section>
      ${p ? `
      <section class="profile" aria-label="${tz("Profile")}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><h3 class="heading">${tz("Profile")}</h3><span class="xs muted mono">${esc(new Date(p.generated_at).toLocaleDateString(LANG === "zh" ? "zh-CN" : "en-US"))}</span></div>
        <p class="sm muted">${esc(p.headline)}</p>
        <p style="line-height:22px">${p.summary.map((r) => `${esc(r.text)}${refs(r.refs)}`).join(" ")}</p>
        <div><h4 class="sm" style="margin:0 0 4px;font-weight:600">${tz("Experience")}</h4><ul class="sm">${p.experience.map((r) => `<li>${esc(r.text)}${refs(r.refs)}</li>`).join("")}</ul></div>
        <div><h4 class="sm" style="margin:0 0 6px;font-weight:600">${tz("Strengths")}</h4><div class="tags">${p.strengths.map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</div></div>
        <div><h4 class="sm" style="margin:0 0 4px;font-weight:600">${tz("Ask in a first call")}</h4><ul class="sm">${p.open_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>
        <div style="display:flex;flex-direction:column;gap:6px"><h4 class="sm" style="margin:0;font-weight:600">${tz("Opening line")}</h4><p class="sm" style="padding:8px 10px;background:var(--paper);border-radius:4px">${esc(p.outreach)}</p><button type="button" class="btn btn-q" data-copy="${esc(p.outreach)}" style="align-self:flex-start">${I.copy}${tz("Copy")}</button></div>
      </section>` : writing ? `<section class="profile" aria-busy="true"><h3 class="heading">${tz("Profile")}</h3><span class="sk" style="width:90%"></span><span class="sk" style="width:70%"></span><span class="sk" style="width:80%"></span></section>` : ""}
      ${c.reasons.length ? `
      <section style="display:flex;flex-direction:column;gap:10px">
        <h3 class="heading">${tz("Why they match")}</h3>
        <p style="line-height:22px">${c.reasons.map((r) => `${esc(r.text)}${refs(r.refs)}`).join(" ")}</p>
        ${c.checks.length ? `<div style="border-top:1px solid var(--line)">${c.checks.map((ch) => {
          const state = ch.met === "yes" ? "Met" : ch.met === "no" ? "Not met" : "Unknown";
          return `
          <div class="check">
            <span style="color:${ch.met === "yes" ? "var(--verified)" : ch.met === "no" ? "var(--insufficient)" : "var(--muted)"};display:flex" title="${tz(state)}">${ch.met === "yes" ? STATUS.verified.svg : ch.met === "no" ? STATUS.no_match.svg : STATUS.pending.svg}<span class="sr">${tz(state)}</span></span>
            <span>${esc(ch.text)}</span>
            <span class="xs muted">${tz(ch.importance === "must" ? "Must" : "Preferred")}</span>
            <span style="min-width:40px;text-align:right">${refs(ch.refs) || '<span class="mono xs muted">—</span>'}</span>
          </div>`;
        }).join("")}</div>` : ""}
      </section>` : ""}
      ${group("code", "Code", I.github)}
      ${group("paper", "Papers", I.papers)}
      ${group("web", "Web", I.web)}
    </div>
  </aside>`;
  if (scroll) $(".drawer-body", root).scrollTop = scroll;
  const go = (id) => { if (id) location.hash = `#/search/${S.id}/c/${id}`; };
  $("#d-close").addEventListener("click", () => {
    location.hash = `#/search/${S.id}`;
    $(`#rows [data-id="${CSS.escape(cid)}"]`)?.focus();
  });
  $("#d-prev").addEventListener("click", () => go(order[pos - 1]));
  $("#d-next").addEventListener("click", () => go(order[pos + 1]));
  $("#d-save")?.addEventListener("click", () => setShortlisted([c.id], !saved));
  $("#d-profile")?.addEventListener("click", () => makeProfile(c.id));
  $$("[data-email]", root).forEach((b) => b.addEventListener("click", () => findEmails([b.dataset.email])));
  $$("[data-copy]", root).forEach((b) => b.addEventListener("click", () => copy(b.dataset.copy)));
  $$(".ref[data-ref]", root).forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const target = $(`#ev-${CSS.escape(a.dataset.ref)}`, root);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("hl");
    setTimeout(() => target.classList.remove("hl"), 1400);
  }));
}

async function makeProfile(cid) {
  const S = app.search;
  S.busy.add("profile:" + cid);
  renderDrawer(S.drawer);
  try {
    const c = await api(`/api/searches/${S.id}/candidates/${cid}/profile?lang=${LANG}`, { method: "POST" });
    const i = S.state.candidates.findIndex((x) => x.id === cid);
    if (i >= 0) S.state.candidates[i] = c;
  } catch (err) { toast(err.message); }
  S.busy.delete("profile:" + cid);
  renderDrawer(S.drawer);
}

function metaText(e) {
  const m = e.meta || {};
  if (e.kind === "code") {
    const line1 = [m.stars != null ? `★ ${Number(m.stars).toLocaleString()}` : null, m.language].filter(Boolean).join(" · ");
    const line2 = m.pushed_at ? t("pushed {d}", { d: m.pushed_at }) : m.contributions ? `${m.contributions} ${t("commits")}` : m.followers != null ? `${m.followers} ${t("followers")}` : "";
    return [line1, line2].filter(Boolean).join("\n");
  }
  if (e.kind === "paper") return [[m.venue, m.year].filter(Boolean).join(" "), m.citations != null ? `${m.citations} ${t("citations")}` : ""].filter(Boolean).join("\n");
  return [m.domain, m.fetched ? t("fetched {d}", { d: m.fetched }) : ""].filter(Boolean).join("\n");
}

// ---------- Shortlist ----------

async function showShortlist() {
  app.view = "shortlist";
  setNav("shortlist");
  const v = $("#view");
  v.innerHTML = `<div class="page"><h1 class="title">${tz("Shortlist")}</h1><p class="muted">${tz("Loading…")}</p></div>`;
  let rows;
  try { rows = await api("/api/shortlist"); } catch (err) { v.innerHTML = `<div class="page"><h1 class="title">${tz("Shortlist")}</h1><p role="alert">${esc(err.message)}</p></div>`; return; }
  $("#shortlist-count").textContent = rows.length || "";
  v.innerHTML = `
  <div class="page">
    <header style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px">
      <div style="display:flex;flex-direction:column;gap:4px"><h1 class="title">${tz("Shortlist")}</h1><span class="sm muted">${tz("Saved people from all searches. Notes save when you leave the box.")}</span></div>
      ${rows.length ? `<a class="btn" href="/api/shortlist/export.csv">${I.download}${tz("Export CSV")}</a>` : ""}
    </header>
    ${rows.length ? `<div class="box" style="overflow-x:auto"><div role="table" aria-label="${tz("Shortlist")}" style="min-width:900px">
      <div class="sl head" role="row"><span role="columnheader">${tz("Candidate")}</span><span role="columnheader">${tz("Status")}</span><span role="columnheader">${tz("Match")}</span><span role="columnheader">${tz("Contact")}</span><span role="columnheader">${tz("Note")}</span><span role="columnheader"><span class="sr">${tz("Remove from shortlist")}</span></span></div>
      ${rows.map((r) => {
        const c = r.candidate;
        return `<div class="sl" role="row">
          <div role="cell" style="display:flex;gap:10px;min-width:0"><span class="av" aria-hidden="true">${esc(initials(c.name))}</span><div style="display:flex;flex-direction:column;min-width:0"><a class="nm" href="#/search/${esc(r.search_id)}/c/${esc(c.id)}">${esc(c.name)}</a><span class="sub2">${esc([c.role, c.company].filter(Boolean).join(" · "))}</span><span class="xs muted">${tz("From search")}: <a href="#/search/${esc(r.search_id)}">${esc(r.query)}</a></span></div></div>
          <div role="cell">${badge(c.status)}</div>
          <div role="cell" class="mono">${c.score ?? "—"}</div>
          <div role="cell" class="contact">${c.email ? `<span class="addr">${esc(c.email)}</span><button type="button" class="btn btn-q" data-copy="${esc(c.email)}" style="height:24px;padding:0 4px;align-self:flex-start">${I.copy}${tz("Copy")}</button>` : `<span class="xs muted">—</span>`}</div>
          <div role="cell"><label class="sr" for="note-${esc(r.id)}">${tz("Note")}</label><textarea id="note-${esc(r.id)}" data-note="${esc(r.id)}" placeholder="${tz("Add a note")}">${esc(r.note)}</textarea></div>
          <div role="cell"><button type="button" class="btn btn-q btn-icon" data-remove="${esc(r.search_id)}/${esc(c.id)}" aria-label="${tz("Remove from shortlist")}" style="color:var(--muted)">${I.trash}</button></div>
        </div>`;
      }).join("")}
    </div></div>` : `<p class="muted">${tz("No one saved yet. Open a search and press Save to shortlist.")}</p>`}
  </div>`;
  $$("[data-note]").forEach((ta) => {
    const original = ta.value;
    ta.addEventListener("blur", async () => {
      if (ta.value === original) return;
      try { await api(`/api/shortlist/${ta.dataset.note}`, { method: "PATCH", body: { note: ta.value } }); toast(t("Saved")); } catch (err) { toast(err.message); }
    });
  });
  $$("[data-copy]").forEach((b) => b.addEventListener("click", () => copy(b.dataset.copy)));
  $$("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
    try { await api(`/api/shortlist/${b.dataset.remove}`, { method: "DELETE" }); showShortlist(); } catch (err) { toast(err.message); }
  }));
}

// ---------- History ----------

async function showHistory() {
  app.view = "history";
  setNav("history");
  const v = $("#view");
  v.innerHTML = `<div class="page"><h1 class="title">${tz("History")}</h1><p class="muted">${tz("Loading…")}</p></div>`;
  let rows;
  try { rows = await api("/api/history"); } catch (err) { v.innerHTML = `<div class="page"><h1 class="title">${tz("History")}</h1><p role="alert">${esc(err.message)}</p></div>`; return; }
  const label = { done: "Done", stopped: "Stopped", budget: "Budget limit", failed: "Failed", running: "Running" };
  v.innerHTML = `
  <div class="page">
    <h1 class="title">${tz("History")}</h1>
    ${rows.length ? `<div class="box" style="overflow-x:auto"><div role="table" aria-label="${tz("Past searches")}" style="min-width:720px">
      <div class="tr head" role="row"><span role="columnheader">${tz("Request")}</span><span role="columnheader">${tz("When")}</span><span class="num" role="columnheader">${tz("People")}</span><span class="num" role="columnheader">${tz("Verified")}</span><span class="num" role="columnheader">${tz("Cost")}</span><span role="columnheader">${tz("Status")}</span></div>
      ${rows.map((r) => `<div class="tr" role="row"><a role="cell" href="#/search/${esc(r.id)}" style="color:var(--ink);font-weight:500">${esc(r.query)}</a><span role="cell" class="mono xs muted">${esc(new Date(r.created_at).toLocaleString(LANG === "zh" ? "zh-CN" : "en-US"))}</span><span role="cell" class="mono num">${r.people}</span><span role="cell" class="mono num">${r.verified}</span><span role="cell" class="mono num">${money(r.cost)}</span><span role="cell" class="xs">${tz(label[r.status] || r.status)}</span></div>`).join("")}
    </div></div>` : `<p class="muted">${tz("No searches yet.")} <a href="#/">${tz("Start one")}</a></p>`}
  </div>`;
}

// ---------- P6 Cost report ----------

async function showCost(month) {
  app.view = "cost";
  setNav("cost");
  const v = $("#view");
  let r;
  try { r = await api(`/api/cost${month ? `?month=${encodeURIComponent(month)}` : ""}`); } catch (err) { v.innerHTML = `<div class="page"><h1 class="title">${tz("Cost report")}</h1><p role="alert">${esc(err.message)}</p></div>`; return; }
  const sources = [["github", "GitHub", "Free"], ["papers", "Papers", "Free"], ["web", "Web search", "Billed per search"], ["homepage", "Homepage fetches", "Free"], ["ai", "AI verification", "Planning, reading sources, scoring"]];
  const max = Math.max(0.0001, ...Object.values(r.by_source));
  v.innerHTML = `
  <div class="page">
    <header style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px">
      <div style="display:flex;flex-direction:column;gap:4px"><h1 class="title">${tz("Cost report")}</h1><span class="sm muted">${tz("GitHub, papers and homepages are free; you pay for web search and AI verification. Per-search limit {b}.", { b: money(r.budget) })}</span></div>
      <div style="display:flex;align-items:center;gap:8px"><label for="month" class="sm muted">${tz("Month")}</label><select id="month" class="input" style="height:32px;font-size:13px">${r.months.map((m) => `<option ${m === r.month ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
    </header>
    <section class="metrics" aria-label="${tz("Totals")}">
      <div><span class="sm muted">${tz("Spent this month")}</span><span class="readout">${money(r.total)}</span></div>
      <div><span class="sm muted">${tz("Searches")}</span><span class="readout">${r.searches}</span><span class="xs muted">${tz("{n} stopped at budget limit", { n: r.budget_stops })}</span></div>
      <div><span class="sm muted">${tz("Average per search")}</span><span class="readout">${money(r.avg_per_search)}</span></div>
      <div><span class="sm muted">${tz("Per verified candidate")}</span><span class="readout">${r.per_verified == null ? "—" : money(r.per_verified, 3)}</span><span class="xs muted">${tz("{n} verified", { n: r.verified })}</span></div>
    </section>
    <div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">
      <section style="flex:999 1 640px;min-width:0;display:flex;flex-direction:column;gap:10px">
        <h2 class="heading">${tz("Searches")}</h2>
        ${r.rows.length ? `<div class="box" style="overflow-x:auto"><div role="table" aria-label="${tz("Searches this month")}" style="min-width:720px">
          <div class="tr head" role="row"><span role="columnheader">${tz("Request")}</span><span role="columnheader">${tz("When")}</span><span class="num" role="columnheader">${tz("People")}</span><span class="num" role="columnheader">${tz("Verified")}</span><span class="num" role="columnheader">${tz("Cost")}</span><span class="num" role="columnheader">${tz("Time")}</span></div>
          ${r.rows.map((x) => `<div class="tr" role="row"><span role="cell" style="display:flex;flex-direction:column;min-width:0"><a href="#/search/${esc(x.id)}" style="color:var(--ink);font-weight:500">${esc(x.query)}</a>${x.status === "budget" ? `<span class="xs" style="color:var(--lead)">${tz("Stopped at budget limit")}</span>` : x.status === "failed" ? `<span class="xs" style="color:var(--insufficient)">${tz("Failed")}</span>` : x.people === 0 && x.status === "done" ? `<span class="xs muted">${tz("No results")}</span>` : ""}</span><span role="cell" class="mono xs muted">${esc(new Date(x.created_at).toLocaleString(LANG === "zh" ? "zh-CN" : "en-US"))}</span><span role="cell" class="mono num">${x.people}</span><span role="cell" class="mono num">${x.verified}</span><span role="cell" class="mono num" style="font-weight:500">${money(x.cost)}</span><span role="cell" class="mono num muted">${fmtDur(x.seconds)}</span></div>`).join("")}
        </div></div>` : `<p class="muted">${tz("No searches this month.")}</p>`}
      </section>
      <section style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:10px">
        <h2 class="heading">${tz("By source")}</h2>
        <div class="box" style="padding:6px 18px">
          ${sources.map(([k, label, note]) => `<div style="display:flex;flex-direction:column;gap:6px;padding:12px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px"><span>${tz(label)}</span><span class="mono" style="font-weight:500">${money(r.by_source[k] || 0)}</span></div><span class="sbar" style="width:auto;height:6px"><span style="height:6px;width:${((r.by_source[k] || 0) / max) * 100}%;background:var(--score-4)"></span></span><span class="xs muted">${tz(note)}</span></div>`).join("")}
          <div style="display:flex;justify-content:space-between;padding:12px 0"><span style="font-weight:600">${tz("Total")}</span><span class="mono" style="font-weight:500">${money(r.total)}</span></div>
        </div>
      </section>
    </div>
  </div>`;
  $("#month").addEventListener("change", (e) => showCost(e.target.value));
}

// ---------- Boot ----------

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && app.search?.drawer) {
    const cid = app.search.drawer;
    location.hash = `#/search/${app.search.id}`;
    setTimeout(() => $(`#rows [data-id="${CSS.escape(cid)}"]`)?.focus(), 0);
  }
});
$$("[data-lang]").forEach((b) => b.addEventListener("click", () => {
  LANG = b.dataset.lang;
  try { localStorage.setItem("ts-lang", LANG); } catch { /* private mode */ }
  rerender();
  refreshSpend();
}));
$("#view").addEventListener("change", onSearchChange);
$("#view").addEventListener("click", onSearchClick);
window.addEventListener("hashchange", route);
(async () => {
  applyLang();
  try {
    app.config = await api("/api/config");
    $("#demo-flag").hidden = !app.config.demo;
  } catch { app.config = { budget: 1, demo: false }; }
  refreshSpend();
  refreshShortlistCount();
  route();
})();
