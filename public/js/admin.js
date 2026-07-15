// ============================================================
//  ADMIN PANEL  —  manage entries / skills / profile from the browser
//  Writes to Firestore, guarded by Firebase Email/Password auth.
//  See firestore.rules: writes require a signed-in owner.
// ============================================================
import { firebaseConfig } from "./firebase-config.js";

const FIRE_VER = "10.12.2";

// ---------- firebase (lazy modular imports) ----------
let db, auth, fs, authMod;
async function initFirebase() {
  const { initializeApp } = await import(
    `https://www.gstatic.com/firebasejs/${FIRE_VER}/firebase-app.js`
  );
  fs = await import(`https://www.gstatic.com/firebasejs/${FIRE_VER}/firebase-firestore.js`);
  authMod = await import(`https://www.gstatic.com/firebasejs/${FIRE_VER}/firebase-auth.js`);

  const app = initializeApp(firebaseConfig);
  db = fs.getFirestore(app);
  auth = authMod.getAuth(app);
}

// ---------- tiny helpers ----------
const $ = (id) => document.getElementById(id);
const show = (el, on = true) => { el.hidden = !on; };

function flash(el, msg, ok = true) {
  el.textContent = msg;
  el.style.color = ok ? "var(--green)" : "var(--red)";
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 3500);
}

// ---------- state ----------
let entries = [];
let profile = null; // { name, role, bio, photo, links[], skills[] }

// ============================================================
//  AUTH
// ============================================================
function wireAuth() {
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("loginError");
    show(err, false);
    try {
      await authMod.signInWithEmailAndPassword(
        auth, $("loginEmail").value.trim(), $("loginPass").value
      );
    } catch (ex) {
      err.textContent = friendlyAuthError(ex);
      show(err, true);
    }
  });

  $("logoutBtn").addEventListener("click", () => authMod.signOut(auth));

  authMod.onAuthStateChanged(auth, async (user) => {
    if (user) {
      show($("loginScreen"), false);
      show($("dashboard"), true);
      show($("whoami"), true);
      show($("logoutBtn"), true);
      $("whoamiEmail").textContent = user.email || "owner";
      await loadAll();
    } else {
      show($("dashboard"), false);
      show($("whoami"), false);
      show($("logoutBtn"), false);
      show($("loginScreen"), true);
    }
  });
}

function friendlyAuthError(ex) {
  const code = (ex && ex.code) || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "// invalid email or password";
  if (code.includes("too-many-requests")) return "// too many attempts — try again later";
  if (code.includes("operation-not-allowed"))
    return "// Email/Password sign-in is not enabled in Firebase Console";
  return "// " + (ex.message || "sign-in failed");
}

// ============================================================
//  DATA LOADING
// ============================================================
async function loadAll() {
  await Promise.all([loadEntries(), loadProfile()]);
}

async function loadEntries() {
  const snap = await fs.getDocs(
    fs.query(fs.collection(db, "entries"), fs.orderBy("date", "desc"))
  );
  entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderEntries();
}

async function loadProfile() {
  const ref = fs.doc(db, "profile", "main");
  const snap = await fs.getDoc(ref);
  profile = snap.exists() ? snap.data() : { name: "", role: "", bio: "", photo: "", links: [], skills: [] };
  profile.links = profile.links || [];
  profile.skills = (profile.skills || []).map((s) => (typeof s === "string" ? { name: s } : s));
  renderProfile();
  renderSkillRows();
}

// ============================================================
//  ENTRIES
// ============================================================
function renderEntries() {
  $("entriesCount").textContent = entries.length;
  const list = $("entriesList");
  if (!entries.length) {
    list.innerHTML = `<div class="a-empty">// no entries yet — click "+ new entry"</div>`;
    return;
  }
  const riskLabel = { high: "0DAY", med: "MEDIUM", low: "PATCHED" };
  list.innerHTML = entries
    .map((e, i) => {
      const risk = (e.risk || "low").toLowerCase();
      return `<div class="a-row" data-idx="${i}">
        <div class="r-date">${escapeHtml(e.date || "")}</div>
        <div>
          <div class="r-title">${escapeHtml(e.title || "untitled")}</div>
          <div class="r-desc">${escapeHtml(e.description || "")}</div>
        </div>
        <span class="tag">${escapeHtml(e.category || "misc")}</span>
        <span class="risk ${risk}">${riskLabel[risk] || "PATCHED"}</span>
      </div>`;
    })
    .join("");
  list.querySelectorAll(".a-row").forEach((row) => {
    row.addEventListener("click", () => openEntry(entries[Number(row.dataset.idx)]));
  });
}

function openEntry(entry) {
  const isNew = !entry;
  $("entryModalTitle").textContent = isNew ? "// NEW ENTRY" : "// EDIT ENTRY";
  $("ef-id").value = entry ? entry.id : "";
  $("ef-date").value = entry ? (entry.date || "") : new Date().toISOString().slice(0, 10);
  $("ef-category").value = entry ? (entry.category || "project") : "project";
  $("ef-title").value = entry ? (entry.title || "") : "";
  $("ef-description").value = entry ? (entry.description || "") : "";
  $("ef-risk").value = entry ? (entry.risk || "low") : "low";
  $("ef-views").value = entry ? Number(entry.views || 0) : 0;
  $("ef-stack").value = entry ? (entry.stack || []).join(", ") : "";
  $("ef-body").value = entry ? (entry.body || "") : "";
  $("ef-link").value = entry ? (entry.link || "") : "";
  show($("deleteEntryBtn"), !isNew);
  show($("entryError"), false);
  show($("entryModal"), true);
}

function closeEntry() { show($("entryModal"), false); }

async function saveEntry(e) {
  e.preventDefault();
  const err = $("entryError");
  show(err, false);

  const data = {
    date: $("ef-date").value,
    category: $("ef-category").value,
    title: $("ef-title").value.trim(),
    description: $("ef-description").value.trim(),
    risk: $("ef-risk").value,
    views: Number($("ef-views").value) || 0,
    stack: $("ef-stack").value.split(",").map((s) => s.trim()).filter(Boolean),
    body: $("ef-body").value,
    link: $("ef-link").value.trim(),
  };

  if (!data.title || !data.date) {
    err.textContent = "// title and date are required";
    show(err, true);
    return;
  }

  const id = $("ef-id").value;
  try {
    if (id) {
      await fs.setDoc(fs.doc(db, "entries", id), data);
    } else {
      await fs.addDoc(fs.collection(db, "entries"), data);
    }
    closeEntry();
    await loadEntries();
  } catch (ex) {
    err.textContent = "// save failed: " + (ex.message || ex);
    show(err, true);
  }
}

async function deleteEntry() {
  const id = $("ef-id").value;
  if (!id) return;
  if (!confirm("Delete this entry? This cannot be undone.")) return;
  try {
    await fs.deleteDoc(fs.doc(db, "entries", id));
    closeEntry();
    await loadEntries();
  } catch (ex) {
    const err = $("entryError");
    err.textContent = "// delete failed: " + (ex.message || ex);
    show(err, true);
  }
}

// ============================================================
//  SKILLS  (stored as profile.skills[])
// ============================================================
function renderSkillRows() {
  const wrap = $("skillsRows");
  const skills = profile.skills;
  $("skillsCount").textContent = skills.length;

  const head = `<div class="a-skillrow">
    <span class="a-skill-head">name</span>
    <span class="a-skill-head">category</span>
    <span class="a-skill-head">level</span>
    <span></span>
  </div>`;

  wrap.innerHTML = head + skills
    .map((s, i) => `<div class="a-skillrow" data-idx="${i}">
      <input class="sk-name" value="${escapeAttr(s.name || "")}" placeholder="Docker" />
      <input class="sk-cat" value="${escapeAttr(s.category || "")}" placeholder="Tools" />
      <input class="sk-level" type="number" min="0" max="100" value="${s.level != null ? s.level : ""}" placeholder="0-100" />
      <button type="button" class="x" title="remove">[x]</button>
    </div>`)
    .join("");

  wrap.querySelectorAll(".a-skillrow[data-idx] .x").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectSkills();
      profile.skills.splice(Number(btn.closest(".a-skillrow").dataset.idx), 1);
      renderSkillRows();
    });
  });
}

// read current inputs back into profile.skills (keeps edits when re-rendering)
function collectSkills() {
  const rows = $("skillsRows").querySelectorAll(".a-skillrow[data-idx]");
  profile.skills = [...rows].map((r) => {
    const name = r.querySelector(".sk-name").value.trim();
    const category = r.querySelector(".sk-cat").value.trim();
    const levelRaw = r.querySelector(".sk-level").value.trim();
    const s = { name };
    if (category) s.category = category;
    if (levelRaw !== "") s.level = Math.max(0, Math.min(100, Number(levelRaw) || 0));
    return s;
  });
}

async function saveSkills() {
  collectSkills();
  const skills = profile.skills.filter((s) => s.name); // drop blank rows
  try {
    await fs.setDoc(fs.doc(db, "profile", "main"), { skills }, { merge: true });
    profile.skills = skills;
    renderSkillRows();
    flash($("skillsStatus"), "// saved ✓", true);
  } catch (ex) {
    flash($("skillsStatus"), "// save failed: " + (ex.message || ex), false);
  }
}

// ============================================================
//  PROFILE
// ============================================================
function renderProfile() {
  $("pf-name").value = profile.name || "";
  $("pf-role").value = profile.role || "";
  $("pf-bio").value = profile.bio || "";
  $("pf-photo").value = profile.photo || "";
  renderLinkRows();
}

function renderLinkRows() {
  const wrap = $("pf-links");
  wrap.innerHTML = (profile.links || [])
    .map((l, i) => `<div class="a-linkrow" data-idx="${i}">
      <input class="lk-label" value="${escapeAttr(l.label || "")}" placeholder="github" />
      <input class="lk-url" value="${escapeAttr(l.url || "")}" placeholder="https://…" />
      <button type="button" class="x" title="remove">[x]</button>
    </div>`)
    .join("");
  wrap.querySelectorAll(".a-linkrow .x").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectLinks();
      profile.links.splice(Number(btn.closest(".a-linkrow").dataset.idx), 1);
      renderLinkRows();
    });
  });
}

function collectLinks() {
  const rows = $("pf-links").querySelectorAll(".a-linkrow");
  profile.links = [...rows].map((r) => ({
    label: r.querySelector(".lk-label").value.trim(),
    url: r.querySelector(".lk-url").value.trim(),
  }));
}

async function saveProfile(e) {
  e.preventDefault();
  collectLinks();
  const data = {
    name: $("pf-name").value.trim(),
    role: $("pf-role").value.trim(),
    bio: $("pf-bio").value.trim(),
    photo: $("pf-photo").value.trim(),
    links: profile.links.filter((l) => l.label || l.url),
  };
  try {
    await fs.setDoc(fs.doc(db, "profile", "main"), data, { merge: true });
    Object.assign(profile, data);
    flash($("profileStatus"), "// saved ✓", true);
  } catch (ex) {
    flash($("profileStatus"), "// save failed: " + (ex.message || ex), false);
  }
}

// ============================================================
//  ESCAPING
// ============================================================
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ============================================================
//  UI WIRING
// ============================================================
function wireUI() {
  // tab switching
  $("adminTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".a-tab");
    if (!btn) return;
    document.querySelectorAll(".a-tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    const panel = btn.dataset.panel;
    ["entries", "skills", "profile"].forEach((p) => show($("panel-" + p), p === panel));
  });

  // entries
  $("newEntryBtn").addEventListener("click", () => openEntry(null));
  $("entryForm").addEventListener("submit", saveEntry);
  $("entryModalClose").addEventListener("click", closeEntry);
  $("entryCancel").addEventListener("click", closeEntry);
  $("deleteEntryBtn").addEventListener("click", deleteEntry);
  $("entryModal").addEventListener("click", (e) => { if (e.target.id === "entryModal") closeEntry(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEntry(); });

  // skills
  $("newSkillBtn").addEventListener("click", () => {
    collectSkills();
    profile.skills.push({ name: "" });
    renderSkillRows();
  });
  $("saveSkillsBtn").addEventListener("click", saveSkills);

  // profile
  $("addLinkBtn").addEventListener("click", () => {
    collectLinks();
    profile.links.push({ label: "", url: "" });
    renderLinkRows();
  });
  $("profileForm").addEventListener("submit", saveProfile);
}

// ============================================================
//  BOOT
// ============================================================
(async function main() {
  try {
    await initFirebase();
  } catch (ex) {
    document.body.innerHTML =
      `<div class="wrap" style="padding:40px;color:var(--red)">Failed to load Firebase: ${escapeHtml(ex.message || ex)}</div>`;
    return;
  }
  wireUI();
  wireAuth();
  show($("loginScreen"), true); // shown until auth state resolves
})();
