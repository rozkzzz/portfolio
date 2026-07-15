import { ENABLED, firebaseConfig } from "./firebase-config.js";
import { sampleEntries, sampleProfile } from "./sample.js";

const FIRE_VER = "10.12.2";
let entries = [];
let profile = sampleProfile;
let activeCat = "all";
let query = "";
let activeView = "table";
let sortKey = "date";
let sortDir = -1; // 1 = ascending (น้อย→มาก), -1 = descending (มาก→น้อย)

// ---------- data loading ----------
async function loadData() {
  if (!ENABLED) {
    entries = sampleEntries.slice();
    profile = sampleProfile;
    setSource("local sample");
    return;
  }
  try {
    const { initializeApp } = await import(
      `https://www.gstatic.com/firebasejs/${FIRE_VER}/firebase-app.js`
    );
    const { getFirestore, collection, getDocs, doc, getDoc, query: fq, orderBy } =
      await import(`https://www.gstatic.com/firebasejs/${FIRE_VER}/firebase-firestore.js`);

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const snap = await getDocs(fq(collection(db, "entries"), orderBy("date", "desc")));
    entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const pSnap = await getDoc(doc(db, "profile", "main"));
    if (pSnap.exists()) profile = { ...sampleProfile, ...pSnap.data() };

    setSource("firestore");
  } catch (err) {
    console.warn("Firestore load failed, using local sample:", err);
    entries = sampleEntries.slice();
    profile = sampleProfile;
    setSource("local (fallback)");
  }
}

function setSource(s) {
  const el = document.getElementById("statSource");
  if (el) el.textContent = s;
}

// ---------- rendering ----------
const riskLabel = { high: "0DAY", med: "MEDIUM", low: "PATCHED" };

// ---------- date helpers (for timeline ranges) ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMon(d) {
  if (!d) return "";
  const p = String(d).split("-");
  if (!p[0]) return "";
  const mi = Number(p[1]) - 1;
  return `${MONTHS[mi] || ""} ${p[0]}`.trim();
}
function durationText(a, b) {
  if (!a || !b) return "";
  const da = new Date(a), db = new Date(b);
  if (isNaN(da) || isNaN(db)) return "";
  const m = (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
  if (m < 1) return "";
  const y = Math.floor(m / 12), mm = m % 12;
  const parts = [];
  if (y) parts.push(`${y} yr${y > 1 ? "s" : ""}`);
  if (mm) parts.push(`${mm} month${mm > 1 ? "s" : ""}`);
  return parts.join(" ");
}
function dateRange(e) {
  const start = fmtMon(e.date);
  if (!start) return "";
  if (e.present) return `${start} to Present`;
  if (e.endDate) {
    const end = fmtMon(e.endDate);
    const dur = durationText(e.date, e.endDate);
    return `${start} to ${end}${dur ? ` (${dur})` : ""}`;
  }
  return start;
}

function filtered() {
  return entries.filter((e) => {
    const catOk = activeCat === "all" || e.category === activeCat;
    if (!catOk) return false;
    if (!query) return true;
    const hay = `${e.title} ${e.description} ${(e.stack || []).join(" ")} ${e.category}`.toLowerCase();
    return hay.includes(query);
  });
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// render a stack array as small tags
function stackTags(stack) {
  if (!stack || !stack.length) return "";
  return stack.map((s) => `<span class="tag">${esc(s)}</span>`).join("");
}

const RISK_RANK = { high: 3, med: 2, low: 1 };
function cmp(a, b, key) {
  switch (key) {
    case "views": return Number(a.views || 0) - Number(b.views || 0);
    case "risk": return (RISK_RANK[(a.risk || "low").toLowerCase()] || 0) - (RISK_RANK[(b.risk || "low").toLowerCase()] || 0);
    case "title": return String(a.title || "").localeCompare(String(b.title || ""));
    case "category": return String(a.category || "").localeCompare(String(b.category || ""));
    default: return String(a.date || "").localeCompare(String(b.date || "")); // date
  }
}
function applySort(list) {
  const arr = list.slice();
  arr.sort((a, b) => sortDir * cmp(a, b, sortKey) || String(a.date || "").localeCompare(String(b.date || "")) * -1);
  return arr;
}

// clicking a header: same column -> flip direction; new column -> sensible default
function setSort(key) {
  if (sortKey === key) {
    sortDir = -sortDir;
  } else {
    sortKey = key;
    sortDir = (key === "title" || key === "category") ? 1 : -1;
  }
  updateSortIndicators();
  renderView();
}

function updateSortIndicators() {
  document.querySelectorAll("#dbHead .sortable").forEach((th) => {
    const active = th.dataset.sort === sortKey;
    th.classList.toggle("active", active);
    const arrow = th.querySelector(".sarrow");
    if (arrow) arrow.textContent = active ? (sortDir === 1 ? " ▲" : " ▼") : "";
  });
}

function renderView() {
  const list = applySort(filtered());
  document.getElementById("count").textContent = `${list.length} records`;
  const tableView = document.getElementById("tableView");
  const timelineView = document.getElementById("timelineView");
  const title = document.getElementById("panelTitle");
  if (activeView === "timeline") {
    tableView.hidden = true;
    timelineView.hidden = false;
    title.textContent = "// CAREER TIMELINE";
    renderTimeline(list);
  } else {
    timelineView.hidden = true;
    tableView.hidden = false;
    title.textContent = "// LATEST ENTRIES";
    renderRows(list);
  }
}

function renderRows(list) {
  const rows = document.getElementById("rows");

  if (!list.length) {
    rows.innerHTML = `<tr><td colspan="6" class="empty">// no entries found — try another filter</td></tr>`;
    return;
  }

  rows.innerHTML = list
    .map((e, i) => {
      const risk = (e.risk || "low").toLowerCase();
      const stackArr = (e.stack || []).slice(0, 4);
      const extra = (e.stack || []).length - stackArr.length;
      const stack = stackTags(stackArr) + (extra > 0 ? `<span class="stack-more">+${extra}</span>` : "");
      return `<tr data-idx="${i}">
        <td class="c-date">${esc(e.date || "")}</td>
        <td class="c-title">
          <div class="entry-title">${esc(e.title || "untitled")}</div>
          <div class="entry-desc">${esc(e.description || "")}</div>
        </td>
        <td class="c-cat"><span class="tag">${esc(e.category || "misc")}</span></td>
        <td class="c-stack"><div class="stack-tags">${stack || "&mdash;"}</div></td>
        <td class="c-risk"><span class="risk ${risk}">${riskLabel[risk] || "PATCHED"}</span></td>
        <td class="c-num num">${Number(e.views || 0).toLocaleString()}</td>
      </tr>`;
    })
    .join("");

  rows.querySelectorAll("tr[data-idx]").forEach((tr) => {
    tr.addEventListener("click", () => openModal(list[Number(tr.dataset.idx)]));
  });
}

function renderTimeline(list) {
  const el = document.getElementById("timelineView");

  if (!list.length) {
    el.innerHTML = `<div class="empty">// no entries found — try another filter</div>`;
    return;
  }

  // alternating (zigzag) timeline — newest first (list is already date-desc)
  const flat = []; // keep a flat index so clicks map back to the entry
  el.innerHTML = list
    .map((e) => {
      const idx = flat.push(e) - 1;
      const range = dateRange(e);
      return `<div class="tl-item" data-idx="${idx}">
        <span class="tl-node" aria-hidden="true"></span>
        <div class="tl-content">
          ${range ? `<div class="tl-range">${esc(range)}</div>` : ""}
          <div class="tl-title">${esc(e.title || "untitled")}</div>
          ${e.org ? `<div class="tl-org">${esc(e.org)}</div>` : ""}
          <div class="tl-desc">${esc(e.description || "")}</div>
          ${e.stack && e.stack.length ? `<div class="tl-stack">${stackTags(e.stack)}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");

  el.querySelectorAll(".tl-item").forEach((it) => {
    it.addEventListener("click", () => openModal(flat[Number(it.dataset.idx)]));
  });
}

function renderProfile() {
  const av = document.getElementById("avatar");
  if (profile.photo) {
    av.innerHTML = `<img src="${esc(profile.photo)}" alt="${esc(profile.name || "profile")}"
      onerror="this.parentElement.textContent='[ ! ]'">`;
  } else {
    av.textContent = "[ ! ]";
  }
  document.getElementById("ownerName").textContent = profile.name || "anonymous";
  document.getElementById("ownerRole").textContent = profile.role || "";
  document.getElementById("ownerBio").textContent = profile.bio || "";
  const linksEl = document.getElementById("ownerLinks");
  linksEl.innerHTML = (profile.links || [])
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
    .join("");
  renderSkills();
}

function skillChip(s) {
  const hasLevel = s.level != null && s.level !== "";
  const lvl = hasLevel ? Math.max(0, Math.min(100, Number(s.level) || 0)) : null;
  const fill = lvl != null ? `<i class="chip-fill" style="width:${lvl}%"></i>` : "";
  const title = lvl != null ? ` title="${esc(s.name)} — ${lvl}%"` : "";
  return `<span class="skill-chip"${title}>${fill}<b>${esc(s.name || "")}</b></span>`;
}

function renderSkills() {
  const el = document.getElementById("skillList");
  const raw = profile.skills || [];
  if (!raw.length) {
    el.innerHTML = `<div class="skill-empty">// add skills from the admin panel</div>`;
    return;
  }
  // normalize: plain string -> { name }
  const skills = raw.map((s) => (typeof s === "string" ? { name: s } : s));

  // group by category, preserving first-seen order
  const groups = new Map();
  for (const s of skills) {
    const cat = s.category || "other";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(s);
  }

  el.innerHTML = [...groups.entries()]
    .map(
      ([cat, items]) => `<div class="skill-group">
        <div class="skill-group-title">${esc(cat)} <span>(${items.length})</span></div>
        <div class="chips">${items.map(skillChip).join("")}</div>
      </div>`
    )
    .join("");
}

function renderStats() {
  const total = entries.length;
  const projects = entries.filter((e) => e.category === "project").length;
  const views = entries.reduce((a, e) => a + Number(e.views || 0), 0);
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statProject").textContent = projects;
  document.getElementById("statViews").textContent = views.toLocaleString();
}

// ---------- modal ----------
function openModal(e) {
  const body = document.getElementById("modalBody");
  const risk = (e.risk || "low").toLowerCase();
  const stack = (e.stack || [])
    .map((s) => `<span class="tag">${esc(s)}</span>`)
    .join(" ");
  const range = dateRange(e) || e.date || "";
  body.innerHTML = `
    <h2>${esc(e.title || "untitled")}</h2>
    ${e.org ? `<div class="m-org">${esc(e.org)}</div>` : ""}
    <div class="m-meta">
      <span>[ ${esc(range)} ]</span>
      <span>category: ${esc(e.category || "misc")}</span>
      <span class="risk ${risk}">${riskLabel[risk] || "PATCHED"}</span>
      <span>${Number(e.views || 0).toLocaleString()} views</span>
    </div>
    <div class="m-body">${esc(e.body || e.description || "")}</div>
    ${stack ? `<div class="m-stack">${stack}</div>` : ""}
    ${e.link ? `<div class="m-link"><a href="${esc(e.link)}" target="_blank" rel="noopener">&gt; open link</a></div>` : ""}
  `;
  document.getElementById("modal").hidden = false;
}

function closeModal() {
  document.getElementById("modal").hidden = true;
}

// ---------- events ----------
function wireEvents() {
  document.getElementById("tabs").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    activeCat = btn.dataset.cat;
    renderView();
  });

  document.getElementById("viewtoggle").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".vbtn");
    if (!btn) return;
    document.querySelectorAll(".vbtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeView = btn.dataset.view;
    renderView();
  });

  document.getElementById("dbHead").addEventListener("click", (ev) => {
    const th = ev.target.closest(".sortable");
    if (!th) return;
    setSort(th.dataset.sort);
  });

  document.getElementById("search").addEventListener("input", (ev) => {
    query = ev.target.value.trim().toLowerCase();
    renderView();
  });
  document.getElementById("searchform").addEventListener("submit", (ev) => ev.preventDefault());

  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", (ev) => {
    if (ev.target.id === "modal") closeModal();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeModal();
  });
}

function startClock() {
  const el = document.getElementById("clock");
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString("en-GB");
  };
  tick();
  setInterval(tick, 1000);
  document.getElementById("year").textContent = new Date().getFullYear();
}

// ---------- boot ----------
(async function main() {
  wireEvents();
  startClock();
  await loadData();
  renderProfile();
  renderStats();
  updateSortIndicators();
  renderView();
})();
