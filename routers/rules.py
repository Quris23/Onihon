import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from database import db_path
from models import RuleIn, RuleOut

router = APIRouter(prefix="/rules", tags=["rules"])


def _row(row) -> dict:
    return dict(row)


@router.get("/", response_model=list[RuleOut])
async def list_rules(
    jlpt_level: int | None = Query(None, ge=1, le=5),
    category:   str | None = None,
    limit:  int = Query(100, le=500),
    offset: int = 0,
):
    filters, params = [], []
    if jlpt_level:
        filters.append("jlpt_level = ?"); params.append(jlpt_level)
    if category:
        filters.append("category = ?"); params.append(category)
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            f"SELECT * FROM rules {where} ORDER BY id DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        )
        rows = await cur.fetchall()
    return [_row(r) for r in rows]


@router.get("/stats")
async def rules_stats():
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT COUNT(*) as total FROM rules")
        total = (await cur.fetchone())["total"]
    return {"total": total}


@router.post("/", response_model=RuleOut, status_code=201)
async def create_rule(p: RuleIn):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO rules (title,body,category,jlpt_level) VALUES (?,?,?,?) RETURNING *",
            (p.title, p.body, p.category, p.jlpt_level),
        )
        row = await cur.fetchone()
        await db.commit()
    return _row(row)


@router.get("/{rid}", response_model=RuleOut)
async def get_rule(rid: int):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM rules WHERE id=?", (rid,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return _row(row)


@router.put("/{rid}", response_model=RuleOut)
async def update_rule(rid: int, p: RuleIn):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "UPDATE rules SET title=?,body=?,category=?,jlpt_level=? WHERE id=? RETURNING *",
            (p.title, p.body, p.category, p.jlpt_level, rid),
        )
        row = await cur.fetchone()
        await db.commit()
    if not row:
        raise HTTPException(404, "Not found")
    return _row(row)


@router.delete("/{rid}", status_code=204)
async def delete_rule(rid: int):
    async with aiosqlite.connect(db_path()) as db:
        cur = await db.execute("DELETE FROM rules WHERE id=?", (rid,))
        await db.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, "Not found")
