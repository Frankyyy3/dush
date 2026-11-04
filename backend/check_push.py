#!/usr/bin/env python3
"""Quick diagnostic: how many students have push subscriptions?"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
os.chdir(os.path.dirname(__file__))

from database import LocalSession, User

s = LocalSession()

total_students = s.query(User).filter(User.role == "student").count()
with_push = s.query(User).filter(
    User.role == "student",
    User.push_subscription != None,
    User.push_subscription != ""
).count()

print(f"Total students: {total_students}")
print(f"Students with push_subscription: {with_push}")
print(f"Students WITHOUT push: {total_students - with_push}")

if with_push > 0:
    samples = s.query(User).filter(
        User.role == "student",
        User.push_subscription != None,
        User.push_subscription != ""
    ).limit(3).all()
    for u in samples:
        sub = u.push_subscription[:80] if u.push_subscription else "EMPTY"
        print(f"  - {u.fullname} ({u.dorm_name}): {sub}...")

# Check admins
admins = s.query(User).filter(User.role == "admin").all()
print(f"\nAdmins ({len(admins)}):")
for a in admins:
    print(f"  - {a.student_id} | dorm={a.dorm_name} | can_send_push={a.can_send_push} | accessible_dorms={a.accessible_dorms}")

s.close()
