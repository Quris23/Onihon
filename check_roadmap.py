import sqlite3, re, sys
sys.stdout.reconfigure(encoding="utf-8")

with open("docs/roadmap-data.js", encoding="utf-8") as f:
    content = f.read()

words_raw = re.findall(r'\{\s*jp:\s*"([^"]+)",\s*ru:\s*"([^"]+)"\s*\}', content)
kanji_raw = re.findall(r'\{\s*kanji:\s*"([^"]+)",\s*read:\s*"([^"]+)",\s*mean:\s*"([^"]+)"\s*\}', content)

conn = sqlite3.connect("nihongo.db")
conn.row_factory = sqlite3.Row

print("=== WORDS ===")
for jp, ru in words_raw:
    cur = conn.execute("SELECT id, word, reading FROM words WHERE word=? OR reading=?", (jp, jp))
    row = cur.fetchone()
    if row:
        print(f"  OK   '{jp}' → id={row['id']} word='{row['word']}' reading='{row['reading']}'")
    else:
        cur2 = conn.execute("SELECT id, word, reading FROM words WHERE word LIKE ? OR reading LIKE ?", (f"%{jp}%", f"%{jp}%"))
        row2 = cur2.fetchone()
        if row2:
            print(f"  LIKE '{jp}' → id={row2['id']} word='{row2['word']}' reading='{row2['reading']}'")
        else:
            print(f"  MISS '{jp}' ({ru})")

print()
print("=== KANJI ===")
for kanji, read, mean in kanji_raw:
    cur = conn.execute("SELECT id, character FROM kanji WHERE character=?", (kanji,))
    row = cur.fetchone()
    print(f"  {'OK  ' if row else 'MISS'} '{kanji}' ({mean}){' → id='+str(row['id']) if row else ''}")

conn.close()
