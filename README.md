# Королевства Пепла 9.2.1 — Visual Polish

Presentation update на базе 9.2.0. **GAMEPLAY LOGIC CHANGED: NO**.

## Запуск и GitHub Pages

Распакуйте ZIP целиком. `index.html`, JS, CSS и папка `assets` должны находиться на одном уровне. Загружайте весь комплект в выбранную папку публикации GitHub Pages, включая три PNG внутри `assets/`; не переносите одни HTML/JS. Регистр имён файлов важен. Сторонние CDN и npm-зависимости для игры не нужны.

Локальный запуск из папки проекта: `python3 -m http.server 8000`, затем `http://localhost:8000/`. Для service worker нужен HTTP localhost либо HTTPS. При обновлении worker выполняет повторную загрузку вкладки; новая версия указана в заголовке страницы и окне запуска. Ключи сохранений и формат кампании сохранены.

## Проверки

`npm test` запускает прежние 180 сценариев, 11 новых проверок visual polish и проверку 39 локальных ресурсов. Требуется Node.js 18+.

Для контрольных сцен: `qa/visual.html?qa=921qa&scene=dungeon-fog`, `scene=battle-abyss`, `scene=battle-surface`, `scene=map`. QA использует сохранение в памяти и выключает service worker; обычная игра запускается через `index.html`. QA-состояния не заменяют пользовательский слот кампании.

[Итоговый отчёт](REPORT-9.2.1.md) · [Изменения](CHANGELOG.md) · [Файлы](CHANGED-FILES.md) · [Снимки и сравнение](qa/VISUAL-QA.md) · [Результаты тестов](qa/test-summary.json) · [Ресурсы](qa/asset-integrity.json) · [Проверка HTTP](qa/http-assets.json)
