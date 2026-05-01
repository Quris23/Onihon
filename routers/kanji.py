import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from database import db_path
from models import KanjiIn, KanjiOut, KanjiBatchIn, tags_to_str, str_to_tags

router = APIRouter(prefix="/kanji", tags=["kanji"])


def _row(row) -> dict:
    d = dict(row)
    d["onyomi"]  = str_to_tags(d.get("onyomi", ""))
    d["kunyomi"] = str_to_tags(d.get("kunyomi", ""))
    return d


@router.get("/", response_model=list[KanjiOut])
async def list_kanji(
    jlpt_level: int | None = Query(None, ge=1, le=5),
    limit:  int = Query(100, le=500),
    offset: int = 0,
):
    filters, params = [], []
    if jlpt_level:
        filters.append("jlpt_level = ?"); params.append(jlpt_level)
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            f"SELECT * FROM kanji {where} ORDER BY id DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        )
        rows = await cur.fetchall()
    return [_row(r) for r in rows]


@router.get("/stats")
async def kanji_stats():
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT COUNT(*) as total FROM kanji")
        total = (await cur.fetchone())["total"]
    return {"total": total}


@router.post("/", response_model=KanjiOut, status_code=201)
async def create_kanji(p: KanjiIn):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """INSERT INTO kanji (character,onyomi,kunyomi,meaning,jlpt_level)
               VALUES (?,?,?,?,?) RETURNING *""",
            (p.character, tags_to_str(p.onyomi), tags_to_str(p.kunyomi),
             p.meaning, p.jlpt_level),
        )
        row = await cur.fetchone()
        await db.commit()
    return _row(row)


@router.post("/batch", response_model=list[KanjiOut], status_code=201)
async def batch_kanji(payload: KanjiBatchIn):
    added = []
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        for p in payload.kanji:
            try:
                cur = await db.execute(
                    """INSERT INTO kanji (character,onyomi,kunyomi,meaning,jlpt_level)
                       VALUES (?,?,?,?,?) RETURNING *""",
                    (p.character, tags_to_str(p.onyomi), tags_to_str(p.kunyomi),
                     p.meaning, p.jlpt_level),
                )
                row = await cur.fetchone()
                if row:
                    added.append(_row(row))
            except Exception:
                pass  # UNIQUE conflict — skip duplicate
        await db.commit()
    return added


@router.get("/{kid}", response_model=KanjiOut)
async def get_kanji(kid: int):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM kanji WHERE id=?", (kid,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return _row(row)


@router.delete("/{kid}", status_code=204)
async def delete_kanji(kid: int):
    async with aiosqlite.connect(db_path()) as db:
        cur = await db.execute("DELETE FROM kanji WHERE id=?", (kid,))
        await db.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, "Not found")
