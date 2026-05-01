from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import pathlib

from database import init_db
from routers import words, kanji, rules


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()           # creates nihongo.db + tables on first run
    yield


app = FastAPI(title="Nihongo no Web", version="1.0.0", lifespan=lifespan)

app.include_router(words.router,  prefix="/api")
app.include_router(kanji.router,  prefix="/api")
app.include_router(rules.router,  prefix="/api")

_fe = pathlib.Path(__file__).parent / "frontend"
app.mount("/static", StaticFiles(directory=str(_fe)), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(str(_fe / "index.html"))
