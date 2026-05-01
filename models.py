from pydantic import BaseModel, Field
from typing import Optional


def tags_to_str(tags: list[str]) -> str:
    return ",".join(t.strip() for t in tags if t.strip())


def str_to_tags(s: str | None) -> list[str]:
    if not s:
        return []
    return [t.strip() for t in s.split(",") if t.strip()]


# ── Words ────────────────────────────────────────────────────────────────────

class WordIn(BaseModel):
    word:             str
    reading:          Optional[str] = None
    romanji:          Optional[str] = None
    translation:      str
    example_sentence: Optional[str] = None
    jlpt_level:       Optional[int] = Field(None, ge=1, le=5)
    tags:             list[str]     = []


class WordOut(BaseModel):
    id:               int
    word:             str
    reading:          Optional[str]
    romanji:          Optional[str]
    translation:      str
    example_sentence: Optional[str]
    jlpt_level:       Optional[int]
    tags:             list[str]
    created_at:       str


class WordBatchIn(BaseModel):
    words: list[WordIn]


# ── Kanji ────────────────────────────────────────────────────────────────────

class KanjiIn(BaseModel):
    character:  str = Field(..., min_length=1, max_length=2)
    onyomi:     list[str] = []
    kunyomi:    list[str] = []
    meaning:    str
    jlpt_level: Optional[int] = Field(None, ge=1, le=5)


class KanjiOut(BaseModel):
    id:         int
    character:  str
    onyomi:     list[str]
    kunyomi:    list[str]
    meaning:    str
    jlpt_level: Optional[int]
    created_at: str


class KanjiBatchIn(BaseModel):
    kanji: list[KanjiIn]


# ── Rules ────────────────────────────────────────────────────────────────────

class RuleIn(BaseModel):
    title:      str
    body:       str
    category:   Optional[str] = None
    jlpt_level: Optional[int] = Field(None, ge=1, le=5)


class RuleOut(BaseModel):
    id:         int
    title:      str
    body:       str
    category:   Optional[str]
    jlpt_level: Optional[int]
    created_at: str
