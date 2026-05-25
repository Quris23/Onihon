import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect('nihongo.db')
c = conn.cursor()
c.execute("SELECT id, word, reading, translation FROM words WHERE reading LIKE ? OR word LIKE ?",
          ('%よろし%', '%よろし%'))
for row in c.fetchall():
    print(row)
conn.close()
