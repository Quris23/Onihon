"""
Классификация японских слов через OpenRouter API с валидацией по Pydantic-схеме.

Usage:
    python data/classify.py [options]

Options:
    --api-key KEY    OpenRouter API key (или env OPENROUTER_API_KEY)
    --model MODEL    Модель (default: deepseek/deepseek-chat-v3-0324)
    --batch N        Слов за один вызов API (default: 8)
    --limit N        Максимум слов (0 = все неклассифицированные)
    --dry-run        Не писать в БД
    --all            Переклассифицировать все слова
"""
import argparse
import json
import os
import pathlib
import re
import sqlite3
import sys
import time

from openai import OpenAI

# Добавляем корень проекта в sys.path для импорта схемы
ROOT = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
DB = ROOT / "nihongo.db"

from backend.schemas.classification import (
    WordClassification,
    NOUN_SUBCATEGORIES,
    VERB_SUBCATEGORIES,
    ADJ_SUBCATEGORIES,
)

OPENROUTER_BASE  = "https://openrouter.ai/api/v1"
GITHUB_BASE      = "https://models.inference.ai.azure.com"
DEFAULT_MODEL    = "deepseek/deepseek-chat-v3-0324"
DEFAULT_GH_MODEL = "DeepSeek-V3-0324"

JLPT_TO_INT = {"N5": 5, "N4": 4, "N3": 3, "N2": 2, "N1": 1, "none": None}


# ── Промпт для батча ──────────────────────────────────────────────────────────

def build_batch_prompt(words: list[dict]) -> str:
    items = json.dumps(
        [{"id": w["id"], "word": w["word"],
          "reading": w.get("reading") or "",
          "translation": w["translation"]}
         for w in words],
        ensure_ascii=False, indent=2,
    )
    return f"""Classify {len(words)} Japanese words. Return ONLY a JSON array of {len(words)} objects, no markdown.

WORDS:
{items}

Each object must have exactly these fields:
{{
  "id": <same integer id>,
  "jlpt_level": "N1"|"N2"|"N3"|"N4"|"N5"|"none",
  "word_type": "noun"|"verb"|"i_adj"|"na_adj"|"adverb"|"particle"|"counter"|"expression"|"conjunction"|"pronoun",
  "subcategory": <string — see rules>,
  "speech_register": "polite"|"neutral"|"casual"|"rough"|"written"|"feminine"|"masculine",
  "description": "<1-2 sentences in Russian about usage nuances, traps, differences from similar words>",
  "frequency": "very_common"|"common"|"uncommon"|"rare"|"specialized",
  "context": [<one or more of: "daily","work","travel","food","anime","news","letters","academic">],
  "verb_details": {{"verb_group":1|2|3,"is_transitive":true|false,"te_form":"<て-form>","verb_subtype":"motion"|"state"|"action"|"giving_receiving"|"potential"|"causative"|"passive"}} or null,
  "noun_details": {{"can_suru":true|false,"counter_suffix":"<string or null>"}} or null
}}

RULES:
1. verb_details REQUIRED (not null) when word_type=="verb"
2. noun_details REQUIRED (not null) when word_type=="noun"
3. verb_group must be integer: 1 (godan/う), 2 (ichidan/る), 3 (irregular する/くる)
4. subcategory for noun: {", ".join(NOUN_SUBCATEGORIES)}
5. subcategory for verb: {", ".join(VERB_SUBCATEGORIES)}
6. subcategory for i_adj/na_adj: {", ".join(ADJ_SUBCATEGORIES)}
7. subcategory for other types: any short English string

Return JSON array:"""


# ── Нормализация ответа модели ────────────────────────────────────────────────

def sanitize(data: dict) -> dict:
    """Приводит типы из JSON-ответа к тому что ждёт strict Pydantic."""
    # verb_group: "2" → 2
    vd = data.get("verb_details")
    if vd and isinstance(vd, dict):
        if "verb_group" in vd:
            try:
                vd["verb_group"] = int(vd["verb_group"])
            except (TypeError, ValueError):
                vd["verb_group"] = 1
        for bf in ("is_transitive",):
            if bf in vd and isinstance(vd[bf], str):
                vd[bf] = vd[bf].lower() in ("true", "1", "yes")
    # noun: can_suru string → bool
    nd = data.get("noun_details")
    if nd and isinstance(nd, dict):
        for bf in ("can_suru",):
            if bf in nd and isinstance(nd[bf], str):
                nd[bf] = nd[bf].lower() in ("true", "1", "yes")
    # context: string → list
    ctx = data.get("context")
    if isinstance(ctx, str):
        data["context"] = [c.strip() for c in ctx.split(",") if c.strip()]
    return data


def strip_think(text: str) -> str:
    return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()


def extract_json_array(text: str) -> list:
    text = strip_think(text)
    text = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    match = re.search(r"\[[\s\S]*\]", text)
    if not match:
        raise ValueError(f"No JSON array:\n{text[:300]}")
    return json.loads(match.group())


# ── Конвертация схемы → поля БД ───────────────────────────────────────────────

def schema_to_db(wc: WordClassification) -> dict:
    """Преобразует WordClassification в словарь для UPDATE."""
    vd = wc.verb_details
    nd = wc.noun_details
    return {
        "jlpt_level":     JLPT_TO_INT.get(wc.jlpt_level),
        "word_type":      wc.word_type,
        "subcategory":    wc.subcategory,
        "verb_group":     str(vd.verb_group) if vd else None,
        "speech_register":wc.speech_register,
        "description":    wc.description,
        "frequency":      wc.frequency,
        "context":        ",".join(wc.context),
        "is_transitive":  int(vd.is_transitive) if vd else None,
        "te_form":        vd.te_form if vd else None,
        "verb_subtype":   vd.verb_subtype if vd else None,
        "can_suru":       int(nd.can_suru) if nd else None,
        "counter_suffix": nd.counter_suffix if nd else None,
    }


# ── Основная функция ──────────────────────────────────────────────────────────

def classify_batch(client: OpenAI, model: str, words: list[dict]) -> list[tuple[int, dict]]:
    """Возвращает список (word_id, db_fields) для успешно классифицированных слов."""
    prompt = build_batch_prompt(words)
    response = client.chat.completions.create(
        model=model,
        max_tokens=1500,
        temperature=0,
        messages=[{"role": "user", "content": prompt}],
    )
    msg  = response.choices[0].message
    text = (msg.content or "") + "\n" + getattr(msg, "reasoning_content", "")
    raw_list = extract_json_array(text)

    results = []
    for item in raw_list:
        try:
            item = sanitize(item)
            wc   = WordClassification.model_validate(item)
            wid  = int(item["id"])
            results.append((wid, schema_to_db(wc)))
        except Exception as e:
            word_repr = item.get("word", item.get("id", "?"))
            print(f"\n    [warn] {word_repr}: {e}", flush=True)
    return results


def main():
    parser = argparse.ArgumentParser(description="Classify Japanese words via OpenRouter")
    parser.add_argument("--api-key",  help="OpenRouter or GitHub Models API key")
    parser.add_argument("--base-url", default=None, help="API base URL (default: OpenRouter)")
    parser.add_argument("--model",    default=None, help="Model name")
    parser.add_argument("--batch",    type=int, default=5)
    parser.add_argument("--limit",    type=int, default=0)
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--all",      action="store_true")
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("ERROR: set OPENROUTER_API_KEY or use --api-key")
        return 1

    # Автоопределение провайдера по ключу
    is_github = api_key.startswith("github_pat_")
    base_url  = args.base_url or (GITHUB_BASE if is_github else OPENROUTER_BASE)
    model     = args.model    or (DEFAULT_GH_MODEL if is_github else DEFAULT_MODEL)

    client = OpenAI(base_url=base_url, api_key=api_key)

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    q = "SELECT id, word, reading, translation FROM words"
    if not args.all:
        q += " WHERE word_type IS NULL OR word_type = ''"
    if args.limit:
        q += f" LIMIT {args.limit}"
    words = [dict(r) for r in con.execute(q).fetchall()]

    if not words:
        print("No unclassified words. Use --all to re-classify.")
        con.close()
        return 0

    batch_sz      = max(1, min(args.batch, 20))
    total         = len(words)
    total_batches = (total + batch_sz - 1) // batch_sz

    print(f"Model  : {model}  ({base_url})")
    print(f"Words  : {total}  |  batch={batch_sz}  |  batches={total_batches}")
    if args.dry_run:
        print("Mode   : DRY-RUN\n")
    else:
        print()

    ok = err = 0
    for i in range(0, total, batch_sz):
        batch     = words[i:i + batch_sz]
        batch_num = i // batch_sz + 1
        end_idx   = min(i + len(batch), total)
        print(f"  [{batch_num:>3}/{total_batches}] #{i+1}-{end_idx} ... ", end="", flush=True)

        try:
            results = classify_batch(client, model, batch)

            if not args.dry_run and results:
                for wid, fields in results:
                    con.execute("""
                        UPDATE words SET
                            jlpt_level=?, word_type=?, subcategory=?, verb_group=?,
                            speech_register=?, description=?, frequency=?, context=?,
                            is_transitive=?, te_form=?, verb_subtype=?,
                            can_suru=?, counter_suffix=?
                        WHERE id=?
                    """, (
                        fields["jlpt_level"], fields["word_type"], fields["subcategory"],
                        fields["verb_group"], fields["speech_register"], fields["description"],
                        fields["frequency"], fields["context"],
                        fields["is_transitive"], fields["te_form"], fields["verb_subtype"],
                        fields["can_suru"], fields["counter_suffix"],
                        wid,
                    ))
                con.commit()

            ok  += len(results)
            miss = len(batch) - len(results)
            print(f"OK  ({len(results)} classified{f', {miss} missed' if miss else ''})")

        except Exception as e:
            print(f"ERROR: {e}")
            err += len(batch)

        if i + batch_sz < total:
            time.sleep(0.3)

    con.close()
    print(f"\nDone: {ok} classified, {err} errors")
    if args.dry_run:
        print("(dry-run — DB not modified)")
    return 0


if __name__ == "__main__":
    exit(main())
