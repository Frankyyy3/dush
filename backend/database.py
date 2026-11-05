import os
import hashlib
import bcrypt
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, text, Boolean, UniqueConstraint, Date, Time
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import datetime
from sshtunnel import SSHTunnelForwarder
from dotenv import load_dotenv

load_dotenv()

# --- Config ---
SSH_HOST = os.getenv("SSH_HOST")
SSH_USER = os.getenv("SSH_USER")
SSH_PASS = os.getenv("SSH_PASS")
SSH_PORT = int(os.getenv("SSH_PORT", 22))

DB_HOST = os.getenv("DB_HOST")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_NAME = os.getenv("DB_NAME")
DB_PORT = int(os.getenv("DB_PORT", 3306))

PG_HOST = os.getenv("PG_HOST", "127.0.0.1")
PG_USER = os.getenv("PG_USER", "postgres")
PG_PASS = os.getenv("PG_PASS", "")
PG_NAME = os.getenv("PG_NAME", "shower_db")
PG_PORT = os.getenv("PG_PORT", "5432")

# --- Engines ---
# DATABASE_URL используется только для локального запуска (sqlite:///...),
# в продакшене переменная не задана — работает PostgreSQL.
POSTGRES_URL = os.getenv("DATABASE_URL") or f"postgresql://{PG_USER}:{PG_PASS}@{PG_HOST}:{PG_PORT}/{PG_NAME}"
pg_engine = create_engine(
    POSTGRES_URL,
    connect_args={"check_same_thread": False} if POSTGRES_URL.startswith("sqlite") else {},
)
LocalSession = sessionmaker(autocommit=False, autoflush=False, bind=pg_engine)

remote_engine = None
RemoteSession = sessionmaker(autocommit=False, autoflush=False)
tunnel = None
Base = declarative_base()

# --- Models (Postgres) ---
class User(Base):
    __tablename__ = "app_users"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, unique=True, index=True)
    password = Column(String, nullable=True)
    fullname = Column(String)
    dorm_name = Column(String)
    room = Column(String)
    role = Column(String, default="student")
    push_subscription = Column(String, nullable=True)
    accessible_dorms = Column(String, nullable=True) # JSON string array of dorms
    can_send_push = Column(Boolean, default=False) # Права на рассылку для комендантов
    bookings = relationship("Booking", back_populates="owner")
    push_devices = relationship("PushSubscriptionDevice", back_populates="user", cascade="all, delete-orphan")

class PushSubscriptionDevice(Base):
    """Отдельная подписка на каждое устройство (iPhone + Android и т.д.)."""
    __tablename__ = "push_subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id"), index=True, nullable=False)
    endpoint = Column(String, unique=True, index=True, nullable=False)
    subscription_json = Column(String, nullable=False)
    user_agent = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    user = relationship("User", back_populates="push_devices")

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date) 
    time = Column(Time) 
    type = Column(String, default="shower") # shower or laundry
    booth = Column(Integer)
    check_code = Column(String) # 4-значный код
    dorm_name = Column(String) # Изоляция по общагам
    user_id = Column(Integer, ForeignKey("app_users.id"))
    is_attended = Column(Boolean, default=False)
    notification_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    owner = relationship("User", back_populates="bookings")
    
    __table_args__ = (
        UniqueConstraint('date', 'time', 'booth', 'dorm_name', 'type', name='_booth_time_type_uc'),
    )

class BoothStatus(Base):
    __tablename__ = "booth_status"
    id = Column(Integer, primary_key=True, index=True)
    dorm_name = Column(String, nullable=False)
    booth = Column(Integer, nullable=False)
    type = Column(String, default="shower") # shower or laundry
    is_active = Column(Boolean, default=True)  # False = На ремонте
    reason = Column(String, nullable=True)     # Причина закрытия
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    __table_args__ = (
        UniqueConstraint('dorm_name', 'booth', 'type', name='_dorm_booth_type_uc'),
    )

class DormConfig(Base):
    __tablename__ = "dorm_configs"
    id = Column(Integer, primary_key=True, index=True)
    dorm_name = Column(String, unique=True, index=True)
    shower_count = Column(Integer, default=4)
    laundry_count = Column(Integer, default=4)
    start_time = Column(String, default="08:00")
    end_time = Column(String, default="21:00")
    slot_duration = Column(Integer, default=30)
    disabled_slots = Column(String, default="[]")

class HolidayBlock(Base):
    __tablename__ = "holiday_blocks"
    id = Column(Integer, primary_key=True, index=True)
    dorm_name = Column(String, index=True)
    start_date = Column(Date, index=True)
    end_date = Column(Date, index=True)
    reason = Column(String)

class BannedStudent(Base):
    __tablename__ = "banned_students"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, unique=True, index=True)
    reason = Column(String, nullable=True)
    banned_at = Column(DateTime, default=datetime.datetime.utcnow)
    banned_by = Column(Integer, ForeignKey("app_users.id"), nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String) # verify, delete, update
    admin_id = Column(Integer, ForeignKey("app_users.id"))
    booking_id = Column(Integer, nullable=True)
    details = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    admin = relationship("User")

def _migrate_legacy_push_subscriptions():
    """Перенос старых одиночных push_subscription в таблицу устройств."""
    import json
    session = LocalSession()
    try:
        users = session.query(User).filter(
            User.push_subscription != None,
            User.push_subscription != "",
            User.role == "student",
        ).all()
        for user in users:
            try:
                data = json.loads(user.push_subscription)
                endpoint = data.get("endpoint")
                if not endpoint or not data.get("keys"):
                    continue
                exists = session.query(PushSubscriptionDevice).filter(
                    PushSubscriptionDevice.endpoint == endpoint
                ).first()
                if exists:
                    continue
                session.add(PushSubscriptionDevice(
                    user_id=user.id,
                    endpoint=endpoint,
                    subscription_json=user.push_subscription,
                ))
            except Exception:
                continue
        session.commit()
    except Exception as e:
        session.rollback()
        print(f"Push migration warning: {e}")
    finally:
        session.close()

def start_remote_connection():
    global tunnel, remote_engine
    if not all((SSH_HOST, SSH_USER, SSH_PASS, DB_HOST, DB_USER, DB_PASS, DB_NAME)):
        print("Nitro DB tunnel is not configured; Platonus student login is unavailable.")
        return

    try:
        # Close the existing SSH tunnel if it exists
        if tunnel:
            try:
                tunnel.stop()
                print("Stopped existing SSH tunnel.")
            except Exception as e_tunnel:
                print(f"Error stopping old tunnel: {e_tunnel}")

        # Dispose the existing SQLAlchemy engine if it exists
        if remote_engine:
            try:
                remote_engine.dispose()
                print("Disposed existing remote DB engine.")
            except Exception as e_engine:
                print(f"Error disposing old remote engine: {e_engine}")

        tunnel = SSHTunnelForwarder(
            (SSH_HOST, SSH_PORT),
            ssh_username=SSH_USER,
            ssh_password=SSH_PASS,
            remote_bind_address=(DB_HOST, DB_PORT)
        )
        tunnel.start()
        REMOTE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@127.0.0.1:{tunnel.local_bind_port}/{DB_NAME}"
        remote_engine = create_engine(REMOTE_URL, pool_pre_ping=True)
        RemoteSession.configure(bind=remote_engine)
        print("Connected to Nitro DB via tunnel.")
    except Exception as e:
        print(f"Nitro Tunnel Error: {e}")

def init_db():
    Base.metadata.create_all(bind=pg_engine)
    # Ручные миграции для добавления новых колонок в существующую БД
    conn = pg_engine.connect()
    for stmt in [
        "ALTER TABLE dorm_configs ADD COLUMN start_time VARCHAR DEFAULT '08:00';",
        "ALTER TABLE dorm_configs ADD COLUMN end_time VARCHAR DEFAULT '21:00';",
        "ALTER TABLE dorm_configs ADD COLUMN slot_duration INTEGER DEFAULT 30;",
        "ALTER TABLE dorm_configs ADD COLUMN disabled_slots VARCHAR DEFAULT '[]';",
        "ALTER TABLE bookings ADD COLUMN notification_sent BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE app_users ADD COLUMN accessible_dorms VARCHAR;",
        "ALTER TABLE app_users ADD COLUMN can_send_push BOOLEAN DEFAULT FALSE;"
    ]:
        try:
            conn.execute(text(stmt))
            conn.commit()
        except Exception:
            conn.rollback()
    conn.close()

    _migrate_legacy_push_subscriptions()

    start_remote_connection()

    session = LocalSession()
    admin_login = "admin"
    if not session.query(User).filter(User.student_id == admin_login).first():
        admin_raw_pass = os.getenv("ADMIN_PASSWORD", "admin_password")
        # Используем bcrypt для хеширования пароля админа
        hashed_pass = bcrypt.hashpw(admin_raw_pass.encode(), bcrypt.gensalt()).decode()
        
        session.add(User(
            student_id=admin_login, 
            password=hashed_pass, 
            fullname="Комендант", 
            dorm_name="UNIT-ALL", 
            role="admin"
        ))
        session.commit()

    if remote_engine:
        try:
            with remote_engine.connect() as remote_conn:
                res = remote_conn.execute(text("SELECT DISTINCT name FROM dormitories WHERE name IS NOT NULL AND name != ''"))
                dorms = [row[0] for row in res]
                
            for i, d_name in enumerate(dorms):
                login = f"admin_ds{i+1}"
                if not session.query(User).filter(User.student_id == login).first():
                    # Default password is the login name
                    pwd = login 
                    hp = bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()
                    session.add(User(
                        student_id=login,
                        password=hp,
                        fullname=f"Комендант {d_name}",
                        dorm_name=d_name,
                        role="admin",
                        accessible_dorms=f'["{d_name}"]'
                    ))
            session.commit()
        except Exception as e:
            print("Error auto-creating dorm admins:", e)
            
    session.close()

def verify_student_platonus(username, password):
    global tunnel
    if not tunnel or not tunnel.is_active:
        print("SSH Tunnel down, attempting restart...")
        start_remote_connection()
        
    if not remote_engine: return None
    try:
        with remote_engine.connect() as conn:
            # Окончательная структура для вашей версии Платонуса
            # Данные логина и пароля хранятся прямо в таблице students
            query = text("""
                SELECT 
                    s.Login, 
                    s.Password, 
                    d.name as dorm_name, 
                    dr.roomnumber as room_number,
                    CONCAT(s.lastname, ' ', s.firstname) as fullname
                FROM students s
                JOIN dormitory_room_tenants ten ON s.StudentID = ten.tenantid
                JOIN dormitory_rooms dr ON ten.roomid = dr.roomid
                JOIN dormitories d ON dr.dormitoryid = d.dormitoryid
                WHERE s.Login = :u 
                AND ten.iscurrent = 1
                LIMIT 1
            """)
            result = conn.execute(query, {"u": username}).fetchone()
            
            if result:
                db_pass = result[1]
                # Пароли в вашей базе хранятся в формате MD5
                hashed_input = hashlib.md5(password.encode()).hexdigest()
                
                if db_pass == hashed_input:
                    return {
                        "student_id": result[0],
                        "fullname": result[4],
                        "dorm_name": result[2],
                        "room": result[3]
                    }
            return None
    except Exception as e:
        print(f"Nitro Auth Error: {e}")
        return None
