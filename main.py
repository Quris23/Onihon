from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import pathlib

from database import init_db
from routers import words, kanji, rules, auth, progress


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Nihongo no Web", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://quris23.github.io", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(words.router,  prefix="/api")
app.include_router(kanji.router,  prefix="/api")
app.include_router(rules.router,  prefix="/api")
app.include_router(auth.router,     prefix="/api")
app.include_router(progress.router, prefix="/api")

_fe = pathlib.Path(__file__).parent / "docs"
app.mount("/", StaticFiles(directory=str(_fe), html=True), name="static")
