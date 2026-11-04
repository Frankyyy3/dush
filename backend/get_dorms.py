import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import start_remote_connection, remote_engine
from sqlalchemy import text

start_remote_connection()
with remote_engine.connect() as conn:
    result = conn.execute(text("SELECT DISTINCT name FROM dormitories WHERE name IS NOT NULL AND name != ''"))
    for row in result:
        print("DORM_FOUND: " + row[0])
