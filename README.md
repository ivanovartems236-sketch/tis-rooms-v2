# Кабинеты ТИС v2

Расписание ТИС (филиал ДГТУ) по аудиториям, группам и преподавателям — на основе файлов с https://stis.su/schedule.

**Что умеет**
- Аудитория / Группа / Преподаватель — день с отметкой «идёт сейчас» и «следующая через N мин»
- Свободные аудитории на выбранную пару, по корпусам
- Шахматка: все аудитории × пары за день
- Загрузка аудиторий за неделю (аналитика)
- Лента изменений расписания + уведомления в Telegram
- Подписка-календарь (.ics) на любую аудиторию, группу, преподавателя
- Избранное, ссылки на конкретный вид (`#room/К-121`), офлайн-режим, установка на экран «Домой»
- Виджет для iPhone через Scriptable (`widget-scriptable.js`), в т.ч. на экран блокировки

**Устройство**
- `scraper/rasp.py` — скачивание и разбор xls
- `scraper/build.py` — пишет `data.json`, `changes.json`, `ics/`, шлёт изменения в Telegram
- `.github/workflows/update.yml` — запуск каждый час (06–20 МСК, пн–сб)
- `index.html`, `app.js`, `style.css`, `sw.js` — сайт (GitHub Pages)

**Настройка**
1. Settings → Pages → Deploy from a branch → `main` / `(root)`.
2. Actions → «Обновление расписания» → Run workflow.
3. Telegram (необязательно): создай бота у @BotFather, добавь его в канал/чат, затем
   Settings → Secrets and variables → Actions → New repository secret:
   `TG_TOKEN` — токен бота, `TG_CHAT` — id чата или `@имя_канала`.

**Локально**
```
pip install openpyxl
python scraper/build.py               # скачать и собрать
python scraper/build.py --from DIR    # собрать из скачанных файлов
python -m http.server                 # открыть http://localhost:8000
```
