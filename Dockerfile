# Шаг 1: Сборка Vite приложения
FROM node:22-alpine AS build

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходники
COPY . .

# Аргументы сборки для Vite
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# Собираем production билд
RUN npm run build

# Шаг 2: Раздача через Nginx
FROM nginx:alpine

# Копируем собранные файлы в папку Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Копируем конфигурацию Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
