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

CREATE INDEX IF NOT EXISTS idx_words_jlpt  ON words (jlpt_level);
CREATE INDEX IF NOT EXISTS idx_kanji_jlpt  ON kanji (jlpt_level);
CREATE INDEX IF NOT EXISTS idx_rules_jlpt  ON rules (jlpt_level);
"""


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()


def db_path() -> str:
    return str(DB_PATH)
