import os
from fastapi import FastAPI, Depends, HTTPException, status, Request, Header, BackgroundTasks, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text as sql_text
from typing import List, Optional
import database as db
from pydantic import BaseModel
from datetime import datetime, date, time, timedelta, timezone
from dotenv import load_dotenv

import hashlib
import jwt
import bcrypt
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import json
import asyncio
from pywebpush import webpush, WebPushException

load_dotenv()

VAPID_PRIVATE_KEY = os.path.join(os.path.dirname(__file__), "private_key.pem")
VAPID_CLAIMS = {"sub": "mailto:admin@aquaflow.kz"}
# FCM (Android Chrome) часто отбрасывает push с низким TTL, если телефон «спит»
PUSH_TTL = int(os.getenv("PUSH_TTL", "86400"))
PUSH_HEADERS = {"Urgency": "high"}
PUSH_ICON_URL = "/university_logo.png"
PUSH_BADGE_URL = "/favicon.png"


def send_web_push(subscription_info: dict, title: str, body: str) -> tuple[bool, Optional[int]]:
    """Отправка push с приоритетом для Android. Возвращает (успех, http-код ошибки)."""
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps({
                "title": title,
                "body": body,
                "icon": PUSH_ICON_URL,
                "badge": PUSH_BADGE_URL,
            }),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS.copy(),
            ttl=PUSH_TTL,
            headers=PUSH_HEADERS,
        )
        return True, None
    except WebPushException as ex:
        status_code = getattr(getattr(ex, "response", None), "status_code", None)
        print(f"WebPush Error ({status_code}): {ex}")
        return False, status_code
    except Exception as e:
        print(f"WebPush Error: {e}")
        return False, None


def parse_subscription_json(raw: Optional[str]) -> Optional[dict]:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if data.get("endpoint") and data.get("keys"):
            return {"endpoint": data["endpoint"], "keys": data["keys"]}
    except Exception:
        pass
    return None


def upsert_device_subscription(
    session: Session,
    user: db.User,
    endpoint: str,
    keys: dict,
    user_agent: Optional[str] = None,
) -> None:
    payload = json.dumps({"endpoint": endpoint, "keys": keys})
    user.push_subscription = payload
    device = session.query(db.PushSubscriptionDevice).filter(
        db.PushSubscriptionDevice.endpoint == endpoint
    ).first()
    if device:
        device.user_id = user.id
        device.subscription_json = payload
        device.user_agent = (user_agent or device.user_agent or "")[:255] or None
        device.updated_at = datetime.utcnow()
    else:
        session.add(db.PushSubscriptionDevice(
            user_id=user.id,
            endpoint=endpoint,
            subscription_json=payload,
            user_agent=(user_agent or "")[:255] or None,
        ))


def get_user_push_targets(session: Session, user: db.User) -> List[tuple]:
    """Список (device|None, subscription_info) для всех устройств пользователя."""
    targets = []
    devices = session.query(db.PushSubscriptionDevice).filter(
        db.PushSubscriptionDevice.user_id == user.id
    ).all()
    for device in devices:
        parsed = parse_subscription_json(device.subscription_json)
        if parsed:
            targets.append((device, parsed))
    if not targets:
        parsed = parse_subscription_json(user.push_subscription)
        if parsed:
            targets.append((None, parsed))
    return targets


def remove_stale_push_target(
    session: Session,
    user: db.User,
    device: Optional[db.PushSubscriptionDevice],
    status_code: Optional[int],
) -> None:
    if status_code not in (403, 404, 410):
        return
    if device:
        session.delete(device)
    else:
        user.push_subscription = None


def send_push_to_user(session: Session, user: db.User, title: str, body: str) -> tuple[int, int]:
    """Отправка на все устройства студента. Возвращает (sent, failed)."""
    sent, failed = 0, 0
    for device, sub_info in get_user_push_targets(session, user):
        ok, status_code = send_web_push(sub_info, title, body)
        if ok:
            sent += 1
        else:
            failed += 1
            remove_stale_push_target(session, user, device, status_code)
    if sent or failed:
        session.commit()
    return sent, failed


def user_has_push_targets(session: Session, user: db.User) -> bool:
    if session.query(db.PushSubscriptionDevice).filter(
        db.PushSubscriptionDevice.user_id == user.id
    ).first():
        return True
    return bool(parse_subscription_json(user.push_subscription))


def build_mass_push_devices_query(session: Session, admin: db.User, dorms: List[str]):
    """Запрос устройств для рассылки (права админа должны быть проверены до вызова)."""
    query = session.query(db.PushSubscriptionDevice).join(db.User).filter(db.User.role == "student")
    if admin.dorm_name != "UNIT-ALL":
        allowed_dorms = get_admin_dorms(admin)
        target_dorms = dorms if dorms else allowed_dorms
        if target_dorms:
            query = query.filter(db.User.dorm_name.in_(target_dorms))
    elif dorms:
        query = query.filter(db.User.dorm_name.in_(dorms))
    return query


def validate_mass_push_dorms(admin: db.User, dorms: List[str]) -> None:
    if admin.dorm_name == "UNIT-ALL" or not dorms:
        return
    allowed_dorms = get_admin_dorms(admin)
    invalid = [d for d in dorms if d not in allowed_dorms]
    if invalid:
        raise HTTPException(
            status_code=403,
            detail=f"У вас нет доступа к общежитиям: {', '.join(invalid)}",
        )


def _mass_push_background(admin_id: int, title: str, message: str, dorms: List[str]) -> None:
    session = db.LocalSession()
    sent = 0
    failed = 0
    try:
        admin = session.query(db.User).filter(db.User.id == admin_id).first()
        if not admin:
            return
        devices = build_mass_push_devices_query(session, admin, dorms).all()
        for device in devices:
            sub_info = parse_subscription_json(device.subscription_json)
            if not sub_info:
                failed += 1
                session.delete(device)
                continue
            ok, status_code = send_web_push(sub_info, title, message)
            if ok:
                sent += 1
            else:
                failed += 1
                if status_code in (403, 404, 410):
                    session.delete(device)
        log = db.AuditLog(
            action="mass_push",
            admin_id=admin_id,
            details=(
                f"BG dorms: {', '.join(dorms) if dorms else 'ALL'} | "
                f"msg: {message[:120]} | sent={sent}, failed={failed}"
            ),
        )
        session.add(log)
        session.commit()
        print(f"[mass-push] admin={admin_id} sent={sent} failed={failed}", flush=True)
    except Exception as e:
        session.rollback()
        print(f"[mass-push] background error: {e}", flush=True)
    finally:
        session.close()

db.init_db()
LOCAL_STUDENT_AUTH = (
    os.getenv("LOCAL_STUDENT_AUTH") == "1"
    and db.pg_engine.url.get_backend_name() == "sqlite"
)

app = FastAPI(title="AquaPass API")

def get_local_now():
    try:
        from datetime import timezone, timedelta
        # Shakarim University is located in UTC+5 timezone (Asia/Almaty / Semey)
        tz = timezone(timedelta(hours=5))
        return datetime.now(tz).replace(tzinfo=None)
    except Exception:
        return datetime.now()

SECRET_KEY = os.getenv("SECRET_KEY", "shower_secret_salt")
ALGORITHM = "HS256"

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://dorm.shakarim.kz",
        "https://dorm.shakarim.kz",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas ---
class BookingCreate(BaseModel):
    date: str
    time: str
    booth: int
    user_id: int
    type: str = "shower"

class BookingUpdate(BaseModel):
    date: Optional[str] = None
    time: Optional[str] = None
    booth: Optional[int] = None

class BookingResponse(BaseModel):
    id: int
    date: date
    time: time
    type: str
    booth: int
    user_id: int
    check_code: Optional[str] = None
    owner_name: Optional[str] = None
    dorm_name: Optional[str] = None
    is_attended: bool = False
    class Config:
        from_attributes = True

login_attempts_cache = {}

class UserLogin(BaseModel):
    student_id: str
    password: str

class DormConfigUpdate(BaseModel):
    dorm_name: str
    shower_count: Optional[int] = None
    laundry_count: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    slot_duration: Optional[int] = None
    disabled_slots: Optional[str] = None

class HolidayBlockCreate(BaseModel):
    dorm_name: str
    start_date: str
    end_date: str
    reason: str

def get_db():
    session = db.LocalSession()
    try:
        yield session
    finally:
        session.close()

def get_current_user(authorization: Optional[str] = Header(None), token: Optional[str] = None, session: Session = Depends(get_db)):
    extracted_token = None
    if authorization and authorization.startswith("Bearer "):
        extracted_token = authorization.split(" ")[1]
    elif token:
        extracted_token = token

    if not extracted_token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(extracted_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        user = session.query(db.User).filter(db.User.id == int(user_id)).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        # Дополнительная защита: Проверяем, не заблокирован ли пользователь прямо сейчас
        if user.role != "admin":
            banned = session.query(db.BannedStudent).filter(db.BannedStudent.student_id == user.student_id).first()
            if banned:
                raise HTTPException(status_code=403, detail=f"Ваш аккаунт заблокирован. Причина: {banned.reason}")
                
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Token corruption")

def admin_required(user: db.User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# --- Routes ---

@app.post("/login")
@limiter.limit("100/minute")
def login(request: Request, user_data: UserLogin, session: Session = Depends(get_db)):
    # Логика защиты от подбора пароля (по логину студента, а не по IP общежития)
    now = datetime.utcnow().timestamp()
    if user_data.student_id in login_attempts_cache:
        attempts, first_time = login_attempts_cache[user_data.student_id]
        if now - first_time > 60:
            login_attempts_cache[user_data.student_id] = [1, now]
        else:
            if attempts >= 5:
                raise HTTPException(status_code=429, detail="Слишком много попыток для этого студента. Подождите 1 минуту.")
            login_attempts_cache[user_data.student_id][0] += 1
    else:
        login_attempts_cache[user_data.student_id] = [1, now]

    # 1. Сначала проверяем, не комендант ли это (локальный вход)
    local_user = session.query(db.User).filter(db.User.student_id == user_data.student_id).first()
    if local_user and local_user.role == "admin" and local_user.password:
        if bcrypt.checkpw(user_data.password.encode(), local_user.password.encode()):
            access_token = jwt.encode({"sub": str(local_user.id), "exp": datetime.utcnow() + timedelta(days=7)}, SECRET_KEY, algorithm=ALGORITHM)
            acc_dorms = []
            if local_user.accessible_dorms:
                try:
                    acc_dorms = json.loads(local_user.accessible_dorms)
                except Exception:
                    pass
            return {
                "id": local_user.id, 
                "student_id": local_user.student_id, 
                "fullname": local_user.fullname,
                "dorm_name": local_user.dorm_name,
                "role": "admin",
                "accessible_dorms": acc_dorms,
                "can_send_push": local_user.can_send_push,
                "token": access_token
            }

    # 2. Проверка бана
    banned = session.query(db.BannedStudent).filter(db.BannedStudent.student_id == user_data.student_id).first()
    if banned:
        raise HTTPException(status_code=403, detail=f"Ваш аккаунт заблокирован. Причина: {banned.reason or 'Не указана'}. Обратитесь к администрации.")

    if LOCAL_STUDENT_AUTH:
        if (
            local_user
            and local_user.role == "student"
            and local_user.password
            and bcrypt.checkpw(user_data.password.encode(), local_user.password.encode())
        ):
            access_token = jwt.encode(
                {"sub": str(local_user.id), "exp": datetime.utcnow() + timedelta(days=7)},
                SECRET_KEY,
                algorithm=ALGORITHM,
            )
            return {
                "id": local_user.id,
                "student_id": local_user.student_id,
                "fullname": local_user.fullname,
                "dorm_name": local_user.dorm_name,
                "room": local_user.room,
                "role": "student",
                "token": access_token,
            }
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    # 3. Проверка через Платонус
    platonus_user = db.verify_student_platonus(user_data.student_id, user_data.password)
    if not platonus_user:
        raise HTTPException(status_code=401, detail="Ошибка входа: Неверный логин или вы не в общаге")

    # 3. Синхронизация студента
    user = session.query(db.User).filter(db.User.student_id == platonus_user['student_id']).first()
    if not user:
        user = db.User(
            student_id=platonus_user['student_id'], 
            fullname=platonus_user['fullname'],
            dorm_name=platonus_user['dorm_name'],
            room=platonus_user['room'],
            role="student"
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    else:
        user.dorm_name = platonus_user['dorm_name']
        user.room = platonus_user['room']
        session.commit()
    
    access_token = jwt.encode({"sub": str(user.id), "exp": datetime.utcnow() + timedelta(days=7)}, SECRET_KEY, algorithm=ALGORITHM)
    return {
        "id": user.id, 
        "student_id": user.student_id, 
        "fullname": user.fullname,
        "dorm_name": user.dorm_name,
        "room": user.room,
        "role": "student",
        "token": access_token
    }

# --- Admin Endpoints ---

def get_admin_dorms(admin: db.User) -> List[str]:
    if admin.dorm_name == "UNIT-ALL":
        return []
    try:
        return json.loads(admin.accessible_dorms) if admin.accessible_dorms else [admin.dorm_name]
    except Exception:
        return [admin.dorm_name]

@app.get("/admin/dorms")
def get_dorms(admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    """Возвращает список уникальных общежитий из реальных данных Nitro (через app_users)."""
    if admin.dorm_name != "UNIT-ALL":
        return get_admin_dorms(admin)
    
    rows = (
        session.query(db.User.dorm_name)
        .filter(db.User.dorm_name != None, db.User.dorm_name != "UNIT-ALL")
        .distinct()
        .order_by(db.User.dorm_name)
        .all()
    )
    return [r.dorm_name for r in rows]

@app.get("/dorm-config")
def get_dorm_config(dorm_name: str, session: Session = Depends(get_db)):
    config = session.query(db.DormConfig).filter(db.DormConfig.dorm_name == dorm_name).first()
    if not config:
        # Create default config if missing
        config = db.DormConfig(
            dorm_name=dorm_name,
            shower_count=4,
            laundry_count=4,
            start_time="08:00",
            end_time="21:00",
            slot_duration=30,
            disabled_slots="[]"
        )
        session.add(config)
        session.commit()
        session.refresh(config)
    return config

@app.post("/admin/dorm-config")
def update_dorm_config(data: DormConfigUpdate, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    if admin.dorm_name != "UNIT-ALL" and data.dorm_name not in get_admin_dorms(admin):
        raise HTTPException(status_code=403, detail="Нельзя изменять настройки чужого общежития")
        
    config = session.query(db.DormConfig).filter(db.DormConfig.dorm_name == data.dorm_name).first()
    if not config:
        config = db.DormConfig(dorm_name=data.dorm_name)
        session.add(config)
    
    if data.shower_count is not None:
        config.shower_count = data.shower_count
    if data.laundry_count is not None:
        config.laundry_count = data.laundry_count
    if data.start_time is not None:
        config.start_time = data.start_time
    if data.end_time is not None:
        config.end_time = data.end_time
    if data.slot_duration is not None:
        config.slot_duration = data.slot_duration
    if data.disabled_slots is not None:
        config.disabled_slots = data.disabled_slots
    
    session.commit()
    return config

@app.get("/admin/bookings", response_model=List[BookingResponse])
def get_all_bookings(admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    query = session.query(db.Booking)
    if admin.dorm_name != "UNIT-ALL":
        query = query.filter(db.Booking.dorm_name.in_(get_admin_dorms(admin)))
    bookings = query.order_by(db.Booking.created_at.desc()).all()
    # Добавляем имя владельца для аналитики
    res = []
    for b in bookings:
        res.append({
            "id": b.id,
            "date": b.date,
            "time": b.time,
            "booth": b.booth,
            "user_id": b.user_id,
            "check_code": b.check_code,
            "owner_name": b.owner.fullname if b.owner else "Unknown",
            "dorm_name": b.owner.dorm_name if b.owner else "Unknown",
            "is_attended": b.is_attended,
            "type": getattr(b, 'type', 'shower') or 'shower'
        })
    return res

@app.delete("/admin/bookings/{booking_id}")
def delete_booking(booking_id: int, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    booking = session.query(db.Booking).filter(db.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if admin.dorm_name != "UNIT-ALL" and booking.dorm_name not in get_admin_dorms(admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if booking.owner and user_has_push_targets(session, booking.owner):
        try:
            type_name = "в душ" if getattr(booking, 'type', 'shower') == "shower" else "в прачечную"
            msg_body = f"Ваша запись {type_name} на {booking.time.strftime('%H:%M')} отменена администратором."
            send_push_to_user(session, booking.owner, "Запись отменена", msg_body)
        except Exception as e:
            print("Failed to send cancel push:", e)

    # Audit Log
    log = db.AuditLog(action="delete", admin_id=admin.id, booking_id=booking_id, details=f"Deleted booking for {booking.owner.fullname if booking.owner else 'Unknown'}")
    session.add(log)
    
    session.delete(booking)
    session.commit()
    return {"status": "deleted"}

@app.patch("/admin/bookings/{booking_id}")
def update_booking(booking_id: int, update_data: BookingUpdate, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    booking = session.query(db.Booking).filter(db.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if admin.dorm_name != "UNIT-ALL" and booking.dorm_name not in get_admin_dorms(admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    changes = []
    if update_data.date: 
        booking.date = datetime.strptime(update_data.date, "%Y-%m-%d").date()
        changes.append(f"date -> {update_data.date}")
    if update_data.time: 
        booking.time = datetime.strptime(update_data.time, "%H:%M").time()
        changes.append(f"time -> {update_data.time}")
    if update_data.booth: 
        booking.booth = update_data.booth
        changes.append(f"booth -> {update_data.booth}")
    
    log = db.AuditLog(action="update", admin_id=admin.id, booking_id=booking_id, details="; ".join(changes))
    session.add(log)
    
    session.commit()
    return {"status": "updated"}

class BookingVerificationRequest(BaseModel):
    code: str
    booking_id: Optional[int] = None


class AttendanceQrCreate(BaseModel):
    dorm_name: Optional[str] = None


class AttendanceQrScan(BaseModel):
    token: str


class AttendanceConfirm(AttendanceQrScan):
    booking_id: int


def decode_attendance_qr(token: str) -> List[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Срок действия QR-кода истёк. Попросите коменданта обновить его")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="QR-код недействителен")

    dorms = payload.get("dorms")
    if payload.get("purpose") != "attendance" or not isinstance(dorms, list) or not dorms:
        raise HTTPException(status_code=400, detail="QR-код недействителен")
    if any(not isinstance(dorm, str) or not dorm for dorm in dorms):
        raise HTTPException(status_code=400, detail="QR-код недействителен")
    return dorms


@app.post("/admin/attendance-qr")
@limiter.limit("30/minute")
def create_attendance_qr(
    data: AttendanceQrCreate,
    request: Request,
    admin: db.User = Depends(admin_required),
    session: Session = Depends(get_db),
):
    if admin.dorm_name == "UNIT-ALL":
        allowed_dorms = [
            row.dorm_name
            for row in session.query(db.User.dorm_name)
            .filter(db.User.dorm_name != None, db.User.dorm_name != "UNIT-ALL")
            .distinct()
            .all()
        ]
    else:
        allowed_dorms = get_admin_dorms(admin)

    if data.dorm_name:
        if data.dorm_name not in allowed_dorms:
            raise HTTPException(status_code=403, detail="У вас нет доступа к этому общежитию")
        allowed_dorms = [data.dorm_name]
    if not allowed_dorms:
        raise HTTPException(status_code=400, detail="Не удалось определить общежитие для QR-кода")

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    token = jwt.encode(
        {"purpose": "attendance", "dorms": allowed_dorms, "exp": expires_at},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return {"token": token, "expires_at": expires_at.isoformat()}


@app.post("/attendance/scan")
@limiter.limit("30/minute")
def scan_attendance_qr(
    data: AttendanceQrScan,
    request: Request,
    user: db.User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    if user.role != "student":
        raise HTTPException(status_code=403, detail="Только студент может отметить посещение")
    dorms = decode_attendance_qr(data.token)
    if user.dorm_name not in dorms:
        raise HTTPException(status_code=403, detail="QR-код предназначен для другого общежития")

    today = get_local_now().date()
    bookings = session.query(db.Booking).filter(
        db.Booking.user_id == user.id,
        db.Booking.date == today,
        db.Booking.dorm_name.in_(dorms),
    ).order_by(db.Booking.time).all()
    if not bookings:
        raise HTTPException(status_code=404, detail="На сегодня нет записей в этом общежитии")

    eligible_bookings = [booking for booking in bookings if not booking.is_attended]
    if not eligible_bookings:
        raise HTTPException(status_code=409, detail="Все записи на сегодня уже отмечены")

    return {
        "bookings": [
            {
                "id": booking.id,
                "date": booking.date.isoformat(),
                "time": booking.time.strftime("%H:%M"),
                "type": booking.type,
                "booth": booking.booth,
            }
            for booking in eligible_bookings
        ]
    }


@app.post("/attendance/confirm")
@limiter.limit("30/minute")
def confirm_student_attendance(
    data: AttendanceConfirm,
    request: Request,
    user: db.User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    if user.role != "student":
        raise HTTPException(status_code=403, detail="Только студент может отметить посещение")
    dorms = decode_attendance_qr(data.token)
    if user.dorm_name not in dorms:
        raise HTTPException(status_code=403, detail="QR-код предназначен для другого общежития")

    booking = session.query(db.Booking).filter(
        db.Booking.id == data.booking_id,
        db.Booking.user_id == user.id,
        db.Booking.date == get_local_now().date(),
        db.Booking.dorm_name.in_(dorms),
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена или QR-код предназначен для другого общежития")
    if booking.is_attended:
        raise HTTPException(status_code=409, detail="Эта запись уже отмечена как посещённая")

    booking.is_attended = True
    session.add(db.AuditLog(
        action="student_attendance",
        admin_id=user.id,
        booking_id=booking.id,
        details=f"Attendance confirmed by student {user.student_id}",
    ))
    session.commit()
    return {"status": "attended", "booking_id": booking.id}


@app.post("/admin/verify-code")
@limiter.limit("30/minute")
def verify_code(code_data: BookingVerificationRequest, request: Request, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    code = code_data.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Код не указан")
    
    # Ищем запись на сегодняшний день и текущий (или ближайший) час
    today_date = get_local_now().date()
    
    query = session.query(db.Booking).filter(db.Booking.check_code == code)
    if code_data.booking_id is not None:
        query = query.filter(db.Booking.id == code_data.booking_id)
    
    if admin.dorm_name != "UNIT-ALL":
        query = query.filter(db.Booking.dorm_name.in_(get_admin_dorms(admin)))
        
    booking = query.filter(db.Booking.date == today_date).first()

    if not booking:
        # Проверяем, существует ли этот код на другой день
        wrong_day_booking = query.first()
        if wrong_day_booking:
            raise HTTPException(status_code=400, detail=f"Этот код действителен на {wrong_day_booking.date}, а не на сегодня!")
        raise HTTPException(status_code=404, detail="Код не найден или принадлежит другому общежитию")

    if booking.is_attended:
        raise HTTPException(status_code=409, detail="Эта запись уже отмечена как посещённая")
    
    # Отмечаем, что студент пришел
    booking.is_attended = True
    
    log = db.AuditLog(action="verify", admin_id=admin.id, booking_id=booking.id, details=f"Verified student {booking.owner.fullname if booking.owner else 'Unknown'}")
    session.add(log)
    
    session.commit()
    
    return {
        "id": booking.id,
        "fullname": booking.owner.fullname if booking.owner else "Unknown",
        "time": booking.time.strftime("%H:%M") if booking.time else None,
        "booth": booking.booth,
        "type": booking.type,
        "is_attended": booking.is_attended,
        "room": booking.owner.room if booking.owner else "—"
    }

# --- Student Endpoints ---

@app.get("/bookings/{user_id}", response_model=List[BookingResponse])
def get_user_bookings(user_id: int, user: db.User = Depends(get_current_user), session: Session = Depends(get_db)):
    if user.id != user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    bookings = session.query(db.Booking).filter(db.Booking.user_id == user_id).order_by(db.Booking.id.desc()).all()
    # Manual conversion for Pydantic (though Pydantic does it, let's be safe)
    return bookings

@app.delete("/bookings/{booking_id}")
def cancel_booking(booking_id: int, user_id: int, user: db.User = Depends(get_current_user), session: Session = Depends(get_db)):
    if user.id != user_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    booking = session.query(db.Booking).filter(db.Booking.id == booking_id, db.Booking.user_id == user_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена или принадлежит не вам")
    
    # Проверка правила 1 часа
    try:
        # Теперь это объекты date и time
        booking_dt = datetime.combine(booking.date, booking.time)
        now = get_local_now()
        
        if booking_dt - now < timedelta(hours=1):
            raise HTTPException(status_code=400, detail="Отмена невозможна менее чем за час до начала")
    except (ValueError, TypeError):
        # Если формат времени вдруг не совпал, разрешаем отмену (защита от ошибок данных)
        pass

    session.delete(booking)
    session.commit()
    return {"status": "cancelled"}

@app.post("/bookings", response_model=BookingResponse)
def create_booking(booking: BookingCreate, user: db.User = Depends(get_current_user), session: Session = Depends(get_db)):
    if user.id != booking.user_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    
    # Блокируем строку пользователя (with_for_update), чтобы предотвратить состояние гонки (Race Condition),
    # когда студент одновременно шлет 2 запроса на бронирование разных кабинок.
    user = session.query(db.User).filter(db.User.id == booking.user_id).with_for_update().first()
    if not user: raise HTTPException(status_code=404, detail="User not found")

    # Booking window check (07:00 - 21:00)
    local_now = get_local_now()
    now_hour = local_now.hour
    if now_hour < 7 or now_hour >= 21:
        raise HTTPException(status_code=400, detail="Запись доступна только с 07:00 до 21:00")

    # Enforce booking only on the current date
    today_str = local_now.strftime("%Y-%m-%d")
    if booking.date != today_str:
        raise HTTPException(status_code=400, detail="Запись доступна только на сегодняшний день")

    # Duplicate check (User already booked today for this type)
    exists = session.query(db.Booking).filter(
        db.Booking.user_id == booking.user_id, 
        db.Booking.date == booking.date,
        db.Booking.type == booking.type
    ).first()
    if exists: 
        raise HTTPException(status_code=400, detail=f"У вас уже есть запись на {booking.type} в этот день")
    
    # Booth count check
    config = session.query(db.DormConfig).filter(db.DormConfig.dorm_name == user.dorm_name).first()
    max_booths = 4
    if config:
        max_booths = config.shower_count if booking.type == "shower" else config.laundry_count
    
    if booking.booth > max_booths or booking.booth < 1:
        raise HTTPException(status_code=400, detail="Неверный номер кабинки/машины")

    # Booth check (Collision in the SAME dorm and SAME type)
    taken = session.query(db.Booking).filter(
        db.Booking.date == booking.date, 
        db.Booking.time == booking.time, 
        db.Booking.booth == booking.booth,
        db.Booking.dorm_name == user.dorm_name,
        db.Booking.type == booking.type
    ).first()
    if taken: raise HTTPException(status_code=400, detail="Это место уже занято")
    
    # Generate unique 4-digit code for this specific date and dorm
    target_date = datetime.strptime(booking.date, "%Y-%m-%d").date()
    existing_codes_rows = session.query(db.Booking.check_code).filter(
        db.Booking.date == target_date,
        db.Booking.dorm_name == user.dorm_name
    ).all()
    existing_codes = {row.check_code for row in existing_codes_rows}

    import random
    code = None
    for _ in range(100):
        candidate = str(random.randint(1000, 9999))
        if candidate not in existing_codes:
            code = candidate
            break
    
    if not code:
        code = str(random.randint(10000, 99999))
    
    new_b = db.Booking(
        date=target_date, 
        time=datetime.strptime(booking.time, "%H:%M").time(), 
        type=booking.type,
        booth=booking.booth, 
        user_id=booking.user_id, 
        check_code=code,
        dorm_name=user.dorm_name
    )
    try:
        session.add(new_b)
        session.commit()
        session.refresh(new_b)
        return new_b
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=400, detail="Извините, эту кабинку только что заняли. Пожалуйста, выберите другое время.")

@app.get("/occupied-slots")
def get_occupied_slots(date: str, dorm_name: str, type: str = "shower", session: Session = Depends(get_db)):
    target_date = datetime.strptime(date, "%Y-%m-%d").date()
    
    # 1. Проверяем санитарные дни / праздники (Holiday Blocks)
    holiday = session.query(db.HolidayBlock).filter(
        db.HolidayBlock.dorm_name == dorm_name,
        db.HolidayBlock.start_date <= target_date,
        db.HolidayBlock.end_date >= target_date
    ).first()
    
    if holiday:
        return {"holiday": True, "reason": holiday.reason}

    # 2. Получаем конфиг общежития для рабочих часов и интервала
    config = session.query(db.DormConfig).filter(db.DormConfig.dorm_name == dorm_name).first()
    start_t = "08:00"
    end_t = "21:00"
    duration = 30
    disabled_arr = []
    max_booths = 4
    
    if config:
        start_t = config.start_time or "08:00"
        end_t = config.end_time or "21:00"
        duration = config.slot_duration or 30
        max_booths = config.shower_count if type == "shower" else config.laundry_count
        if config.disabled_slots:
            try:
                disabled_arr = json.loads(config.disabled_slots)
            except Exception:
                pass
                
    # Генерируем временные слоты динамически
    time_slots = []
    try:
        curr = datetime.strptime(start_t, "%H:%M")
        end_dt = datetime.strptime(end_t, "%H:%M")
        while curr + timedelta(minutes=duration) <= end_dt:
            time_slots.append(curr.strftime("%H:%M"))
            curr += timedelta(minutes=duration)
    except Exception:
        from constants import TIME_SLOTS
        time_slots = TIME_SLOTS

    # Занятые слоты из броней
    slots = session.query(db.Booking).filter(
        db.Booking.date == target_date, 
        db.Booking.dorm_name == dorm_name,
        db.Booking.type == type
    ).all()
    result = [{"time": s.time.strftime("%H:%M"), "booth": s.booth} for s in slots]
    
    # Блокируем выключенные комендантом слоты времени (санитарный час) для всех кабинок
    for t_slot in disabled_arr:
        for b_idx in range(1, max_booths + 1):
            result.append({"time": t_slot, "booth": b_idx, "disabled": True, "reason": "Санитарный час"})
    
    # Кабинки на ремонте — блокируем все слоты для них
    broken = session.query(db.BoothStatus).filter(
        db.BoothStatus.dorm_name == dorm_name,
        db.BoothStatus.type == type,
        db.BoothStatus.is_active == False
    ).all()
    
    for b in broken:
        for t in time_slots:
            result.append({"time": t, "booth": b.booth, "maintenance": True, "reason": b.reason})
            
    return result

# --- Holiday Blocks Endpoints ---

@app.post("/admin/holiday-blocks")
def create_holiday_block(data: HolidayBlockCreate, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    if admin.dorm_name != "UNIT-ALL" and data.dorm_name not in get_admin_dorms(admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    target_dorm = data.dorm_name
    start_dt = datetime.strptime(data.start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(data.end_date, "%Y-%m-%d").date()
    
    block = db.HolidayBlock(
        dorm_name=target_dorm,
        start_date=start_dt,
        end_date=end_dt,
        reason=data.reason
    )
    session.add(block)
    session.commit()
    return {"status": "success", "message": "Период успешно заблокирован"}

@app.get("/admin/holiday-blocks")
def get_holiday_blocks(dorm_name: str, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    if admin.dorm_name != "UNIT-ALL" and dorm_name not in get_admin_dorms(admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    target_dorm = dorm_name
    blocks = session.query(db.HolidayBlock).filter(db.HolidayBlock.dorm_name == target_dorm).order_by(db.HolidayBlock.start_date.desc()).all()
    return blocks

@app.delete("/admin/holiday-blocks/{block_id}")
def delete_holiday_block(block_id: int, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    block = session.query(db.HolidayBlock).filter(db.HolidayBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    if admin.dorm_name != "UNIT-ALL" and block.dorm_name not in get_admin_dorms(admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    session.delete(block)
    session.commit()
    return {"status": "success"}

# --- Maintenance Mode Endpoints ---

@app.get("/admin/booths")
def get_booth_statuses(dorm_name: str, type: str = "shower", admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    if admin.dorm_name != "UNIT-ALL" and dorm_name not in get_admin_dorms(admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    target_dorm = dorm_name
    statuses = session.query(db.BoothStatus).filter(
        db.BoothStatus.dorm_name == target_dorm,
        db.BoothStatus.type == type
    ).all()
    # Если записей ещё нет — возвращаем дефолт (все активны)
    existing = {s.booth: s for s in statuses}
    result = []
    
    # Получаем актуальное количество из конфига
    config = session.query(db.DormConfig).filter(db.DormConfig.dorm_name == target_dorm).first()
    max_booths = 4
    if config:
        max_booths = config.shower_count if type == "shower" else config.laundry_count

    for i in range(1, max_booths + 1):
        if i in existing:
            s = existing[i]
            result.append({"booth": s.booth, "is_active": s.is_active, "reason": s.reason, "dorm_name": s.dorm_name, "type": s.type})
        else:
            result.append({"booth": i, "is_active": True, "reason": None, "dorm_name": target_dorm, "type": type})
    return result

class BoothToggle(BaseModel):
    booth: int
    is_active: bool
    reason: Optional[str] = None
    dorm_name: Optional[str] = None  # нужно только для UNIT-ALL админа
    type: str = "shower"

@app.post("/admin/booths/toggle")
def toggle_booth(data: BoothToggle, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    print(f"[DEBUG] toggle_booth payload: {data.dict()}")
    if not data.dorm_name:
        raise HTTPException(status_code=400, detail="dorm_name required")
    if admin.dorm_name != "UNIT-ALL" and data.dorm_name not in get_admin_dorms(admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    dorm = data.dorm_name
    existing = session.query(db.BoothStatus).filter(
        db.BoothStatus.dorm_name == dorm,
        db.BoothStatus.booth == data.booth,
        db.BoothStatus.type == data.type
    ).first()
    if existing:
        existing.is_active = data.is_active
        existing.reason = data.reason
        existing.updated_at = datetime.utcnow()
    else:
        session.add(db.BoothStatus(dorm_name=dorm, booth=data.booth, is_active=data.is_active, reason=data.reason, type=data.type))
    
    # Аудит лог
    action = "activate_booth" if data.is_active else "maintenance_booth"
    log = db.AuditLog(action=action, admin_id=admin.id, details=f"Booth {data.booth} in {dorm}: {'active' if data.is_active else data.reason}")
    session.add(log)
    session.commit()
    return {"status": "updated", "booth": data.booth, "is_active": data.is_active}

# --- Web Push Notifications ---
class PushSubscription(BaseModel):
    endpoint: str
    keys: dict

@app.post("/notifications/subscribe")
def subscribe_push(
    request: Request,
    sub: PushSubscription,
    user: db.User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    keys = sub.keys or {}
    if not sub.endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(status_code=400, detail="Некорректная push-подписка (нет endpoint или keys)")
    upsert_device_subscription(
        session,
        user,
        sub.endpoint,
        keys,
        request.headers.get("user-agent"),
    )
    session.commit()
    device_count = session.query(db.PushSubscriptionDevice).filter(
        db.PushSubscriptionDevice.user_id == user.id
    ).count()
    return {"status": "subscribed", "devices": device_count}

class TestPushRequest(BaseModel):
    booking_id: int

@app.post("/admin/test-push")
def test_push_notification(data: TestPushRequest, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    booking = session.query(db.Booking).filter(db.Booking.id == data.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
        
    user = booking.owner
    if not user:
        raise HTTPException(status_code=404, detail="Студент не найден")
    
    if admin.dorm_name != "UNIT-ALL" and user.dorm_name not in get_admin_dorms(admin):
        raise HTTPException(status_code=403, detail="Студент из другого общежития")

    if not user_has_push_targets(session, user):
        raise HTTPException(status_code=400, detail="У студента не включены уведомления (нет подписки в PWA)")

    sent, failed = send_push_to_user(
        session,
        user,
        "Тест уведомлений",
        f"Работает! Это тестовое уведомление для вашей записи (кабинка №{booking.booth}).",
    )
    if sent > 0:
        return {"status": "success", "message": f"Уведомление отправлено на {sent} устройств(а)!"}
    raise HTTPException(
        status_code=400,
        detail="Не удалось доставить ни на одно устройство. Студенту нужно открыть приложение и включить уведомления.",
    )

# --- Admins Management ---
class AdminDormUpdate(BaseModel):
    dorms: List[str]

@app.get("/admin/admins_list")
def get_admins_list(admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    if admin.dorm_name != "UNIT-ALL":
        raise HTTPException(status_code=403, detail="Доступ только для главного администратора")
    
    admins = session.query(db.User).filter(db.User.role == "admin").all()
    res = []
    for a in admins:
        res.append({
            "id": a.id,
            "student_id": a.student_id,
            "fullname": a.fullname,
            "dorm_name": a.dorm_name,
            "can_send_push": a.can_send_push,
            "accessible_dorms": get_admin_dorms(a) if a.dorm_name != "UNIT-ALL" else []
        })
    return res

class AdminPushPermissionUpdate(BaseModel):
    can_send_push: bool

@app.post("/admin/admins_list/{admin_id}/push-permission")
def update_admin_push_permission(admin_id: int, data: AdminPushPermissionUpdate, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    if admin.dorm_name != "UNIT-ALL":
        raise HTTPException(status_code=403, detail="Доступ только для главного администратора")
    
    target_admin = session.query(db.User).filter(db.User.id == admin_id, db.User.role == "admin").first()
    if not target_admin:
        raise HTTPException(status_code=404, detail="Администратор не найден")
    
    if target_admin.dorm_name == "UNIT-ALL":
        raise HTTPException(status_code=400, detail="Нельзя изменять доступ главного администратора")
        
    target_admin.can_send_push = data.can_send_push
    session.commit()
    
    return {"status": "success", "can_send_push": target_admin.can_send_push}

@app.post("/admin/admins_list/{admin_id}/dorms")
def update_admin_dorms(admin_id: int, data: AdminDormUpdate, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    if admin.dorm_name != "UNIT-ALL":
        raise HTTPException(status_code=403, detail="Доступ только для главного администратора")
    
    target_admin = session.query(db.User).filter(db.User.id == admin_id, db.User.role == "admin").first()
    if not target_admin:
        raise HTTPException(status_code=404, detail="Администратор не найден")
    
    if target_admin.dorm_name == "UNIT-ALL":
        raise HTTPException(status_code=400, detail="Нельзя изменять доступ главного администратора")
        
    target_admin.accessible_dorms = json.dumps(data.dorms)
    session.commit()
    
    return {"status": "success", "accessible_dorms": data.dorms}


class CreateAdminRequest(BaseModel):
    login: str
    password: str
    fullname: str
    dorms: List[str]

@app.post("/admin/create-admin")
def create_admin(data: CreateAdminRequest, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    """Создание нового коменданта суперадмином."""
    if admin.dorm_name != "UNIT-ALL":
        raise HTTPException(status_code=403, detail="Доступ только для главного администратора")
    
    existing = session.query(db.User).filter(db.User.student_id == data.login).first()
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")
    
    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    new_admin = db.User(
        student_id=data.login,
        fullname=data.fullname,
        password=hashed,
        role="admin",
        dorm_name=data.dorms[0] if len(data.dorms) == 1 else "MULTI",
        accessible_dorms=json.dumps(data.dorms)
    )
    session.add(new_admin)
    session.commit()
    session.refresh(new_admin)
    
    log = db.AuditLog(action="create_admin", admin_id=admin.id, details=f"Created admin {data.login} with dorms: {', '.join(data.dorms)}")
    session.add(log)
    session.commit()
    
    return {"status": "success", "id": new_admin.id, "student_id": new_admin.student_id}


class MassPushRequest(BaseModel):
    message: str
    title: str = "Объявление от администрации"
    dorms: List[str] = []  # пустой список = все доступные общежития


@app.get("/admin/mass-push/preview")
def mass_push_preview(
    admin: db.User = Depends(admin_required),
    session: Session = Depends(get_db),
    dorms: List[str] = Query(default=[]),
):
    if admin.dorm_name != "UNIT-ALL" and not getattr(admin, "can_send_push", False):
        raise HTTPException(status_code=403, detail="У вас нет прав на массовую рассылку")
    validate_mass_push_dorms(admin, dorms)
    devices_q = build_mass_push_devices_query(session, admin, dorms)
    device_count = devices_q.count()
    student_count = devices_q.with_entities(db.User.id).distinct().count()
    return {
        "devices": device_count,
        "students": student_count,
        "dorms": dorms,
    }


@app.post("/admin/mass-push")
@limiter.limit("5/minute")
def mass_push(
    request: Request,
    data: MassPushRequest,
    background_tasks: BackgroundTasks,
    admin: db.User = Depends(admin_required),
    session: Session = Depends(get_db),
):
    """Массовая PUSH-рассылка в фоне (не блокирует HTTP)."""
    if admin.dorm_name != "UNIT-ALL" and not getattr(admin, "can_send_push", False):
        raise HTTPException(status_code=403, detail="У вас нет прав на массовую рассылку")

    title = (data.title or "Объявление от администрации").strip()[:120]
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Текст объявления не может быть пустым")
    if len(message) > 500:
        raise HTTPException(status_code=400, detail="Текст объявления слишком длинный (макс. 500 символов)")

    validate_mass_push_dorms(admin, data.dorms)
    devices_q = build_mass_push_devices_query(session, admin, data.dorms)
    device_count = devices_q.count()
    student_count = devices_q.with_entities(db.User.id).distinct().count()
    if device_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Нет активных push-подписок у студентов в выбранных общежитиях",
        )

    background_tasks.add_task(
        _mass_push_background,
        admin.id,
        title,
        message,
        list(data.dorms),
    )

    return {
        "status": "queued",
        "devices": device_count,
        "students": student_count,
        "message": "Рассылка запущена в фоне. Результат будет в журнале аудита.",
    }


class GlobalConfigRequest(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    slot_duration: Optional[int] = None
    dorms: List[str]  # пустой список = все общежития

@app.post("/admin/global-config")
def apply_global_config(data: GlobalConfigRequest, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    """Применить единое расписание ко всем (или выбранным) общежитиям."""
    if admin.dorm_name != "UNIT-ALL":
        raise HTTPException(status_code=403, detail="Доступ только для главного администратора")
    
    # Если список пуст — берём все общежития из базы
    if data.dorms:
        target_dorms = data.dorms
    else:
        rows = session.query(db.DormConfig.dorm_name).all()
        target_dorms = [r.dorm_name for r in rows]
        if not target_dorms:
            # Fallback: из пользователей
            rows2 = session.query(db.User.dorm_name).filter(
                db.User.dorm_name != None,
                db.User.dorm_name != "UNIT-ALL",
                db.User.dorm_name != "MULTI"
            ).distinct().all()
            target_dorms = [r.dorm_name for r in rows2]
    
    updated = []
    for dorm_name in target_dorms:
        config = session.query(db.DormConfig).filter(db.DormConfig.dorm_name == dorm_name).first()
        if not config:
            config = db.DormConfig(dorm_name=dorm_name, shower_count=4, laundry_count=4,
                                    start_time="08:00", end_time="21:00", slot_duration=30, disabled_slots="[]")
            session.add(config)
        if data.start_time is not None:
            config.start_time = data.start_time
        if data.end_time is not None:
            config.end_time = data.end_time
        if data.slot_duration is not None:
            config.slot_duration = data.slot_duration
        updated.append(dorm_name)
    
    log = db.AuditLog(
        action="global_config",
        admin_id=admin.id,
        details=f"Applied schedule {data.start_time}-{data.end_time}/{data.slot_duration}min to: {', '.join(updated)}"
    )
    session.add(log)
    session.commit()
    
    return {"status": "success", "updated_dorms": updated}


# --- Banned Students Management ---

@app.get("/admin/banned-students")
def get_banned_students(admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    """Список заблокированных студентов."""
    if admin.dorm_name != "UNIT-ALL":
        raise HTTPException(status_code=403, detail="Доступ только для главного администратора")
    
    banned = session.query(db.BannedStudent).order_by(db.BannedStudent.banned_at.desc()).all()
    res = []
    for b in banned:
        # Получаем имя забанившего админа
        admin_name = None
        if b.banned_by:
            ban_admin = session.query(db.User).filter(db.User.id == b.banned_by).first()
            admin_name = ban_admin.fullname if ban_admin else None
        
        # Получаем имя студента из таблицы пользователей
        student = session.query(db.User).filter(db.User.student_id == b.student_id).first()
        
        res.append({
            "id": b.id,
            "student_id": b.student_id,
            "student_name": student.fullname if student else "Неизвестный",
            "dorm_name": student.dorm_name if student else "—",
            "reason": b.reason,
            "banned_at": b.banned_at.isoformat() if b.banned_at else None,
            "banned_by_name": admin_name
        })
    return res

@app.delete("/admin/banned-students/{ban_id}")
def unban_student(ban_id: int, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    """Разблокировка студента (удаление из чёрного списка)."""
    if admin.dorm_name != "UNIT-ALL":
        raise HTTPException(status_code=403, detail="Доступ только для главного администратора")
    
    ban_record = session.query(db.BannedStudent).filter(db.BannedStudent.id == ban_id).first()
    if not ban_record:
        raise HTTPException(status_code=404, detail="Запись о блокировке не найдена")
    
    student_id = ban_record.student_id
    
    # Аудит лог
    log = db.AuditLog(
        action="unban_student",
        admin_id=admin.id,
        details=f"Unbanned student {student_id}"
    )
    session.add(log)
    
    session.delete(ban_record)
    session.commit()
    
    return {"status": "success", "message": f"Студент {student_id} разблокирован"}

class BanStudentRequest(BaseModel):
    student_id: str
    reason: str = "Нарушение правил"

@app.post("/admin/ban-student")
def ban_student(data: BanStudentRequest, admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    """Ручная блокировка студента администратором."""
    if admin.dorm_name != "UNIT-ALL":
        raise HTTPException(status_code=403, detail="Доступ только для главного администратора")
    
    # Проверяем, не заблокирован ли уже
    existing = session.query(db.BannedStudent).filter(db.BannedStudent.student_id == data.student_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Этот студент уже заблокирован")
    
    # Проверяем, существует ли такой студент
    student = session.query(db.User).filter(db.User.student_id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Студент не найден в системе")
    
    if student.role == "admin":
        raise HTTPException(status_code=400, detail="Нельзя заблокировать администратора")
    
    ban = db.BannedStudent(
        student_id=data.student_id,
        reason=data.reason,
        banned_by=admin.id
    )
    session.add(ban)
    
    # Аудит лог
    log = db.AuditLog(
        action="ban_student",
        admin_id=admin.id,
        details=f"Banned student {data.student_id} ({student.fullname}): {data.reason}"
    )
    session.add(log)
    
    session.commit()
    
    return {"status": "success", "message": f"Студент {student.fullname} заблокирован"}


def _sync_check_upcoming_bookings():
    session = db.LocalSession()
    try:
        now = get_local_now()
        today_date = now.date()
        print(f"[DEBUG WORKER] Starting check. local_now={now}, today_date={today_date}", flush=True)
        
        # Fetch bookings for today where notification was not sent yet
        bookings = session.query(db.Booking).filter(
            db.Booking.date == today_date,
            db.Booking.notification_sent == False,
            db.Booking.is_attended == False
        ).all()
        print(f"[DEBUG WORKER] Found {len(bookings)} unsent bookings for today.", flush=True)
        
        for b in bookings:
            print(f"[DEBUG WORKER] Checking booking ID={b.id}, Time={b.time}, Student={b.owner.fullname if b.owner else 'None'}", flush=True)
            if not b.owner or not user_has_push_targets(session, b.owner):
                print(f"[DEBUG WORKER] Booking ID={b.id} has no push subscription, ignoring.", flush=True)
                b.notification_sent = True
                continue
                
            try:
                booking_dt = datetime.combine(b.date, b.time)
            except Exception as e:
                print(f"[DEBUG WORKER] Combine error: {e}", flush=True)
                continue
                
            diff_seconds = (booking_dt - now).total_seconds()
            diff_minutes = diff_seconds / 60.0
            print(f"[DEBUG WORKER] Booking ID={b.id}: diff_seconds={diff_seconds:.2f}, diff_minutes={diff_minutes:.2f}", flush=True)
            
            # If the session is starting in <= 10.5 minutes and has not started yet
            if 0.0 <= diff_minutes <= 10.5:
                type_name = "в душ" if b.type == "shower" else "в прачечную"
                msg_body = f"Ваш сеанс {type_name} (Кабинка 0{b.booth}) начнется через 10 минут (в {b.time.strftime('%H:%M')})!"
                sent, _failed = send_push_to_user(session, b.owner, "AQUA.FLOW", msg_body)
                if sent > 0:
                    b.notification_sent = True
            
            elif diff_minutes < 0.0:
                # Session has already expired, mark as sent (do not send notification)
                b.notification_sent = True
                
        session.commit()
    except Exception as e:
        print("Background task sync error:", e)
    finally:
        try:
            session.close()
        except:
            pass

async def check_upcoming_bookings():
    while True:
        try:
            await run_in_threadpool(_sync_check_upcoming_bookings)
        except Exception as e:
            print("Background task error:", e)
        
        await asyncio.sleep(60)


@app.get("/health")
def health(session: Session = Depends(get_db)):
    pg_ok = False
    try:
        session.execute(sql_text("SELECT 1"))
        pg_ok = True
    except Exception:
        pass
    tunnel_ok = bool(db.tunnel and getattr(db.tunnel, "is_active", False))
    status = "ok" if pg_ok else "degraded"
    return {
        "status": status,
        "postgres": pg_ok,
        "platonus_tunnel": tunnel_ok,
        "service": "AquaPass API",
    }


@app.get("/admin/push-stats")
def push_stats(admin: db.User = Depends(admin_required), session: Session = Depends(get_db)):
    """Сводка по push-подпискам для админки."""
    if admin.dorm_name != "UNIT-ALL" and not getattr(admin, "can_send_push", False):
        raise HTTPException(status_code=403, detail="Нет доступа")
    q = session.query(db.PushSubscriptionDevice).join(db.User).filter(db.User.role == "student")
    if admin.dorm_name != "UNIT-ALL":
        q = q.filter(db.User.dorm_name.in_(get_admin_dorms(admin)))
    devices = q.count()
    students = q.with_entities(db.User.id).distinct().count()
    total_students = session.query(db.User).filter(db.User.role == "student")
    if admin.dorm_name != "UNIT-ALL":
        total_students = total_students.filter(db.User.dorm_name.in_(get_admin_dorms(admin)))
    total_students = total_students.count()
    return {
        "devices": devices,
        "students_with_push": students,
        "students_total": total_students,
        "coverage_percent": round(100 * students / total_students, 1) if total_students else 0,
    }


@app.get("/admin/audit-logs")
def get_audit_logs(admin: db.User = Depends(admin_required), session: Session = Depends(get_db), limit: int = 100):
    if admin.dorm_name != "UNIT-ALL":
        raise HTTPException(status_code=403, detail="Доступ только для главного администратора")
    
    logs = session.query(db.AuditLog).order_by(db.AuditLog.created_at.desc()).limit(limit).all()
    res = []
    for l in logs:
        res.append({
            "id": l.id,
            "action": l.action,
            "admin_name": l.admin.fullname if l.admin else "Unknown",
            "details": l.details,
            "created_at": l.created_at.isoformat() if l.created_at else None
        })
    return res

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(check_upcoming_bookings())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("API_HOST", "0.0.0.0"), port=int(os.getenv("API_PORT", 8000)))
