import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('nihongo.db')
c = conn.cursor()

# Check if already exists
c.execute("SELECT id FROM words WHERE reading = 'よろしくおねがいします'")
if c.fetchone():
    print("Already exists")
    conn.close()
    sys.exit(0)

c.execute("""
INSERT INTO words (word, reading, translation, word_type, jlpt_level)
VALUES (?, ?, ?, ?, ?)
""", (
    'よろしくお願いします',
    'よろしくおねがいします',
    'прошу отнестись хорошо; рад знакомству',
    'expression',
    5
))
conn.commit()
print(f"Added id={c.lastrowid}")
conn.close()
