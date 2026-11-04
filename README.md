# AQUA.FLOW — электронная очередь в душ

PWA для бронирования душа и прачечной в общежитиях Университета Шакарим.

**Прод:** https://dorm.shakarim.kz

## Стек

- **Frontend:** React 19, Vite, Tailwind 4, PWA (`sw.js`)
- **Backend:** FastAPI, PostgreSQL, Web Push (VAPID)
- **Вход студентов:** Platonus (MySQL) через SSH-туннель

## Запуск (Docker)

```bash
cp .env.example .env
# заполнить SECRET_KEY, ADMIN_PASSWORD, SSH, DB_*, VITE_VAPID_PUBLIC_KEY

sudo docker compose up -d --build
```

- Сайт: http://localhost:8090
- Postgres: порт `5433`
- API через nginx: `/api/*`

## Локальный запуск (без Docker)

Нужны Python 3.10+ и Node 20+.

```bash
./run-local.sh
```

- Сайт: http://localhost:5173 (Vite, `/api` проксируется на backend)
- API: http://127.0.0.1:8000, проверка — `/health`
- Админ: `admin` / `admin123` (переопределяется через `LOCAL_ADMIN_PASSWORD`)
- БД: SQLite `backend/local.db`, создаётся сама при первом запуске
- Вход студентов через Platonus в локальном режиме отключён
- Остановка: Ctrl+C (backend гасится вместе со скриптом) или `./run-local.sh down`

## Проверка

```bash
curl -s http://127.0.0.1:8090/health
curl -s http://127.0.0.1:8090/sw.js | head -1
```

## Роли

| Логин | Роль |
|-------|------|
| Platonus | Студент в общежитии |
| `admin` | Суперадмин (UNIT-ALL) |
| `admin_dsN` | Комендант общежития |

## Push / объявления

- Подписка: Настройки → «Включить уведомления» (лучше с ярлыка PWA на главном экране)
- Несколько устройств на одного студента (iPhone + Android)
- Mass-push: админка → «Объявления» (фоновая рассылка, лимит 5/мин)
- Журнал рассылок: вкладка «Журнал» (суперадмин)

## Деплой после изменений

```bash
cd /var/www/dush
sudo docker compose up -d --build
```

Пользователя в группу docker (без sudo):

```bash
sudo usermod -aG docker $USER
# перелогиниться
```
