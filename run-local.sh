#!/usr/bin/env bash
# Локальный запуск AQUA.FLOW без Docker:
#   backend  — venv + SQLite (файл backend/local.db), порт 8000
#   frontend — Vite dev-сервер, порт 5173, /api проксируется на backend
#
#   ./run-local.sh        — поднять всё и открыть dev-сервер (Ctrl+C остановит)
#   ./run-local.sh down   — остановить backend, если остался висеть
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"
PY="$ROOT/backend/.venv/bin/python"
ADMIN_PASSWORD="${LOCAL_ADMIN_PASSWORD:-admin123}"

if [ "${1:-}" = "down" ]; then
  pkill -f "uvicorn main:app" 2>/dev/null && echo "backend остановлен" || echo "backend не запущен"
  exit 0
fi

if [ ! -x "$PY" ]; then
  echo "==> Создаю venv в backend/.venv"
  python3 -m venv backend/.venv
fi

echo "==> Ставлю зависимости backend"
"$PY" -m pip install -q --upgrade pip
"$PY" -m pip install -q -r backend/requirements-local.txt

# Локальный режим: SQLite и локальные учётные записи, без Platonus.
export DATABASE_URL="sqlite:///$ROOT/backend/local.db"
export SECRET_KEY="${LOCAL_SECRET_KEY:-local-dev-secret}"
export ADMIN_PASSWORD
export LOCAL_STUDENT_AUTH=1
export SSH_HOST= SSH_USER= SSH_PASS= DB_HOST= DB_USER= DB_PASS= DB_NAME=

echo "==> Подготавливаю локальную базу"
(cd backend && "$PY" seed_local.py)

echo "==> Запускаю backend на http://127.0.0.1:8000"
(cd backend && exec "$PY" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload) &
BACK_PID=$!
trap 'kill "$BACK_PID" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$BACK_PID" 2>/dev/null; then
    echo "Backend упал при старте, смотрите вывод выше."
    exit 1
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8000/health || { echo; echo "Backend не отвечает на /health"; exit 1; }
echo

if [ ! -d node_modules ]; then
  echo "==> Устанавливаю npm-зависимости"
  npm ci
fi

echo "Готово. Сайт: http://localhost:5173"
echo "Админ: admin / ${ADMIN_PASSWORD}"
echo "Студенты: student1 / student123, student2 / student123"
echo
npm run dev
