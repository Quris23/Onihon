import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from database import db_path
from models import WordIn, WordOut, WordBatchIn, tags_to_str, str_to_tags

router = APIRouter(prefix="/words", tags=["words"])


def _row(row) -> dict:
    d = dict(row)
    d["tags"]    = str_to_tags(d.get("tags", ""))
    d["context"] = str_to_tags(d.get("context", ""))
    # SQLite хранит bool как 0/1 → конвертируем
    for bool_field in ("is_transitive", "can_suru"):
        v = d.get(bool_field)
        d[bool_field] = bool(v) if v is not None else None
    return d


def _word_params(p: WordIn) -> tuple:
    return (
        p.word, p.reading, p.romanji, p.translation,
        p.example_sentence, p.jlpt_level, tags_to_str(p.tags),
        p.word_type, p.subcategory, p.verb_group,
        p.speech_register, p.description, p.frequency,
        tags_to_str(p.context),
        None if p.is_transitive is None else int(p.is_transitive),
        p.te_form, p.verb_subtype,
        None if p.can_suru is None else int(p.can_suru),
        p.counter_suffix,
    )


_INSERT_SQL = """
    INSERT INTO words (
        word, reading, romanji, translation, example_sentence, jlpt_level, tags,
        word_type, subcategory, verb_group,
        speech_register, description, frequency, context,
        is_transitive, te_form, verb_subtype,
        can_suru, counter_suffix
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *
"""

_UPDATE_SQL = """
    UPDATE words SET
        word=?, reading=?, romanji=?, translation=?, example_sentence=?,
        jlpt_level=?, tags=?,
        word_type=?, subcategory=?, verb_group=?,
        speech_register=?, description=?, frequency=?, context=?,
        is_transitive=?, te_form=?, verb_subtype=?,
        can_suru=?, counter_suffix=?
    WHERE id=? RETURNING *
"""


@router.get("/", response_model=list[WordOut])
async def list_words(
    jlpt_level:  int | None = Query(None, ge=1, le=5),
    word_type:   str | None = None,
    subcategory: str | None = None,
    frequency:   str | None = None,
    search:      str | None = None,
    limit:  int = Query(100, le=500),
    offset: int = 0,
):
    filters, params = [], []
    if jlpt_level:
        filters.append("jlpt_level = ?");   params.append(jlpt_level)
    if word_type:
        filters.append("word_type = ?");     params.append(word_type)
    if subcategory:
        filters.append("subcategory = ?");   params.append(subcategory)
    if frequency:
        filters.append("frequency = ?");     params.append(frequency)
    if search:
        filters.append("(word LIKE ? OR reading LIKE ? OR translation LIKE ?)")
        params += [f"%{search}%"] * 3
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            f"SELECT * FROM words {where} ORDER BY id DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        )
        rows = await cur.fetchall()
    return [_row(r) for r in rows]


@router.get("/stats")
async def word_stats():
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        total    = (await (await db.execute("SELECT COUNT(*) as n FROM words")).fetchone())["n"]
        by_level = {r["jlpt_level"]: r["cnt"] for r in await (
            await db.execute("SELECT jlpt_level, COUNT(*) as cnt FROM words WHERE jlpt_level IS NOT NULL GROUP BY jlpt_level")
        ).fetchall()}
        by_type  = {r["word_type"]: r["cnt"] for r in await (
            await db.execute("SELECT word_type, COUNT(*) as cnt FROM words WHERE word_type IS NOT NULL GROUP BY word_type")
        ).fetchall()}
    return {"total": total, "by_level": by_level, "by_type": by_type}


@router.post("/", response_model=WordOut, status_code=201)
async def create_word(p: WordIn):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(_INSERT_SQL, _word_params(p))
        row = await cur.fetchone()
        await db.commit()
    return _row(row)


@router.post("/batch", response_model=list[WordOut], status_code=201)
async def batch_words(payload: WordBatchIn):
    added = []
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        for p in payload.words:
            cur = await db.execute(_INSERT_SQL, _word_params(p))
            added.append(_row(await cur.fetchone()))
        await db.commit()
    return added


@router.get("/{wid}", response_model=WordOut)
async def get_word(wid: int):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM words WHERE id=?", (wid,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return _row(row)


@router.put("/{wid}", response_model=WordOut)
async def update_word(wid: int, p: WordIn):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(_UPDATE_SQL, _word_params(p) + (wid,))
        row = await cur.fetchone()
        await db.commit()
    if not row:
        raise HTTPException(404, "Not found")
    return _row(row)


@router.delete("/{wid}", status_code=204)
async def delete_word(wid: int):
    async with aiosqlite.connect(db_path()) as db:
        cur = await db.execute("DELETE FROM words WHERE id=?", (wid,))
        await db.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, "Not found")
