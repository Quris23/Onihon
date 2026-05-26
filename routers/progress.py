"""Маршруты прогресса пользователя по словам, кандзи и правилам."""
from typing import Optional

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user
from database import db_path

router = APIRouter(prefix="/progress", tags=["progress"])


# ── Схемы ─────────────────────────────────────────────────────────────────────

class WordProgressUpdate(BaseModel):
    status:   Optional[str] = None   # new / learning / known
    learned:  Optional[int] = None   # 0 или 1
    favorite: Optional[int] = None   # 0 или 1


class SimpleProgressUpdate(BaseModel):
    learned:  Optional[int] = None
    favorite: Optional[int] = None


# ── Words ──────────────────────────────────────────────────────────────────────

@router.get("/words")
async def get_word_progress(current_user: dict = Depends(get_current_user)):
    """Возвращает {word_id: {status, learned, favorite}} для текущего пользователя."""
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        rows = await (await db.execute(
            "SELECT word_id, status, learned, favorite FROM word_progress WHERE user_id = ?",
            (current_user["id"],),
        )).fetchall()
    return {
        r["word_id"]: {"status": r["status"], "learned": r["learned"], "favorite": r["favorite"]}
        for r in rows
    }


@router.put("/words/{word_id}")
async def update_word_progress(
    word_id: int,
    body: WordProgressUpdate,
    current_user: dict = Depends(get_current_user),
):
    async with aiosqlite.connect(db_path()) as db:
        word = await (await db.execute(
            "SELECT id FROM words WHERE id = ?", (word_id,)
        )).fetchone()
        if not word:
            raise HTTPException(404, "Слово не найдено")

        # Гарантируем, что строка существует
        await db.execute("""
            INSERT INTO word_progress (user_id, word_id)
            VALUES (?, ?)
            ON CONFLICT(user_id, word_id) DO NOTHING
        """, (current_user["id"], word_id))

        # Обновляем только переданные поля
        updates, params = [], []
        if body.status is not None:
            if body.status not in ("new", "learning", "known"):
                raise HTTPException(400, "Недопустимый статус")
            updates.append("status = ?"); params.append(body.status)
        if body.learned is not None:
            updates.append("learned = ?"); params.append(body.learned)
        if body.favorite is not None:
            updates.append("favorite = ?"); params.append(body.favorite)

        if updates:
            updates.append("updated_at = datetime('now')")
            params += [current_user["id"], word_id]
            await db.execute(
                f"UPDATE word_progress SET {', '.join(updates)} WHERE user_id = ? AND word_id = ?",
                params,
            )
        await db.commit()

        db.row_factory = aiosqlite.Row
        row = await (await db.execute(
            "SELECT status, learned, favorite FROM word_progress WHERE user_id = ? AND word_id = ?",
            (current_user["id"], word_id),
        )).fetchone()

    return {"word_id": word_id, **dict(row)}


# ── Kanji ──────────────────────────────────────────────────────────────────────

@router.get("/kanji")
async def get_kanji_progress(current_user: dict = Depends(get_current_user)):
    """Возвращает {kanji_id: {learned, favorite}} для текущего пользователя."""
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        rows = await (await db.execute(
            "SELECT kanji_id, learned, favorite FROM kanji_progress WHERE user_id = ?",
            (current_user["id"],),
        )).fetchall()
    return {r["kanji_id"]: {"learned": r["learned"], "favorite": r["favorite"]} for r in rows}


@router.put("/kanji/{kanji_id}")
async def update_kanji_progress(
    kanji_id: int,
    body: SimpleProgressUpdate,
    current_user: dict = Depends(get_current_user),
):
    async with aiosqlite.connect(db_path()) as db:
        kanji = await (await db.execute(
            "SELECT id FROM kanji WHERE id = ?", (kanji_id,)
        )).fetchone()
        if not kanji:
            raise HTTPException(404, "Кандзи не найден")

        await db.execute("""
            INSERT INTO kanji_progress (user_id, kanji_id)
            VALUES (?, ?)
            ON CONFLICT(user_id, kanji_id) DO NOTHING
        """, (current_user["id"], kanji_id))

        updates, params = [], []
        if body.learned is not None:
            updates.append("learned = ?"); params.append(body.learned)
        if body.favorite is not None:
            updates.append("favorite = ?"); params.append(body.favorite)

        if updates:
            updates.append("updated_at = datetime('now')")
            params += [current_user["id"], kanji_id]
            await db.execute(
                f"UPDATE kanji_progress SET {', '.join(updates)} WHERE user_id = ? AND kanji_id = ?",
                params,
            )
        await db.commit()

        db.row_factory = aiosqlite.Row
        row = await (await db.execute(
            "SELECT learned, favorite FROM kanji_progress WHERE user_id = ? AND kanji_id = ?",
            (current_user["id"], kanji_id),
        )).fetchone()

    return {"kanji_id": kanji_id, **dict(row)}


# ── Rules ──────────────────────────────────────────────────────────────────────

@router.get("/rules")
async def get_rule_progress(current_user: dict = Depends(get_current_user)):
    """Возвращает {rule_id: {learned, favorite}} для текущего пользователя."""
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        rows = await (await db.execute(
            "SELECT rule_id, learned, favorite FROM rule_progress WHERE user_id = ?",
            (current_user["id"],),
        )).fetchall()
    return {r["rule_id"]: {"learned": r["learned"], "favorite": r["favorite"]} for r in rows}


@router.put("/rules/{rule_id}")
async def update_rule_progress(
    rule_id: int,
    body: SimpleProgressUpdate,
    current_user: dict = Depends(get_current_user),
):
    async with aiosqlite.connect(db_path()) as db:
        rule = await (await db.execute(
            "SELECT id FROM rules WHERE id = ?", (rule_id,)
        )).fetchone()
        if not rule:
            raise HTTPException(404, "Правило не найдено")

        await db.execute("""
            INSERT INTO rule_progress (user_id, rule_id)
            VALUES (?, ?)
            ON CONFLICT(user_id, rule_id) DO NOTHING
        """, (current_user["id"], rule_id))

        updates, params = [], []
        if body.learned is not None:
            updates.append("learned = ?"); params.append(body.learned)
        if body.favorite is not None:
            updates.append("favorite = ?"); params.append(body.favorite)

        if updates:
            updates.append("updated_at = datetime('now')")
            params += [current_user["id"], rule_id]
            await db.execute(
                f"UPDATE rule_progress SET {', '.join(updates)} WHERE user_id = ? AND rule_id = ?",
                params,
            )
        await db.commit()

        db.row_factory = aiosqlite.Row
        row = await (await db.execute(
            "SELECT learned, favorite FROM rule_progress WHERE user_id = ? AND rule_id = ?",
            (current_user["id"], rule_id),
        )).fetchone()

    return {"rule_id": rule_id, **dict(row)}


# ── Radar ──────────────────────────────────────────────────────────────────────

@router.get("/radar")
async def get_radar_data(current_user: dict = Depends(get_current_user)):
    """Данные для лепестковой диаграммы: % выученных по уровням JLPT."""
    uid = current_user["id"]

    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row

        w_total = {r["jlpt_level"]: r["cnt"] for r in await (await db.execute(
            "SELECT jlpt_level, COUNT(*) as cnt FROM words WHERE jlpt_level IS NOT NULL GROUP BY jlpt_level"
        )).fetchall()}
        w_learned = {r["jlpt_level"]: r["cnt"] for r in await (await db.execute(
            """SELECT w.jlpt_level, COUNT(*) as cnt
               FROM word_progress wp JOIN words w ON w.id = wp.word_id
               WHERE wp.user_id = ? AND wp.learned = 1 AND w.jlpt_level IS NOT NULL
               GROUP BY w.jlpt_level""",
            (uid,),
        )).fetchall()}

        k_total = {r["jlpt_level"]: r["cnt"] for r in await (await db.execute(
            "SELECT jlpt_level, COUNT(*) as cnt FROM kanji WHERE jlpt_level IS NOT NULL GROUP BY jlpt_level"
        )).fetchall()}
        k_learned = {r["jlpt_level"]: r["cnt"] for r in await (await db.execute(
            """SELECT k.jlpt_level, COUNT(*) as cnt
               FROM kanji_progress kp JOIN kanji k ON k.id = kp.kanji_id
               WHERE kp.user_id = ? AND kp.learned = 1 AND k.jlpt_level IS NOT NULL
               GROUP BY k.jlpt_level""",
            (uid,),
        )).fetchall()}

        r_total = {r["jlpt_level"]: r["cnt"] for r in await (await db.execute(
            "SELECT jlpt_level, COUNT(*) as cnt FROM rules WHERE jlpt_level IS NOT NULL GROUP BY jlpt_level"
        )).fetchall()}
        r_learned = {r["jlpt_level"]: r["cnt"] for r in await (await db.execute(
            """SELECT r.jlpt_level, COUNT(*) as cnt
               FROM rule_progress rp JOIN rules r ON r.id = rp.rule_id
               WHERE rp.user_id = ? AND rp.learned = 1 AND r.jlpt_level IS NOT NULL
               GROUP BY r.jlpt_level""",
            (uid,),
        )).fetchall()}

    def build(total, learned):
        return {
            str(lvl): {"total": total.get(lvl, 0), "learned": learned.get(lvl, 0)}
            for lvl in range(1, 6)
        }

    return {
        "words": build(w_total, w_learned),
        "kanji": build(k_total, k_learned),
        "rules": build(r_total, r_learned),
    }


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def progress_stats(current_user: dict = Depends(get_current_user)):
    """Агрегированная статистика прогресса пользователя."""
    uid = current_user["id"]
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row

        status_rows = await (await db.execute(
            "SELECT status, COUNT(*) as cnt FROM word_progress WHERE user_id = ? GROUP BY status",
            (uid,),
        )).fetchall()
        sc = {r["status"]: r["cnt"] for r in status_rows}

        def count(q):
            async def _inner():
                return (await (await db.execute(q, (uid,))).fetchone())["n"]
            return _inner

        w_learned  = (await (await db.execute("SELECT COUNT(*) n FROM word_progress  WHERE user_id=? AND learned=1",  (uid,))).fetchone())["n"]
        w_favorite = (await (await db.execute("SELECT COUNT(*) n FROM word_progress  WHERE user_id=? AND favorite=1", (uid,))).fetchone())["n"]
        k_learned  = (await (await db.execute("SELECT COUNT(*) n FROM kanji_progress WHERE user_id=? AND learned=1",  (uid,))).fetchone())["n"]
        k_favorite = (await (await db.execute("SELECT COUNT(*) n FROM kanji_progress WHERE user_id=? AND favorite=1", (uid,))).fetchone())["n"]
        r_learned  = (await (await db.execute("SELECT COUNT(*) n FROM rule_progress  WHERE user_id=? AND learned=1",  (uid,))).fetchone())["n"]
        r_favorite = (await (await db.execute("SELECT COUNT(*) n FROM rule_progress  WHERE user_id=? AND favorite=1", (uid,))).fetchone())["n"]

    return {
        "words":  {"new": sc.get("new", 0), "learning": sc.get("learning", 0), "known": sc.get("known", 0),
                   "learned": w_learned, "favorite": w_favorite},
        "kanji":  {"learned": k_learned, "favorite": k_favorite},
        "rules":  {"learned": r_learned, "favorite": r_favorite},
    }
