"""
Импорт слов из noun.txt прямо в nihongo.db.
Запуск: python data/import_nouns.py
"""
import re
import sqlite3
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
DB   = ROOT / "nihongo.db"
TXT  = pathlib.Path(__file__).parent / "noun.txt"

# ── Создаём таблицу если БД ещё не инициализирована ─────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS words (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    word             TEXT NOT NULL,
    reading          TEXT,
    romanji          TEXT,
    translation      TEXT NOT NULL,
    example_sentence TEXT,
    jlpt_level       INTEGER,
    tags             TEXT DEFAULT '',
    created_at       TEXT DEFAULT (datetime('now'))
);
"""

# ── Парсер одной строки ───────────────────────────────────────────────────────
def parse(raw: str):
    # убираем номер строки: "42\tслово..."
    line = re.sub(r'^\d+\s*\t?\s*', '', raw).strip()
    if not line:
        return None

    # разбиваем на «левую часть» (слово + чтение) и перевод
    # ищем последний " - " чтобы не зацепить скобки в переводе
    sep = re.search(r'\s[-－]\s', line)
    if not sep:
        return None
    left        = line[:sep.start()].strip()
    translation = line[sep.end():].strip()
    if not translation:
        return None

    # извлекаем чтения из скобок (半角・全角)
    readings = re.findall(r'[（(]([^）)]+)[）)]', left)
    # удаляем все скобки с содержимым из «слова»
    word = re.sub(r'\s*[（(][^）)]*[）)]\s*', '', left).strip()

    if not word:
        # Например: "(試験に) 合格する" — берём всё до последних скобок
        word = left.strip()

    reading = romanji = None
    for r in readings:
        r = r.strip()
        if re.search(r'[ぁ-んァ-ン]', r):
            # содержит кану — это чтение (берём только хирагану если есть слэш)
            reading = r.split('/')[0].strip()
        elif re.search(r'[a-zA-Z]', r):
            romanji = r

    return {
        "word":        word,
        "reading":     reading,
        "romanji":     romanji,
        "translation": translation,
    }


# ── Основной импорт ───────────────────────────────────────────────────────────
def main():
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)

    with open(TXT, encoding="utf-8") as f:
        lines = f.readlines()

    ok = skip = dup = 0
    for line in lines:
        w = parse(line)
        if not w:
            continue
        try:
            con.execute(
                """INSERT INTO words (word, reading, romanji, translation, jlpt_level, tags)
                   VALUES (?,?,?,?,?,?)""",
                (w["word"], w["reading"], w["romanji"], w["translation"], 5, "существительное"),
            )
            ok += 1
        except sqlite3.IntegrityError:
            dup += 1
        except Exception as e:
            print(f"  [skip] {w['word']}: {e}")
            skip += 1

    con.commit()
    con.close()
    print(f"\nГотово: добавлено {ok}, дублей пропущено {dup}, ошибок {skip}")
    print(f"База: {DB}")


if __name__ == "__main__":
    main()
