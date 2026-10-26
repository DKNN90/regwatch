/* RegWatch — reads feed.json, renders four regions, works offline. */
(function () {
  "use strict";

  const REGIONS = ["eu", "uk", "us", "global"];
  const STEP_OF = { proposal: 1, consultation: 2, rulemaking: 2, agreed: 3, adopted: 3, in_force: 4, stalled: 2 };
  const QUALITY = {
    primary: { cls: "q-primary", text: "Primary source" },
    secondary: { cls: "q-secondary", text: "Secondary — law firm / specialist press" },
    lower: { cls: "q-lower", text: "Lower-reputability source — verify against primary" }
  };
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const state = {
    feed: null,
    region: "eu",
    view: "latest",
    openId: null,
    fromCache: false,
    pendingSeen: null
  };

  /* ---------- storage (best effort) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("rw:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("rw:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- helpers ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function fmtDate(d, approx) {
    if (!d) return "";
    const p = String(d).split("-");
    let out;
    if (p.length === 1) out = p[0];
    else if (p.length === 2) out = MONTHS[+p[1] - 1] + " " + p[0];
    else out = (+p[2]) + " " + MONTHS[+p[1] - 1] + " " + p[0];
    return approx ? "Expected " + out : out;
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysUntil(d) {
    const t = new Date(d + "T00:00:00Z").getTime();
    const n = new Date(today() + "T00:00:00Z").getTime();
    return Math.round((t - n) / 86400000);
  }
  function relDays(d) {
    const n = daysUntil(d);
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n > 1 && n < 60) return "in " + n + " days";
    if (n < 0) return "passed";
    return "";
  }
  function regionObj(id) { return (state.feed.regions || []).find((r) => r.id === id) || { name: id, blurb: "" }; }
  function trackerById(id) { return (state.feed.trackers || []).find((t) => t.id === id); }

  /* ---------- "new" tracking ---------- */
  function seenMap() { return store.get("seen", {}); }
  function isNew(u) {
    const seen = seenMap()[u.region];
    if (!seen) {
      // first visit: flag the last 7 days relative to the feed date
      const ref = new Date((state.feed.generated_at || today()).slice(0, 10) + "T00:00:00Z");
      ref.setUTCDate(ref.getUTCDate() - 7);
      return u.date >= ref.toISOString().slice(0, 10);
    }
    return (u.added || u.date) > seen;
  }
  function commitSeen() {
    if (!state.pendingSeen) return;
    const m = seenMap();
    m[state.pendingSeen] = (state.feed.generated_at || today()).slice(0, 10);
    store.set("seen", m);
    state.pendingSeen = null;
    updateDots();
  }
  function updateDots() {
    REGIONS.forEach((r) => {
      const has = (state.feed.updates || []).some((u) => u.region === r && isNew(u));
      const dot = $('.regions button[data-region="' + r + '"] .dot');
      if (dot) dot.hidden = !(has && r !== state.region);
    });
  }

  /* ---------- rendering ---------- */
  function linkList(links) {
    if (!links || !links.length) return "";
    return '<ul class="links">' + links.map((l) => {
      const q = QUALITY[l.quality] || QUALITY.secondary;
      return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener"><span class="u">' + esc(l.label) +
        '</span> ↗<br><span class="q ' + q.cls + '">' + q.text + "</span></a></li>";
    }).join("") + "</ul>";
  }

  function updateCard(u) {
    const open = state.openId === u.id;
    const tr = u.tracker ? trackerById(u.tracker) : null;
    return '<article class="card" id="c-' + esc(u.id) + '"' + (open ? " open" : "") + ">" +
      '<button class="card-btn" data-toggle="' + esc(u.id) + '" aria-expanded="' + open + '">' +
        '<div class="card-meta"><span>' + fmtDate(u.date) + '</span><span class="chip">' + esc(u.authority) + "</span><span>" + esc(u.type) + "</span>" +
        (isNew(u) ? '<span class="new-badge">NEW</span>' : "") + '<span style="flex:1"></span><span class="chev">▾</span></div>' +
        "<h3>" + esc(u.title) + "</h3>" +
        '<p class="summary">' + esc(u.summary) + "</p>" +
      "</button>" +
      (open ? '<div class="detail">' +
        (u.what_changed && u.what_changed.length ? "<h4>What it says</h4><ul>" + u.what_changed.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
        (u.who ? "<h4>Who it applies to</h4><p>" + esc(u.who) + "</p>" : "") +
        (u.dates ? "<h4>Key dates</h4><p>" + esc(u.dates) + "</p>" : "") +
        "<h4>Sources</h4>" + linkList(u.links) +
        (tr ? '<button class="related" data-goto-tracker="' + esc(tr.id) + '">See the full file: ' + esc(tr.short || tr.name) + " →</button>" : "") +
      "</div>" : "") +
    "</article>";
  }

  function stageBar(t) {
    const n = STEP_OF[t.stage] || 1;
    const stalled = t.stage === "stalled";
    let steps = "";
    for (let i = 1; i <= 4; i++) steps += '<i class="' + (i <= n ? "on" : "") + '"></i>';
    return '<div class="stage"><span class="steps' + (stalled ? " stalled" : "") + '" aria-hidden="true">' + steps +
      '</span><span class="stage-label' + (stalled ? " stalled" : "") + '">' + esc(t.stage_label) + "</span></div>";
  }

  function trackerCard(t) {
    const open = state.openId === t.id;
    return '<article class="card" id="c-' + esc(t.id) + '"' + (open ? " open" : "") + ">" +
      '<button class="card-btn" data-toggle="' + esc(t.id) + '" aria-expanded="' + open + '">' +
        '<div class="card-meta"><span>' + esc((t.authorities || []).slice(0, 3).join(" · ")) + '</span><span style="flex:1"></span><span class="chev">▾</span></div>' +
        "<h3>" + esc(t.name) + "</h3>" + stageBar(t) +
        '<p class="summary">' + esc(t.summary) + "</p>" +
      "</button>" +
      (open ? '<div class="detail">' +
        (t.points && t.points.length ? "<h4>Where it stands</h4><ul>" + t.points.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
        (t.timeline && t.timeline.length ? '<h4>Timeline</h4><ul class="timeline">' + t.timeline.map((s) =>
          '<li class="' + (s.done ? "done" : "") + '"><span class="t-date">' + fmtDate(s.date, s.approx && !s.done) + '</span><span class="t-label">' + esc(s.label) + "</span></li>").join("") + "</ul>" : "") +
        (t.next ? "<h4>What happens next</h4><p>" + esc(t.next) + "</p>" : "") +
        "<h4>Sources</h4>" + linkList(t.links) +
        '<p class="footnote" style="text-align:left;margin:12px 0 0">File last reviewed ' + fmtDate(t.updated) + "</p>" +
      "</div>" : "") +
    "</article>";
  }

  function renderLatest() {
    const items = (state.feed.updates || []).filter((u) => u.region === state.region)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    state.pendingSeen = state.region;
    if (!items.length) return '<p class="empty">No updates recorded for this region yet.</p>';
    return items.map(updateCard).join("");
  }

  function renderTracker() {
    const order = { stalled: 0, proposal: 1, consultation: 2, rulemaking: 2, agreed: 3, adopted: 4, in_force: 5 };
    // Most recently active file first: latest completed timeline step.
    const lastMove = (t) => (t.timeline || []).filter((s) => s.done).map((s) => String(s.date)).sort().pop() || "";
    const items = (state.feed.trackers || []).filter((t) => t.region === state.region)
      .sort((a, b) => { const x = lastMove(a), y = lastMove(b); return x < y ? 1 : x > y ? -1 : (order[a.stage] || 0) - (order[b.stage] || 0); });
    if (!items.length) return '<p class="empty">No files tracked for this region yet.</p>';
    return items.map(trackerCard).join("");
  }

  function renderAhead() {
    const t = today();
    const items = (state.feed.upcoming || []).filter((e) => e.region === state.region && (e.end || e.date) >= t)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!items.length) return '<p class="empty">Nothing scheduled.</p>';
    let html = "", lastMonth = "";
    items.forEach((e) => {
      const p = e.date.split("-");
      const m = MONTHS[+p[1] - 1] + " " + p[0];
      if (m !== lastMonth) { html += '<div class="month">' + m + "</div>"; lastMonth = m; }
      const rel = e.approx ? "Approximate date" : relDays(e.date);
      const span = e.end ? fmtDate(e.date) + " – " + fmtDate(e.end) : fmtDate(e.date);
      const tr = e.tracker ? trackerById(e.tracker) : null;
      html += '<div class="event"><div class="day"><b>' + (e.approx ? "~" : +p[2]) + "</b><small>" + MONTHS[+p[1] - 1] + "</small></div>" +
        '<div><p class="e-title">' + esc(e.title) + '</p><div class="e-sub">' + esc(e.approx ? rel : span + (rel ? " · " + rel : "")) + "</div>" +
        (tr ? '<button class="e-link" data-goto-tracker="' + esc(tr.id) + '">' + esc(tr.short || tr.name) + " →</button>" : "") +
        "</div></div>";
    });
    return html;
  }

  function render() {
    const f = state.feed;
    document.documentElement.setAttribute("data-region", state.region);
    const r = regionObj(state.region);
    $("#region-title").textContent = r.name;
    const updated = fmtDate((f.generated_at || "").slice(0, 10));
    const next = f.next_update ? " · Next update " + fmtDate(f.next_update) : "";
    $("#meta").textContent = "Updated " + updated + next + (state.fromCache ? " · offline copy" : "");

    document.querySelectorAll(".segments button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === state.view)));
    document.querySelectorAll(".regions button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.region === state.region)));

    let body = '<p class="region-blurb">' + esc(r.blurb) + "</p>";
    if (state.view === "latest") body += renderLatest();
    else if (state.view === "tracker") body += renderTracker();
    else body += renderAhead();
    body += '<p class="footnote">Plain-English summaries of public documents, not legal text or advice. Check the primary source before relying on anything here.</p>';
    $("#content").innerHTML = body;
    updateDots();
  }

  /* ---------- navigation ---------- */
  function go(region, view, openId, scroll) {
    if (region !== state.region) commitSeen();
    state.region = region; state.view = view; state.openId = openId || null;
    store.set("last", { region, view });
    const hash = "#/" + region + "/" + view + (openId ? "/" + openId : "");
    if (location.hash !== hash) history.replaceState(null, "", hash);
    render();
    if (scroll && openId) {
      const el = document.getElementById("c-" + openId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (!openId) window.scrollTo(0, 0);
  }

  function gotoTracker(id) {
    const t = trackerById(id);
    if (!t) return;
    closeSheets();
    go(t.region, "tracker", id, true);
  }

  document.addEventListener("click", (e) => {
    const tog = e.target.closest("[data-toggle]");
    if (tog) {
      const id = tog.dataset.toggle;
      state.openId = state.openId === id ? null : id;
      const hash = "#/" + state.region + "/" + state.view + (state.openId ? "/" + state.openId : "");
      history.replaceState(null, "", hash);
      render();
      const el = document.getElementById("c-" + id);
      if (el && state.openId) {
        const top = el.getBoundingClientRect().top;
        if (top < 50) el.scrollIntoView({ block: "start" });
      }
      return;
    }
    const gt = e.target.closest("[data-goto-tracker]");
    if (gt) { gotoTracker(gt.dataset.gotoTracker); return; }
    const seg = e.target.closest(".segments button");
    if (seg) { go(state.region, seg.dataset.view, null); return; }
    const reg = e.target.closest(".regions button");
    if (reg) { go(reg.dataset.region, state.view, null); return; }
    const res = e.target.closest("[data-result]");
    if (res) {
      const [kind, id] = res.dataset.result.split(":");
      closeSheets();
      if (kind === "t") gotoTracker(id);
      else {
        const u = state.feed.updates.find((x) => x.id === id);
        if (u) go(u.region, "latest", id, true);
      }
      return;
    }
    if (e.target.closest("[data-close]") || e.target.classList.contains("sheet")) closeSheets();
  });

  /* ---------- sheets ---------- */
  function closeSheets() { document.querySelectorAll(".sheet").forEach((s) => (s.hidden = true)); }

  $("#btn-search").addEventListener("click", () => {
    $("#search-sheet").hidden = false;
    const inp = $("#search-input");
    inp.value = ""; $("#search-results").innerHTML = '<p class="empty">Type to search updates and tracked files across all four regions.</p>';
    setTimeout(() => inp.focus(), 50);
  });
  $("#search-input").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const out = $("#search-results");
    if (q.length < 2) { out.innerHTML = '<p class="empty">Type at least two letters.</p>'; return; }
    const hit = (o) => JSON.stringify(o).toLowerCase().includes(q);
    const ts = state.feed.trackers.filter(hit).map((t) => ({ k: "t", id: t.id, r: t.region, meta: "Tracked file · " + t.stage_label, title: t.name }));
    const us = state.feed.updates.filter(hit).map((u) => ({ k: "u", id: u.id, r: u.region, meta: fmtDate(u.date) + " · " + u.authority, title: u.title }));
    const all = ts.concat(us);
    out.innerHTML = all.length ? all.map((x) =>
      '<div class="result"><button data-result="' + x.k + ":" + esc(x.id) + '"><div class="r-meta">' + esc(regionObj(x.r).short || x.r) + " · " + esc(x.meta) + '</div><div class="r-title">' + esc(x.title) + "</div></button></div>").join("")
      : '<p class="empty">No matches.</p>';
  });

  let deferredInstall = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; });

  $("#btn-info").addEventListener("click", () => {
    const f = state.feed;
    const byRegion = REGIONS.map((r) => {
      const srcs = (f.sources || []).filter((s) => s.region === r);
      return "<h3>" + esc(regionObj(r).name) + '</h3><ul class="src-list">' + srcs.map((s) =>
        '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + ' ↗</a><span class="src-status ' +
        (s.status === "checked" ? "ok" : "bad") + '">' + (s.status === "checked" ? "Checked" : "Not reached") + "</span></li>").join("") + "</ul>";
    }).join("");
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    $("#info-body").innerHTML =
      "<h3>What this is</h3><p>A personal tracker of financial regulatory developments. Each update is a plain-English, neutral summary of a public document: what it says, who it applies to, and the key dates. Every item links to its source.</p>" +
      "<p>" + esc(f.coverage_note || "") + " Last updated " + fmtDate((f.generated_at || "").slice(0, 10)) + ".</p>" +
      (standalone ? "" : (deferredInstall ? '<button class="install-btn" id="do-install">Install on this device</button>' :
        "<p><b>Install:</b> in Chrome, open the ⋮ menu and choose <i>Install app</i> or <i>Add to Home screen</i>.</p>")) +
      '<h3>Source labels</h3><div class="legend">' +
      '<p><span class="q q-primary">Primary source</span> — the regulator, legislature or standard setter itself.</p>' +
      '<p><span class="q q-secondary">Secondary</span> — reputable law-firm or specialist analysis, used where the primary page wasn\'t directly retrievable.</p>' +
      '<p><span class="q q-lower">Lower-reputability</span> — trade or crypto press. Treat as a pointer and verify.</p></div>' +
      "<h3>Sources monitored</h3>" + byRegion +
      '<p class="footnote">Summaries are generated with AI assistance and may contain errors. Not legal advice.</p>';
    $("#info-sheet").hidden = false;
    const ib = $("#do-install");
    if (ib) ib.addEventListener("click", async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; closeSheets(); });
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") commitSeen(); });
  window.addEventListener("pagehide", commitSeen);

  /* ---------- data loading ---------- */
  async function load() {
    try {
      const res = await fetch("feed.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.fromCache = res.headers.get("x-rw-cache") === "1";
      state.feed = await res.json();
    } catch (err) {
      $("#content").innerHTML = '<p class="empty">Couldn\'t load the feed. Connect to the internet once so the app can save a copy for offline use.</p>';
      $("#meta").textContent = "";
      return;
    }
    const banner = $("#offline-banner");
    if (state.fromCache || !navigator.onLine) { banner.textContent = "Offline — showing the last saved update"; banner.hidden = false; }

    const m = location.hash.match(/^#\/(eu|uk|us|global)\/(latest|tracker|ahead)(?:\/(.+))?$/);
    const last = store.get("last", null);
    if (m) go(m[1], m[2], m[3] || null, !!m[3]);
    else if (last && REGIONS.includes(last.region)) go(last.region, last.view || "latest", null);
    else go("eu", "latest", null);
  }

  window.addEventListener("online", () => { $("#offline-banner").hidden = true; });
  window.addEventListener("offline", () => { const b = $("#offline-banner"); b.textContent = "Offline — showing the last saved update"; b.hidden = false; });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  load();
})();
