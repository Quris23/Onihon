"""
Pydantic v2 схема для классификации японских слов.

Используется в data/classify.py для валидации JSON-ответов от AI-модели
и обогащения записей в nihongo.db.
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

# ── Допустимые значения subcategory ──────────────────────────────────────────

NOUN_SUBCATEGORIES: list[str] = [
    "place", "person", "food", "object", "body", "time",
    "weather", "nature", "abstract", "number", "transport",
    "building", "clothing", "animal", "emotion", "work",
]
"""
Подгруппы существительных:
  place     — место (школа, магазин, страна)
  person    — люди и профессии (учитель, врач, друг)
  food      — еда и блюда (суши, рис, хлеб)
  object    — предметы обихода (стол, ручка, телефон)
  body      — части тела (рука, глаз, голова)
  time      — время (год, месяц, час, понедельник)
  weather   — погода и природные явления (дождь, снег, ветер)
  nature    — природа (гора, река, море, лес)
  abstract  — абстрактные понятия (любовь, свобода, мечта)
  number    — числа и количество (один, сто, тысяча)
  transport — транспорт (поезд, автобус, самолёт)
  building  — здания и сооружения (дом, офис, станция)
  clothing  — одежда и аксессуары (рубашка, туфли, сумка)
  animal    — животные (кошка, собака, птица)
  emotion   — эмоции и чувства (радость, страх, грусть)
  work      — работа и карьера (компания, задание, совещание)
"""

VERB_SUBCATEGORIES: list[str] = [
    "motion", "state", "action", "speech", "perception",
    "giving_receiving", "existence", "change", "creation",
]
"""
Подгруппы глаголов:
  motion          — движение (идти, бежать, ехать)
  state           — состояние (быть, существовать, мочь)
  action          — конкретное действие (есть, писать, читать)
  speech          — речь и общение (говорить, спросить, ответить)
  perception      — восприятие (видеть, слышать, понимать)
  giving_receiving — давать/получать (あげる, もらう, くれる)
  existence       — существование/наличие (いる, ある)
  change          — изменение состояния (стать, превратиться)
  creation        — создание (делать, строить, готовить)
"""

ADJ_SUBCATEGORIES: list[str] = [
    "size", "color", "emotion", "character", "appearance",
    "evaluation", "quantity", "time", "physical",
]
"""
Подгруппы прилагательных:
  size       — размер (большой, маленький, длинный)
  color      — цвет (красный, белый, синий)
  emotion    — эмоциональное состояние (грустный, весёлый, злой)
  character  — характер/личность (добрый, умный, ленивый)
  appearance — внешность (красивый, страшный, чистый)
  evaluation — оценка (хороший, плохой, правильный)
  quantity   — количество/степень (много, мало, достаточно)
  time       — временной характер (новый, старый, поздний)
  physical   — физические свойства (твёрдый, тяжёлый, горячий)
"""

# Карта word_type → список допустимых subcategory (None = любая строка)
SUBCATEGORY_MAP: dict[str, list[str] | None] = {
    "noun":        NOUN_SUBCATEGORIES,
    "verb":        VERB_SUBCATEGORIES,
    "i_adj":       ADJ_SUBCATEGORIES,
    "na_adj":      ADJ_SUBCATEGORIES,
    "adverb":      None,
    "particle":    None,
    "counter":     None,
    "expression":  None,
    "conjunction": None,
    "pronoun":     None,
}


# ── Вложенные модели ──────────────────────────────────────────────────────────

class VerbDetails(BaseModel):
    """Дополнительная информация о глаголе. Заполняется только если word_type == 'verb'."""

    model_config = ConfigDict(strict=True)

    verb_group: Literal[1, 2, 3]
    """
    Группа глагола:
      1 — う-глаголы (五段動詞, godan): 書く、飲む、話す
      2 — る-глаголы (一段動詞, ichidan): 食べる、見る、起きる
      3 — Неправильные (不規則動詞): する、くる
    ВАЖНО: в JSON передавать целым числом, не строкой: 1, 2 или 3
    """

    is_transitive: bool
    """
    True  — переходный глагол (他動詞): требует прямого дополнения (開ける, 食べる)
    False — непереходный глагол (自動詞): не требует дополнения (開く, 泳ぐ)
    """

    te_form: str
    """
    て-форма глагола. Примеры:
      食べる → 食べて
      飲む  → 飲んで
      行く  → 行って
      する  → して
    """

    verb_subtype: Literal[
        "motion", "state", "action",
        "giving_receiving", "potential", "causative", "passive",
    ]
    """
    Семантический подтип глагола:
      motion          — движение: 行く、来る、走る、飛ぶ
      state           — состояние: いる、ある、できる、知っている
      action          — действие: 食べる、書く、読む、作る
      giving_receiving — давать/получать: あげる、もらう、くれる
      potential       — потенциальная форма: 食べられる、書ける
      causative       — побудительная форма: 食べさせる、行かせる
      passive         — страдательная форма: 食べられる、書かれる
    """


class NounDetails(BaseModel):
    """Дополнительная информация о существительном. Заполняется только если word_type == 'noun'."""

    model_config = ConfigDict(strict=True)

    can_suru: bool
    """
    True  — существительное может образовывать глагол через する:
            勉強 → 勉強する, 運動 → 運動する, 結婚 → 結婚する
    False — добавление する невозможно (学校する ✗, 机する ✗)
    """

    counter_suffix: str | None
    """
    Счётный суффикс, применяемый к данному существительному.
    Примеры:
      "本 (ほん)"  — для длинных предметов: ペン、木、道
      "枚 (まい)"  — для плоских предметов: 紙、シャツ、皿
      "匹 (ひき)"  — для мелких животных: 猫、犬、魚
      "冊 (さつ)"  — для книг и тетрадей
      "台 (だい)"  — для машин и техники
      "個 (こ)"    — для небольших предметов
    None — суффикс не применим или неизвестен
    """


# ── Основная схема ────────────────────────────────────────────────────────────

class WordClassification(BaseModel):
    """
    Полная классификация одного японского слова.

    Правила заполнения:
    - Если word_type == 'verb'  → verb_details обязателен
    - Если word_type == 'noun'  → noun_details обязателен
    - В остальных случаях оба поля = null
    """

    model_config = ConfigDict(strict=True)

    # ── Обязательные поля ─────────────────────────────────────────────────────

    jlpt_level: Literal["N1", "N2", "N3", "N4", "N5", "none"]
    """
    Уровень JLPT:
      N5   — начальный: самые базовые слова (~800 слов)
      N4   — базовый: повседневная лексика (~1500 слов)
      N3   — средний: газеты, простые тексты (~3700 слов)
      N2   — выше среднего: деловые тексты (~6000 слов)
      N1   — продвинутый: литература, СМИ (~10000+ слов)
      none — слово не входит в JLPT-словарь или уровень неопределён
    """

    word_type: Literal[
        "noun", "verb", "i_adj", "na_adj", "adverb",
        "particle", "counter", "expression", "conjunction", "pronoun",
    ]
    """
    Часть речи:
      noun        — существительное (名詞): 学校、水、時間
      verb        — глагол (動詞): 食べる、行く、する
      i_adj       — い-прилагательное (い形容詞): 大きい、美しい、良い
      na_adj      — な-прилагательное (な形容詞): 静か、便利、有名
      adverb      — наречие (副詞): とても、もう、少し
      particle    — частица (助詞): は、が、を、に、で
      counter     — счётный суффикс (助数詞): 本、枚、個、匹
      expression  — устойчивое выражение/фраза: よろしく、お疲れ様
      conjunction — союз (接続詞): でも、そして、だから
      pronoun     — местоимение (代名詞): 私、あなた、これ、どこ
    """

    subcategory: str
    """
    Подгруппа внутри типа. Допустимые значения зависят от word_type.
    Если тип не имеет фиксированного списка — любая краткая строка на английском.
    """

    speech_register: Literal["polite", "neutral", "casual", "rough", "written", "feminine", "masculine"]
    """
    Стилистический регистр слова (поле называется speech_register — register зарезервирован BaseModel):
      polite    — вежливый стиль (丁寧語): です、ます-форма, お/ご-префиксы
      neutral   — нейтральный: подходит для любого контекста
      casual    — разговорный (普通体): среди друзей и равных
      rough     — грубый/просторечный: мужской разговорный, аниме-речь
      written   — книжно-письменный: официальные документы, литература
      feminine  — женская речь: わ、の終助詞, お-префиксы
      masculine — мужская речь: ぞ、ぜ終助詞, грубые формы
    """

    description: str
    """
    1-2 предложения с практическими нюансами:
    типичные ошибки, особенности употребления, отличия от похожих слов,
    грамматические ловушки. На русском языке.
    """

    # ── Частотность ───────────────────────────────────────────────────────────

    frequency: Literal["very_common", "common", "uncommon", "rare", "specialized"]
    """
    Частота употребления в японском языке:
      very_common  — топ-1000 слов, встречается ежедневно
      common       — обычное употребление, знает большинство носителей
      uncommon     — редко в повседневной речи, но встречается в текстах
      rare         — очень редкое, узкоспециализированное
      specialized  — специализированная лексика (медицина, право, техника)
    """

    context: list[Literal["daily", "work", "travel", "food", "anime", "news", "letters", "academic"]]
    """
    Контексты употребления (один или несколько):
      daily    — повседневная жизнь и быт
      work     — рабочая/деловая среда
      travel   — путешествия и туризм
      food     — еда, рестораны, приготовление пищи
      anime    — аниме, манга, молодёжная культура, интернет
      news     — новости, СМИ, публичные речи
      letters  — переписка, письма, электронная почта
      academic — академические тексты, наука, образование
    """

    # ── Условно обязательные вложенные детали ────────────────────────────────

    verb_details: VerbDetails | None = None
    """Детали глагола. ОБЯЗАТЕЛЕН если word_type == 'verb', иначе null."""

    noun_details: NounDetails | None = None
    """Детали существительного. ОБЯЗАТЕЛЕН если word_type == 'noun', иначе null."""

    # ── Валидаторы ────────────────────────────────────────────────────────────

    @model_validator(mode="after")
    def _check_required_details(self) -> "WordClassification":
        """Проверяет наличие verb_details/noun_details для соответствующих типов."""
        if self.word_type == "verb" and self.verb_details is None:
            raise ValueError(
                "verb_details обязателен когда word_type == 'verb'"
            )
        if self.word_type == "noun" and self.noun_details is None:
            raise ValueError(
                "noun_details обязателен когда word_type == 'noun'"
            )
        return self

    @model_validator(mode="after")
    def _check_subcategory(self) -> "WordClassification":
        """Проверяет subcategory против допустимого списка для данного word_type."""
        allowed = SUBCATEGORY_MAP.get(self.word_type)
        if allowed is not None and self.subcategory not in allowed:
            raise ValueError(
                f"subcategory '{self.subcategory}' недопустим для word_type='{self.word_type}'.\n"
                f"Допустимые значения: {allowed}"
            )
        return self


# ── Промпт-билдер ─────────────────────────────────────────────────────────────

def build_prompt(word: str, reading: str, translation: str) -> str:
    """
    Возвращает готовый промпт для AI-модели (DeepSeek / Claude / GPT).
    Модель должна вернуть JSON, строго соответствующий схеме WordClassification.

    Args:
        word:        Японское слово (кандзи или кана): 食べる
        reading:     Чтение в хирагане: たべる
        translation: Перевод на русский: есть, кушать

    Returns:
        Строка-промпт для отправки в API.
    """
    schema = json.dumps(
        WordClassification.model_json_schema(),
        ensure_ascii=False,
        indent=2,
    )

    # Собираем пример допустимых подкатегорий для быстрой справки
    sub_hint = "\n".join(
        f"  {wt:12s}: {', '.join(lst)}"
        for wt, lst in SUBCATEGORY_MAP.items()
        if lst is not None
    )

    return f"""Ты — эксперт по японскому языку. Классифицируй японское слово и верни ТОЛЬКО валидный JSON без markdown, без пояснений.

## Слово для классификации
- Запись:  {word}
- Чтение:  {reading if reading else "—"}
- Перевод: {translation}

## Требуемая JSON-схема
{schema}

## Допустимые значения subcategory
{sub_hint}
  остальные типы: любая краткая строка на английском

## Правила
1. Верни ТОЛЬКО JSON-объект — никакого текста вокруг, никаких ```
2. Если word_type == "verb"  → заполни verb_details (не null)
3. Если word_type == "noun"  → заполни noun_details (не null)
4. В остальных случаях verb_details и noun_details = null
5. verb_details.verb_group — целое число 1, 2 или 3 (не строка)
6. context — список строк, хотя бы один элемент
7. description — на русском языке, 1-2 предложения

Верни JSON:"""


# ── Пример использования ──────────────────────────────────────────────────────
#
# from backend.schemas.classification import WordClassification, build_prompt
# import json
#
# # 1. Построить промпт
# prompt = build_prompt("食べる", "たべる", "есть, кушать")
#
# # 2. Отправить в AI и получить ответ (псевдокод)
# raw_json = ai_client.complete(prompt)  # → строка с JSON
#
# # 3. Распарсить и валидировать
# data = json.loads(raw_json)
# result = WordClassification.model_validate(data)
#
# # 4. Убедиться что verb_details заполнен
# assert result.verb_details is not None
# assert result.verb_details.verb_group == 2       # る-глагол
# assert result.verb_details.te_form == "食べて"
# assert result.word_type == "verb"
# assert result.jlpt_level == "N5"
#
# # Ожидаемый JSON от модели:
# # {
# #   "jlpt_level": "N5",
# #   "word_type": "verb",
# #   "subcategory": "action",
# #   "speech_register": "neutral",
# #   "description": "Основной глагол 'есть'. Пара 飲む (пить). Te-форма 食べて активно используется в ~ながら и ~てから конструкциях.",
# #   "frequency": "very_common",
# #   "context": ["daily", "food"],
# #   "verb_details": {
# #     "verb_group": 2,
# #     "is_transitive": true,
# #     "te_form": "食べて",
# #     "verb_subtype": "action"
# #   },
# #   "noun_details": null
# # }
