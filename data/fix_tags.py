import sqlite3, pathlib

DB = pathlib.Path(__file__).parent.parent / "nihongo.db"
con = sqlite3.connect(DB)
con.execute("UPDATE words SET tags = '' WHERE tags = '存在名詞' OR tags = 'すんじゅつ'")

# На случай если тег написан по-русски (как в import_nouns.py)
cur = con.execute("UPDATE words SET tags = '' WHERE tags = ?", ('существительное',))
con.commit()
print(f"Done, rows affected: {cur.rowcount}")
con.close()
