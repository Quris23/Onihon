import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from database import db_path
from models import WordIn, WordOut, WordBatchIn, tags_to_str, str_to_tags

router = APIRouter(prefix="/words", tags=["words"])


def _row(row) -> dict:
    d = dict(row)
    d["tags"] = str_to_tags(d.get("tags", ""))
    return d


@router.get("/", response_model=list[WordOut])
async def list_words(
    jlpt_level: int | None = Query(None, ge=1, le=5),
    search:     str | None = None,
    limit:  int = Query(100, le=500),
    offset: int = 0,
):
    filters, params = [], []
    if jlpt_level:
        filters.append("jlpt_level = ?");  params.append(jlpt_level)
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
        cur = await db.execute("SELECT COUNT(*) as total FROM words")
        total = (await cur.fetchone())["total"]
        cur = await db.execute(
            "SELECT jlpt_level, COUNT(*) as cnt FROM words WHERE jlpt_level IS NOT NULL GROUP BY jlpt_level"
        )
        by_level = {r["jlpt_level"]: r["cnt"] for r in await cur.fetchall()}
    return {"total": total, "by_level": by_level}


@router.post("/", response_model=WordOut, status_code=201)
async def create_word(p: WordIn):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """INSERT INTO words (word,reading,romanji,translation,example_sentence,jlpt_level,tags)
               VALUES (?,?,?,?,?,?,?) RETURNING *""",
            (p.word, p.reading, p.romanji, p.translation,
             p.example_sentence, p.jlpt_level, tags_to_str(p.tags)),
        )
        row = await cur.fetchone()
        await db.commit()
    return _row(row)


@router.post("/batch", response_model=list[WordOut], status_code=201)
async def batch_words(payload: WordBatchIn):
    added = []
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        for p in payload.words:
            cur = await db.execute(
                """INSERT INTO words (word,reading,romanji,translation,example_sentence,jlpt_level,tags)
                   VALUES (?,?,?,?,?,?,?) RETURNING *""",
                (p.word, p.reading, p.romanji, p.translation,
                 p.example_sentence, p.jlpt_level, tags_to_str(p.tags)),
            )
            row = await cur.fetchone()
            added.append(_row(row))
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
        cur = await db.execute(
            """UPDATE words SET word=?,reading=?,romanji=?,translation=?,
               example_sentence=?,jlpt_level=?,tags=? WHERE id=? RETURNING *""",
            (p.word, p.reading, p.romanji, p.translation,
             p.example_sentence, p.jlpt_level, tags_to_str(p.tags), wid),
        )
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
