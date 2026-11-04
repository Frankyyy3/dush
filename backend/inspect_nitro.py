import os
from sqlalchemy import create_engine, text
from sshtunnel import SSHTunnelForwarder
from dotenv import load_dotenv

load_dotenv()

# Config
SSH_HOST = os.getenv("SSH_HOST")
SSH_USER = os.getenv("SSH_USER")
SSH_PASS = os.getenv("SSH_PASS")
SSH_PORT = int(os.getenv("SSH_PORT", 22))

DB_HOST = os.getenv("DB_HOST")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_NAME = os.getenv("DB_NAME")
DB_PORT = int(os.getenv("DB_PORT", 3306))

def describe_tables():
    target_tables = ['users', 'students', 'dormitories', 'dorm_rooms', 'dorm_resident_log']
    
    try:
        with SSHTunnelForwarder(
            (SSH_HOST, SSH_PORT),
            ssh_username=SSH_USER,
            ssh_password=SSH_PASS,
            remote_bind_address=(DB_HOST, DB_PORT)
        ) as tunnel:
            DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@127.0.0.1:{tunnel.local_bind_port}/{DB_NAME}"
            engine = create_engine(DATABASE_URL)
            
            with engine.connect() as conn:
                for table in target_tables:
                    print(f"\n--- DESCRIBE {table} ---")
                    try:
                        res = conn.execute(text(f"DESCRIBE {table}"))
                        for row in res:
                            print(row)
                    except Exception as e:
                        print(f"Error describing {table}: {e}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    describe_tables()
