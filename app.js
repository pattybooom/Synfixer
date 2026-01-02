// Daily Fix — Python-only, fill_blank + fix_code, unlimited per day
const STORE_KEY = "dailyfix:v2";

const $ = (sel) => document.querySelector(sel);

const screens = {
  home: $("#screenHome"),
  today: $("#screenToday"),
  history: $("#screenHistory"),
  settings: $("#screenSettings"),
};

const correctAudio = new Audio("./correct.m4a");
correctAudio.preload = "auto";
correctAudio.playsInline = true;

const state = {
  challenges: [],
  today: {
    dayKey: "",
    count: 0,
    challenge: null,
  },
  store: null,
};

function playCorrectSound() {
  try {
    correctAudio.pause();
    correctAudio.currentTime = 0;
    const p = correctAudio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}

function isoDayKeyLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDayKey(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayDiff(aKey, bKey) {
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

function normalizeAnswer(s) {
  return (s || "").trim();
}

function defaultStore() {
  return {
    settings: {
      graceEnabled: false,
    },
    streak: {
      current: 0,
      best: 0,
      lastCompletedDayKey: null,
      lastCreditedDayKey: null,
      graceAvailable: true,
      graceUsedForDayKey: null,
    },
    completions: {
      // dayKey -> [ {challengeId, completedAt, type, difficulty, userAnswer}, ... ]
    },
  };
}

function migrateStore(raw) {
  const base = defaultStore();
  if (!raw || typeof raw !== "object") return base;

  const out = {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    streak: { ...base.streak, ...(raw.streak || {}) },
    completions: raw.completions || {},
  };

  // Migrate old schema where completions[dayKey] was a single object
  for (const k of Object.keys(out.completions || {})) {
    const v = out.completions[k];
    if (Array.isArray(v)) continue;
    if (v && typeof v === "object") {
      out.completions[k] = [
        {
          challengeId: v.challengeId || v.id || "unknown",
          completedAt: v.completedAt || new Date().toISOString(),
          type: v.type || "fix_code",
          difficulty: v.difficulty || "hard",
          userAnswer: v.userAnswer || "",
        },
      ];
    } else {
      out.completions[k] = [];
    }
  }

  if (!out.streak.lastCreditedDayKey && out.streak.lastCompletedDayKey) {
    out.streak.lastCreditedDayKey = out.streak.lastCompletedDayKey;
  }

  return out;
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultStore();
    return migrateStore(JSON.parse(raw));
  } catch {
    return defaultStore();
  }
}

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.store));
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getCompletionsForDay(dayKey) {
  const arr = state.store.completions[dayKey];
  return Array.isArray(arr) ? arr : [];
}

function pickChallengeForAttempt(dayKey, attemptIndex) {
  const h = hashString(`dailyfix|${dayKey}|${attemptIndex}`);
  const idx = h % state.challenges.length;
  return state.challenges[idx];
}

function computeToday() {
  const dayKey = isoDayKeyLocal();
  const todays = getCompletionsForDay(dayKey);
  const attemptIndex = todays.length;

  const challenge = pickChallengeForAttempt(dayKey, attemptIndex);

  state.today = {
    dayKey,
    count: todays.length,
    challenge,
  };
}

function updateTopUI() {
  $("#streakNum").textContent = String(state.store.streak.current || 0);
  $("#bestNum").textContent = String(state.store.streak.best || 0);

  const doneTotal = Object.values(state.store.completions || {}).reduce((acc, v) => {
    if (Array.isArray(v)) return acc + v.length;
    return acc;
  }, 0);
  $("#doneNum").textContent = String(doneTotal);

  const c = state.today.challenge;
  $("#todayTitle").textContent = c ? c.title : "—";
  $("#todayMeta").textContent = c ? c.prompt : "—";

  const n = state.today.count;
  $("#todayPill").textContent = `Completed today: ${n}`;
  $("#todayPill").style.borderColor = n > 0 ? "rgba(232,63,212,.65)" : "rgba(255,255,255,.12)";
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.style.display = k === name ? "" : "none";
  });

  document.querySelectorAll(".tab").forEach((btn) => {
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

function ensureTodayUIExtras() {
  let blank = $("#blankInput");
  if (!blank) {
    blank = document.createElement("input");
    blank.id = "blankInput";
    blank.type = "text";
    blank.autocomplete = "off";
    blank.autocapitalize = "off";
    blank.spellcheck = false;
    blank.style.width = "100%";
    blank.style.marginTop = "10px";
    blank.style.padding = "12px";
    blank.style.borderRadius = "18px";
    blank.style.border = "1px solid var(--border)";
    blank.style.background = "rgba(0,0,0,.22)";
    blank.style.color = "var(--text)";
    blank.style.fontFamily =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    blank.style.fontSize = "16px";
    blank.style.lineHeight = "1.5";

    const editor = $("#editor");
    editor.parentElement.insertBefore(blank, editor);
  }

  let another = $("#btnAnother");
  if (!another) {
    another = document.createElement("button");
    another.id = "btnAnother";
    another.className = "btn";
    another.textContent = "Do another challenge";
    another.style.display = "none";

    const row = $("#btnCheck").parentElement;
    row.appendChild(another);

    another.onclick = () => {
      clearResult();
      $("#hintBox").style.display = "none";
      $("#solutionBox").style.display = "none";
      computeToday();
      renderToday();
    };
  }
}

function setResult(msg, ok) {
  const box = $("#resultBox");
  box.style.display = "";
  box.textContent = msg;
  box.style.borderColor = ok ? "rgba(232,63,212,.65)" : "rgba(251,113,133,.35)";
}

function clearResult() {
  const box = $("#resultBox");
  box.style.display = "none";
  box.textContent = "";
  box.style.borderColor = "var(--border)";
}

function renderToday() {
  ensureTodayUIExtras();

  const c = state.today.challenge;
  if (!c) return;

  const dayKey = state.today.dayKey;
  const todays = getCompletionsForDay(dayKey);
  const n = todays.length;

  $("#challengeKicker").textContent = `Challenge • Completed today: ${n}`;
  $("#challengeTitle").textContent = c.title;
  $("#challengePrompt").textContent = c.prompt;
  $("#challengeLang").textContent = c.language;

  const brokenPre = $("#brokenCode");
  const editor = $("#editor");
  const blank = $("#blankInput");

  $("#btnCopyBroken").style.display = "none";
  editor.style.display = "none";
  blank.style.display = "none";

  $("#btnAnother").style.display = n > 0 ? "" : "none";

  $("#hintBox").style.display = "none";
  $("#solutionBox").style.display = "none";
  $("#solutionPre").textContent = "";

  if (c.type === "fill_blank") {
    brokenPre.textContent = c.template;
    blank.style.display = "";
    blank.value = "";
    clearResult();
    return;
  }

  // fix_code
  brokenPre.textContent = c.broken;
  $("#btnCopyBroken").style.display = "";
  editor.style.display = "";
  editor.value = "";
  clearResult();
}

function renderHistory() {
  const keys = Object.keys(state.store.completions || {}).sort().reverse();

  const doneTotal = Object.values(state.store.completions || {}).reduce((acc, v) => {
    if (Array.isArray(v)) return acc + v.length;
    return acc;
  }, 0);

  $("#historyMeta").textContent =
    `Current streak: ${state.store.streak.current} • Best: ${state.store.streak.best} • Completed: ${doneTotal}`;

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
    const arr = getCompletionsForDay(dayKey);
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <strong>${dayKey}</strong>
        <div class="tiny muted">Completed: ${arr.length}</div>
      </div>
      <div class="badge">✅</div>
    `;
    list.appendChild(row);
  }
}

function renderSettings() {
  $("#toggleGrace").checked = !!state.store.settings.graceEnabled;
}

function showHint(where = "today") {
  const c = state.today.challenge;
  const hint = c?.hints?.length ? c.hints[0] : "No hint for this one.";
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
  const box = $("#solutionBox");
  const pre = $("#solutionPre");

  if (c.type === "fill_blank") {
    pre.textContent = String(c.template || "").replace("______", c.answer);
    box.style.display = "";
    return;
  }

  pre.textContent = c.expected;
  box.style.display = "";
}

function copyBrokenToEditor() {
  const c = state.today.challenge;
  if (c.type !== "fix_code") return;
  $("#editor").value = c.broken;
}

function maybeOfferGrace(todayKey) {
  const st = state.store.streak;
  if (!state.store.settings.graceEnabled) return false;
  if (!st.graceAvailable) return false;
  if (st.graceUsedForDayKey) return false;

  const box = $("#resultBox");
  box.style.display = "";
  box.style.borderColor = "rgba(232,63,212,.65)";
  box.textContent = "Missed a day. You can use grace once to preserve your streak.";

  const spacer = document.createElement("div");
  spacer.style.height = "10px";
  box.appendChild(spacer);

  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "Use grace (save streak once)";
  btn.onclick = () => {
    st.graceAvailable = false;
    st.graceUsedForDayKey = todayKey;
    saveStore();
    setResult("Grace armed — complete a challenge to keep streak ✅", true);
  };
  box.appendChild(btn);
  return true;
}

function applyStreakOnFirstCompletion(todayKey) {
  const st = state.store.streak;

  if (st.lastCreditedDayKey === todayKey) {
    st.lastCompletedDayKey = todayKey;
    return;
  }

  const ref = st.lastCreditedDayKey || st.lastCompletedDayKey;

  if (!ref) {
    st.current = 1;
    st.best = Math.max(st.best || 0, st.current);
    st.lastCreditedDayKey = todayKey;
    st.lastCompletedDayKey = todayKey;
    return;
  }

  const diff = dayDiff(ref, todayKey);

  if (diff === 0) {
    st.lastCreditedDayKey = todayKey;
  } else if (diff === 1) {
    st.current = (st.current || 0) + 1;
    st.lastCreditedDayKey = todayKey;
  } else {
    if (st.graceUsedForDayKey === todayKey) {
      st.current = (st.current || 0) + 1;
      st.lastCreditedDayKey = todayKey;
      st.graceUsedForDayKey = null;
    } else {
      st.current = 1;
      st.lastCreditedDayKey = todayKey;
    }
  }

  st.lastCompletedDayKey = todayKey;
  st.best = Math.max(st.best || 0, st.current || 0);
}

function recordCompletion(challenge, userAnswer) {
  playCorrectSound();

  const dayKey = state.today.dayKey;
  const list = getCompletionsForDay(dayKey);
  const firstOfDay = list.length === 0;

  const entry = {
    challengeId: challenge.id,
    completedAt: new Date().toISOString(),
    type: challenge.type,
    difficulty: challenge.difficulty,
    userAnswer: userAnswer,
  };

  list.push(entry);
  state.store.completions[dayKey] = list;

  if (firstOfDay) {
    applyStreakOnFirstCompletion(dayKey);
  } else {
    state.store.streak.lastCompletedDayKey = dayKey;
  }

  saveStore();
  computeToday();
  updateTopUI();
}

function checkAnswer() {
  const c = state.today.challenge;

  if (!c || c.language !== "py") {
    setResult("Challenge pack error: expected Python challenges.", false);
    return;
  }

  if (c.type === "fill_blank") {
    const ans = normalizeAnswer($("#blankInput").value);
    if (!ans) {
      setResult("Type the missing piece first 👀", false);
      return;
    }
    const expected = normalizeAnswer(c.answer);
    if (ans === expected) {
      recordCompletion(c, ans);
      setResult(`Correct! Completed today: ${state.today.count} ✅`, true);
      $("#btnAnother").style.display = "";
    } else {
      setResult("Not quite — check spacing/case.", false);
    }
    return;
  }

  // fix_code
  const editorVal = $("#editor").value;
  const got = normalizeCode(editorVal);
  const exp = normalizeCode(c.expected);

  if (!got) {
    setResult("Paste your fixed code first 👀", false);
    return;
  }

  if (got === exp) {
    recordCompletion(c, editorVal);
    setResult(`Correct! Completed today: ${state.today.count} ✅`, true);
    $("#btnAnother").style.display = "";
  } else {
    setResult("Not quite — try again. (Whitespace matters a bit in this MVP.)", false);
  }
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
      state.store = migrateStore(parsed);
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

function checkMissedDayNotice() {
  const st = state.store.streak;
  const todayKey = isoDayKeyLocal();

  const ref = st.lastCreditedDayKey || st.lastCompletedDayKey;
  if (!ref) return;

  const diff = dayDiff(ref, todayKey);
  if (diff >= 2) {
    if (location.hash === "#today") {
      maybeOfferGrace(todayKey);
    }
  }
}

function bindClick(id, fn) {
  const el = $(id);
  if (el) el.onclick = fn;
}

function initNav() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.route;
    });
  });

  bindClick("#btnGoToday", () => (location.hash = "#today"));
  bindClick("#btnBackHome", () => (location.hash = "#home"));
  bindClick("#btnBackHome2", () => (location.hash = "#home"));
  bindClick("#btnBackHome3", () => (location.hash = "#home"));
  bindClick("#btnGoHistory", () => (location.hash = "#history"));
  bindClick("#btnGoSettings", () => (location.hash = "#settings"));

  bindClick("#btnHint", () => showHint("today"));
  bindClick("#btnHintHome", () => showHint("home"));
  bindClick("#btnShowSolution", () => showSolution());
  bindClick("#btnCheck", () => checkAnswer());
  bindClick("#btnCopyBroken", () => copyBrokenToEditor());

  const toggle = $("#toggleGrace");
  if (toggle) {
    toggle.onchange = (e) => {
      state.store.settings.graceEnabled = !!e.target.checked;
      saveStore();
    };
  }

  bindClick("#btnExport", () => exportData());

  const fileImport = $("#fileImport");
  if (fileImport) fileImport.onchange = (e) => importData(e);

  bindClick("#btnReset", () => resetData());

  // Disable zoom (iOS Safari: pinch + double-tap)
  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

async function loadChallenges() {
  const res = await fetch("./challenges.json", { cache: "no-cache" });
  const data = await res.json();

  const filtered = (Array.isArray(data) ? data : []).filter(
    (c) => c && c.language === "py" && (c.type === "fill_blank" || c.type === "fix_code")
  );
  state.challenges = filtered;

  if (state.challenges.length === 0) {
    throw new Error("No Python challenges found.");
  }
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

async function boot() {
  state.store = loadStore();

  // Always wire nav first so buttons/tabs work even if loading challenges fails.
  initNav();
  registerSW();

  try {
    await loadChallenges();
    computeToday();
    updateTopUI();
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    const sub = $("#subTitle");
    if (sub) sub.textContent = "⚠️ challenges.json failed to load";
    const meta = $("#todayMeta");
    if (meta) meta.textContent = msg;
  }

  window.addEventListener("hashchange", () => {
    route();
    if (location.hash === "#today") checkMissedDayNotice();
  });

  route();
  if (location.hash === "#today") checkMissedDayNotice();
}

boot();