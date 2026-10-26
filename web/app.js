"use strict";
// Talent Search web app: search home (P1), plan review (P2), live search (P3), results (P4),
// candidate drawer (P5), cost report (P6), empty and error states (P7). No build step.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");
const money = (n, d = 2) => (n == null ? "—" : "$" + Number(n).toFixed(d));
const FINAL = ["done", "stopped", "budget", "failed"];
const EXAMPLES = [
  "LLM inference optimization engineers in the US",
  "PhD researchers in computer vision, California",
  "Full-stack engineers who contribute to open-source AI agent frameworks",
  "Engineers experienced with on-device model deployment on iOS (Core ML)",
];

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
  clock: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M8 4.5V8l2.5 1.5"></path></svg>',
  github: '<svg class="ic" viewBox="0 0 16 16" role="img" aria-label="GitHub"><title>GitHub</title><path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"></path></svg>',
  papers: '<svg class="ic" viewBox="0 0 16 16" role="img" aria-label="Papers"><title>Papers</title><path d="M4 2h5.5L12 4.5V14H4z"></path><path d="M6 7h4M6 9.5h4"></path></svg>',
  homepage: '<svg class="ic" viewBox="0 0 16 16" role="img" aria-label="Homepage"><title>Homepage</title><path d="M2.5 7.5 8 3l5.5 4.5v6h-11z"></path><path d="M6.5 13.5V10h3v3.5"></path></svg>',
  web: '<svg class="ic" viewBox="0 0 16 16" role="img" aria-label="Web"><title>Web</title><circle cx="8" cy="8" r="6"></circle><path d="M2 8h12M8 2c2.2 2 2.2 10 0 12M8 2c-2.2 2-2.2 10 0 12"></path></svg>',
};
I.code = I.github.replace('aria-label="GitHub"><title>GitHub</title>', 'aria-hidden="true">');
I.paper = I.papers.replace('role="img" aria-label="Papers"><title>Papers</title>', 'aria-hidden="true">');
I.webh = I.web.replace('role="img" aria-label="Web"><title>Web</title>', 'aria-hidden="true">');

const STATUS = {
  verified: { label: "Verified", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="currentColor"></circle><path d="M5.2 8.3l1.9 1.9 3.7-4" fill="none" stroke="var(--verified-soft)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>' },
  lead: { label: "Lead only", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4"></circle><path d="M8 2.2a5.8 5.8 0 0 1 0 11.6z" fill="currentColor"></path></svg>' },
  pending: { label: "Pending", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.6 2.1"></circle></svg>' },
  insufficient: { label: "Not enough evidence", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4"></circle><path d="M5.3 8h5.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>' },
  no_match: { label: "Didn't match", svg: '<svg class="si" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4"></circle><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>' },
};
const badge = (status) => `<span class="badge b-${status}">${STATUS[status].svg}${STATUS[status].label}</span>`;
const scoreColor = (s) => `var(--score-${s < 50 ? 1 : s < 65 ? 2 : s < 80 ? 3 : s < 90 ? 4 : 5})`;
const initials = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// ---------- App state ----------

const app = { config: null, view: null, es: null, search: null, ui: {} };

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
    $("#month-searches").textContent = `${r.searches} ${r.searches === 1 ? "search" : "searches"}`;
  } catch { /* nav footer is best-effort */ }
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
  if (parts[0] === "history") return showHistory();
  if (parts[0] === "cost") return showCost();
  return showHome();
}

function closeStream() {
  if (app.es) { app.es.close(); app.es = null; }
  app.search = null;
}

// ---------- P1 Home ----------

function showHome() {
  app.view = "home";
  setNav("search");
  const v = $("#view");
  v.innerHTML = `
  <main class="home"><div class="home-inner">
    <div style="display:flex;flex-direction:column;gap:16px">
      <h1 class="display">Who are you looking for?</h1>
      <form class="searchbox" id="home-form">
        <label for="q" class="sr">Search request</label>
        <textarea id="q" rows="3" placeholder="Describe who you're looking for — role, skills, location, experience"></textarea>
        <div class="searchbox-foot">
          <span class="sm muted" id="home-note">You'll review the plan and cost before anything is spent.</span>
          <button class="btn btn-p" style="height:36px;padding:0 16px">${I.search}Plan search</button>
        </div>
      </form>
    </div>
    <section style="display:flex;flex-direction:column;gap:8px">
      <h2 class="heading">Try an example</h2>
      <div style="border-top:1px solid var(--line)">
        ${EXAMPLES.map((e) => `<button type="button" class="ex" data-ex="${esc(e)}">${I.list}<span>${esc(e)}</span></button>`).join("")}
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
    if (query.length < 4) { note.textContent = "Describe who you're looking for in a few words."; q.focus(); return; }
    const btn = e.submitter || $("#home-form button");
    btn.disabled = true;
    note.textContent = "Reading your request…";
    try {
      savePlan(await api("/api/plan", { method: "POST", body: { query } }));
      location.hash = "#/plan";
    } catch (err) {
      note.textContent = err.message;
      btn.disabled = false;
    }
  });
  q.focus();
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
      <a href="#/" class="sm">Edit request</a>
      <h1 class="title">Review the search plan</h1>
      <p class="muted">From your request <span class="mono sm" style="color:var(--ink)">“${esc(plan.query)}”</span>. Nothing is spent until you start.</p>
    </header>
    <div class="plan-body">
      <form class="plan-form" id="plan-form">
        <div style="display:flex;flex-direction:column;gap:8px">
          <label for="goal" class="heading">Goal</label>
          <input id="goal" class="input" value="${esc(plan.goal)}">
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><h2 class="heading">Conditions</h2><span class="sm muted">Must = required to qualify. Preferred = raises the score.</span></div>
          <div class="cond-list">
            ${plan.conditions.map((c, i) => `
            <div class="cond">
              <label class="sr" for="c${i}">Condition ${i + 1}</label>
              <input id="c${i}" data-i="${i}" class="cond-text" value="${esc(c.text)}">
              <div class="seg" role="group" aria-label="Importance">
                <button type="button" data-i="${i}" data-imp="must" aria-pressed="${c.importance === "must"}">Must</button>
                <button type="button" data-i="${i}" data-imp="preferred" aria-pressed="${c.importance === "preferred"}">Preferred</button>
              </div>
              <button type="button" class="btn btn-q btn-icon" data-rm="${i}" aria-label="Remove condition" style="color:var(--muted)">${I.trash}</button>
            </div>`).join("")}
            <div style="padding:6px"><button type="button" class="btn btn-q" id="add-cond">${I.plus}Add condition</button></div>
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
          <label for="target" class="heading">How many people</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input id="target" type="number" min="5" max="100" value="${plan.target}" class="input mono" style="width:88px">
            <span class="sm muted">qualified candidates, then the search stops</span>
          </div>
        </div>
      </form>
      <aside class="plan-side" aria-label="Sources and cost">
        <h2 class="heading">Where it will look</h2>
        <div style="border-top:1px solid var(--line)">
          <div class="src-row">${I.code}<span style="flex:1">GitHub</span><span class="mono xs muted">free</span></div>
          <div class="src-row">${I.paper}<span style="flex:1">Papers (OpenAlex)</span><span class="mono xs muted">free</span></div>
          <div class="src-row">${I.webh}<span style="flex:1">Web search</span><span class="mono xs muted">~$0.01 / search</span></div>
          <div class="src-row">${I.homepage.replace('role="img" aria-label="Homepage"><title>Homepage</title>', 'aria-hidden="true">')}<span style="flex:1">Personal homepages</span><span class="mono xs muted">free</span></div>
          <div class="src-row">${I.search}<span style="flex:1">AI verification</span><span class="mono xs muted">most of the cost</span></div>
        </div>
        <p class="sm muted">A person is marked Verified only when every Must condition has evidence and at least two independent sites agree.</p>
      </aside>
    </div>
    <footer class="sticky-foot">
      <div style="display:flex;flex-direction:column;gap:2px;flex:1 1 auto">
        <span>Estimated cost <span class="mono" style="font-weight:500">~${money(est.cost)}</span> · about ${est.minutes} min</span>
        <span class="sm muted">Stops automatically at your ${money(budget)} per-search limit.</span>
      </div>
      <span class="sm" id="plan-err" role="alert" style="color:var(--insufficient)"></span>
      <a href="#/" class="btn">Back</a>
      <button type="button" class="btn btn-p" id="start" style="height:36px;padding:0 18px">Start search</button>
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
    $$(".seg button").forEach((b) => b.addEventListener("click", () => { sync(); plan.conditions[+b.dataset.i].importance = b.dataset.imp; render(); }));
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
      if (!plan.conditions.length) { $("#plan-err").textContent = "Add at least one condition."; return; }
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
  app.search = { id, state: null, progress: null, sel: null, sort: "score", onlyVerified: false, traceOpen: false };
  $("#view").innerHTML = `<div class="page"><p class="muted">Loading search…</p></div>`;
  const es = new EventSource(`/api/searches/${id}/events`);
  app.es = es;
  const S = app.search;
  es.addEventListener("snapshot", (e) => {
    const data = JSON.parse(e.data);
    S.state = data;
    S.progress = data.progress || progressFrom(data);
    renderSearch();
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
      api(`/api/searches/${id}`).then((full) => { S.state = full; S.progress = progressFrom(full); })
        .catch(() => {}).finally(() => { renderSearch(); renderDrawer(S.drawer); refreshSpend(); });
    } else renderSearch();
  });
  es.onerror = () => {
    if (S.state && FINAL.includes(S.state.status)) es.close();
  };
}

function progressFrom(state) {
  const counts = { pending: 0, verified: 0, lead: 0, insufficient: 0, no_match: 0 };
  state.candidates.forEach((c) => { counts[c.status] += 1; });
  return { cost: state.cost, budget: state.budget, sources_checked: state.sources_checked, people: state.candidates.length, counts, elapsed: null };
}

const running = () => app.search?.state?.status === "running";

function renderSearch() {
  const S = app.search;
  const st = S.state;
  const final = FINAL.includes(st.status);
  const conds = st.plan.conditions;
  const must = conds.filter((c) => c.importance === "must").length;
  const left = final ? summaryColumn(st) : traceColumn(st);
  $("#view").innerHTML = `
  <div class="search">
    ${left}
    <main class="results">
      <header class="results-head">
        <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
          <h1 class="title">${esc(st.plan.query)}</h1>
          <span class="sm muted">${must} must · ${conds.length - must} preferred${st.plan.focus && st.plan.focus !== "Any" ? ` · focus: ${esc(st.plan.focus.toLowerCase())}` : ""} · target ${st.plan.target}${final && st.finished_at ? ` · finished ${new Date(st.finished_at).toLocaleString()}` : ""}</span>
        </div>
        ${final
          ? `<a class="btn" href="/api/searches/${esc(st.id)}/export.csv">${I.download}Export CSV</a>`
          : `<button type="button" class="btn" id="stop">${I.stop}Stop search</button>`}
      </header>
      ${statusCallout(st)}
      <div class="toolbar" id="toolbar">${toolbar(st)}</div>
      <div class="table-wrap" id="table-wrap">
        ${st.candidates.length || !final ? `
        <div class="table" role="table" aria-label="Candidates" id="table">
          <div class="rw head" role="row"><span role="columnheader">Candidate</span><span role="columnheader">Status</span><span role="columnheader">Match</span><span role="columnheader">Why they match</span><span role="columnheader">Evidence</span></div>
          <div id="rows" role="rowgroup">${visibleRows(st).map(rowHtml).join("")}</div>
        </div>
        ${!final ? `<p class="sm muted" style="padding:12px 24px" id="rows-note">${st.candidates.length ? "Rows keep their place while the search runs." : "People appear here as soon as a source returns them."}</p>` : ""}
        ${final ? excludedHtml(st) : ""}` : emptyHtml(st)}
      </div>
    </main>
  </div>`;
  bindSearch();
}

function traceColumn(st) {
  return `
  <section class="trace" aria-label="Search trace">
    <div class="trace-head">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="heading">Search trace</h2><span class="mono xs tmuted" id="elapsed"></span></div>
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
  const dur = s.status === "running" ? '<span class="mono xs" style="color:var(--trace-accent)">running…</span>'
    : s.status === "failed" ? `<span class="mono xs tfail">failed${s.seconds != null ? ` · ${s.seconds}s` : ""}</span>`
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
  if (!p || !$("#readouts")) { const tb = $("#toolbar"); if (tb && S) tb.innerHTML = toolbar(S.state); return; }
  const target = S.state.plan.target;
  $("#readouts").innerHTML = `
    <span><span class="readout">${p.people}</span><span class="xs tmuted">people found</span></span>
    <span><span class="readout">${p.sources_checked}</span><span class="xs tmuted">sources checked</span></span>
    <span><span class="readout">${money(p.cost)}</span><span class="xs tmuted">of ${money(p.budget)} limit</span></span>`;
  if (p.elapsed != null) {
    const m = Math.floor(p.elapsed / 60), s = Math.floor(p.elapsed % 60);
    $("#elapsed").textContent = `${m}:${String(s).padStart(2, "0")} elapsed`;
  }
  const pct = Math.min(98, Math.round(Math.max(p.counts.verified / target, (p.people - p.counts.pending) / Math.max(p.people, 1) * 0.5) * 100));
  $("#pbar").style.width = `${p.people ? pct : 3}%`;
  $("#phase").textContent = p.counts.pending
    ? `Verifying ${p.counts.pending} of ${p.people} · ${p.counts.verified} verified so far`
    : p.people ? `Searching more sources · ${p.counts.verified} of ${target} verified` : "Searching sources · verification starts as people come in";
  $("#toolbar").innerHTML = toolbar(S.state);
}

function toolbar(st) {
  const c = app.search.progress?.counts || progressFrom(st).counts;
  if (!FINAL.includes(st.status)) {
    return `<span><b class="mono" style="font-weight:500">${c.verified}</b> verified</span><span><b class="mono" style="font-weight:500">${c.lead}</b> lead only</span><span><b class="mono" style="font-weight:500">${c.pending}</b> pending</span>${c.insufficient + c.no_match ? `<span><b class="mono" style="font-weight:500">${c.insufficient + c.no_match}</b> not included</span>` : ""}`;
  }
  const S = app.search;
  return `
    <span style="display:inline-flex;gap:6px;align-items:center;color:var(--verified)">${STATUS.verified.svg}<span style="color:var(--ink)"><b class="mono" style="font-weight:500">${c.verified}</b> qualified</span></span>
    <span style="display:inline-flex;gap:6px;align-items:center;color:var(--lead)">${STATUS.lead.svg}<span style="color:var(--ink)"><b class="mono" style="font-weight:500">${c.lead}</b> lead only</span></span>
    <span style="display:inline-flex;gap:6px;align-items:center;color:var(--muted)">${STATUS.no_match.svg}<a href="#excluded"><b class="mono" style="font-weight:500">${c.insufficient + c.no_match + c.pending}</b> not included</a></span>
    <span style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <label class="btn" style="gap:8px"><input type="checkbox" id="only-v" ${S.onlyVerified ? "checked" : ""} style="margin:0;accent-color:var(--cobalt)">Only verified</label>
      <label for="sort" class="sm muted">Sort</label>
      <select id="sort" class="input" style="height:32px;padding:0 8px;font-size:13px">
        <option value="score" ${S.sort === "score" ? "selected" : ""}>Match score</option>
        <option value="status" ${S.sort === "status" ? "selected" : ""}>Status</option>
        <option value="name" ${S.sort === "name" ? "selected" : ""}>Name</option>
      </select>
    </span>`;
}

function visibleRows(st) {
  const S = app.search;
  if (!FINAL.includes(st.status)) return st.candidates; // arrival order while running
  let rows = st.candidates.filter((c) => c.status === "verified" || c.status === "lead");
  if (S.onlyVerified) rows = rows.filter((c) => c.status === "verified");
  const rank = { verified: 0, lead: 1 };
  const by = {
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
    status: (a, b) => rank[a.status] - rank[b.status] || (b.score ?? -1) - (a.score ?? -1),
    name: (a, b) => a.name.localeCompare(b.name),
  }[S.sort];
  return [...rows].sort(by);
}

function rowHtml(c, enter = false) {
  const S = app.search;
  const pending = c.status === "pending";
  const sub = [c.role, c.company].filter(Boolean).join(" · ");
  const why = pending ? "Checking sources…" : c.summary || c.exclusion;
  return `
  <div class="rw cand${S.sel === c.id ? " sel" : ""}${enter ? " enter" : ""}" role="row" tabindex="0" data-id="${esc(c.id)}" aria-selected="${S.sel === c.id}">
    <div role="cell" style="display:flex;gap:10px;min-width:0"><span class="av" aria-hidden="true">${esc(initials(c.name))}</span><div style="display:flex;flex-direction:column;min-width:0"><a class="nm" href="#/search/${esc(S.id)}/c/${esc(c.id)}" tabindex="-1">${esc(c.name)}</a>${sub ? `<span class="sub2">${esc(sub)}</span>` : ""}${c.location ? `<span class="sub2">${esc(c.location)}</span>` : ""}</div></div>
    <div role="cell">${badge(c.status)}</div>
    <div role="cell">${c.score != null && !pending ? `<div class="score"><span class="mono" style="font-weight:500">${c.score}</span><span class="sbar"><span style="width:${c.score}%;background:${scoreColor(c.score)}"></span></span></div>` : '<span class="mono muted" aria-label="No score yet">—</span>'}</div>
    <div role="cell" style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="why${pending ? " muted" : ""}">${esc(why)}</span>${c.tags.length ? `<div class="tags">${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}</div>
    <div role="cell" class="srcs">${c.sources.map((s) => `<span title="${esc(s)}">${I[s] || ""}</span>`).join("")}</div>
  </div>`;
}

function upsertCandidate(c) {
  const S = app.search;
  if (!S?.state) return;
  const list = S.state.candidates;
  const i = list.findIndex((x) => x.id === c.id);
  const prev = i >= 0 ? list[i] : null;
  if (i >= 0) list[i] = c; else list.push(c);
  if (!running()) return;
  const rows = $("#rows");
  if (!rows) return;
  const el = rows.querySelector(`[data-id="${CSS.escape(c.id)}"]`);
  if (el) {
    const hadFocus = document.activeElement === el;
    el.outerHTML = rowHtml(c);
    const fresh = rows.querySelector(`[data-id="${CSS.escape(c.id)}"]`);
    bindRow(fresh);
    if (hadFocus) fresh.focus();
    if (prev && prev.status !== c.status) {
      // One-time tint when a status settles, then fade back over 1.4s.
      fresh.classList.add("flash");
      requestAnimationFrame(() => requestAnimationFrame(() => fresh.classList.remove("flash")));
    }
  } else {
    rows.insertAdjacentHTML("beforeend", rowHtml(c, true));
    bindRow(rows.lastElementChild);
    const note = $("#rows-note");
    if (note) note.textContent = "Rows keep their place while the search runs.";
  }
  if (S.drawer === c.id) renderDrawer(c.id);
}

function bindRow(el) {
  el.addEventListener("click", (e) => {
    if (e.target.closest("a") && !e.target.closest("a.nm")) return;
    e.preventDefault();
    location.hash = `#/search/${app.search.id}/c/${el.dataset.id}`;
  });
  el.addEventListener("keydown", (e) => {
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

function bindSearch() {
  $$("#rows .cand").forEach(bindRow);
  $("#stop")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { await api(`/api/searches/${app.search.id}/stop`, { method: "POST" }); } catch (err) { e.target.disabled = false; alert(err.message); }
  });
  $("#continue")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await api(`/api/searches/${app.search.id}/continue`, { method: "POST" });
      showSearch(app.search.id);
    } catch (err) { e.target.disabled = false; $("#callout-err").textContent = err.message; }
  });
  $("#toolbar").addEventListener("change", (e) => {
    if (e.target.id === "only-v") app.search.onlyVerified = e.target.checked;
    if (e.target.id === "sort") app.search.sort = e.target.value;
    $("#rows").innerHTML = visibleRows(app.search.state).map((c) => rowHtml(c)).join("");
    $$("#rows .cand").forEach(bindRow);
  });
  $$("[data-followup]").forEach((b) => b.addEventListener("click", () => followUp(b.dataset.followup)));
  $$("[data-loosen]").forEach((b) => b.addEventListener("click", () => loosen(+b.dataset.loosen)));
  $("#trace-toggle")?.addEventListener("click", () => {
    app.search.traceOpen = !app.search.traceOpen;
    $("#trace-full").hidden = !app.search.traceOpen;
    $("#trace-toggle").setAttribute("aria-expanded", app.search.traceOpen);
    $("#trace-toggle-label").textContent = app.search.traceOpen ? "Hide" : "Show";
  });
  renderReadouts();
}

function statusCallout(st) {
  const failedWeb = st.trace.some((s) => s.status === "failed" && s.action === "Searched the web");
  const parts = [];
  if (st.status === "budget") {
    parts.push(`
    <div class="callout warn" role="status" style="margin:16px 24px 0">
      <span class="heading">Stopped at your ${money(st.budget)} limit. ${st.candidates.length} people found.</span>
      <span class="sm">${st.candidates.filter((c) => c.status === "verified").length} are verified and ${st.candidates.filter((c) => c.status === "lead").length} are lead only. ${st.candidates.filter((c) => c.status === "pending").length} were still pending.</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="btn btn-p" id="continue">Continue for another ${money(app.config?.budget ?? 1)}</button><span class="sm" id="callout-err" role="alert"></span></div>
    </div>`);
  }
  if (st.status === "failed") {
    parts.push(`<div class="callout err" role="alert" style="margin:16px 24px 0"><span class="heading" style="color:var(--insufficient)">The search stopped because of an error</span><span class="sm">${esc(st.error)}</span><span class="sm">Results found before the error are kept below.</span></div>`);
  }
  if (st.status === "stopped") {
    parts.push(`<div class="callout warn" role="status" style="margin:16px 24px 0"><span class="sm">You stopped this search. ${st.candidates.length} people found so far are kept below.</span></div>`);
  }
  if (failedWeb) {
    parts.push(`<div class="callout err" role="status" style="margin:16px 24px 0"><span style="color:var(--insufficient);font-weight:600">Web search unavailable</span><span class="sm">Results come from GitHub and papers only. Fewer people can be confirmed by location, so more will stay Lead only.</span></div>`);
  }
  return parts.join("");
}

function summaryColumn(st) {
  const sum = st.summary;
  const minutes = st.finished_at ? Math.max(0, (new Date(st.finished_at) - new Date(st.created_at)) / 1000) : null;
  const dur = minutes != null ? `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, "0")}` : "—";
  const max = Math.max(1, ...(sum?.areas || []).map((a) => a[1]));
  return `
  <aside class="summary-col" aria-label="Search summary">
    <button type="button" class="trace-collapsed" id="trace-toggle" aria-expanded="false" aria-controls="trace-full">
      <span class="dot" style="margin:0;flex:none"></span>
      <span style="display:flex;flex-direction:column;flex:1 1 auto"><span class="sm" style="font-weight:500">Search trace · ${st.trace.length} steps</span><span class="mono xs tmuted">${dur} · ${st.sources_checked} sources · ${money(st.cost)}</span></span>
      <span class="sm" style="color:var(--trace-accent)" id="trace-toggle-label">Show</span>
    </button>
    <div id="trace-full" hidden style="background:var(--trace);color:var(--trace-ink)"><ol class="trace-list">${st.trace.map((s) => stepHtml(s)).join("")}</ol></div>
    <div style="padding:20px;display:flex;flex-direction:column;gap:24px">
      ${sum ? `
      <section style="display:flex;flex-direction:column;gap:8px"><h2 class="heading">Summary</h2><p style="line-height:21px">${esc(sum.text)}</p></section>
      ${sum.areas.length ? `<section style="display:flex;flex-direction:column;gap:10px"><h2 class="heading">Qualified by area</h2>
        <div style="display:grid;grid-template-columns:120px 1fr 28px;gap:8px 10px;align-items:center" class="sm">
        ${sum.areas.map(([name, n]) => `<span>${esc(name)}</span><span class="sbar" style="width:auto;height:6px"><span style="height:6px;width:${(n / max) * 100}%;background:var(--score-4)"></span></span><span class="mono num">${n}</span>`).join("")}
        </div></section>` : ""}
      ${sum.followups.length ? `<section style="display:flex;flex-direction:column;gap:8px"><h2 class="heading">Next searches</h2>
        ${sum.followups.map((f) => `<button type="button" class="fu" data-followup="${esc(f)}">${I.search}${esc(f)}</button>`).join("")}
        <span class="xs muted">Each opens a new plan to review first.</span></section>` : ""}`
      : `<p class="muted sm">No summary for this search${st.status === "done" ? "" : " because it didn't finish"}.</p>`}
    </div>
  </aside>`;
}

function excludedHtml(st) {
  const groups = [
    ["no_match", "Didn't match", st.candidates.filter((c) => c.status === "no_match")],
    ["insufficient", "Not enough evidence", st.candidates.filter((c) => c.status === "insufficient" || c.status === "pending")],
  ];
  const total = groups.reduce((n, g) => n + g[2].length, 0);
  if (!total) return "";
  return `
  <details class="excl" id="excluded">
    <summary>${total} not included</summary>
    ${groups.filter((g) => g[2].length).map(([status, label, list]) => `
      <h3 class="xh">${badge(status)}<span class="mono">${list.length}</span></h3>
      ${list.map((c) => `<div class="xr"><div style="display:flex;flex-direction:column"><a class="nm" href="#/search/${esc(st.id)}/c/${esc(c.id)}">${esc(c.name)}</a><span class="sub2">${esc([c.role, c.company].filter(Boolean).join(" · ") || "Role unknown")}</span></div><span class="sm">${esc(c.exclusion || (c.status === "pending" ? "Not checked before the search ended." : label))}</span></div>`).join("")}
    `).join("")}
  </details>`;
}

function emptyHtml(st) {
  const musts = st.plan.conditions.map((c, i) => [c, i]).filter(([c]) => c.importance === "must");
  return `
  <div class="empty">
    <h2 class="title">No one met every Must condition</h2>
    <p>The search checked ${st.sources_checked} sources but found no one who fits. Loosening one condition usually helps.</p>
    ${musts.length ? `<span class="sm" style="font-weight:500">Try loosening one condition</span>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${musts.map(([c, i]) => `<button type="button" class="btn" data-loosen="${i}">Remove “${esc(c.text)}”</button>`).join("")}</div>` : ""}
    <span class="xs muted">You'll review the new plan before anything is spent.</span>
  </div>`;
}

function loosen(i) {
  const plan = structuredClone(app.search.state.plan);
  plan.conditions.splice(i, 1);
  savePlan(plan);
  location.hash = "#/plan";
}

async function followUp(text) {
  const base = app.search.state.plan.query;
  const btns = $$("[data-followup]");
  btns.forEach((b) => (b.disabled = true));
  try {
    savePlan(await api("/api/plan", { method: "POST", body: { query: `${base}. ${text}` } }));
    location.hash = "#/plan";
  } catch (err) {
    btns.forEach((b) => (b.disabled = false));
    alert(err.message);
  }
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
  const group = (kind, label, icon) => {
    const items = c.evidence.filter((e) => e.kind === kind);
    if (!items.length && !pending) return "";
    return `
    <section style="display:flex;flex-direction:column;gap:4px">
      <h3 class="heading" style="display:flex;align-items:center;gap:8px"><span class="muted" style="display:flex">${icon}</span>${label}</h3>
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
  root.innerHTML = `
  <aside class="drawer" role="dialog" aria-modal="false" aria-labelledby="dname">
    <div class="drawer-top">
      <button type="button" class="btn btn-icon" id="d-prev" aria-label="Previous candidate" ${pos <= 0 ? "disabled" : ""}>${I.up}</button>
      <button type="button" class="btn btn-icon" id="d-next" aria-label="Next candidate" ${pos < 0 || pos >= order.length - 1 ? "disabled" : ""}>${I.down}</button>
      <span class="mono xs muted">${pos >= 0 ? `${pos + 1} of ${order.length} · ↑↓ to move` : ""}</span>
      <button type="button" class="btn btn-icon" id="d-close" style="margin-left:auto;border-color:transparent" aria-label="Close details">${I.close}</button>
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
            ${c.score != null && !pending ? `<span style="display:flex;align-items:center;gap:8px"><span class="xs muted">Match</span><span class="mono" style="font-size:20px;line-height:24px;font-weight:500">${c.score}</span></span><span class="sbar" style="width:72px"><span style="width:${c.score}%;background:${scoreColor(c.score)}"></span></span>` : ""}
          </div>
        </div>
        ${links.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${links.map(([k, label]) => `<a class="btn" style="color:var(--cobalt)" href="${esc(safeUrl(c.links[k]))}" target="_blank" rel="noopener noreferrer">${label}${I.ext}<span class="sr">(opens in new tab)</span></a>`).join("")}</div>` : ""}
        ${pending ? `<p role="status" class="sm muted" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--paper);border-radius:4px">${STATUS.pending.svg}Gathering more details…</p>` : ""}
        ${c.exclusion ? `<p class="sm" style="padding:8px 10px;background:var(--${c.status === "insufficient" ? "insufficient" : "pending"}-soft);border-radius:4px">${esc(c.exclusion)}</p>` : ""}
      </section>
      ${c.reasons.length ? `
      <section style="display:flex;flex-direction:column;gap:10px">
        <h3 class="heading">Why they match</h3>
        <p style="line-height:22px">${c.reasons.map((r) => `${esc(r.text)}${refs(r.refs)}`).join(" ")}</p>
        ${c.checks.length ? `<div style="border-top:1px solid var(--line)">${c.checks.map((ch) => `
          <div class="check">
            <span style="color:${ch.met === "yes" ? "var(--verified)" : ch.met === "no" ? "var(--insufficient)" : "var(--muted)"};display:flex" title="${ch.met === "yes" ? "Met" : ch.met === "no" ? "Not met" : "Unknown"}">${ch.met === "yes" ? STATUS.verified.svg : ch.met === "no" ? STATUS.no_match.svg : STATUS.pending.svg}<span class="sr">${ch.met === "yes" ? "Met" : ch.met === "no" ? "Not met" : "Unknown"}</span></span>
            <span>${esc(ch.text)}</span>
            <span class="xs muted">${ch.importance === "must" ? "Must" : "Preferred"}</span>
            <span style="min-width:40px;text-align:right">${refs(ch.refs) || '<span class="mono xs muted">—</span>'}</span>
          </div>`).join("")}</div>` : ""}
      </section>` : ""}
      ${group("code", "Code", I.code)}
      ${group("paper", "Papers", I.paper)}
      ${group("web", "Web", I.webh)}
    </div>
  </aside>`;
  const go = (id) => { if (id) location.hash = `#/search/${S.id}/c/${id}`; };
  $("#d-close").addEventListener("click", () => {
    location.hash = `#/search/${S.id}`;
    $(`#rows [data-id="${CSS.escape(cid)}"]`)?.focus();
  });
  $("#d-prev").addEventListener("click", () => go(order[pos - 1]));
  $("#d-next").addEventListener("click", () => go(order[pos + 1]));
  $$(".ref[data-ref]", root).forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const target = $(`#ev-${CSS.escape(a.dataset.ref)}`, root);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("hl");
    setTimeout(() => target.classList.remove("hl"), 1400);
  }));
}

function metaText(e) {
  const m = e.meta || {};
  if (e.kind === "code") {
    const line1 = [m.stars != null ? `★ ${Number(m.stars).toLocaleString()}` : null, m.language].filter(Boolean).join(" · ");
    const line2 = m.pushed_at ? `pushed ${m.pushed_at}` : m.contributions ? `${m.contributions} commits` : m.followers != null ? `${m.followers} followers` : "";
    return [line1, line2].filter(Boolean).join("\n");
  }
  if (e.kind === "paper") return [[m.venue, m.year].filter(Boolean).join(" "), m.citations != null ? `${m.citations} citations` : ""].filter(Boolean).join("\n");
  return [m.domain, m.fetched ? `fetched ${m.fetched}` : ""].filter(Boolean).join("\n");
}

// ---------- History ----------

async function showHistory() {
  app.view = "history";
  setNav("history");
  const v = $("#view");
  v.innerHTML = `<div class="page"><h1 class="title">History</h1><p class="muted">Loading…</p></div>`;
  let rows;
  try { rows = await api("/api/history"); } catch (err) { v.innerHTML = `<div class="page"><h1 class="title">History</h1><p role="alert">${esc(err.message)}</p></div>`; return; }
  const label = { done: "Done", stopped: "Stopped", budget: "Budget limit", failed: "Failed", running: "Running" };
  v.innerHTML = `
  <div class="page">
    <h1 class="title">History</h1>
    ${rows.length ? `<div class="box" style="overflow-x:auto"><div role="table" aria-label="Past searches" style="min-width:720px">
      <div class="tr head" role="row"><span role="columnheader">Request</span><span role="columnheader">When</span><span class="num" role="columnheader">People</span><span class="num" role="columnheader">Verified</span><span class="num" role="columnheader">Cost</span><span role="columnheader">Status</span></div>
      ${rows.map((r) => `<div class="tr" role="row"><a role="cell" href="#/search/${esc(r.id)}" style="color:var(--ink);font-weight:500">${esc(r.query)}</a><span role="cell" class="mono xs muted">${esc(new Date(r.created_at).toLocaleString())}</span><span role="cell" class="mono num">${r.people}</span><span role="cell" class="mono num">${r.verified}</span><span role="cell" class="mono num">${money(r.cost)}</span><span role="cell" class="xs">${label[r.status] || esc(r.status)}</span></div>`).join("")}
    </div></div>` : `<p class="muted">No searches yet. <a href="#/">Start one</a>.</p>`}
  </div>`;
}

// ---------- P6 Cost report ----------

async function showCost(month) {
  app.view = "cost";
  setNav("cost");
  const v = $("#view");
  let r;
  try { r = await api(`/api/cost${month ? `?month=${encodeURIComponent(month)}` : ""}`); } catch (err) { v.innerHTML = `<div class="page"><h1 class="title">Cost report</h1><p role="alert">${esc(err.message)}</p></div>`; return; }
  const sources = [["github", "GitHub", "Free"], ["papers", "Papers", "Free"], ["web", "Web search", "Billed per search"], ["homepage", "Homepage fetches", "Free"], ["ai", "AI verification", "Planning, reading sources, scoring"]];
  const max = Math.max(0.0001, ...Object.values(r.by_source));
  const fmtSecs = (s) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
  v.innerHTML = `
  <div class="page">
    <header style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px">
      <div style="display:flex;flex-direction:column;gap:4px"><h1 class="title">Cost report</h1><span class="sm muted">GitHub, papers and homepages are free; you pay for web search and AI verification. Per-search limit ${money(r.budget)}.</span></div>
      <div style="display:flex;align-items:center;gap:8px"><label for="month" class="sm muted">Month</label><select id="month" class="input" style="height:32px;font-size:13px">${r.months.map((m) => `<option ${m === r.month ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
    </header>
    <section class="metrics" aria-label="Totals">
      <div><span class="sm muted">Spent this month</span><span class="readout">${money(r.total)}</span></div>
      <div><span class="sm muted">Searches</span><span class="readout">${r.searches}</span><span class="xs muted">${r.budget_stops} stopped at budget limit</span></div>
      <div><span class="sm muted">Average per search</span><span class="readout">${money(r.avg_per_search)}</span></div>
      <div><span class="sm muted">Per verified candidate</span><span class="readout">${r.per_verified == null ? "—" : money(r.per_verified, 3)}</span><span class="xs muted">${r.verified} verified</span></div>
    </section>
    <div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">
      <section style="flex:999 1 640px;min-width:0;display:flex;flex-direction:column;gap:10px">
        <h2 class="heading">Searches</h2>
        ${r.rows.length ? `<div class="box" style="overflow-x:auto"><div role="table" aria-label="Searches this month" style="min-width:720px">
          <div class="tr head" role="row"><span role="columnheader">Request</span><span role="columnheader">When</span><span class="num" role="columnheader">People</span><span class="num" role="columnheader">Verified</span><span class="num" role="columnheader">Cost</span><span class="num" role="columnheader">Time</span></div>
          ${r.rows.map((x) => `<div class="tr" role="row"><span role="cell" style="display:flex;flex-direction:column;min-width:0"><a href="#/search/${esc(x.id)}" style="color:var(--ink);font-weight:500">${esc(x.query)}</a>${x.status === "budget" ? '<span class="xs" style="color:var(--lead)">Stopped at budget limit</span>' : x.status === "failed" ? '<span class="xs" style="color:var(--insufficient)">Failed</span>' : x.people === 0 && x.status === "done" ? '<span class="xs muted">No results</span>' : ""}</span><span role="cell" class="mono xs muted">${esc(new Date(x.created_at).toLocaleString())}</span><span role="cell" class="mono num">${x.people}</span><span role="cell" class="mono num">${x.verified}</span><span role="cell" class="mono num" style="font-weight:500">${money(x.cost)}</span><span role="cell" class="mono num muted">${fmtSecs(x.seconds)}</span></div>`).join("")}
        </div></div>` : `<p class="muted">No searches this month.</p>`}
      </section>
      <section style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:10px">
        <h2 class="heading">By source</h2>
        <div class="box" style="padding:6px 18px">
          ${sources.map(([k, label, note]) => `<div style="display:flex;flex-direction:column;gap:6px;padding:12px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px"><span>${label}</span><span class="mono" style="font-weight:500">${money(r.by_source[k] || 0)}</span></div><span class="sbar" style="width:auto;height:6px"><span style="height:6px;width:${((r.by_source[k] || 0) / max) * 100}%;background:var(--score-4)"></span></span><span class="xs muted">${note}</span></div>`).join("")}
          <div style="display:flex;justify-content:space-between;padding:12px 0"><span style="font-weight:600">Total</span><span class="mono" style="font-weight:500">${money(r.total)}</span></div>
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
window.addEventListener("hashchange", route);
(async () => {
  try {
    app.config = await api("/api/config");
    $("#demo-flag").hidden = !app.config.demo;
  } catch { app.config = { budget: 1, demo: false }; }
  refreshSpend();
  route();
})();
