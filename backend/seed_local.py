"""Populate the local SQLite database with fictional local starter data."""

from datetime import date, datetime, time, timedelta

import bcrypt
import database as db


LOCAL_DORMS = [
    ("Студенческий дом №1", 6, 3, "08:00", "22:00"),
    ("Студенческий дом №2", 8, 4, "07:00", "23:00"),
    ("Студенческий дом №3", 5, 2, "08:00", "21:00"),
    ("Студенческий дом №4", 7, 3, "06:00", "22:00"),
    ("Студенческий дом №5", 4, 2, "08:00", "21:00"),
]

LOCAL_STUDENT_NAMES = [
    "Алия Садыкова",
    "Данияр Нурланов",
    "Аружан Ермекова",
    "Ерлан Касымов",
    "Мадина Омарова",
    "Тимур Жумабеков",
]

LOCAL_LOGIN_ACCOUNTS = [
    ("student1", "Алия Садыкова", LOCAL_DORMS[0][0], "102", "student123", "demo1"),
    ("student2", "Данияр Нурланов", LOCAL_DORMS[1][0], "103", "student123", "demo2"),
]

EVENTS = [
    ("shower", 1, time(12, 0)),
    ("shower", 2, time(12, 30)),
    ("shower", 3, time(13, 0)),
    ("shower", 4, time(13, 30)),
    ("laundry", 1, time(15, 0)),
]


def main():
    if db.pg_engine.url.get_backend_name() != "sqlite":
        raise RuntimeError(
            "Refusing to seed a non-SQLite database. Set DATABASE_URL to the local SQLite file."
        )

    db.Base.metadata.create_all(bind=db.pg_engine)
    session = db.LocalSession()
    added = {
        "users": 0,
        "student_logins": 0,
        "dorm_configs": 0,
        "booth_statuses": 0,
        "bookings": 0,
    }
    try:
        dorm_tables = (
            db.User,
            db.Booking,
            db.BoothStatus,
            db.DormConfig,
            db.HolidayBlock,
        )
        for dorm_name, *_ in LOCAL_DORMS:
            old_name = f"ДЕМО — {dorm_name}"
            for model in dorm_tables:
                session.query(model).filter(model.dorm_name == old_name).update(
                    {model.dorm_name: dorm_name},
                    synchronize_session=False,
                )

        students_by_dorm = {}
        for dorm_index, dorm_data in enumerate(LOCAL_DORMS, start=1):
            dorm_name, shower_count, laundry_count, start_time, end_time = dorm_data

            config = (
                session.query(db.DormConfig)
                .filter(db.DormConfig.dorm_name == dorm_name)
                .first()
            )
            if not config:
                session.add(
                    db.DormConfig(
                        dorm_name=dorm_name,
                        shower_count=shower_count,
                        laundry_count=laundry_count,
                        start_time=start_time,
                        end_time=end_time,
                        slot_duration=30,
                        disabled_slots="[]",
                    )
                )
                added["dorm_configs"] += 1

            students = []
            for student_index, fullname in enumerate(LOCAL_STUDENT_NAMES, start=1):
                student_id = f"LOCAL-{dorm_index:02d}-{student_index:02d}"
                student = (
                    session.query(db.User)
                    .filter(db.User.student_id == student_id)
                    .first()
                )
                if not student:
                    old_id = f"DEMO-{dorm_index:02d}-{student_index:02d}"
                    student = (
                        session.query(db.User)
                        .filter(db.User.student_id == old_id)
                        .first()
                    )
                    if student:
                        student.student_id = student_id
                if student and (
                    student.role != "student" or student.dorm_name != dorm_name
                ):
                    raise RuntimeError(
                        f"Existing account {student_id} does not match the local starter data."
                    )
                if not student:
                    student = db.User(
                        student_id=student_id,
                        fullname=fullname,
                        dorm_name=dorm_name,
                        room=str(101 + student_index),
                        role="student",
                    )
                    session.add(student)
                    session.flush()
                    added["users"] += 1
                students.append(student)
            students_by_dorm[dorm_name] = students

        for student_id, fullname, dorm_name, room, password, old_student_id in LOCAL_LOGIN_ACCOUNTS:
            migrated_legacy_account = False
            student = (
                session.query(db.User)
                .filter(db.User.student_id == student_id)
                .first()
            )
            if not student:
                student = (
                    session.query(db.User)
                    .filter(db.User.student_id == old_student_id)
                    .first()
                )
                if student:
                    student.student_id = student_id
                    migrated_legacy_account = True
            if student and (
                student.role != "student" or student.dorm_name != dorm_name
            ):
                raise RuntimeError(
                    f"Existing account {student_id} does not match the local starter data."
                )
            if not student:
                student = db.User(
                    student_id=student_id,
                    fullname=fullname,
                    dorm_name=dorm_name,
                    room=room,
                    role="student",
                    password=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
                )
                session.add(student)
                added["student_logins"] += 1
            elif (
                migrated_legacy_account
                or not student.password
                or not bcrypt.checkpw(password.encode(), student.password.encode())
            ):
                student.password = bcrypt.hashpw(
                    password.encode(), bcrypt.gensalt()
                ).decode()
                added["student_logins"] += 1
            students_by_dorm[dorm_name][0] = student

        session.flush()

        today = date.today()
        for dorm_index in range(1, len(LOCAL_LOGIN_ACCOUNTS) + 1):
            dorm_name = LOCAL_DORMS[dorm_index - 1][0]
            local_student = students_by_dorm[dorm_name][0]
            has_bookings = (
                session.query(db.Booking.id)
                .filter(db.Booking.user_id == local_student.id)
                .first()
            )
            if has_bookings:
                continue

            source_student = (
                session.query(db.User)
                .filter(db.User.student_id == f"LOCAL-{dorm_index:02d}-01")
                .first()
            )
            if not source_student:
                continue

            starter_booking = (
                session.query(db.Booking)
                .filter(
                    db.Booking.user_id == source_student.id,
                    db.Booking.dorm_name == dorm_name,
                    db.Booking.type == "shower",
                    db.Booking.booth == 1,
                    db.Booking.time == time(12, 0),
                    db.Booking.date >= today,
                    db.Booking.date <= today + timedelta(days=6),
                )
                .order_by(db.Booking.date)
                .first()
            )
            if starter_booking:
                starter_booking.user_id = local_student.id

        for dorm_name, shower_count, laundry_count, *_ in LOCAL_DORMS:
            maintenance = [
                ("shower", shower_count, "Профилактика"),
                ("laundry", laundry_count, "Временно недоступна"),
            ]
            for kind, booth, reason in maintenance:
                status = (
                    session.query(db.BoothStatus)
                    .filter_by(dorm_name=dorm_name, booth=booth, type=kind)
                    .first()
                )
                if not status:
                    session.add(
                        db.BoothStatus(
                            dorm_name=dorm_name,
                            booth=booth,
                            type=kind,
                            is_active=False,
                            reason=reason,
                        )
                    )
                    added["booth_statuses"] += 1

        session.flush()
        for dorm_index, (dorm_name, *_rest) in enumerate(LOCAL_DORMS, start=1):
            students = students_by_dorm[dorm_name]
            for day_offset in range(7):
                booking_date = today + timedelta(days=day_offset)
                for event_index, (kind, booth, slot_time) in enumerate(EVENTS):
                    exists = (
                        session.query(db.Booking)
                        .filter_by(
                            date=booking_date,
                            time=slot_time,
                            booth=booth,
                            dorm_name=dorm_name,
                            type=kind,
                        )
                        .first()
                    )
                    if exists:
                        continue

                    student = students[(day_offset * len(EVENTS) + event_index) % len(students)]
                    code = f"{1000 + (dorm_index - 1) * 100 + day_offset * len(EVENTS) + event_index:04d}"
                    session.add(
                        db.Booking(
                            date=booking_date,
                            time=slot_time,
                            type=kind,
                            booth=booth,
                            check_code=code,
                            dorm_name=dorm_name,
                            user_id=student.id,
                            is_attended=False,
                            notification_sent=False,
                            created_at=datetime.now(),
                        )
                    )
                    added["bookings"] += 1

        session.commit()
        print("Локальная база подготовлена (повторный запуск не создаёт дубликаты):")
        for table, count in added.items():
            print(f"  {table}: {count}")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
