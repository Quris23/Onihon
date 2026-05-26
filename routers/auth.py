"""Маршруты аутентификации: email/password + Google OAuth."""
import os
from urllib.parse import urlencode

import aiosqlite
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr

from auth_utils import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from database import db_path

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8000")

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USER_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"


# ── Схемы запросов ────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email:        EmailStr
    password:     str
    display_name: str = ""


class LoginIn(BaseModel):
    email:    EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user: dict


# ── Email / Password ──────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn):
    if len(body.password) < 6:
        raise HTTPException(400, "Пароль должен быть не менее 6 символов")

    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        existing = await (await db.execute(
            "SELECT id FROM users WHERE email = ?", (body.email,)
        )).fetchone()
        if existing:
            raise HTTPException(409, "Пользователь с таким email уже существует")

        hashed = hash_password(body.password)
        cur = await db.execute(
            "INSERT INTO users (email, hashed_pw, display_name) VALUES (?,?,?) RETURNING *",
            (body.email, hashed, body.display_name or body.email.split("@")[0]),
        )
        user = dict(await cur.fetchone())
        await db.commit()

    token = create_access_token(user["id"], user["email"])
    return {
        "access_token": token,
        "user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"]},
    }


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        row = await (await db.execute(
            "SELECT * FROM users WHERE email = ?", (body.email,)
        )).fetchone()

    if not row or not row["hashed_pw"] or not verify_password(body.password, row["hashed_pw"]):
        raise HTTPException(401, "Неверный email или пароль")

    user = dict(row)
    token = create_access_token(user["id"], user["email"])
    return {
        "access_token": token,
        "user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"]},
    }


class ProfileUpdate(BaseModel):
    display_name: str


@router.patch("/me")
async def update_me(body: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(db_path()) as db:
        await db.execute(
            "UPDATE users SET display_name = ? WHERE id = ?",
            (body.display_name.strip(), current_user["id"]),
        )
        await db.commit()
        db.row_factory = aiosqlite.Row
        row = await (await db.execute(
            "SELECT id, email, display_name, avatar_url, created_at FROM users WHERE id = ?",
            (current_user["id"],),
        )).fetchone()
    if not row:
        raise HTTPException(404, "Пользователь не найден")
    return dict(row)


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row
        row = await (await db.execute(
            "SELECT id, email, display_name, avatar_url, created_at FROM users WHERE id = ?",
            (current_user["id"],),
        )).fetchone()
    if not row:
        raise HTTPException(404, "Пользователь не найден")
    return dict(row)


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/google")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(501, "Google OAuth не настроен (GOOGLE_CLIENT_ID не задан)")
    params = urlencode({
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "online",
    })
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback")
async def google_callback(code: str = "", error: str = ""):
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}?auth_error=google_denied")

    # Обмен кода на токены
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  GOOGLE_REDIRECT_URI,
            "grant_type":    "authorization_code",
        })
        if token_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}?auth_error=token_exchange")

        tokens     = token_resp.json()
        user_resp  = await client.get(
            GOOGLE_USER_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if user_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}?auth_error=userinfo")

        guser = user_resp.json()  # {sub, email, name, picture}

    google_id    = guser.get("sub")
    email        = guser.get("email", "")
    display_name = guser.get("name", email.split("@")[0])
    avatar_url   = guser.get("picture", "")

    # Upsert пользователя
    async with aiosqlite.connect(db_path()) as db:
        db.row_factory = aiosqlite.Row

        # Ищем по google_id, затем по email
        row = await (await db.execute(
            "SELECT * FROM users WHERE google_id = ? OR email = ? LIMIT 1",
            (google_id, email),
        )).fetchone()

        if row:
            # Обновляем google_id и аватар если ещё не заполнены
            await db.execute(
                "UPDATE users SET google_id=?, avatar_url=?, display_name=COALESCE(NULLIF(display_name,''), ?) WHERE id=?",
                (google_id, avatar_url, display_name, row["id"]),
            )
            user_id = row["id"]
        else:
            cur = await db.execute(
                "INSERT INTO users (email, google_id, display_name, avatar_url) VALUES (?,?,?,?) RETURNING id",
                (email, google_id, display_name, avatar_url),
            )
            user_id = (await cur.fetchone())["id"]

        await db.commit()

    token = create_access_token(user_id, email)
    # Редиректим на фронтенд с токеном в query param
    return RedirectResponse(f"{FRONTEND_URL}/?token={token}")
