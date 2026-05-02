import aiosqlite
import pathlib

DB_PATH = pathlib.Path(__file__).parent / "nihongo.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS words (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    word             TEXT    NOT NULL,
    reading          TEXT,
    romanji          TEXT,
    translation      TEXT    NOT NULL,
    example_sentence TEXT,
    jlpt_level       INTEGER CHECK (jlpt_level BETWEEN 1 AND 5),
    tags             TEXT    DEFAULT '',
    word_type        TEXT,
    subcategory      TEXT,
    verb_group       TEXT,
    politeness       TEXT,
    speech_register  TEXT,
    description      TEXT,
    frequency        TEXT,
    context          TEXT,
    is_transitive    INTEGER,
    te_form          TEXT,
    verb_subtype     TEXT,
    can_suru         INTEGER,
    counter_suffix   TEXT,
    created_at       TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kanji (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    character   TEXT    NOT NULL UNIQUE,
    onyomi      TEXT    DEFAULT '',
    kunyomi     TEXT    DEFAULT '',
    meaning     TEXT    NOT NULL,
    jlpt_level  INTEGER CHECK (jlpt_level BETWEEN 1 AND 5),
    created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    category    TEXT,
    jlpt_level  INTEGER CHECK (jlpt_level BETWEEN 1 AND 5),
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_words_jlpt      ON words (jlpt_level);
CREATE INDEX IF NOT EXISTS idx_words_type      ON words (word_type);
CREATE INDEX IF NOT EXISTS idx_words_sub       ON words (subcategory);
CREATE INDEX IF NOT EXISTS idx_words_freq      ON words (frequency);
CREATE INDEX IF NOT EXISTS idx_kanji_jlpt      ON kanji (jlpt_level);
CREATE INDEX IF NOT EXISTS idx_rules_jlpt      ON rules (jlpt_level);
"""

# Миграции для существующих БД (каждая обёрнута в try/except)
_MIGRATIONS = [
    "ALTER TABLE words ADD COLUMN word_type       TEXT",
    "ALTER TABLE words ADD COLUMN subcategory     TEXT",
    "ALTER TABLE words ADD COLUMN verb_group      TEXT",
    "ALTER TABLE words ADD COLUMN politeness      TEXT",
    "ALTER TABLE words ADD COLUMN speech_register TEXT",
    "ALTER TABLE words ADD COLUMN description     TEXT",
    "ALTER TABLE words ADD COLUMN frequency       TEXT",
    "ALTER TABLE words ADD COLUMN context         TEXT",
    "ALTER TABLE words ADD COLUMN is_transitive   INTEGER",
    "ALTER TABLE words ADD COLUMN te_form         TEXT",
    "ALTER TABLE words ADD COLUMN verb_subtype    TEXT",
    "ALTER TABLE words ADD COLUMN can_suru        INTEGER",
    "ALTER TABLE words ADD COLUMN counter_suffix  TEXT",
]


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        for sql in _MIGRATIONS:
            try:
                await db.execute(sql)
            except Exception:
                pass  # колонка уже существует
        await db.commit()


def db_path() -> str:
    return str(DB_PATH)
