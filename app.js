// Daily Fix — minimal Duolingo-like PWA
// Storage key
const STORE_KEY = "dailyfix:v1";

const $ = (sel) => document.querySelector(sel);

const screens = {
  home: $("#screenHome"),
  today: $("#screenToday"),
  history: $("#screenHistory"),
  settings: $("#screenSettings"),
};

const state = {
  challenges: [],
  today: { dayKey: "", challenge: null, done: false },
  store: null,
};

function isoDayKeyLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDayKey(dayKey) {
  // dayKey is YYYY-MM-DD; interpret as local midnight
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayDiff(aKey, bKey) {
  // b - a in whole days
  const a = parseDayKey(aKey);
  const b = parseDayKey(bKey);
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function normalizeCode(s) {
  return (s || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function defaultStore() {
  return {
    settings: {
      graceEnabled: false
    },
    streak: {
      current: 0,
      best: 0,
      lastCompletedDayKey: null,
      graceAvailable: true,
      graceUsedForDayKey: null
    },
    completions: {} // dayKey -> {dayKey, challengeId, completedAt, userAnswer}
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw);
    // light migration/guard
    return {
      ...defaultStore(),
      ...parsed,
      settings: { ...defaultStore().settings, ...(parsed.settings || {}) },
      streak: { ...defaultStore().streak, ...(parsed.streak || {}) },
      completions: parsed.completions || {}
    };
  } catch {
    return defaultStore();
  }
}

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.store));
}

function hashString(str) {
  // tiny deterministic hash
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function pickDailyChallenge(dayKey) {
  const h = hashString("dailyfix|" + dayKey);
  const idx = h % state.challenges.length;
  return state.challenges[idx];
}

function computeToday() {
  const dayKey = isoDayKeyLocal();
  const completion = state.store.completions[dayKey] || null;

  const challenge = pickDailyChallenge(dayKey);
  state.today = {
    dayKey,
    challenge,
    done: !!completion
  };
}

function updateTopUI() {
  $("#streakNum").textContent = String(state.store.streak.current || 0);
  $("#bestNum").textContent = String(state.store.streak.best || 0);
  $("#doneNum").textContent = String(Object.keys(state.store.completions || {}).length);

  // Home today card
  $("#todayTitle").textContent = state.today.challenge ? state.today.challenge.title : "—";
  $("#todayMeta").textContent = state.today.challenge ? state.today.challenge.prompt : "—";
  $("#todayPill").textContent = state.today.done ? "Done ✅" : "Not done";
  $("#todayPill").style.borderColor = state.today.done ? "rgba(74,222,128,.35)" : "rgba(255,255,255,.12)";
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.style.display = (k === name) ? "" : "none";
  });

  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.route === "#" + name);
  });
}

function route() {
  const hash = (location.hash || "#home").replace("#", "");
  const name = ["home", "today", "history", "settings"].includes(hash) ? hash : "home";
  if (name === "today") renderToday();
  if (name === "history") renderHistory();
  if (name === "settings") renderSettings();
  showScreen(name);
}

function renderToday() {
  const c = state.today.challenge;
  if (!c) return;

  $("#challengeTitle").textContent = c.title;
  $("#challengePrompt").textContent = c.prompt;
  $("#challengeLang").textContent = c.language;
  $("#brokenCode").textContent = c.broken;

  const completion = state.store.completions[state.today.dayKey] || null;
  const editor = $("#editor");

  if (completion) {
    editor.value = completion.userAnswer || "";
    setResult(`Completed for ${state.today.dayKey} ✅`, true);
  } else {
    // keep what user was typing today in sessionStorage (nice UX)
    const draftKey = "draft:" + state.today.dayKey;
    editor.value = sessionStorage.getItem(draftKey) || "";
    clearResult();
  }

  editor.oninput = () => {
    const draftKey = "draft:" + state.today.dayKey;
    sessionStorage.setItem(draftKey, editor.value);
  };

  $("#hintBox").style.display = "none";
  $("#solutionBox").style.display = "none";
}

function renderHistory() {
  const keys = Object.keys(state.store.completions || {}).sort().reverse();
  $("#historyMeta").textContent =
    `Current streak: ${state.store.streak.current} • Best: ${state.store.streak.best} • Done: ${keys.length}`;

  const list = $("#historyList");
  list.innerHTML = "";

  if (keys.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No completions yet. Do Today!";
    list.appendChild(empty);
    return;
  }

  for (const dayKey of keys) {
    const item = state.store.completions[dayKey];
    const ch = state.challenges.find(x => x.id === item.challengeId);
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <strong>${dayKey}</strong>
        <div class="tiny muted">${escapeHtml(ch ? ch.title : item.challengeId)}</div>
      </div>
      <div class="badge">✅</div>
    `;
    list.appendChild(row);
  }
}

function renderSettings() {
  $("#toggleGrace").checked = !!state.store.settings.graceEnabled;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[c]));
}

function clearResult() {
  $("#resultBox").style.display = "none";
  $("#resultBox").textContent = "";
  $("#resultBox").style.borderColor = "var(--border)";
}

function setResult(msg, ok) {
  const box = $("#resultBox");
  box.style.display = "";
  box.textContent = msg;
  box.style.borderColor = ok ? "rgba(74,222,128,.35)" : "rgba(251,113,133,.35)";
}

function maybeOfferGrace(nextDayKey) {
  const st = state.store.streak;
  if (!state.store.settings.graceEnabled) return false;
  if (!st.graceAvailable) return false;
  if (st.graceUsedForDayKey) return false;

  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "Use grace (save streak once)";
  btn.onclick = () => {
    st.graceAvailable = false;
    st.graceUsedForDayKey = nextDayKey;
    saveStore();
    computeToday();
    updateTopUI();
    setResult("Grace used — streak preserved (for now). ✅", true);
    btn.remove();
  };

  const resBox = $("#resultBox");
  resBox.style.display = "";
  resBox.textContent = "Missed a day. You can use grace once to preserve your streak.";
  resBox.style.borderColor = "rgba(96,165,250,.35)";
  resBox.appendChild(document.createElement("div")).style.height = "10px";
  resBox.appendChild(btn);
  return true;
}

function applyStreakOnComplete(todayKey) {
  const st = state.store.streak;
  const last = st.lastCompletedDayKey;

  if (!last) {
    st.current = 1;
  } else {
    const diff = dayDiff(last, todayKey);
    if (diff === 0) {
      // already completed today, no change
    } else if (diff === 1) {
      st.current = (st.current || 0) + 1;
    } else {
      // missed days: reset unless grace has been used for this "gap"
      st.current = 1;
    }
  }

  st.lastCompletedDayKey = todayKey;
  st.best = Math.max(st.best || 0, st.current || 0);

  // If grace was used to get here, clear the marker but keep grace unavailable
  if (st.graceUsedForDayKey === todayKey) {
    st.graceUsedForDayKey = null;
  }
}

function checkAnswer() {
  const c = state.today.challenge;
  const todayKey = state.today.dayKey;

  const editorVal = $("#editor").value;
  const got = normalizeCode(editorVal);
  const exp = normalizeCode(c.expected);

  if (got.length === 0) {
    setResult("Paste your fixed code first 👀", false);
    return;
  }

  const already = !!state.store.completions[todayKey];
  if (got === exp) {
    if (!already) {
      state.store.completions[todayKey] = {
        dayKey: todayKey,
        challengeId: c.id,
        completedAt: new Date().toISOString(),
        userAnswer: editorVal
      };
      applyStreakOnComplete(todayKey);
      saveStore();
      computeToday();
      updateTopUI();
    }
    setResult(`Correct! Completed for ${todayKey} ✅`, true);
  } else {
    setResult("Not quite — try again. (Tip: whitespace matters a little in this MVP.)", false);
  }
}

function showHint(where = "today") {
  const c = state.today.challenge;
  const hint = (c.hints && c.hints.length) ? c.hints[0] : "No hint for this one.";
  if (where === "home") {
    const el = $("#homeHint");
    el.style.display = "";
    el.textContent = "Hint: " + hint;
    return;
  }
  const box = $("#hintBox");
  box.style.display = "";
  box.textContent = "Hint: " + hint;
}

function showSolution() {
  const c = state.today.challenge;
  $("#solutionPre").textContent = c.expected;
  $("#solutionBox").style.display = "";
}

function copyBrokenToEditor() {
  $("#editor").value = state.today.challenge.broken;
  $("#editor").dispatchEvent(new Event("input"));
}

function initNav() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.route;
    });
  });

  $("#btnGoToday").onclick = () => (location.hash = "#today");
  $("#btnBackHome").onclick = () => (location.hash = "#home");
  $("#btnBackHome2").onclick = () => (location.hash = "#home");
  $("#btnBackHome3").onclick = () => (location.hash = "#home");
  $("#btnGoHistory").onclick = () => (location.hash = "#history");
  $("#btnGoSettings").onclick = () => (location.hash = "#settings");

  $("#btnHint").onclick = () => showHint("today");
  $("#btnHintHome").onclick = () => showHint("home");
  $("#btnShowSolution").onclick = () => showSolution();
  $("#btnCheck").onclick = () => checkAnswer();
  $("#btnCopyBroken").onclick = () => copyBrokenToEditor();

  $("#toggleGrace").onchange = (e) => {
    state.store.settings.graceEnabled = !!e.target.checked;
    saveStore();
  };

  $("#btnExport").onclick = () => exportData();
  $("#fileImport").onchange = (e) => importData(e);
  $("#btnReset").onclick = () => resetData();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state.store, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "daily-fix-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      // basic sanity
      if (!parsed || typeof parsed !== "object") throw new Error("bad");
      state.store = {
        ...defaultStore(),
        ...parsed,
        settings: { ...defaultStore().settings, ...(parsed.settings || {}) },
        streak: { ...defaultStore().streak, ...(parsed.streak || {}) },
        completions: parsed.completions || {}
      };
      saveStore();
      computeToday();
      updateTopUI();
      location.hash = "#home";
      alert("Imported ✅");
    } catch {
      alert("Import failed (invalid JSON).");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function resetData() {
  const ok = confirm("Reset all data? This clears streak + history.");
  if (!ok) return;
  state.store = defaultStore();
  saveStore();
  computeToday();
  updateTopUI();
  location.hash = "#home";
}

async function loadChallenges() {
  const res = await fetch("./challenges.json", { cache: "no-cache" });
  const data = await res.json();
  state.challenges = data;
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

function checkMissedDayNotice() {
  // Only show in Today screen render context: we show a grace prompt if needed
  const st = state.store.streak;
  const todayKey = isoDayKeyLocal();

  if (!st.lastCompletedDayKey) return;
  const diff = dayDiff(st.lastCompletedDayKey, todayKey);

  // missed at least one full day
  if (diff >= 2) {
    // Show the grace option (if enabled + available)
    // We show it when user visits Today screen (or immediately if already there)
    if (location.hash === "#today") {
      maybeOfferGrace(todayKey);
    }
  }
}

async function boot() {
  state.store = loadStore();
  await loadChallenges();

  computeToday();
  updateTopUI();
  initNav();
  registerSW();

  window.addEventListener("hashchange", () => {
    route();
    // if entering today, maybe offer grace
    if (location.hash === "#today") checkMissedDayNotice();
  });

  route();
  if (location.hash === "#today") checkMissedDayNotice();
}

boot();