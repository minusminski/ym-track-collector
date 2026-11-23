# YM Track Collector

A lightweight browser console script for exporting tracks from **Yandex Music playlists** to `.txt`, `.csv`, or the clipboard.

Yandex Music renders playlists using virtualized lists (`react-virtuoso`), meaning only a small subset of tracks exists in the DOM at any given moment. Open a playlist, run the script in DevTools Console, let it auto-scroll (or scroll manually), and export the full tracklist in its original order.

Fork of [idaniil24/ym-track-collector](https://github.com/idaniil24/ym-track-collector), modified by **minusminski** (`v2.1.0`).

[English](#english) • [Русская версия](#русская-версия) • [Support the Project](#support-the-project)

---

## English

### Features

- **Auto-scroll capture** — automatically detects the real scroll container (with a `scrollIntoView` fallback), waits for lazy-loaded shimmers, and stops at the bottom of the playlist
- **Manual scroll support** — scroll at your own pace, pause/resume collection, or finalize anytime with **Stop & export**
- **Updated Yandex Music DOM support** — targets current `data-test-id` attributes (`TRACK_PLAYLIST`, `TRACK_TITLE`, `SEPARATED_ARTIST_TITLE`, `TRACK_DURATION`, `virtuoso-item-list`) with fallback selectors
- **Clean metadata** — strips `Track ` / `Трек ` prefixes, avoids duplicate artists on collaborations, keeps track version tags, and captures durations accurately
- **Isolated from UI noise** — ignores the currently playing track in the bottom player bar (`PLAYERBAR_DESKTOP`) and sidebar pins
- **Original track order** — preserves playlist order using each row's `data-index`
- **No skipped rows** — uses throttled capture-phase `scroll` events and `MutationObserver` instead of trailing debounce
- **Flexible export** — download `.txt`, Excel-friendly `.csv` (with UTF-8 BOM), or copy straight to clipboard; filenames automatically match the playlist title
- **Zero dependencies** — runs directly in DevTools Console without browser extensions

### How to Use

1. Open a playlist on **Yandex Music** (`music.yandex.ru`) and wait for the first tracks to appear.
2. Open **DevTools** and switch to the **Console** tab:

```text
F12 -> Console
```

3. Open [`ym-track-collector.js`](./ym-track-collector.js), copy the entire script, paste it into the Console, and press **Enter**.
4. Use the floating panel in the top-right corner:
   - Press **Auto-scroll playlist** to collect the entire playlist automatically *(if auto-scroll pauses or gets stuck, nudge the mouse wheel once and press **Auto-scroll playlist** again)*.
   - Or scroll through the playlist manually and press **Stop & export**.
5. Click **Download .txt**, **Download .csv**, or **Copy .txt to clipboard** (or click **Resume collecting** to continue).

### Output Formats

Files are named automatically after the playlist title (e.g., `My Favorites.txt` / `My Favorites.csv`).

**TXT:**

```text
Artist - Title
```

**CSV (UTF-8 with BOM for Excel):**

```csv
Artist,Title,Duration
```

---

## Русская версия

### Описание

Скрипт для экспорта треков из **плейлистов Яндекс Музыки** в `.txt`, `.csv` или буфер обмена через консоль браузера (DevTools Console).

Форк оригинального проекта [idaniil24/ym-track-collector](https://github.com/idaniil24/ym-track-collector), адаптированный под обновлённую вёрстку Яндекс Музыки (Next.js + `react-virtuoso`). Поскольку список треков виртуализирован и в DOM одновременно присутствует лишь часть строк, скрипт собирает треки по мере прокрутки.

### Возможности и изменения в форке (v2.1.0)

- **Автопрокрутка** — автоматически находит реальный scroll-контейнер (с fallback через `scrollIntoView`), дожидается подгрузки шиммеров и определяет конец списка по `padding-bottom`
- **Ручной режим и пауза** — можно листать плейлист вручную, ставить автопрокрутку на паузу и продолжать с того же места
- **Актуальные селекторы DOM** — переход на `data-test-id` (`TRACK_PLAYLIST`, `TRACK_TITLE`, `SEPARATED_ARTIST_TITLE`, `TRACK_DURATION`, `virtuoso-item-list`) с резервными селекторами
- **Чистый парсинг метаданных** — убран префикс `Track ` / `Трек ` из названий, устранено дублирование исполнителей в фитах, сохраняются версии треков и длительность
- **Изоляция от плеера и сайдбара** — текущий трек из нижнего плеера (`PLAYERBAR_DESKTOP`) и закреплённые элементы больше не попадают в выгрузку
- **Сохранение порядка** — итоговый список сортируется по `data-index` из плейлиста
- **Сбор без пропусков** — вместо `debounce` используется `throttle` + перехват `scroll` в фазе `capture` и `MutationObserver`
- **Удобный экспорт** — `.txt`, `.csv` с UTF-8 BOM (кириллица корректно открывается в Excel), кнопка копирования в буфер обмена и автоматическое имя файла по названию плейлиста
- **Без расширений** — запускается напрямую из DevTools Console

### Как использовать

1. Откройте нужный плейлист на **Яндекс Музыке** (`music.yandex.ru`) и дождитесь загрузки первых треков.
2. Откройте **DevTools** и перейдите на вкладку **Console**:

```text
F12 -> Console
```

3. Откройте файл [`ym-track-collector.js`](./ym-track-collector.js), скопируйте весь код, вставьте в консоль и нажмите **Enter**.
4. В правом верхнем углу появится панель:
   - Нажмите **Auto-scroll playlist** — скрипт сам пролистает плейлист до конца *(если прокрутка застопорится, слегка крутаните колесо мыши и нажмите кнопку снова)*.
   - Либо пролистайте список вручную и нажмите **Stop & export**.
5. Нажмите **Download .txt**, **Download .csv** или **Copy .txt to clipboard** (при необходимости можно нажать **Resume collecting** и дособрать список).

### Форматы экспорта

Имена файлов формируются автоматически по названию плейлиста.

**TXT:**

```text
Исполнитель - Название
```

**CSV (UTF-8 с BOM для Excel):**

```csv
Artist,Title,Duration
```

---

## Support the Project

If this modified version helped you, consider supporting development.

### Crypto Donations

**USDT or BNB (BEP20 / BNB Smart Chain)**

```text
0x549a125F595B901e009835B74eF9203a5A4BD545
```

Thank you for the support! If you find this project useful, please star the repository.

---

## License

[MIT](./LICENSE) — original author [idaniil24](https://github.com/idaniil24), fork maintained by **minusminski**.
