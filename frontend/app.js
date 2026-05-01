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
  const search = document.getElementById("words-search").value.trim();
  let url = `/words/?limit=${WORDS_PER_PAGE}&offset=${offset}`;
  if (jlpt)   url += `&jlpt_level=${jlpt}`;
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

function renderWordCard(w) {
  const tags = (w.tags ?? []).map(t => `<span class="badge badge-tag">${esc(t)}</span>`).join("");
  const jlpt = w.jlpt_level ? `<span class="badge badge-jlpt">N${w.jlpt_level}</span>` : "";
  return `<div class="word-card">
    <button class="wc-del" data-id="${w.id}" title="Удалить">✕</button>
    <div class="wc-word">${esc(w.word)}</div>
    ${w.reading  ? `<div class="wc-reading">${esc(w.reading)}</div>` : ""}
    ${w.romanji  ? `<div class="wc-romanji">${esc(w.romanji)}</div>` : ""}
    <div class="wc-translation">${esc(w.translation)}</div>
    ${w.example_sentence ? `<div class="wc-example">${esc(w.example_sentence)}</div>` : ""}
    <div class="wc-footer">${jlpt}${tags}</div>
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
  const on  = k.onyomi?.join("、") ?? "";
  const kun = k.kunyomi?.join("、") ?? "";
  const jlpt = k.jlpt_level ? `<span class="badge badge-jlpt">N${k.jlpt_level}</span>` : "";
  return `<div class="kanji-card">
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
      ? data.map(r => `<div class="rule-card">
          <button class="rc-del" data-id="${r.id}" title="Удалить">✕</button>
          <div class="rc-title">${esc(r.title)}</div>
          <div class="rc-body">${esc(r.body)}</div>
          <div class="rc-footer">
            ${r.jlpt_level ? `<span class="badge badge-jlpt">N${r.jlpt_level}</span>` : ""}
            ${r.category   ? `<span class="badge">${esc(r.category)}</span>` : ""}
          </div>
        </div>`).join("")
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
   Boot
═══════════════════════════════════════════════════════════ */
loadDashboard();
