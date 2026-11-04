FROM python:3.10-slim

WORKDIR /app

# Установка системных зависимостей для сборки
RUN apt-get update && apt-get install -y gcc default-libmysqlclient-dev pkg-config libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Установка Python-зависимостей
RUN pip install --no-cache-dir -r requirements.txt

# Копируем остальной код
COPY . .

# Открываем порт для приложения
EXPOSE 8000

# Запускаем FastAPI с помощью Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
