"use strict";
const API = "/api";

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
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
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
   Navigation
═══════════════════════════════════════════════════════════ */
const sections = {
  dashboard: "Обзор",
  words:     "Слова",
  kanji:     "Кандзи",
  rules:     "Грамматика",
  import:    "Импорт",
};

function navigate(id) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.section === id));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "sec-" + id));
  document.getElementById("topbar-title").textContent = sections[id] ?? id;
  if (id === "dashboard") loadDashboard();
  if (id === "words")     loadWords();
  if (id === "kanji")     loadKanji();
  if (id === "rules")     loadRules();
  document.getElementById("sidebar").classList.remove("open");
}

document.querySelectorAll(".nav-item").forEach(n =>
  n.addEventListener("click", e => { e.preventDefault(); navigate(n.dataset.section); })
);

// stat cards also navigate
document.querySelectorAll(".stat-card").forEach(c =>
  c.addEventListener("click", () => navigate(c.dataset.section))
);

// burger
document.getElementById("burger").addEventListener("click", () =>
  document.getElementById("sidebar").classList.toggle("open")
);
document.addEventListener("click", e => {
  const sb = document.getElementById("sidebar");
  if (!sb.contains(e.target) && !document.getElementById("burger").contains(e.target))
    sb.classList.remove("open");
});

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
      const pct = Math.max(4, (cnt / maxCnt) * 80);
      return `<div class="jlpt-bar-wrap">
        <div class="jlpt-bar-cnt">${cnt}</div>
        <div class="jlpt-bar" style="height:${pct}px"></div>
        <div class="jlpt-bar-label">N${lvl}</div>
      </div>`;
    }).join("");

    // Recent words
    document.getElementById("recent-words").innerHTML = words.length
      ? words.map(renderWordCard).join("")
      : `<p class="empty">Слов пока нет — добавьте первые!</p>`;
    bindWordDeletes(document.getElementById("recent-words"), loadDashboard);
  } catch (e) {
    console.error(e);
  }
}

/* ═══════════════════════════════════════════════════════════
   Words
═══════════════════════════════════════════════════════════ */
let wordsOffset = 0;
const WORDS_PER_PAGE = 24;

async function loadWords(offset = 0) {
  wordsOffset = offset;
  const jlpt   = document.getElementById("words-jlpt-filter").value;
  const wtype  = document.getElementById("words-type-filter").value;
  const wsub   = document.getElementById("words-sub-filter").value;
  const wfreq  = document.getElementById("words-freq-filter")?.value ?? "";
  const search = document.getElementById("words-search").value.trim();
  let url = `/words/?limit=${WORDS_PER_PAGE}&offset=${offset}`;
  if (jlpt)   url += `&jlpt_level=${jlpt}`;
  if (wtype)  url += `&word_type=${encodeURIComponent(wtype)}`;
  if (wsub)   url += `&subcategory=${encodeURIComponent(wsub)}`;
  if (wfreq)  url += `&frequency=${encodeURIComponent(wfreq)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  try {
    const data = await api(url);
    const grid = document.getElementById("words-grid");
    grid.innerHTML = data.length
      ? data.map(renderWordCard).join("")
      : `<p class="empty">Ничего не найдено</p>`;
    bindWordDeletes(grid, () => loadWords(wordsOffset));
    renderPagination(data.length, offset, WORDS_PER_PAGE, loadWords);
  } catch(e) {
    document.getElementById("words-grid").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

// ── Справочники меток ─────────────────────────────────────────────────────────
const TYPE_LABELS = {
  "noun":"сущ.", "verb":"глаг.", "i_adj":"い-прил.", "na_adj":"な-прил.",
  "adverb":"нар.", "expression":"выр.", "particle":"частица",
  "conjunction":"союз", "counter":"счётн.", "pronoun":"мест.",
  // старые варианты с дефисом (обратная совместимость)
  "i-adj":"い-прил.", "na-adj":"な-прил.",
};
const SUB_LABELS = {
  "place":"место","food":"еда","drink":"напиток","person":"человек",
  "family":"семья","time":"время","weather":"погода","nature":"природа",
  "object":"предмет","body":"тело","abstract":"абстр.","transport":"транспорт",
  "building":"здание","clothing":"одежда","money":"деньги","animal":"животное",
  "plant":"растение","number":"число","color":"цвет","direction":"направление",
  "emotion":"эмоция","work":"работа",
  // verb subcategories
  "motion":"движение","state":"состояние","action":"действие","speech":"речь",
  "perception":"восприятие","giving_receiving":"давать/получать",
  "existence":"существование","change":"изменение","creation":"создание",
  // adj subcategories
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
  if (t === "noun")                          return "badge-noun";
  if (t === "verb")                          return "badge-verb";
  if (t === "i_adj" || t === "na_adj" || t === "i-adj" || t === "na-adj") return "badge-adj";
  if (t === "adverb")                        return "badge-adverb";
  if (t === "expression")                    return "badge-expression";
  return "badge-other";
}

function renderWordCard(w) {
  _wCache[w.id] = w;
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
  return `<div class="word-card" data-wid="${w.id}">
    <button class="wc-del" data-id="${w.id}" title="Удалить">✕</button>
    <div class="wc-word">${esc(w.word)}</div>
    ${w.reading ? `<div class="wc-reading">${esc(w.reading)}</div>` : ""}
    ${w.romanji ? `<div class="wc-romanji">${esc(w.romanji)}</div>` : ""}
    <div class="wc-translation">${esc(w.translation)}</div>
    ${descSnippet}
    ${w.example_sentence ? `<div class="wc-example">${esc(w.example_sentence)}</div>` : ""}
    <div class="wc-footer">${jlpt}${typeBadge}${freqBadge}${subBadge}${tags}</div>
  </div>`;
}

function bindWordDeletes(container, onDelete) {
  container.querySelectorAll(".wc-del").forEach(btn =>
    btn.addEventListener("click", async () => {
      if (!confirm("Удалить слово?")) return;
      try { await api(`/words/${btn.dataset.id}`, "DELETE"); onDelete(); }
      catch(e) { alert(e.message); }
    })
  );
}

document.getElementById("words-load").addEventListener("click", () => loadWords(0));
document.getElementById("words-search").addEventListener("keydown", e => {
  if (e.key === "Enter") loadWords(0);
});
document.getElementById("words-jlpt-filter").addEventListener("change", () => loadWords(0));
document.getElementById("words-type-filter").addEventListener("change", () => loadWords(0));
document.getElementById("words-sub-filter").addEventListener("change",  () => loadWords(0));
document.getElementById("words-freq-filter")?.addEventListener("change", () => loadWords(0));

/* ═══════════════════════════════════════════════════════════
   Kanji
═══════════════════════════════════════════════════════════ */
async function loadKanji(offset = 0) {
  const jlpt = document.getElementById("kanji-jlpt-filter").value;
  let url = `/kanji/?limit=60&offset=${offset}`;
  if (jlpt) url += `&jlpt_level=${jlpt}`;
  try {
    const data = await api(url);
    const grid = document.getElementById("kanji-grid");
    grid.innerHTML = data.length
      ? data.map(renderKanjiCard).join("")
      : `<p class="empty">Кандзи не найдено</p>`;
    bindKanjiDeletes(grid, loadKanji);
  } catch(e) {
    document.getElementById("kanji-grid").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

function renderKanjiCard(k) {
  _kCache[k.id] = k;
  const on  = k.onyomi?.join("、") ?? "";
  const kun = k.kunyomi?.join("、") ?? "";
  const jlpt = k.jlpt_level ? `<span class="badge badge-jlpt">N${k.jlpt_level}</span>` : "";
  return `<div class="kanji-card" data-kid="${k.id}">
    <button class="kc-del" data-id="${k.id}" title="Удалить">✕</button>
    <div class="kc-char">${esc(k.character)}</div>
    <div class="kc-meaning">${esc(k.meaning)}</div>
    <div class="kc-readings">
      ${on  ? `音: ${esc(on)}<br/>` : ""}
      ${kun ? `訓: ${esc(kun)}` : ""}
    </div>
    <div style="margin-top:8px">${jlpt}</div>
  </div>`;
}

function bindKanjiDeletes(container, onDelete) {
  container.querySelectorAll(".kc-del").forEach(btn =>
    btn.addEventListener("click", async () => {
      if (!confirm("Удалить кандзи?")) return;
      try { await api(`/kanji/${btn.dataset.id}`, "DELETE"); onDelete(); }
      catch(e) { alert(e.message); }
    })
  );
}

document.getElementById("kanji-load").addEventListener("click", () => loadKanji(0));

/* ═══════════════════════════════════════════════════════════
   Rules
═══════════════════════════════════════════════════════════ */
async function loadRules() {
  const jlpt = document.getElementById("rules-jlpt-filter").value;
  let url = `/rules/?limit=100`;
  if (jlpt) url += `&jlpt_level=${jlpt}`;
  try {
    const data = await api(url);
    const list = document.getElementById("rules-list");
    list.innerHTML = data.length
      ? data.map(r => {
          _rCache[r.id] = r;
          return `<div class="rule-card" data-rid="${r.id}">
            <button class="rc-del" data-id="${r.id}" title="Удалить">✕</button>
            <div class="rc-title">${esc(r.title)}</div>
            <div class="rc-body">${esc(r.body)}</div>
            <div class="rc-footer">
              ${r.jlpt_level ? `<span class="badge badge-jlpt">N${r.jlpt_level}</span>` : ""}
              ${r.category   ? `<span class="badge">${esc(r.category)}</span>` : ""}
            </div>
          </div>`;
        }).join("")
      : `<p class="empty">Правил не найдено</p>`;
    list.querySelectorAll(".rc-del").forEach(btn =>
      btn.addEventListener("click", async () => {
        if (!confirm("Удалить правило?")) return;
        try { await api(`/rules/${btn.dataset.id}`, "DELETE"); loadRules(); }
        catch(e) { alert(e.message); }
      })
    );
  } catch(e) {
    document.getElementById("rules-list").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

document.getElementById("rules-load").addEventListener("click", loadRules);

/* ═══════════════════════════════════════════════════════════
   Pagination helper
═══════════════════════════════════════════════════════════ */
function renderPagination(count, offset, perPage, loadFn) {
  const wrap = document.getElementById("words-pagination");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (offset > 0) {
    const prev = document.createElement("button");
    prev.className = "pg-btn";
    prev.textContent = "← Назад";
    prev.addEventListener("click", () => loadFn(offset - perPage));
    wrap.appendChild(prev);
  }
  if (count === perPage) {
    const next = document.createElement("button");
    next.className = "pg-btn";
    next.textContent = "Далее →";
    next.addEventListener("click", () => loadFn(offset + perPage));
    wrap.appendChild(next);
  }
}

/* ═══════════════════════════════════════════════════════════
   Modal (add forms)
═══════════════════════════════════════════════════════════ */
const overlay = document.getElementById("modal-overlay");

document.getElementById("add-btn").addEventListener("click",   () => overlay.classList.add("open"));
document.getElementById("modal-close").addEventListener("click", () => overlay.classList.remove("open"));
overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.remove("open"); });
document.addEventListener("keydown", e => { if (e.key === "Escape") overlay.classList.remove("open"); });

// Switch form type tabs
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

// Word form
document.getElementById("word-form").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const st = document.getElementById("word-form-status");
  try {
    await api("/words/", "POST", {
      word: fd.word, reading: fd.reading||null, romanji: fd.romanji||null,
      translation: fd.translation, example_sentence: fd.example_sentence||null,
      jlpt_level: intOrNull(fd.jlpt_level), tags: parseTags(fd.tags),
      word_type:   fd.word_type   || null,
      verb_group:  fd.verb_group  || null,
    });
    setFormStatus(st, "✓ Добавлено!", true);
    e.target.reset();
  } catch(err) { setFormStatus(st, err.message, false); }
});

// Kanji form
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

// Rule form
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
   Batch Import
═══════════════════════════════════════════════════════════ */
document.getElementById("words-import-btn").addEventListener("click", async () => {
  const raw = document.getElementById("words-import-area").value.trim();
  const st  = document.getElementById("words-import-status");
  if (!raw) return setStatus(st, "Введите данные", false);

  const words = raw.split("\n")
    .map(line => {
      const [word="", reading="", romanji="", translation="",
             example_sentence="", jlpt_raw="", tags_raw=""] =
        line.split("|").map(s => s.trim());
      return {
        word, reading: reading||null, romanji: romanji||null,
        translation: translation || word,
        example_sentence: example_sentence||null,
        jlpt_level: intOrNull(jlpt_raw),
        tags: parseTags(tags_raw),
      };
    })
    .filter(w => w.word);

  if (!words.length) return setStatus(st, "Нет валидных строк", false);

  try {
    const res = await api("/words/batch", "POST", { words });
    setStatus(st, `✓ Добавлено ${res.length} слов`, true);
    document.getElementById("words-import-area").value = "";
  } catch(e) { setStatus(st, e.message, false); }
});

document.getElementById("kanji-import-btn").addEventListener("click", async () => {
  const raw = document.getElementById("kanji-import-area").value.trim();
  const st  = document.getElementById("kanji-import-status");
  if (!raw) return setStatus(st, "Введите данные", false);

  const kanji = raw.split("\n")
    .map(line => {
      const [character="", onyomi_raw="", kunyomi_raw="", meaning="", jlpt_raw=""] =
        line.split("|").map(s => s.trim());
      return {
        character, meaning: meaning||character,
        onyomi:  parseTags(onyomi_raw),
        kunyomi: parseTags(kunyomi_raw),
        jlpt_level: intOrNull(jlpt_raw),
      };
    })
    .filter(k => k.character);

  if (!kanji.length) return setStatus(st, "Нет валидных строк", false);

  try {
    const res = await api("/kanji/batch", "POST", { kanji });
    setStatus(st, `✓ Добавлено ${res.length} кандзи`, true);
    document.getElementById("kanji-import-area").value = "";
  } catch(e) { setStatus(st, e.message, false); }
});

/* ═══════════════════════════════════════════════════════════
   Detail modal — глобальный кэш и рендер
═══════════════════════════════════════════════════════════ */
const _wCache = {};
const _kCache = {};
const _rCache = {};

const VGROUP_LABELS = { "1": "1-я группа (五段)", "2": "2-я группа (一段)", "3": "3-я (нерег.)" };

function renderWordDetail(w) {
  const metaItems = [];
  if (w.jlpt_level)     metaItems.push({ label: "JLPT",       value: `N${w.jlpt_level}` });
  if (w.word_type)      metaItems.push({ label: "Тип",        value: TYPE_LABELS[w.word_type] ?? w.word_type });
  if (w.subcategory)    metaItems.push({ label: "Подтип",     value: SUB_LABELS[w.subcategory] ?? w.subcategory });
  if (w.verb_group)     metaItems.push({ label: "Группа",     value: VGROUP_LABELS[w.verb_group] ?? w.verb_group });
  if (w.speech_register) metaItems.push({ label: "Стиль",    value: REGISTER_LABELS[w.speech_register] ?? w.speech_register });
  if (w.frequency)      metaItems.push({ label: "Частотность", value: FREQ_LABELS[w.frequency] ?? w.frequency });
  if (w.te_form)        metaItems.push({ label: "て-форма",   value: w.te_form });
  if (w.is_transitive != null) metaItems.push({ label: "Переходность", value: w.is_transitive ? "переходный" : "непереходный" });
  if (w.can_suru != null)      metaItems.push({ label: "する-глагол",  value: w.can_suru ? "да" : "нет" });
  if (w.counter_suffix) metaItems.push({ label: "Счётный суф.", value: w.counter_suffix });

  const meta = metaItems.map(m =>
    `<div class="dc-meta-item">
       <div class="dc-meta-label">${m.label}</div>
       <div class="dc-meta-value">${esc(m.value)}</div>
     </div>`
  ).join("");

  const contextBadges = (w.context ?? [])
    .map(c => `<span class="badge badge-tag">${esc(CONTEXT_LABELS[c] ?? c)}</span>`).join("");
  const allTags = (w.tags ?? []).map(t => `<span class="badge badge-tag">${esc(t)}</span>`).join("");

  return `
    <div class="dc-word">${esc(w.word)}</div>
    ${w.reading  ? `<div class="dc-reading">${esc(w.reading)}</div>` : ""}
    ${w.romanji  ? `<div class="dc-romanji">${esc(w.romanji)}</div>` : ""}
    <div class="dc-translation">${esc(w.translation)}</div>
    ${w.description ? `<div class="dc-description">${esc(w.description)}</div>` : ""}
    ${w.example_sentence ? `<div class="dc-example">${esc(w.example_sentence)}</div>` : ""}
    ${meta ? `<div class="dc-meta">${meta}</div>` : ""}
    ${contextBadges ? `<div class="dc-badges">${contextBadges}</div>` : ""}
    ${allTags ? `<div class="dc-badges" style="margin-top:6px">${allTags}</div>` : ""}`;
}

function renderKanjiDetail(k) {
  const on  = k.onyomi?.join("  ") ?? "";
  const kun = k.kunyomi?.join("  ") ?? "";
  const jlpt = k.jlpt_level ? `<span class="badge badge-jlpt">N${k.jlpt_level}</span>` : "";
  return `
    <div class="dc-kanji">${esc(k.character)}</div>
    <div class="dc-kanji-meaning">${esc(k.meaning)}</div>
    <div class="dc-kanji-readings">
      ${on  ? `<div class="dc-reading-block"><div class="dc-meta-label">Онъёми 音読み</div><div class="dc-meta-value">${esc(on)}</div></div>` : ""}
      ${kun ? `<div class="dc-reading-block"><div class="dc-meta-label">Кунъёми 訓読み</div><div class="dc-meta-value">${esc(kun)}</div></div>` : ""}
    </div>
    ${jlpt ? `<div class="dc-badges">${jlpt}</div>` : ""}`;
}

function renderRuleDetail(r) {
  const jlpt = r.jlpt_level ? `<span class="badge badge-jlpt">N${r.jlpt_level}</span>` : "";
  const cat  = r.category   ? `<span class="badge">${esc(r.category)}</span>` : "";
  return `
    <div class="dc-rule-title">${esc(r.title)}</div>
    <div class="dc-rule-body">${esc(r.body)}</div>
    ${(jlpt || cat) ? `<div class="dc-badges">${jlpt}${cat}</div>` : ""}`;
}

function openDetail(html) {
  document.getElementById("detail-content").innerHTML = html;
  document.getElementById("detail-overlay").classList.add("open");
}

function closeDetail() {
  document.getElementById("detail-overlay").classList.remove("open");
}

// Закрытие детал-модалки
document.getElementById("detail-close").addEventListener("click", closeDetail);
document.getElementById("detail-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("detail-overlay")) closeDetail();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeDetail();
});

// Делегирование кликов на карточки
document.addEventListener("click", e => {
  const wcard = e.target.closest(".word-card");
  if (wcard && !e.target.closest(".wc-del")) {
    const id = +wcard.dataset.wid;
    const w = _wCache[id];
    if (w) openDetail(renderWordDetail(w));
    return;
  }
  const kcard = e.target.closest(".kanji-card");
  if (kcard && !e.target.closest(".kc-del")) {
    const id = +kcard.dataset.kid;
    const k = _kCache[id];
    if (k) openDetail(renderKanjiDetail(k));
    return;
  }
  const rcard = e.target.closest(".rule-card");
  if (rcard && !e.target.closest(".rc-del")) {
    const id = +rcard.dataset.rid;
    const r = _rCache[id];
    if (r) openDetail(renderRuleDetail(r));
  }
});

/* ═══════════════════════════════════════════════════════════
   Boot
═══════════════════════════════════════════════════════════ */
loadDashboard();
