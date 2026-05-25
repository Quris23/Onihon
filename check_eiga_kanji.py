import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect('nihongo.db')
c = conn.cursor()
c.execute("SELECT id, character, meaning FROM kanji WHERE character IN (?, ?, ?)", ('映', '画', '円'))
for row in c.fetchall():
    print(row)
conn.close()
