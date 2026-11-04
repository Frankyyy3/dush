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

def test_connection():
    print("--- Testing Connection ---")
    try:
        with SSHTunnelForwarder(
            (SSH_HOST, SSH_PORT),
            ssh_username=SSH_USER,
            ssh_password=SSH_PASS,
            remote_bind_address=(DB_HOST, DB_PORT)
        ) as tunnel:
            print(f"Tunnel established on port: {tunnel.local_bind_port}")
            
            DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@127.0.0.1:{tunnel.local_bind_port}/{DB_NAME}"
            engine = create_engine(DATABASE_URL)
            
            with engine.connect() as connection:
                # 1. Test Read
                print("Testing Read...")
                result = connection.execute(text("SELECT 1"))
                print(f"Read successful: {result.fetchone()}")
                
                # 2. Test Tables
                print("Listing tables in 'nitro'...")
                tables = connection.execute(text("SHOW TABLES"))
                for table in tables:
                    print(f" - {table[0]}")
                    
                # 3. Test Write (Attempt)
                print("\nAttempting to check Write permissions (creating a temp table)...")
                try:
                    connection.execute(text("CREATE TEMPORARY TABLE test_perm (id INT)"))
                    print("SUCCESS: Write permission detected (at least for temp tables).")
                except Exception as e:
                    print(f"FAILED: Write permission denied. Error: {e}")
                    print("\nIMPORTANT: If this DB is Read-Only, we MUST use a local SQLite for bookings.")

    except Exception as e:
        print(f"Critical Error: {e}")

if __name__ == "__main__":
    test_connection()
