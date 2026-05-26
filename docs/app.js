"use strict";
const API = location.hostname === "quris23.github.io"
  ? "https://onihon.onrender.com/api"
  : "/api";

// ── Sakura petals ────────────────────────────────────────────
(function() {
  const layer = document.getElementById("sakura-layer");
  if (!layer) return;
  const SWAYS = ["sway1","sway2","sway3","sway4","sway5","sway6"];
  const COLORS = ["#FFB3C1","#ffc5d0","#ffd8e4","#ffe8f0","#fff0f5"];
  const SVG = (color, size) => `<svg width="${size}" height="${size*1.25}" viewBox="0 0 20 25" opacity="0.85"><path d="M10,2 C6,4 2,8 2,13 C2,19 5.5,24 10,24 C14.5,24 18,19 18,13 C18,8 14,4 10,2 Z" fill="${color}"/><line x1="10" y1="3" x2="10" y2="16" stroke="${color}" stroke-width="0.6" opacity="0.5"/></svg>`;
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 100;
    const dur = 10 + Math.random() * 12;
    const delay = -Math.random() * 24;
    const swayDur = 1.8 + Math.random() * 2.2;
    const swayName = SWAYS[Math.floor(Math.random() * 6)];
    const size = 9 + Math.random() * 11;
    const color = COLORS[Math.floor(Math.random() * 5)];
    const opacity = 0.3 + Math.random() * 0.42;
    const outer = document.createElement("div");
    outer.className = "petal";
    outer.style.cssText = `left:${x}%;animation-duration:${dur}s;animation-delay:${delay}s;opacity:${opacity}`;
    const inner = document.createElement("div");
    inner.className = "petal-inner";
    inner.style.cssText = `animation-name:${swayName};animation-duration:${swayDur}s`;
    inner.innerHTML = SVG(color, size);
    outer.appendChild(inner);
    layer.appendChild(outer);
  }
})();

/* ═══════════════════════════════════════════════════════════
   Theme
═══════════════════════════════════════════════════════════ */

// Apply theme to <html> immediately (no DOM needed — prevents flash)
document.documentElement.setAttribute("data-theme", localStorage.getItem("theme") || "dark");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  document.getElementById("theme-dark-btn")?.classList.toggle("active", theme === "dark");
  document.getElementById("theme-light-btn")?.classList.toggle("active", theme === "light");
  // Redraw radar if profile is open
  if (typeof _lastRadarData !== "undefined" && _lastRadarData && _profileRadarChart) {
    drawProfileRadar(_lastRadarData);
  }
}

/* ═══════════════════════════════════════════════════════════
   Auth & Progress state
═══════════════════════════════════════════════════════════ */
let _currentUser   = null;
let _progressMap   = {};       // word_id  → {status, learned, favorite}
let _kanjiProgress = {};       // kanji_id → {learned, favorite}
let _rulesProgress = {};       // rule_id  → {learned, favorite}

function getToken() { return localStorage.getItem("token"); }
function setToken(t) { localStorage.setItem("token", t); }
function clearToken() { localStorage.removeItem("token"); }

function wProg(id) { return _progressMap[id]   || { status: "new", learned: 0, favorite: 0 }; }
function kProg(id) { return _kanjiProgress[id] || { learned: 0, favorite: 0 }; }
function rProg(id) { return _rulesProgress[id] || { learned: 0, favorite: 0 }; }

/* ═══════════════════════════════════════════════════════════
   Utilities
═══════════════════════════════════════════════════════════ */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  const token = getToken();
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  if (body)  opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  if (r.status === 401) { logout(); openAuthModal(); return null; }
  if (!r.ok) {
    const e = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(e.detail ?? "Ошибка сервера");
  }
  return r.status === 204 ? null : r.json();
}

function parseTags(s) {
  return s ? s.split(",").map(t => t.trim()).filter(Boolean) : [];
}
function intOrNull(v) { const n = parseInt(v, 10); return isNaN(n) ? null : n; }

function setStatus(el, msg, ok) {
  el.textContent = msg;
  el.className = "import-status " + (ok ? "ok" : "err");
  if (ok) setTimeout(() => { el.textContent = ""; el.className = "import-status"; }, 3500);
}
function setFormStatus(el, msg, ok) {
  el.textContent = msg;
  el.className = "form-status " + (ok ? "ok" : "err");
  if (ok) setTimeout(() => { el.textContent = ""; el.className = "form-status"; }, 2500);
}

/* ═══════════════════════════════════════════════════════════
   SVG Icons
═══════════════════════════════════════════════════════════ */
const SVG_BOOK = `<svg viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h2v8l2.5-1.5L13 12V4h5v16z"/></svg>`;
const SVG_STAR = `<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;

function progBtns(id, type, learned, favorite) {
  return `<div class="card-actions">
    <button class="prog-btn prog-book${learned ? ' active' : ''}"
      data-id="${id}" data-ptype="${type}" data-field="learned"
      title="${learned ? 'Изучено ✓' : 'Отметить как изученное'}">${SVG_BOOK} <span>${learned ? 'Изучено' : 'Не изучено'}</span></button>
    <button class="prog-btn prog-star${favorite ? ' active' : ''}"
      data-id="${id}" data-ptype="${type}" data-field="favorite"
      title="${favorite ? 'В избранном ✓' : 'В избранное'}">${SVG_STAR} <span>${favorite ? 'Избранное' : 'В избранное'}</span></button>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════
   Navigation
═══════════════════════════════════════════════════════════ */
const sections = {
  dashboard:  "Обзор",
  words:      "Слова",
  kanji:      "Кандзи",
  rules:      "Грамматика",
  flashcards: "Флэш Карточки",
  quiz:       "Тест",
  roadmap:    "Дорожная карта",
};

function navigate(id) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.section === id));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "sec-" + id));
  document.getElementById("topbar-title").textContent = sections[id] ?? id;
  if (id === "dashboard") loadDashboard();
  if (id === "words")     loadWords();
  if (id === "kanji")     loadKanji();
  if (id === "rules")     loadRules();
  if (id === "roadmap")   renderRoadmap();
  document.getElementById("sidebar").classList.remove("open");
}

document.querySelectorAll(".nav-item").forEach(n =>
  n.addEventListener("click", e => { e.preventDefault(); navigate(n.dataset.section); })
);
document.querySelectorAll(".stat-card[data-section], .stat-col[data-section]").forEach(el =>
  el.addEventListener("click", () => navigate(el.dataset.section))
);
document.getElementById("burger").addEventListener("click", () =>
  document.getElementById("sidebar").classList.toggle("open")
);
document.addEventListener("click", e => {
  const sb = document.getElementById("sidebar");
  if (!sb.contains(e.target) && !document.getElementById("burger").contains(e.target))
    sb.classList.remove("open");
});

/* ── Sidebar collapse ──────────────────────────────────────── */
(function() {
  const sidebar  = document.getElementById("sidebar");
  const layout   = document.querySelector(".layout");
  const toggle   = document.getElementById("sidebar-toggle");
  const btnTheme = document.getElementById("btn-theme");
  const collapsed = localStorage.getItem("sidebarCollapsed") === "1";

  function setSidebar(col) {
    sidebar.classList.toggle("collapsed", col);
    layout.classList.toggle("sidebar-collapsed", col);
    toggle.title = col ? "Развернуть" : "Свернуть";
    localStorage.setItem("sidebarCollapsed", col ? "1" : "0");
  }

  setSidebar(collapsed);
  toggle.addEventListener("click", () => setSidebar(!sidebar.classList.contains("collapsed")));

  /* ── Theme toggle ──────────────────────────────────────── */
  function updateThemeBtn() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    btnTheme.textContent = isDark ? "☀" : "🌙";
    btnTheme.title = isDark ? "Светлая тема" : "Тёмная тема";
  }
  updateThemeBtn();
  btnTheme.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    updateThemeBtn();
  });

  /* ── Sakura toggle ─────────────────────────────────────── */
  const btnSakura = document.getElementById("btn-sakura");
  const sakuraLayer = document.getElementById("sakura-layer");
  let sakuraOn = localStorage.getItem("sakura") !== "0";

  function updateSakuraBtn() {
    sakuraLayer.style.display = sakuraOn ? "" : "none";
    btnSakura.style.opacity = sakuraOn ? "1" : "0.35";
    btnSakura.title = sakuraOn ? "Выключить лепестки" : "Включить лепестки";
  }
  updateSakuraBtn();
  btnSakura.addEventListener("click", () => {
    sakuraOn = !sakuraOn;
    localStorage.setItem("sakura", sakuraOn ? "1" : "0");
    updateSakuraBtn();
  });
})();

/* ═══════════════════════════════════════════════════════════
   Dashboard
═══════════════════════════════════════════════════════════ */
async function loadDashboard() {
  try {
    const [ws, ks, rs, words] = await Promise.all([
      api("/words/stats"),
      api("/kanji/stats"),
      api("/rules/stats"),
      api("/words/?limit=8"),
    ]);

    document.getElementById("stat-words").textContent = ws.total;
    document.getElementById("stat-kanji").textContent = ks.total;
    document.getElementById("stat-rules").textContent = rs.total;

    // JLPT bars
    const bars = document.getElementById("jlpt-bars");
    const maxCnt = Math.max(1, ...Object.values(ws.by_level ?? {}));
    bars.innerHTML = [5,4,3,2,1].map(lvl => {
      const cnt = ws.by_level?.[lvl] ?? 0;
      const pct = Math.max(4, (cnt / maxCnt) * 60);
      return `<div class="jlpt-col">
        <span class="jlpt-cnt">${cnt}</span>
        <div class="jlpt-bar-grad" style="height:${pct}px"></div>
        <span class="jlpt-lbl">N${lvl}</span>
      </div>`;
    }).join("");

    // Recent words
    _wordCardIndex = 0;
    document.getElementById("recent-words").innerHTML = words.length
      ? words.map((w, i) => renderWordCard(w, i)).join("")
      : `<p class="empty">Слов пока нет — добавьте первые!</p>`;
    bindWordDeletes(document.getElementById("recent-words"), loadDashboard);

  } catch (e) {
    console.error(e);
  }
}

// Mode cards
document.querySelectorAll(".mode-card").forEach(card =>
  card.addEventListener("click", () => {
    if (card.dataset.mode === "flashcards") enterFlashCards();
    if (card.dataset.mode === "quiz")       enterQuiz();
  })
);

/* ═══════════════════════════════════════════════════════════
   Words
═══════════════════════════════════════════════════════════ */
let wordsOffset = 0;
const WORDS_PER_PAGE = 24;
const KANJI_PER_PAGE = 80;

async function loadWords(offset = 0) {
  wordsOffset = offset;
  const jlpt   = document.getElementById("words-jlpt-filter").value;
  const wtype  = document.getElementById("words-type-filter").value;
  const wsub   = document.getElementById("words-sub-filter").value;
  const wfreq  = document.getElementById("words-freq-filter")?.value ?? "";
  const prog   = document.getElementById("words-prog-filter")?.value ?? "";
  const search = document.getElementById("words-search").value.trim();
  let url = `/words/?limit=${WORDS_PER_PAGE}&offset=${offset}`;
  if (jlpt)   url += `&jlpt_level=${jlpt}`;
  if (wtype)  url += `&word_type=${encodeURIComponent(wtype)}`;
  if (wsub)   url += `&subcategory=${encodeURIComponent(wsub)}`;
  if (wfreq)  url += `&frequency=${encodeURIComponent(wfreq)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (prog === "learned")   url += "&learned=1";
  if (prog === "favorite")  url += "&favorite=1";
  try {
    const data = await api(url);
    const grid = document.getElementById("words-grid");
    _wordCardIndex = 0;
    grid.innerHTML = data.length
      ? data.map((w, i) => renderWordCard(w, i)).join("")
      : `<p class="empty">Ничего не найдено</p>`;
    bindWordDeletes(grid, () => loadWords(wordsOffset));
    renderPagination(data.length, offset, WORDS_PER_PAGE, loadWords);
  } catch(e) {
    document.getElementById("words-grid").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

// ── Маппинг тип → допустимые подтипы ─────────────────────────────────────────
const TYPE_SUBTYPES = {
  noun:        ["place","food","drink","person","family","time","weather","nature","object",
                "body","abstract","transport","building","clothing","animal","color",
                "emotion","work","money","direction","travel"],
  verb:        ["action","motion","state"],
  i_adj:       ["color","abstract","emotion","state"],
  na_adj:      ["color","abstract","emotion","state"],
  adverb:      ["time","direction","state","abstract"],
  expression:  [],
  particle:    [],
  conjunction: [],
  counter:     [],
  pronoun:     ["person","direction"],
};

/**
 * Обновляет список подтипов в зависимости от выбранного типа.
 * typeSelId  — id селекта типа
 * subSelId   — id селекта подтипа
 */
function syncSubFilter(typeSelId, subSelId) {
  const typeSel = document.getElementById(typeSelId);
  const subSel  = document.getElementById(subSelId);
  if (!typeSel || !subSel) return;

  const type    = typeSel.value;
  const allowed = type ? (TYPE_SUBTYPES[type] ?? []) : null; // null = show all

  let anyVisible = false;
  for (const opt of subSel.options) {
    if (opt.value === "") { opt.hidden = false; continue; }          // «Все подтипы» всегда видна
    const show = !allowed || allowed.includes(opt.value);
    opt.hidden   = !show;
    opt.disabled = !show;
    if (show) anyVisible = true;
  }

  // Если текущий выбранный подтип больше недоступен — сбрасываем
  if (subSel.value && subSel.options[subSel.selectedIndex]?.hidden) {
    subSel.value = "";
  }

  // Если у выбранного типа нет подтипов вообще — прячем весь селект
  subSel.parentElement?.classList.toggle("hidden", type !== "" && !anyVisible);
}

// ── Label maps ────────────────────────────────────────────────────────────────
const TYPE_LABELS = {
  "noun":"сущ.", "verb":"глаг.", "i_adj":"い-прил.", "na_adj":"な-прил.",
  "adverb":"нар.", "expression":"выр.", "particle":"частица",
  "conjunction":"союз", "counter":"счётн.", "pronoun":"мест.",
  "i-adj":"い-прил.", "na-adj":"な-прил.",
};
const SUB_LABELS = {
  "place":"место","food":"еда","drink":"напиток","person":"человек",
  "family":"семья","time":"время","weather":"погода","nature":"природа",
  "object":"предмет","body":"тело","abstract":"абстр.","transport":"транспорт",
  "building":"здание","clothing":"одежда","money":"деньги","animal":"животное",
  "plant":"растение","number":"число","color":"цвет","direction":"направление",
  "emotion":"эмоция","work":"работа",
  "motion":"движение","state":"состояние","action":"действие","speech":"речь",
  "perception":"восприятие","giving_receiving":"давать/получать",
  "existence":"существование","change":"изменение","creation":"создание",
  "size":"размер","character":"характер","appearance":"внешность",
  "evaluation":"оценка","quantity":"количество","physical":"физич.",
};
const FREQ_LABELS = {
  "very_common":"★★★", "common":"★★", "uncommon":"★", "rare":"редк.", "specialized":"спец.",
};
const FREQ_CLASS = {
  "very_common":"badge-freq-high", "common":"badge-freq-med",
  "uncommon":"badge-freq-low", "rare":"badge-freq-low", "specialized":"badge-freq-low",
};
const REGISTER_LABELS = {
  "polite":"вежл.", "neutral":"нейтр.", "casual":"разг.", "rough":"груб.",
  "written":"письм.", "feminine":"жен.", "masculine":"муж.",
};
const CONTEXT_LABELS = {
  "daily":"быт","work":"работа","travel":"путеш.","food":"еда",
  "anime":"аниме","news":"новости","letters":"письма","academic":"наука",
};

function typeBadgeClass(t) {
  if (!t) return "badge-other";
  if (t === "noun")                                     return "badge-noun";
  if (t === "verb")                                     return "badge-verb";
  if (["i_adj","na_adj","i-adj","na-adj"].includes(t)) return "badge-adj";
  if (t === "adverb")                                   return "badge-adverb";
  if (t === "expression")                               return "badge-expression";
  return "badge-other";
}

const PROGRESS_LABELS = { new: "Новое", learning: "Изучаю", known: "Знаю" };
const PROGRESS_NEXT   = { new: "learning", learning: "known", known: "new" };

let _wordCardIndex = 0;
function renderWordCard(w, idx) {
  _wCache[w.id] = w;
  const prog   = wProg(w.id);
  const status = prog.status;
  const cardIdx = idx !== undefined ? idx : _wordCardIndex++;

  const jlpt      = w.jlpt_level ? `<span class="badge badge-jlpt">N${w.jlpt_level}</span>` : "";
  const typeBadge = w.word_type
    ? `<span class="badge ${typeBadgeClass(w.word_type)}">${esc(TYPE_LABELS[w.word_type] ?? w.word_type)}</span>`
    : "";
  const freqBadge = w.frequency
    ? `<span class="badge ${FREQ_CLASS[w.frequency] ?? 'badge-other'}">${esc(FREQ_LABELS[w.frequency] ?? w.frequency)}</span>`
    : "";
  const subBadge  = w.subcategory
    ? `<span class="badge badge-sub">${esc(SUB_LABELS[w.subcategory] ?? w.subcategory)}</span>`
    : "";
  const tags = (w.tags ?? []).map(t => `<span class="badge badge-tag">${esc(t)}</span>`).join("");
  const descSnippet = w.description
    ? `<div class="wc-desc">${esc(w.description.length > 72 ? w.description.slice(0, 70) + "…" : w.description)}</div>`
    : "";
  const progressBtn = _currentUser
    ? `<button class="wp-btn wp-${status}" data-wid="${w.id}" title="${PROGRESS_LABELS[status]}">●</button>`
    : "";
  const actions = _currentUser ? progBtns(w.id, "word", prog.learned, prog.favorite) : "";

  return `<div class="word-card${wordCardClasses(w.id)}" data-wid="${w.id}" style="--i:${cardIdx}">
    <button class="wc-del" data-id="${w.id}" title="Удалить">✕</button>
    ${progressBtn}
    <div class="wc-word">${esc(w.word)}</div>
    ${w.reading ? `<div class="wc-reading">${esc(w.reading)}</div>` : ""}
    ${w.romanji ? `<div class="wc-romanji">${esc(w.romanji)}</div>` : ""}
    <div class="wc-translation">${esc(w.translation)}</div>
    ${descSnippet}
    ${w.example_sentence ? `<div class="wc-example">${esc(w.example_sentence)}</div>` : ""}
    <div class="wc-footer">${jlpt}${typeBadge}${freqBadge}${subBadge}${tags}</div>
    ${actions}
  </div>`;
}

function bindWordDeletes(container, onDelete) {
  container.querySelectorAll(".wc-del").forEach(btn =>
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("Удалить слово?")) return;
      try { await api(`/words/${btn.dataset.id}`, "DELETE"); onDelete(); }
      catch(e) { alert(e.message); }
    })
  );
  container.querySelectorAll(".wp-btn").forEach(btn =>
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const wid  = +btn.dataset.wid;
      const cur  = wProg(wid).status;
      const next = PROGRESS_NEXT[cur];
      btn.className = `wp-btn wp-${next}`;
      btn.title     = PROGRESS_LABELS[next];
      _progressMap[wid] = { ...wProg(wid), status: next };
      await api(`/progress/words/${wid}`, "PUT", { status: next });
    })
  );
  container.querySelectorAll(".prog-btn").forEach(btn =>
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id    = +btn.dataset.id;
      const type  = btn.dataset.ptype;
      const field = btn.dataset.field;
      const newVal = btn.classList.contains("active") ? 0 : 1;
      btn.classList.toggle("active", !!newVal);
      const span = btn.querySelector("span");
      if (span) span.textContent = field === "learned"
        ? (newVal ? "Изучено" : "Не изучено")
        : (newVal ? "Избранное" : "В избранное");
      btn.title = field === "learned"
        ? (newVal ? "Изучено ✓" : "Отметить как изученное")
        : (newVal ? "В избранном ✓" : "В избранное");
      if (type === "word") {
        _progressMap[id] = { ...wProg(id), [field]: newVal };
        await api(`/progress/words/${id}`, "PUT", { [field]: newVal });
        updateWordCardEl(id);
      } else if (type === "kanji") {
        _kanjiProgress[id] = { ...kProg(id), [field]: newVal };
        await api(`/progress/kanji/${id}`, "PUT", { [field]: newVal });
        updateKanjiCardEl(id);
      } else {
        _rulesProgress[id] = { ...rProg(id), [field]: newVal };
        await api(`/progress/rules/${id}`, "PUT", { [field]: newVal });
      }
    })
  );
}

document.getElementById("words-reset")?.addEventListener("click", () => {
  document.getElementById("words-search").value = "";
  document.getElementById("words-jlpt-filter").value = "";
  document.getElementById("words-type-filter").value = "";
  document.getElementById("words-sub-filter").value = "";
  if (document.getElementById("words-freq-filter")) document.getElementById("words-freq-filter").value = "";
  if (document.getElementById("words-prog-filter")) document.getElementById("words-prog-filter").value = "";
  loadWords(0);
});
let _wordsSearchTimer = null;
document.getElementById("words-search").addEventListener("input", () => {
  clearTimeout(_wordsSearchTimer);
  _wordsSearchTimer = setTimeout(() => loadWords(0), 350);
});
document.getElementById("words-search").addEventListener("keydown", e => {
  if (e.key === "Enter") { clearTimeout(_wordsSearchTimer); loadWords(0); }
});
document.getElementById("words-jlpt-filter").addEventListener("change", () => loadWords(0));
document.getElementById("words-type-filter").addEventListener("change", () => {
  syncSubFilter("words-type-filter", "words-sub-filter");
  loadWords(0);
});
document.getElementById("words-sub-filter").addEventListener("change",  () => loadWords(0));
document.getElementById("words-freq-filter")?.addEventListener("change", () => loadWords(0));
document.getElementById("words-prog-filter")?.addEventListener("change", () => loadWords(0));

/* ═══════════════════════════════════════════════════════════
   Kanji
═══════════════════════════════════════════════════════════ */
async function loadKanji(offset = 0) {
  const jlpt   = document.getElementById("kanji-jlpt-filter").value;
  const prog   = document.getElementById("kanji-prog-filter")?.value ?? "";
  const search = document.getElementById("kanji-search")?.value.trim() ?? "";
  let url = `/kanji/?limit=${KANJI_PER_PAGE}&offset=${offset}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (jlpt)   url += `&jlpt_level=${jlpt}`;
  if (prog === "learned")  url += "&learned=1";
  if (prog === "favorite") url += "&favorite=1";
  try {
    const data = await api(url);
    const grid = document.getElementById("kanji-grid");
    grid.innerHTML = data.length
      ? data.map((k, i) => renderKanjiCard(k, i)).join("")
      : `<p class="empty">Кандзи не найдено</p>`;
    bindKanjiEvents(grid, loadKanji);
    renderPagination(data.length, offset, KANJI_PER_PAGE, loadKanji, "kanji-pagination");
  } catch(e) {
    document.getElementById("kanji-grid").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

function wordCardClasses(id) {
  const prog = wProg(id);
  let cls = prog.learned ? " wc-learned" : "";
  if (prog.favorite) cls += " wc-favorite";
  return cls;
}

function updateWordCardEl(id) {
  const el = document.querySelector(`.word-card[data-wid="${id}"]`);
  if (!el) return;
  el.className = "word-card" + wordCardClasses(id);
}

function kanjiCardClasses(id) {
  const prog = kProg(id);
  let cls = prog.learned ? " kc-learned" : " kc-not-learned";
  if (prog.favorite) cls += " kc-favorite";
  return cls;
}

function updateKanjiCardEl(id) {
  const el = document.querySelector(`.kanji-card[data-kid="${id}"]`);
  if (!el) return;
  el.className = "kanji-card" + kanjiCardClasses(id);
}

function kanjiIconBtns(id, learned, favorite) {
  if (!_currentUser) return "";
  return `<div class="kc-actions">
    <button class="prog-btn prog-book kc-icon-btn${learned ? ' active' : ''}"
      data-id="${id}" data-ptype="kanji" data-field="learned"
      title="${learned ? 'Изучено ✓' : 'Отметить как изученное'}">${SVG_BOOK}</button>
    <button class="prog-btn prog-star kc-icon-btn${favorite ? ' active' : ''}"
      data-id="${id}" data-ptype="kanji" data-field="favorite"
      title="${favorite ? 'В избранном ✓' : 'В избранное'}">${SVG_STAR}</button>
  </div>`;
}

function renderKanjiCard(k, idx) {
  _kCache[k.id] = k;
  const jlpt = k.jlpt_level ? `<span class="badge badge-jlpt">N${k.jlpt_level}</span>` : "";
  const prog = kProg(k.id);
  const cardIdx = idx !== undefined ? idx : 0;

  return `<div class="kanji-card${kanjiCardClasses(k.id)}" data-kid="${k.id}" style="--i:${cardIdx}">
    <button class="kc-del" data-id="${k.id}" title="Удалить">✕</button>
    <div class="kc-char">${esc(k.character)}</div>
    <div class="kc-meaning">${esc(k.meaning)}</div>
    <div style="margin-top:8px">${jlpt}</div>
    ${kanjiIconBtns(k.id, prog.learned, prog.favorite)}
  </div>`;
}

function bindKanjiEvents(container, onDelete) {
  container.querySelectorAll(".kc-del").forEach(btn =>
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("Удалить кандзи?")) return;
      try { await api(`/kanji/${btn.dataset.id}`, "DELETE"); onDelete(); }
      catch(e) { alert(e.message); }
    })
  );
  container.querySelectorAll(".prog-btn").forEach(btn =>
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id    = +btn.dataset.id;
      const field = btn.dataset.field;
      const newVal = btn.classList.contains("active") ? 0 : 1;
      btn.classList.toggle("active", !!newVal);
      btn.title = field === "learned"
        ? (newVal ? "Изучено ✓" : "Отметить как изученное")
        : (newVal ? "В избранном ✓" : "В избранное");
      _kanjiProgress[id] = { ...kProg(id), [field]: newVal };
      updateKanjiCardEl(id);
      await api(`/progress/kanji/${id}`, "PUT", { [field]: newVal });
    })
  );
}

document.getElementById("kanji-load").addEventListener("click", () => loadKanji(0));
document.getElementById("kanji-jlpt-filter").addEventListener("change", () => loadKanji(0));
document.getElementById("kanji-prog-filter")?.addEventListener("change", () => loadKanji(0));

let _kanjiSearchTimer = null;
document.getElementById("kanji-search").addEventListener("input", () => {
  clearTimeout(_kanjiSearchTimer);
  _kanjiSearchTimer = setTimeout(() => loadKanji(0), 350);
});
document.getElementById("kanji-search").addEventListener("keydown", e => {
  if (e.key === "Enter") { clearTimeout(_kanjiSearchTimer); loadKanji(0); }
});

/* ═══════════════════════════════════════════════════════════
   Rules
═══════════════════════════════════════════════════════════ */
async function loadRules() {
  const jlpt = document.getElementById("rules-jlpt-filter").value;
  const prog = document.getElementById("rules-prog-filter")?.value ?? "";
  let url = `/rules/?limit=100`;
  if (jlpt) url += `&jlpt_level=${jlpt}`;
  if (prog === "learned")  url += "&learned=1";
  if (prog === "favorite") url += "&favorite=1";
  try {
    const data = await api(url);
    const list = document.getElementById("rules-list");
    list.innerHTML = data.length
      ? data.map((r, rIdx) => {
          _rCache[r.id] = r;
          const prog = rProg(r.id);
          const actions = _currentUser ? progBtns(r.id, "rule", prog.learned, prog.favorite) : "";
          return `<div class="rule-card" data-rid="${r.id}" style="--i:${rIdx}">
            <button class="rc-del" data-id="${r.id}" title="Удалить">✕</button>
            <div class="rc-title">${esc(r.title)}</div>
            <div class="rc-body">${esc(r.body)}</div>
            <div class="rc-footer">
              ${r.jlpt_level ? `<span class="badge badge-jlpt">N${r.jlpt_level}</span>` : ""}
              ${r.category   ? `<span class="badge">${esc(r.category)}</span>` : ""}
              <span style="flex:1"></span>
              ${actions}
            </div>
          </div>`;
        }).join("")
      : `<p class="empty">Правил не найдено</p>`;
    list.querySelectorAll(".rc-del").forEach(btn =>
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        if (!confirm("Удалить правило?")) return;
        try { await api(`/rules/${btn.dataset.id}`, "DELETE"); loadRules(); }
        catch(e) { alert(e.message); }
      })
    );
    list.querySelectorAll(".prog-btn").forEach(btn =>
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const id    = +btn.dataset.id;
        const field = btn.dataset.field;
        const newVal = btn.classList.contains("active") ? 0 : 1;
        btn.classList.toggle("active", !!newVal);
        const span = btn.querySelector("span");
        if (span) span.textContent = field === "learned"
          ? (newVal ? "Изучено" : "Не изучено")
          : (newVal ? "Избранное" : "В избранное");
        _rulesProgress[id] = { ...rProg(id), [field]: newVal };
        await api(`/progress/rules/${id}`, "PUT", { [field]: newVal });
      })
    );
  } catch(e) {
    document.getElementById("rules-list").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

document.getElementById("rules-load").addEventListener("click", loadRules);
document.getElementById("rules-jlpt-filter").addEventListener("change", loadRules);
document.getElementById("rules-prog-filter")?.addEventListener("change", loadRules);

/* ═══════════════════════════════════════════════════════════
   Pagination
═══════════════════════════════════════════════════════════ */
function renderPagination(count, offset, perPage, loadFn, containerId = "words-pagination") {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = "";
  if (offset > 0) {
    const prev = document.createElement("button");
    prev.className = "pg-btn"; prev.textContent = "← Назад";
    prev.addEventListener("click", () => loadFn(offset - perPage));
    wrap.appendChild(prev);
  }
  if (count === perPage) {
    const next = document.createElement("button");
    next.className = "pg-btn"; next.textContent = "Далее →";
    next.addEventListener("click", () => loadFn(offset + perPage));
    wrap.appendChild(next);
  }
}

/* ═══════════════════════════════════════════════════════════
   Modal (add forms)
═══════════════════════════════════════════════════════════ */
const overlay = document.getElementById("modal-overlay");

document.getElementById("add-btn").addEventListener("click",    () => overlay.classList.add("open"));
document.getElementById("modal-close").addEventListener("click", () => overlay.classList.remove("open"));
overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.remove("open"); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    overlay.classList.remove("open");
    closeDetail();
    closeProfile();
  }
});

document.querySelectorAll(".mtype").forEach(btn =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mtype").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const t = btn.dataset.form;
    document.getElementById("word-form").classList.toggle("hidden",  t !== "word");
    document.getElementById("kanji-form").classList.toggle("hidden", t !== "kanji");
    document.getElementById("rule-form").classList.toggle("hidden",  t !== "rule");
    document.getElementById("modal-title").textContent =
      t === "word" ? "Добавить слово" : t === "kanji" ? "Добавить кандзи" : "Добавить правило";
  })
);

document.getElementById("word-form").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const st = document.getElementById("word-form-status");
  try {
    await api("/words/", "POST", {
      word: fd.word, reading: fd.reading||null, romanji: fd.romanji||null,
      translation: fd.translation, example_sentence: fd.example_sentence||null,
      jlpt_level: intOrNull(fd.jlpt_level), tags: parseTags(fd.tags),
      word_type: fd.word_type || null, verb_group: fd.verb_group || null,
    });
    setFormStatus(st, "✓ Добавлено!", true);
    e.target.reset();
  } catch(err) { setFormStatus(st, err.message, false); }
});

document.getElementById("kanji-form").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const st = document.getElementById("kanji-form-status");
  try {
    await api("/kanji/", "POST", {
      character: fd.character, meaning: fd.meaning,
      onyomi: parseTags(fd.onyomi), kunyomi: parseTags(fd.kunyomi),
      jlpt_level: intOrNull(fd.jlpt_level),
    });
    setFormStatus(st, "✓ Добавлено!", true);
    e.target.reset();
  } catch(err) { setFormStatus(st, err.message, false); }
});

document.getElementById("rule-form").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const st = document.getElementById("rule-form-status");
  try {
    await api("/rules/", "POST", {
      title: fd.title, body: fd.body,
      category: fd.category||null, jlpt_level: intOrNull(fd.jlpt_level),
    });
    setFormStatus(st, "✓ Добавлено!", true);
    e.target.reset();
  } catch(err) { setFormStatus(st, err.message, false); }
});

/* ═══════════════════════════════════════════════════════════
   Detail modal
═══════════════════════════════════════════════════════════ */
const _wCache = {};
const _kCache = {};
const _rCache = {};

const VGROUP_LABELS = { "1": "1-я группа (五段)", "2": "2-я группа (一段)", "3": "3-я (нерег.)" };

function renderWordDetail(w) {
  const metaItems = [];
  if (w.jlpt_level)      metaItems.push({ label: "JLPT",        value: `N${w.jlpt_level}` });
  if (w.word_type)       metaItems.push({ label: "Тип",         value: TYPE_LABELS[w.word_type] ?? w.word_type });
  if (w.subcategory)     metaItems.push({ label: "Подтип",      value: SUB_LABELS[w.subcategory] ?? w.subcategory });
  if (w.verb_group)      metaItems.push({ label: "Группа",      value: VGROUP_LABELS[w.verb_group] ?? w.verb_group });
  if (w.speech_register) metaItems.push({ label: "Стиль",       value: REGISTER_LABELS[w.speech_register] ?? w.speech_register });
  if (w.frequency)       metaItems.push({ label: "Частотность", value: FREQ_LABELS[w.frequency] ?? w.frequency });
  if (w.te_form)         metaItems.push({ label: "て-форма",    value: w.te_form });
  if (w.is_transitive != null) metaItems.push({ label: "Переходность", value: w.is_transitive ? "переходный" : "непереходный" });
  if (w.can_suru != null)      metaItems.push({ label: "する-глагол",  value: w.can_suru ? "да" : "нет" });
  if (w.counter_suffix)        metaItems.push({ label: "Счётный суф.", value: w.counter_suffix });

  const meta = metaItems.map(m =>
    `<div class="dc-meta-item"><div class="dc-meta-label">${m.label}</div><div class="dc-meta-value">${esc(m.value)}</div></div>`
  ).join("");

  const contextBadges = (w.context ?? [])
    .map(c => `<span class="badge badge-tag">${esc(CONTEXT_LABELS[c] ?? c)}</span>`).join("");
  const allTags = (w.tags ?? []).map(t => `<span class="badge badge-tag">${esc(t)}</span>`).join("");

  const prog = wProg(w.id);
  const detailActions = _currentUser
    ? `<div class="dc-actions">
        <button class="prog-btn prog-book${prog.learned ? ' active' : ''}" data-id="${w.id}" data-ptype="word" data-field="learned">${SVG_BOOK} <span>${prog.learned ? 'Изучено' : 'Не изучено'}</span></button>
        <button class="prog-btn prog-star${prog.favorite ? ' active' : ''}" data-id="${w.id}" data-ptype="word" data-field="favorite">${SVG_STAR} <span>${prog.favorite ? 'Избранное' : 'В избранное'}</span></button>
      </div>`
    : "";

  return `
    <div class="dc-word">${esc(w.word)}</div>
    ${w.reading  ? `<div class="dc-reading">${esc(w.reading)}</div>` : ""}
    ${w.romanji  ? `<div class="dc-romanji">${esc(w.romanji)}</div>` : ""}
    <div class="dc-translation">${esc(w.translation)}</div>
    ${w.description ? `<div class="dc-description">${esc(w.description)}</div>` : ""}
    ${w.example_sentence ? `<div class="dc-example">${esc(w.example_sentence)}</div>` : ""}
    ${meta ? `<div class="dc-meta">${meta}</div>` : ""}
    ${contextBadges ? `<div class="dc-badges">${contextBadges}</div>` : ""}
    ${allTags ? `<div class="dc-badges" style="margin-top:6px">${allTags}</div>` : ""}
    ${detailActions}`;
}

function renderKanjiDetail(k) {
  const on  = k.onyomi?.join("、") ?? "";
  const kun = k.kunyomi?.join("、") ?? "";
  const jlpt = k.jlpt_level ? `<span class="badge badge-jlpt">N${k.jlpt_level}</span>` : "";
  const prog = kProg(k.id);
  const detailActions = _currentUser
    ? `<div class="dc-actions">
        <button class="prog-btn prog-book${prog.learned ? ' active' : ''}" data-id="${k.id}" data-ptype="kanji" data-field="learned">${SVG_BOOK} <span>${prog.learned ? 'Изучено' : 'Не изучено'}</span></button>
        <button class="prog-btn prog-star${prog.favorite ? ' active' : ''}" data-id="${k.id}" data-ptype="kanji" data-field="favorite">${SVG_STAR} <span>${prog.favorite ? 'Избранное' : 'В избранное'}</span></button>
      </div>`
    : "";
  return `
    <div class="dc-kanji">${esc(k.character)}</div>
    <div class="dc-kanji-meaning">${esc(k.meaning)}</div>
    <div class="dc-kanji-readings">
      ${on  ? `<div class="dc-reading-block"><div class="dc-meta-label">Онъёми 音読み</div><div class="dc-meta-value">${esc(on)}</div></div>` : ""}
      ${kun ? `<div class="dc-reading-block"><div class="dc-meta-label">Кунъёми 訓読み</div><div class="dc-meta-value">${esc(kun)}</div></div>` : ""}
    </div>
    ${jlpt ? `<div class="dc-badges">${jlpt}</div>` : ""}
    ${detailActions}`;
}

function renderRuleDetail(r) {
  const jlpt = r.jlpt_level ? `<span class="badge badge-jlpt">N${r.jlpt_level}</span>` : "";
  const cat  = r.category   ? `<span class="badge">${esc(r.category)}</span>` : "";
  const prog = rProg(r.id);
  const detailActions = _currentUser
    ? `<div class="dc-actions">
        <button class="prog-btn prog-book${prog.learned ? ' active' : ''}" data-id="${r.id}" data-ptype="rule" data-field="learned">${SVG_BOOK} <span>${prog.learned ? 'Изучено' : 'Не изучено'}</span></button>
        <button class="prog-btn prog-star${prog.favorite ? ' active' : ''}" data-id="${r.id}" data-ptype="rule" data-field="favorite">${SVG_STAR} <span>${prog.favorite ? 'Избранное' : 'В избранное'}</span></button>
      </div>`
    : "";
  return `
    <div class="dc-rule-title">${esc(r.title)}</div>
    <div class="dc-rule-body">${esc(r.body)}</div>
    ${(jlpt || cat) ? `<div class="dc-badges">${jlpt}${cat}</div>` : ""}
    ${detailActions}`;
}

function openDetail(html, cardClass = "") {
  const content = document.getElementById("detail-content");
  content.innerHTML = html;
  const card = document.getElementById("detail-card");
  card.className = "detail-card" + (cardClass ? " " + cardClass : "");
  document.getElementById("detail-overlay").classList.add("open");
  content.querySelectorAll(".prog-btn").forEach(btn =>
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id    = +btn.dataset.id;
      const type  = btn.dataset.ptype;
      const field = btn.dataset.field;
      const newVal = btn.classList.contains("active") ? 0 : 1;
      btn.classList.toggle("active", !!newVal);
      const span = btn.querySelector("span");
      if (span) span.textContent = field === "learned"
        ? (newVal ? "Изучено" : "Не изучено")
        : (newVal ? "Избранное" : "В избранное");
      if (type === "word") {
        _progressMap[id] = { ...wProg(id), [field]: newVal };
        await api(`/progress/words/${id}`, "PUT", { [field]: newVal });
        updateWordCardEl(id);
      } else if (type === "kanji") {
        _kanjiProgress[id] = { ...kProg(id), [field]: newVal };
        await api(`/progress/kanji/${id}`, "PUT", { [field]: newVal });
        updateKanjiCardEl(id);
      } else {
        _rulesProgress[id] = { ...rProg(id), [field]: newVal };
        await api(`/progress/rules/${id}`, "PUT", { [field]: newVal });
      }
      document.querySelectorAll(".rm-lesson.rm-open").forEach(l => applyRoadmapProgress(l));
    })
  );
}

function closeDetail() {
  document.getElementById("detail-overlay").classList.remove("open");
}

document.getElementById("detail-close").addEventListener("click", closeDetail);
document.getElementById("detail-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("detail-overlay")) closeDetail();
});

document.addEventListener("click", e => {
  if (e.target.closest(".prog-btn") || e.target.closest(".wp-btn")) return;
  const wcard = e.target.closest(".word-card");
  if (wcard && !e.target.closest(".wc-del") && !e.target.closest(".card-actions")) {
    const id = +wcard.dataset.wid;
    if (_wCache[id]) openDetail(renderWordDetail(_wCache[id]));
    return;
  }
  const kcard = e.target.closest(".kanji-card");
  if (kcard && !e.target.closest(".kc-del") && !e.target.closest(".card-actions")) {
    const id = +kcard.dataset.kid;
    if (_kCache[id]) openDetail(renderKanjiDetail(_kCache[id]), "kanji-detail");
    return;
  }
  const rcard = e.target.closest(".rule-card");
  if (rcard && !e.target.closest(".rc-del") && !e.target.closest(".card-actions")) {
    const id = +rcard.dataset.rid;
    if (_rCache[id]) openDetail(renderRuleDetail(_rCache[id]));
  }
});

/* ═══════════════════════════════════════════════════════════
   Auth UI
═══════════════════════════════════════════════════════════ */
function openAuthModal()  { document.getElementById("auth-overlay").classList.add("open"); }
function closeAuthModal() { document.getElementById("auth-overlay").classList.remove("open"); }

document.getElementById("btn-login").addEventListener("click", openAuthModal);
document.getElementById("auth-close").addEventListener("click", closeAuthModal);
document.getElementById("auth-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("auth-overlay")) closeAuthModal();
});

document.querySelectorAll(".auth-tab").forEach(tab =>
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const t = tab.dataset.tab;
    document.getElementById("login-form").classList.toggle("hidden",    t !== "login");
    document.getElementById("register-form").classList.toggle("hidden", t !== "register");
  })
);

document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const st = document.getElementById("login-status");
  st.textContent = "";
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fd.email, password: fd.password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail ?? "Ошибка");
    onAuthSuccess(data.access_token, data.user);
  } catch(err) { st.textContent = err.message; st.className = "auth-status err"; }
});

document.getElementById("register-form").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const st = document.getElementById("register-status");
  st.textContent = "";
  try {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fd.email, password: fd.password, display_name: fd.display_name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail ?? "Ошибка");
    onAuthSuccess(data.access_token, data.user);
  } catch(err) { st.textContent = err.message; st.className = "auth-status err"; }
});

document.getElementById("btn-logout").addEventListener("click", () => {
  logout();
  loadDashboard();
});

function onAuthSuccess(token, user) {
  setToken(token);
  _currentUser = user;
  closeAuthModal();
  renderUserUI(user);
  loadAllProgress().then(() => loadDashboard());
}

function logout() {
  clearToken();
  _currentUser = null;
  _progressMap = {};
  _kanjiProgress = {};
  _rulesProgress = {};
  renderUserUI(null);
  if (_profileRadarChart) { _profileRadarChart.destroy(); _profileRadarChart = null; }
}

function renderUserUI(user) {
  const menu = document.getElementById("user-menu");
  const btn  = document.getElementById("btn-login");
  if (user) {
    document.getElementById("user-name").textContent = user.display_name || user.email;
    const av = document.getElementById("user-avatar");
    if (user.avatar_url) { av.src = user.avatar_url; av.classList.remove("hidden"); }
    else { av.classList.add("hidden"); }
    menu.classList.remove("hidden");
    btn.classList.add("hidden");
  } else {
    menu.classList.add("hidden");
    btn.classList.remove("hidden");
  }
}

async function loadAllProgress() {
  if (!getToken()) return;
  try {
    const [words, kanji, rules] = await Promise.all([
      api("/progress/words"),
      api("/progress/kanji"),
      api("/progress/rules"),
    ]);
    if (words) _progressMap   = words;
    if (kanji) _kanjiProgress = kanji;
    if (rules) _rulesProgress = rules;
  } catch(_) {}
}

// Init auth
(async function initAuth() {
  const params   = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  const authErr  = params.get("auth_error");
  if (urlToken) {
    setToken(urlToken);
    const url = new URL(window.location);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url);
  }
  if (authErr) {
    const url = new URL(window.location);
    url.searchParams.delete("auth_error");
    window.history.replaceState({}, "", url);
  }
  const token = getToken();
  if (token) {
    try {
      const user = await fetch(`${API}/auth/me`, {
        headers: { Authorization: "Bearer " + token },
      }).then(r => r.ok ? r.json() : null);
      if (user) {
        _currentUser = user;
        renderUserUI(user);
        await loadAllProgress();
      } else { clearToken(); }
    } catch(_) { clearToken(); }
  }
})();

/* ═══════════════════════════════════════════════════════════
   Profile modal  (+ radar chart)
═══════════════════════════════════════════════════════════ */
let _profileRadarChart = null;
let _lastRadarData     = null;

function openProfile() {
  if (!_currentUser) { openAuthModal(); return; }
  document.getElementById("profile-overlay").classList.add("open");

  document.getElementById("profile-name-input").value  = _currentUser.display_name || "";
  document.getElementById("profile-email-input").value = _currentUser.email || "";

  const av   = document.getElementById("profile-avatar-img");
  const init = document.getElementById("profile-initials");
  if (_currentUser.avatar_url) {
    av.src = _currentUser.avatar_url;
    av.classList.remove("hidden");
    init.classList.add("hidden");
  } else {
    av.classList.add("hidden");
    const name = _currentUser.display_name || _currentUser.email || "?";
    init.textContent = name[0].toUpperCase();
    init.classList.remove("hidden");
  }

  // Stats + radar
  api("/progress/stats").then(stats => {
    if (!stats) return;
    document.getElementById("pstat-w-learned").textContent = stats.words?.learned  ?? 0;
    document.getElementById("pstat-k-learned").textContent = stats.kanji?.learned  ?? 0;
    document.getElementById("pstat-r-learned").textContent = stats.rules?.learned  ?? 0;
    document.getElementById("pstat-w-fav").textContent     = stats.words?.favorite ?? 0;
  }).catch(() => {});

  api("/progress/radar").then(data => {
    if (data) { _lastRadarData = data; drawProfileRadar(data); }
  }).catch(() => {});
}

function drawProfileRadar(data) {
  const wrap = document.getElementById("profile-radar-wrap");
  wrap.classList.remove("hidden");
  const ctx = document.getElementById("profile-radar-chart").getContext("2d");

  function sumPct(obj) {
    let total = 0, learned = 0;
    for (const lvl of Object.values(obj || {})) {
      total   += (lvl.total   || 0);
      learned += (lvl.learned || 0);
    }
    return total ? Math.round((learned / total) * 100) : 0;
  }

  const wPct = sumPct(data.words);
  const kPct = sumPct(data.kanji);
  const rPct = sumPct(data.rules);

  // Theme-aware colors
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const clr = isDark ? {
    label:      "#eaeaf2",
    ticks:      "#9b7080",
    grid:       "#252535",
    angle:      "#2f2f45",
    border:     "rgba(200,16,46,.9)",
    fill:       "rgba(255,179,193,.18)",
    point:      "rgba(200,16,46,.9)",
  } : {
    label:      "#1a0008",
    ticks:      "#7a3040",
    grid:       "#ffccd5",
    angle:      "#ffb3c1",
    border:     "rgba(200,16,46,.85)",
    fill:       "rgba(200,16,46,.12)",
    point:      "rgba(200,16,46,.9)",
  };

  if (_profileRadarChart) { _profileRadarChart.destroy(); _profileRadarChart = null; }

  _profileRadarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: ["Слова", "Кандзи", "Грамматика"],
      datasets: [{
        label: "Изучено %",
        data:  [wPct, kPct, rPct],
        borderColor:          clr.border,
        backgroundColor:      clr.fill,
        pointBackgroundColor: clr.point,
        pointRadius: 4,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: {
            stepSize: 25,
            color: clr.ticks,
            backdropColor: "transparent",
            font: { size: 9 },
            callback: v => v + "%",
          },
          grid:        { color: clr.grid,  lineWidth: 1 },
          angleLines:  { color: clr.angle, lineWidth: 1 },
          pointLabels: { color: clr.label, font: { size: 13, weight: "700" } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw}%` } },
      },
    },
  });
}

function closeProfile() {
  document.getElementById("profile-overlay").classList.remove("open");
}

document.getElementById("profile-close").addEventListener("click", closeProfile);
document.getElementById("profile-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("profile-overlay")) closeProfile();
});

document.getElementById("profile-fav-btn").addEventListener("click", () => {
  closeProfile();
  navigate("words");
  const sel = document.getElementById("words-prog-filter");
  if (sel) { sel.value = "favorite"; }
  loadWords();
});

document.getElementById("profile-form").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const st = document.getElementById("profile-status");
  try {
    const user = await api("/auth/me", "PATCH", { display_name: fd.display_name });
    if (user) {
      _currentUser = { ..._currentUser, ...user };
      renderUserUI(_currentUser);
      setFormStatus(st, "✓ Сохранено!", true);
    }
  } catch(err) { setFormStatus(st, err.message, false); }
});

document.getElementById("user-name").addEventListener("click", openProfile);
document.getElementById("user-avatar").addEventListener("click", openProfile);

/* ═══════════════════════════════════════════════════════════
   Flash Cards
═══════════════════════════════════════════════════════════ */
let _fcDeck  = [];
let _fcIndex = 0;
let _fcDone  = [];    // null | true(✓) | false(✕)

function enterFlashCards() {
  navigate("flashcards");
  document.getElementById("fc-setup").classList.remove("hidden");
  document.getElementById("fc-view").classList.add("hidden");
  document.getElementById("fc-results").classList.add("hidden");
  document.getElementById("fc-count-hint").textContent = "";
  syncSubFilter("fc-type", "fc-sub");  // сбрасываем подтипы под текущий тип
}

async function loadFlashCards() {
  const jlpt = document.getElementById("fc-jlpt").value;
  const type = document.getElementById("fc-type").value;
  const sub  = document.getElementById("fc-sub").value;
  const prog = document.getElementById("fc-prog").value;

  let url = "/words/?limit=500";
  if (jlpt) url += `&jlpt_level=${jlpt}`;
  if (type) url += `&word_type=${encodeURIComponent(type)}`;
  if (sub)  url += `&subcategory=${encodeURIComponent(sub)}`;
  if (prog === "favorite")  url += "&favorite=1";
  if (prog === "learned")   url += "&learned=1";
  if (prog === "unlearned") url += "&learned=0";

  const hint = document.getElementById("fc-count-hint");
  hint.textContent = "Загрузка…";

  try {
    const data = await api(url);
    if (!data || !data.length) {
      hint.textContent = "Нет слов по выбранным фильтрам";
      return;
    }

    // Shuffle, take up to 20
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    _fcDeck  = shuffled.slice(0, 20);
    _fcIndex = 0;
    _fcDone  = new Array(_fcDeck.length).fill(null);

    hint.textContent = data.length > 20
      ? `Найдено ${data.length} слов → выбрано 20 случайных`
      : `Найдено ${data.length} слов`;

    // Transition to card view
    document.getElementById("fc-setup").classList.add("hidden");
    document.getElementById("fc-results").classList.add("hidden");
    document.getElementById("fc-view").classList.remove("hidden");
    document.getElementById("fc-prev").disabled = true;  // первая карточка — назад нет
    renderFcCard();
  } catch(e) {
    hint.textContent = "Ошибка: " + e.message;
  }
}

function renderFcCard() {
  const w = _fcDeck[_fcIndex];

  // Reset flip to front
  document.getElementById("fc-card-inner").classList.remove("flipped");

  // Counter
  document.getElementById("fc-counter").textContent = `${_fcIndex + 1} / ${_fcDeck.length}`;

  // JLPT badge on front
  document.getElementById("fc-f-jlpt").textContent    = w.jlpt_level ? `N${w.jlpt_level}` : "";
  document.getElementById("fc-f-word").textContent    = w.word    || "";
  document.getElementById("fc-f-reading").textContent = w.reading || "";
  document.getElementById("fc-f-romanji").textContent = w.romanji || "";

  // Back
  document.getElementById("fc-b-word").textContent        = w.word        || "";
  document.getElementById("fc-b-translation").textContent = w.translation || "";
  document.getElementById("fc-b-desc").textContent        = (w.description || "").slice(0, 120);

  renderFcDots();

  // Update ✓ button label based on learned status
  const learned = wProg(w.id).learned;
  const rightBtn = document.getElementById("fc-right");
  rightBtn.classList.toggle("fc-right-done", !!learned);
  rightBtn.title = learned ? "Уже изучено" : "Знаю — отметить изученным (→)";
}

function renderFcDots() {
  const container = document.getElementById("fc-dots");
  container.innerHTML = _fcDone.map((v, i) => {
    let cls = "fc-dot";
    if (i === _fcIndex)  cls += " fc-dot-active";
    else if (v === true)  cls += " fc-dot-ok";
    else if (v === false) cls += " fc-dot-skip";
    return `<span class="${cls}"></span>`;
  }).join("");
}

function fcFlip() {
  document.getElementById("fc-card-inner").classList.toggle("flipped");
}

function fcNavigate(delta) {
  const next = _fcIndex + delta;
  if (next < 0) return;                         // первая карточка — назад нельзя
  if (next >= _fcDeck.length) { showFcResults(); return; }  // конец → результаты
  _fcIndex = next;
  renderFcCard();
  // Обновляем доступность стрелок
  document.getElementById("fc-prev").disabled = (_fcIndex === 0);
}

async function fcAnswer(correct) {
  _fcDone[_fcIndex] = correct;

  if (correct && _currentUser) {
    const w = _fcDeck[_fcIndex];
    _progressMap[w.id] = { ...wProg(w.id), learned: 1 };
    api(`/progress/words/${w.id}`, "PUT", { learned: 1 }).catch(() => {});
  }

  if (_fcIndex >= _fcDeck.length - 1) {
    showFcResults();
  } else {
    _fcIndex++;
    renderFcCard();
    document.getElementById("fc-prev").disabled = (_fcIndex === 0);
  }
}

function showFcResults() {
  document.getElementById("fc-view").classList.add("hidden");
  const res = document.getElementById("fc-results");
  res.classList.remove("hidden");

  const correct = _fcDone.filter(v => v === true).length;
  const wrong   = _fcDone.filter(v => v === false).length;
  const skipped = _fcDone.filter(v => v === null).length;

  document.getElementById("fc-results-summary").innerHTML =
    `<div class="fcr-stat fcr-ok">✓ Правильно <b>${correct}</b></div>` +
    `<div class="fcr-stat fcr-err">✕ Неправильно <b>${wrong}</b></div>` +
    (skipped ? `<div class="fcr-stat fcr-skip">— Пропущено <b>${skipped}</b></div>` : "");

  document.getElementById("fc-results-list").innerHTML = _fcDeck.map((w, i) => {
    const s    = _fcDone[i];
    const cls  = s === true ? "fcr-item-ok" : s === false ? "fcr-item-err" : "fcr-item-skip";
    const icon = s === true ? "✓"           : s === false ? "✕"            : "—";
    return `<div class="fcr-item ${cls}">
      <span class="fcr-icon">${icon}</span>
      <span class="fcr-word">${w.word || ""}</span>
      <span class="fcr-reading">${w.reading || ""}</span>
      <span class="fcr-trans">${w.translation || ""}</span>
    </div>`;
  }).join("");
}

// Bind flash card UI events
document.getElementById("fc-card").addEventListener("click",     fcFlip);
document.getElementById("fc-prev").addEventListener("click",     () => fcNavigate(-1));
document.getElementById("fc-next").addEventListener("click",     () => fcNavigate(1));
document.getElementById("fc-wrong").addEventListener("click",    () => fcAnswer(false));
document.getElementById("fc-right").addEventListener("click",    () => fcAnswer(true));
document.getElementById("fc-start-btn").addEventListener("click", loadFlashCards);
document.getElementById("fc-back-btn").addEventListener("click",  () => navigate("dashboard"));
document.getElementById("fc-type").addEventListener("change", () => syncSubFilter("fc-type", "fc-sub"));
document.getElementById("fc-reset-btn").addEventListener("click", () => {
  document.getElementById("fc-setup").classList.remove("hidden");
  document.getElementById("fc-view").classList.add("hidden");
});
document.getElementById("fc-results-home").addEventListener("click",  () => navigate("dashboard"));
document.getElementById("fc-results-retry").addEventListener("click", () => {
  // Перезапуск с той же колодой
  _fcIndex = 0;
  _fcDone  = new Array(_fcDeck.length).fill(null);
  document.getElementById("fc-results").classList.add("hidden");
  document.getElementById("fc-view").classList.remove("hidden");
  document.getElementById("fc-prev").disabled = true;
  renderFcCard();
});

// Keyboard shortcuts while flash cards are active
document.addEventListener("keydown", e => {
  if (!document.getElementById("sec-flashcards").classList.contains("active")) return;
  if (document.getElementById("fc-view").classList.contains("hidden")) return;
  if (e.key === "ArrowLeft")                    fcNavigate(-1);
  else if (e.key === "ArrowRight")              fcNavigate(1);
  else if (e.key === " " || e.key === "Enter")  { e.preventDefault(); fcFlip(); }
  else if (e.key === "ArrowDown" || e.key === "x" || e.key === "X") fcAnswer(false);
  else if (e.key === "ArrowUp"   || e.key === "c" || e.key === "C") fcAnswer(true);
});

/* ═══════════════════════════════════════════════════════════
   Quiz Mode
═══════════════════════════════════════════════════════════ */
let _qzDeck  = [];
let _qzIndex = 0;
let _qzDone  = [];     // null | true | false
let _qzDir   = "jp_ru"; // "jp_ru" | "ru_jp"

function enterQuiz() {
  navigate("quiz");
  document.getElementById("qz-setup").classList.remove("hidden");
  document.getElementById("qz-view").classList.add("hidden");
  document.getElementById("qz-results").classList.add("hidden");
  document.getElementById("qz-count-hint").textContent = "";
  syncSubFilter("qz-type", "qz-sub");
}

async function loadQuiz() {
  const jlpt = document.getElementById("qz-jlpt").value;
  const type = document.getElementById("qz-type").value;
  const sub  = document.getElementById("qz-sub").value;
  const prog = document.getElementById("qz-prog").value;
  _qzDir     = document.getElementById("qz-dir").value;

  let url = "/words/?limit=500";
  if (jlpt) url += `&jlpt_level=${jlpt}`;
  if (type) url += `&word_type=${encodeURIComponent(type)}`;
  if (sub)  url += `&subcategory=${encodeURIComponent(sub)}`;
  if (prog === "favorite")  url += "&favorite=1";
  if (prog === "learned")   url += "&learned=1";
  if (prog === "unlearned") url += "&learned=0";

  const hint = document.getElementById("qz-count-hint");
  hint.textContent = "Загрузка…";

  try {
    const data = await api(url);
    if (!data || data.length < 4) {
      hint.textContent = "Нужно минимум 4 слова для теста. Измените фильтры.";
      return;
    }

    const shuffled = [...data].sort(() => Math.random() - 0.5);
    _qzDeck  = shuffled.slice(0, 20);
    _qzIndex = 0;
    _qzDone  = new Array(_qzDeck.length).fill(null);

    hint.textContent = data.length > 20
      ? `Найдено ${data.length} слов → выбрано 20 случайных`
      : `Найдено ${data.length} слов`;

    document.getElementById("qz-setup").classList.add("hidden");
    document.getElementById("qz-results").classList.add("hidden");
    document.getElementById("qz-view").classList.remove("hidden");
    renderQzQuestion();
  } catch(e) {
    hint.textContent = "Ошибка: " + e.message;
  }
}

function renderQzQuestion() {
  const w = _qzDeck[_qzIndex];
  document.getElementById("qz-counter").textContent = `${_qzIndex + 1} / ${_qzDeck.length}`;

  if (_qzDir === "jp_ru") {
    document.getElementById("qz-q-label").textContent   = "Как переводится?";
    document.getElementById("qz-q-word").textContent    = w.word || "";
    document.getElementById("qz-q-reading").textContent = w.reading || "";
  } else {
    document.getElementById("qz-q-label").textContent   = "Как будет по-японски?";
    document.getElementById("qz-q-word").textContent    = w.translation || "";
    document.getElementById("qz-q-reading").textContent = "";
  }

  // 1 верный + 3 случайных из колоды
  const correctVal = _qzDir === "jp_ru" ? (w.translation || "") : (w.word || "");
  const pool = _qzDeck.filter((_, i) => i !== _qzIndex).sort(() => Math.random() - 0.5).slice(0, 3);
  const wrongs = pool.map(x => _qzDir === "jp_ru" ? (x.translation || "") : (x.word || ""));
  const opts = [correctVal, ...wrongs].sort(() => Math.random() - 0.5);

  const container = document.getElementById("qz-options");
  container.innerHTML = opts.map((opt, i) => {
    const isCorrect = opt === correctVal;
    return `<button class="qz-option" data-correct="${isCorrect}">
      <span class="qz-num">${i + 1}</span>
      <span class="qz-text">${esc(opt)}</span>
    </button>`;
  }).join("");

  container.querySelectorAll(".qz-option").forEach(btn =>
    btn.addEventListener("click", () => qzAnswer(btn.dataset.correct === "true", btn))
  );

  const ns = document.getElementById("qz-not-sure");
  ns.disabled = false;
  renderQzDots();
}

function renderQzDots() {
  document.getElementById("qz-dots").innerHTML = _qzDone.map((v, i) => {
    let cls = "fc-dot";
    if (i === _qzIndex)  cls += " fc-dot-active";
    else if (v === true)  cls += " fc-dot-ok";
    else if (v === false) cls += " fc-dot-skip";
    return `<span class="${cls}"></span>`;
  }).join("");
}

function qzRevealAll(wrongBtn) {
  document.querySelectorAll(".qz-option").forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.correct === "true") btn.classList.add("qz-opt-correct");
    else if (btn === wrongBtn)          btn.classList.add("qz-opt-wrong");
  });
  document.getElementById("qz-not-sure").disabled = true;
}

async function qzAnswer(correct, clickedBtn) {
  qzRevealAll(correct ? null : clickedBtn);
  _qzDone[_qzIndex] = correct;
  renderQzDots();

  if (correct && _currentUser) {
    const w = _qzDeck[_qzIndex];
    _progressMap[w.id] = { ...wProg(w.id), learned: 1 };
    api(`/progress/words/${w.id}`, "PUT", { learned: 1 }).catch(() => {});
  }

  setTimeout(() => {
    if (_qzIndex >= _qzDeck.length - 1) showQzResults();
    else { _qzIndex++; renderQzQuestion(); }
  }, 900);
}

function showQzResults() {
  document.getElementById("qz-view").classList.add("hidden");
  document.getElementById("qz-results").classList.remove("hidden");

  const correct = _qzDone.filter(v => v === true).length;
  const wrong   = _qzDone.filter(v => v === false).length;
  const skipped = _qzDone.filter(v => v === null).length;

  document.getElementById("qz-results-summary").innerHTML =
    `<div class="fcr-stat fcr-ok">✓ Правильно <b>${correct}</b></div>` +
    `<div class="fcr-stat fcr-err">✕ Неправильно <b>${wrong}</b></div>` +
    (skipped ? `<div class="fcr-stat fcr-skip">— Пропущено <b>${skipped}</b></div>` : "");

  document.getElementById("qz-results-list").innerHTML = _qzDeck.map((w, i) => {
    const s    = _qzDone[i];
    const cls  = s === true ? "fcr-item-ok" : s === false ? "fcr-item-err" : "fcr-item-skip";
    const icon = s === true ? "✓" : s === false ? "✕" : "—";
    return `<div class="fcr-item ${cls}">
      <span class="fcr-icon">${icon}</span>
      <span class="fcr-word">${esc(w.word || "")}</span>
      <span class="fcr-reading">${esc(w.reading || "")}</span>
      <span class="fcr-trans">${esc(w.translation || "")}</span>
    </div>`;
  }).join("");
}

// ── Quiz UI bindings ──
document.getElementById("qz-start-btn").addEventListener("click", loadQuiz);
document.getElementById("qz-back-btn").addEventListener("click",  () => navigate("dashboard"));
document.getElementById("qz-reset-btn").addEventListener("click", () => {
  document.getElementById("qz-setup").classList.remove("hidden");
  document.getElementById("qz-view").classList.add("hidden");
});
document.getElementById("qz-results-home").addEventListener("click",  () => navigate("dashboard"));
document.getElementById("qz-results-retry").addEventListener("click", () => {
  _qzIndex = 0;
  _qzDone  = new Array(_qzDeck.length).fill(null);
  document.getElementById("qz-results").classList.add("hidden");
  document.getElementById("qz-view").classList.remove("hidden");
  renderQzQuestion();
});
document.getElementById("qz-not-sure").addEventListener("click", () => {
  _qzDone[_qzIndex] = false;
  qzRevealAll(null);
  renderQzDots();
  setTimeout(() => {
    if (_qzIndex >= _qzDeck.length - 1) showQzResults();
    else { _qzIndex++; renderQzQuestion(); }
  }, 1200);
});
document.getElementById("qz-type").addEventListener("change", () => syncSubFilter("qz-type", "qz-sub"));

// Клавиши 1-4 выбирают вариант
document.addEventListener("keydown", e => {
  if (!document.getElementById("sec-quiz").classList.contains("active")) return;
  if (document.getElementById("qz-view").classList.contains("hidden")) return;
  const n = parseInt(e.key);
  if (n >= 1 && n <= 4) {
    const opts = [...document.querySelectorAll(".qz-option:not(:disabled)")];
    if (opts[n - 1]) opts[n - 1].click();
  }
});

/* ═══════════════════════════════════════════════════════════
   Pill filter wiring
═══════════════════════════════════════════════════════════ */
['words', 'kanji', 'rules'].forEach(section => {
  const secEl = document.getElementById(`sec-${section}`);
  if (!secEl) return;

  // JLPT pills
  secEl.querySelectorAll('.pill-btn[data-jlpt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const jlptSel = document.getElementById(`${section}-jlpt-filter`);
      const wasOn = btn.classList.contains('on');
      secEl.querySelectorAll('.pill-btn[data-jlpt]').forEach(b => b.classList.remove('on'));
      if (!wasOn) {
        btn.classList.add('on');
        if (jlptSel) jlptSel.value = btn.dataset.jlpt;
      } else {
        if (jlptSel) jlptSel.value = '';
      }
      const loadBtn = document.getElementById(`${section}-load`);
      if (loadBtn) loadBtn.click();
    });
  });

  // Progress pills
  const learnedPill = document.getElementById(`${section}-pill-learned`);
  const favPill     = document.getElementById(`${section}-pill-fav`);
  const progSel     = document.getElementById(`${section}-prog-filter`);

  if (learnedPill) learnedPill.addEventListener('click', () => {
    const wasOn = learnedPill.classList.contains('on');
    learnedPill.classList.toggle('on', !wasOn);
    if (favPill) favPill.classList.remove('on');
    if (progSel) progSel.value = wasOn ? '' : 'learned';
    const loadBtn = document.getElementById(`${section}-load`);
    if (loadBtn) loadBtn.click();
  });

  if (favPill) favPill.addEventListener('click', () => {
    const wasOn = favPill.classList.contains('on');
    favPill.classList.toggle('on', !wasOn);
    if (learnedPill) learnedPill.classList.remove('on');
    if (progSel) progSel.value = wasOn ? '' : 'favorite';
    const loadBtn = document.getElementById(`${section}-load`);
    if (loadBtn) loadBtn.click();
  });
});


// ── Roadmap helpers ──────────────────────────────────────────────────

function rmGetProgress() {
  try { return new Set(JSON.parse(localStorage.getItem("rm_done") || "[]")); }
  catch { return new Set(); }
}

function rmSaveProgress(done) {
  localStorage.setItem("rm_done", JSON.stringify([...done]));
}

function rmIsBlockUnlocked(blockIdx, done) {
  if (blockIdx === 0) return true;
  const prev = ROADMAP[blockIdx - 1];
  return prev.lessons.every(l => done.has(l.id));
}

function rmIsLessonUnlocked(blockIdx, lessonIdx, done) {
  if (!rmIsBlockUnlocked(blockIdx, done)) return false;
  if (lessonIdx === 0) return true;
  const prevLesson = ROADMAP[blockIdx].lessons[lessonIdx - 1];
  return done.has(prevLesson.id);
}

// ── Roadmap render ───────────────────────────────────────────────────

// ── Roadmap progress cache (jp/kanji → db id) ────────────────
const _rmWordIds     = {};
const _rmWordDisplay = {}; // jp → kanji form from DB
const _rmKanjiIds    = {};

async function applyRoadmapProgress(lessonEl) {
  if (!_currentUser) return;
  for (const card of lessonEl.querySelectorAll(".rm-lcard[data-rmjp]")) {
    const jp = card.dataset.rmjp;
    let id = _rmWordIds[jp];
    if (!id) {
      for (const cand of jp.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean)) {
        try {
          const res = await api(`/words/?search=${encodeURIComponent(cand)}&limit=20`);
          const match = res?.find(r => r.word === cand || r.reading === cand);
          if (match) {
            _rmWordIds[jp]     = match.id;
            _rmWordDisplay[jp] = match.word;
            id = match.id;
            break;
          }
        } catch {}
      }
    }
    if (id) {
      const p = wProg(id);
      card.classList.toggle("rm-card-learned", !!p.learned);
      card.classList.toggle("rm-card-fav",     !!p.favorite);
      const disp = _rmWordDisplay[jp];
      if (disp && disp !== jp) {
        const wordEl = card.querySelector(".wc-word");
        if (wordEl) wordEl.textContent = disp;
      }
    }
  }
  for (const card of lessonEl.querySelectorAll(".rm-lcard[data-rmkanji]")) {
    const kanji = card.dataset.rmkanji;
    let id = _rmKanjiIds[kanji];
    if (!id) {
      try {
        const res = await api(`/kanji/?search=${encodeURIComponent(kanji)}&limit=10`);
        const match = res?.find(r => r.character === kanji);
        if (match) { _rmKanjiIds[kanji] = match.id; id = match.id; }
      } catch {}
    }
    if (id) {
      const p = kProg(id);
      card.classList.toggle("rm-card-learned", !!p.learned);
      card.classList.toggle("rm-card-fav",     !!p.favorite);
    }
  }
}

function renderRmWordDetail(w) {
  return `
    <div class="dc-word">${w.jp}</div>
    <div class="dc-translation">${w.ru}</div>`;
}

function renderRmKanjiDetail(k) {
  // Split "に / にち / ひ" → individual readings shown as separate blocks
  const readings = k.read.split(/\s*\/\s*/).map(r => r.trim()).filter(Boolean);
  const readingBlocks = readings.map(r =>
    `<div class="dc-reading-block"><div class="dc-meta-value">${r}</div></div>`
  ).join("");
  return `
    <div class="dc-kanji">${k.kanji}</div>
    <div class="dc-kanji-meaning">${k.mean}</div>
    <div class="dc-kanji-readings">${readingBlocks}</div>`;
}

function renderRoadmap() {
  const container = document.getElementById("rm-blocks");
  if (!container) return;

  // Save open state before re-render
  const openBlocks  = new Set([...container.querySelectorAll(".rm-block.rm-open")].map(b => b.id));
  const openLessons = new Set([...container.querySelectorAll(".rm-lesson.rm-open")].map(l => l.dataset.lid));
  const activeTabs  = {};
  container.querySelectorAll(".rm-lesson.rm-open").forEach(l => {
    const t = l.querySelector(".rm-tab.rm-tab-active");
    if (t) activeTabs[l.dataset.lid] = t.dataset.tab;
  });

  const done = rmGetProgress();
  const totalLessons = ROADMAP.reduce((s, b) => s + b.lessons.length, 0);
  const doneLessons  = [...done].length;

  const fillEl = document.getElementById("rm-overall-fill");
  const pctEl  = document.getElementById("rm-overall-pct");
  if (fillEl) fillEl.style.width = totalLessons ? `${(doneLessons / totalLessons) * 100}%` : "0%";
  if (pctEl)  pctEl.textContent  = `${doneLessons} / ${totalLessons} уроков`;

  container.innerHTML = ROADMAP.map((block, bi) => {
    const unlocked = rmIsBlockUnlocked(bi, done);
    const blockDone = block.lessons.every(l => done.has(l.id));
    const lockedCls = unlocked ? "" : " rm-locked";
    const doneCls   = blockDone ? " rm-block-done" : "";

    const lessonsHtml = block.lessons.map((lesson, li) => {
      const lUnlocked = rmIsLessonUnlocked(bi, li, done);
      const lDone     = done.has(lesson.id);
      const lCurrent  = lUnlocked && !lDone;
      const dotCls    = lDone ? " rm-done" : lCurrent ? " rm-current" : " rm-locked-lesson";

      const rulesHtml = lesson.rules.map(r => `
        <div class="rm-rule">
          <div class="rm-rule-title">${r.title}</div>
          <div class="rm-rule-body">${r.body.replace(/\n/g, "<br>")}</div>
        </div>`).join("");

      const wordsHtml = `
        <div class="word-cards rm-word-cards">${lesson.words.map((w, wi) =>
          `<div class="word-card rm-lcard" style="--i:${wi}" data-rmjp="${w.jp}" data-rmru="${w.ru}">
            <div class="wc-word">${w.jp}</div>
            <div class="wc-translation">${w.ru}</div>
          </div>`
        ).join("")}</div>
        ${lUnlocked ? `<button class="rm-mark-words-btn" data-lid="${lesson.id}" data-state="0">📖 Все слова изучены</button>` : ""}`;

      const kanjiHtml = `
        <div class="kanji-grid rm-kanji-cards">${lesson.kanji.map((k, ki) =>
          `<div class="kanji-card rm-lcard" style="--i:${ki}" data-rmkanji="${k.kanji}" data-rmread="${k.read}" data-rmmean="${k.mean}">
            <div class="kc-char">${k.kanji}</div>
            <div class="kc-meaning">${k.mean}</div>
          </div>`
        ).join("")}</div>
        ${lUnlocked ? `<button class="rm-mark-kanji-btn" data-lid="${lesson.id}" data-state="0">✍ Все кандзи изучены</button>` : ""}`;

      const dialogHtml = `<div class="rm-dialog">${lesson.dialog.map(d =>
        `<div class="rm-dialog-line">
          <span class="rm-who">${d.who}</span>
          <div class="rm-speech">
            <div class="rm-speech-jp">${d.line}</div>
            ${d.tr ? `<div class="rm-speech-tr">${d.tr}</div>` : ""}
          </div>
        </div>`
      ).join("")}</div>`;

      const lessonLockedCls = lUnlocked ? "" : " rm-locked-lesson";
      const completeBtnHtml = lUnlocked && !lDone
        ? `<button class="rm-complete-btn" data-lid="${lesson.id}">✓ Урок пройден</button>`
        : "";

      return `
        <div class="rm-lesson${dotCls}${lessonLockedCls}" data-lid="${lesson.id}">
          <div class="rm-lesson-header">
            <span class="rm-lesson-dot${lDone ? " rm-dot-undo" : ""}" data-lid="${lesson.id}" title="${lDone ? "Отменить выполнение" : ""}"></span>
            <span class="rm-lesson-title">${lesson.title}</span>
            ${lDone ? '<span class="rm-lesson-check">✓</span>' : ""}
          </div>
          <div class="rm-lesson-body">
            <div class="rm-tabs">
              <button class="rm-tab rm-tab-active" data-tab="rules">Правила</button>
              <button class="rm-tab" data-tab="words">Слова</button>
              <button class="rm-tab" data-tab="kanji">Кандзи</button>
              <button class="rm-tab" data-tab="dialog">Диалог</button>
            </div>
            <div class="rm-pane rm-pane-active" data-pane="rules">${rulesHtml}</div>
            <div class="rm-pane" data-pane="words">${wordsHtml}</div>
            <div class="rm-pane" data-pane="kanji">${kanjiHtml}</div>
            <div class="rm-pane" data-pane="dialog">${dialogHtml}</div>
            <div class="rm-lesson-actions">${completeBtnHtml}</div>
          </div>
        </div>`;
    }).join("");

    return `
      <div class="rm-block${lockedCls}${doneCls}" id="rmb-${block.id}">
        <div class="rm-block-header" data-bid="${block.id}">
          <div class="rm-block-title-wrap">
            <span class="rm-block-num">Блок ${bi + 1}</span>
            <span class="rm-block-title">${block.title.replace(/^Блок \d+ — /, "")}</span>
            <span class="rm-block-sub">${block.subtitle}</span>
          </div>
          <span class="rm-block-chevron">▾</span>
        </div>
        <div class="rm-block-body">${lessonsHtml}</div>
      </div>`;
  }).join("");

  // Restore open state
  openBlocks.forEach(id => container.querySelector(`#${id}`)?.classList.add("rm-open"));
  openLessons.forEach(lid => {
    const el = container.querySelector(`.rm-lesson[data-lid="${lid}"]`);
    if (!el) return;
    el.classList.add("rm-open");
    const tab = activeTabs[lid];
    if (tab) {
      el.querySelectorAll(".rm-tab").forEach(t => t.classList.toggle("rm-tab-active", t.dataset.tab === tab));
      el.querySelectorAll(".rm-pane").forEach(p => p.classList.toggle("rm-pane-active", p.dataset.pane === tab));
    }
    applyRoadmapProgress(el);
  });

  bindRoadmapEvents();
}

function bindRoadmapEvents() {
  const container = document.getElementById("rm-blocks");
  if (!container) return;

  // Block accordion toggle
  container.querySelectorAll(".rm-block-header").forEach(hdr => {
    hdr.addEventListener("click", () => {
      const block = hdr.closest(".rm-block");
      if (block.classList.contains("rm-locked")) return;
      block.classList.toggle("rm-open");
    });
  });

  // Lesson accordion toggle
  container.querySelectorAll(".rm-lesson-header").forEach(hdr => {
    hdr.addEventListener("click", () => {
      const lesson = hdr.closest(".rm-lesson");
      if (lesson.classList.contains("rm-locked-lesson")) return;
      lesson.classList.toggle("rm-open");
      if (lesson.classList.contains("rm-open")) applyRoadmapProgress(lesson);
    });
  });

  // Tab switching
  container.querySelectorAll(".rm-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const lesson = tab.closest(".rm-lesson-body");
      lesson.querySelectorAll(".rm-tab").forEach(t => t.classList.remove("rm-tab-active"));
      lesson.querySelectorAll(".rm-pane").forEach(p => p.classList.remove("rm-pane-active"));
      tab.classList.add("rm-tab-active");
      lesson.querySelector(`.rm-pane[data-pane="${tab.dataset.tab}"]`)?.classList.add("rm-pane-active");
    });
  });

  // Word / kanji detail modal — fetch full DB record, cache ID for progress
  container.querySelectorAll(".rm-lcard[data-rmjp]").forEach(card => {
    card.addEventListener("click", async e => {
      e.stopPropagation();
      const jp = card.dataset.rmjp;
      const ru = card.dataset.rmru;
      const candidates = jp.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
      try {
        for (const cand of candidates) {
          const results = await api(`/words/?search=${encodeURIComponent(cand)}&limit=20`);
          const match = results?.find(w => w.word === cand || w.reading === cand);
          if (match) { _rmWordIds[jp] = match.id; openDetail(renderWordDetail(match), "word-detail"); return; }
        }
      } catch {}
      openDetail(renderRmWordDetail({ jp, ru }), "word-detail");
    });
  });
  container.querySelectorAll(".rm-lcard[data-rmkanji]").forEach(card => {
    card.addEventListener("click", async e => {
      e.stopPropagation();
      const kanji = card.dataset.rmkanji;
      const read  = card.dataset.rmread;
      const mean  = card.dataset.rmmean;
      try {
        const results = await api(`/kanji/?search=${encodeURIComponent(kanji)}&limit=10`);
        const match = results?.find(k => k.character === kanji);
        if (match) { _rmKanjiIds[kanji] = match.id; openDetail(renderKanjiDetail(match), "kanji-detail"); return; }
      } catch {}
      openDetail(renderRmKanjiDetail({ kanji, read, mean }), "kanji-detail");
    });
  });

  // Complete button
  container.querySelectorAll(".rm-complete-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const done = rmGetProgress();
      done.add(btn.dataset.lid);
      rmSaveProgress(done);
      renderRoadmap();
    });
  });

  // Undo via green dot click
  container.querySelectorAll(".rm-dot-undo").forEach(dot => {
    dot.addEventListener("click", e => {
      e.stopPropagation();
      const done = rmGetProgress();
      done.delete(dot.dataset.lid);
      rmSaveProgress(done);
      renderRoadmap();
    });
  });

  // Mark all words as learned / unlearned (toggle)
  container.querySelectorAll(".rm-mark-words-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!_currentUser) { openAuthModal(); return; }
      const lid = btn.dataset.lid;
      const learnVal = btn.dataset.state === "1" ? 0 : 1;
      let lesson = null;
      for (const block of ROADMAP) { lesson = block.lessons.find(l => l.id === lid); if (lesson) break; }
      if (!lesson) return;
      btn.disabled = true; btn.textContent = "⌛ Сохраняю...";
      for (const w of lesson.words) {
        for (const cand of w.jp.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean)) {
          try {
            const res = await api(`/words/?search=${encodeURIComponent(cand)}&limit=20`);
            const match = res?.find(r => r.word === cand || r.reading === cand);
            if (match) {
              _rmWordIds[w.jp] = match.id;
              _progressMap[match.id] = { ...wProg(match.id), learned: learnVal };
              await api(`/progress/words/${match.id}`, "PUT", { learned: learnVal });
              break;
            }
          } catch {}
        }
      }
      btn.dataset.state = String(learnVal);
      btn.textContent = learnVal ? "↩ Снять изучение (слова)" : "📖 Все слова изучены";
      btn.disabled = false;
      applyRoadmapProgress(btn.closest(".rm-lesson"));
    });
  });

  // Mark all kanji as learned / unlearned (toggle)
  container.querySelectorAll(".rm-mark-kanji-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!_currentUser) { openAuthModal(); return; }
      const lid = btn.dataset.lid;
      const learnVal = btn.dataset.state === "1" ? 0 : 1;
      let lesson = null;
      for (const block of ROADMAP) { lesson = block.lessons.find(l => l.id === lid); if (lesson) break; }
      if (!lesson) return;
      btn.disabled = true; btn.textContent = "⌛ Сохраняю...";
      for (const k of lesson.kanji) {
        try {
          const res = await api(`/kanji/?search=${encodeURIComponent(k.kanji)}&limit=10`);
          const match = res?.find(r => r.character === k.kanji);
          if (match) {
            _rmKanjiIds[k.kanji] = match.id;
            _kanjiProgress[match.id] = { ...kProg(match.id), learned: learnVal };
            await api(`/progress/kanji/${match.id}`, "PUT", { learned: learnVal });
          }
        } catch {}
      }
      btn.dataset.state = String(learnVal);
      btn.textContent = learnVal ? "↩ Снять изучение (кандзи)" : "✍ Все кандзи изучены";
      btn.disabled = false;
      applyRoadmapProgress(btn.closest(".rm-lesson"));
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   Boot
═══════════════════════════════════════════════════════════ */

// Theme buttons — sync active state and bind clicks
applyTheme(localStorage.getItem("theme") || "dark");
document.getElementById("theme-dark-btn")?.addEventListener("click", () => applyTheme("dark"));
document.getElementById("theme-light-btn")?.addEventListener("click", () => applyTheme("light"));

loadDashboard();
// Инициализируем каскадные фильтры при старте
syncSubFilter("words-type-filter", "words-sub-filter");
syncSubFilter("fc-type", "fc-sub");
syncSubFilter("qz-type", "qz-sub");