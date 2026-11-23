(() => {
  'use strict';

  const GLOBAL_KEY = '__ymTrackCollector';
  const VERSION = '2.1.0';

  if (window[GLOBAL_KEY]?.cleanup) {
    window[GLOBAL_KEY].cleanup();
  }

  const CFG = {
    throttleMs: 80,
    autoScrollStepRatio: 0.65,
    autoScrollStepMs: 180,
    shimmerWaitMs: 2500,
    shimmerPollMs: 100,
    bottomConfirmChecks: 3,
    bottomConfirmMs: 350,
    maxStallTicks: 6
  };

  const SELECTORS = {
    itemListScoped: [
      '[data-test-id="PLAYLIST_PAGE"] [data-test-id="virtuoso-item-list"]',
      'main [data-test-id="virtuoso-item-list"]',
      '[data-test-id="virtuoso-item-list"]'
    ],
    scroller: '[data-virtuoso-scroller="true"], [data-test-id="virtuoso-scroller"]',
    row: '[data-test-id="TRACK_PLAYLIST"], [data-test-id="TRACK_ALBUM"], [class*="CommonTrack_root"]',
    excluded: '[data-test-id="PLAYERBAR_DESKTOP"], [data-test-id="PIN_LIST"], aside[data-test-id="NAVBAR"]',
    titleLink: 'a[data-test-id="TRACK_TITLE"], a[href*="/track/"]',
    titleText: '[class*="Meta_title"]',
    versionText: '[data-test-id="TRACK_VERSION"], [class*="Meta_version"]',
    artistLink: 'a[data-test-id="SEPARATED_ARTIST_TITLE"], a[href*="/artist/"]',
    artistCaption: '[class*="Meta_artistCaption"]',
    artistContainer: '[class*="Meta_artists"]',
    duration: '[data-test-id="TRACK_DURATION"], [class*="CommonControlsBar_duration"], time',
    playlistTitle: '[data-test-id="ENTITY_TITLE"]'
  };

  const tracks = new Map();
  let seenCounter = 0;

  const state = {
    running: true,
    autoScrolling: false,
    maxSeenIndex: -1,
    detectedScroller: null,
    observer: null,
    listeners: [],
    timers: new Set(),
    ui: null
  };

  window[GLOBAL_KEY] = state;

  // =========================
  // STYLES
  // =========================

  const injectStyles = () => {
    if (document.getElementById('ym-scraper-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'ym-scraper-styles';
    style.textContent = `
      #ym-scraper {
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 999999;
        width: 300px;
        background: #0e0e0e;
        border: 1px solid #222;
        border-radius: 12px;
        padding: 18px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
        font-size: 12px;
        color: #999;
        box-shadow: 0 8px 40px rgba(0, 0, 0, .6);
        user-select: none;
      }

      #ym-scraper .h {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
      }

      #ym-scraper .h-right {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      #ym-scraper .l {
        font-size: 10px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: #666;
      }

      #ym-scraper .v {
        color: #444;
        font-size: 10px;
      }

      #ym-scraper .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #3b3b3b;
        flex: 0 0 auto;
      }

      #ym-scraper .dot.a {
        background: #c8f560;
        box-shadow: 0 0 8px rgba(200, 245, 96, .5);
      }

      #ym-scraper .close {
        width: auto;
        margin: 0;
        padding: 2px 6px;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        color: #666;
        line-height: 1;
      }

      #ym-scraper .c {
        font-size: 34px;
        color: #f0f0f0;
        line-height: 1;
        margin: 6px 0 4px;
      }

      #ym-scraper .m {
        font-size: 10px;
        color: #555;
        min-height: 13px;
      }

      #ym-scraper .s {
        font-size: 11px;
        color: #888;
        min-height: 15px;
        margin: 8px 0 12px;
      }

      #ym-scraper button {
        width: 100%;
        padding: 9px 12px;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        background: transparent;
        color: #ccc;
        font: inherit;
        font-size: 11px;
        letter-spacing: .05em;
        cursor: pointer;
        text-align: left;
        margin-top: 8px;
        transition: background .15s, border-color .15s, color .15s;
      }

      #ym-scraper button:hover:not(:disabled) {
        background: #1a1a1a;
        border-color: #444;
        color: #fff;
      }

      #ym-scraper button:disabled {
        opacity: .45;
        cursor: not-allowed;
      }

      #ym-scraper button.p {
        border-color: #c8f560;
        color: #c8f560;
      }

      #ym-scraper button.p:hover:not(:disabled) {
        background: rgba(200, 245, 96, .08);
      }

      #ym-scraper .hidden {
        display: none;
      }
    `;

    document.head.appendChild(style);
  };

  // =========================
  // HELPERS
  // =========================

  const safeText = (element) => {
    if (!element) {
      return '';
    }

    return (element.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const unique = (array) => Array.from(new Set(array.filter(Boolean)));

  const csvCell = (value) => `"${String(value || '').replace(/"/g, '""')}"`;

  const isDurationText = (value) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(value);

  const getTrackId = (href) => {
    if (!href) {
      return '';
    }

    const str = String(href);
    const match = str.match(/\/track\/(\d+)/) || str.match(/[?&]trackId=(\d+)/);
    return match ? match[1] : '';
  };

  const getItemList = () => {
    for (const sel of SELECTORS.itemListScoped) {
      const candidates = Array.from(document.querySelectorAll(sel));
      const visible = candidates.find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && (rect.height > 0 || el.children.length > 0);
      });
      if (visible) {
        return visible;
      }
    }
    return null;
  };

  const getPlaylistFilename = (ext) => {
    const raw = safeText(document.querySelector(SELECTORS.playlistTitle)) || 'tracks';
    const clean = raw
      .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);

    return `${clean || 'tracks'}.${ext}`;
  };

  const setManagedTimeout = (fn, ms) => {
    const timer = setTimeout(() => {
      state.timers.delete(timer);
      fn();
    }, ms);

    state.timers.add(timer);
    return timer;
  };

  const sleep = (ms) => new Promise((resolve) => setManagedTimeout(resolve, ms));

  const throttle = (fn, ms) => {
    let lastRun = 0;
    let trailingTimer = null;

    return (...args) => {
      const now = Date.now();
      const remaining = ms - (now - lastRun);

      if (remaining <= 0) {
        if (trailingTimer) {
          clearTimeout(trailingTimer);
          state.timers.delete(trailingTimer);
          trailingTimer = null;
        }
        lastRun = now;
        fn(...args);
        return;
      }

      if (!trailingTimer) {
        trailingTimer = setManagedTimeout(() => {
          trailingTimer = null;
          lastRun = Date.now();
          fn(...args);
        }, remaining);
      }
    };
  };

  const addListener = (target, eventName, handler, options) => {
    if (!target?.addEventListener) {
      return;
    }

    target.addEventListener(eventName, handler, options);
    state.listeners.push({ target, eventName, handler, options });
  };

  const stopWatchers = () => {
    state.autoScrolling = false;

    state.listeners.forEach(({ target, eventName, handler, options }) => {
      target.removeEventListener(eventName, handler, options);
    });
    state.listeners = [];

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    state.timers.forEach((timer) => clearTimeout(timer));
    state.timers.clear();
  };

  state.cleanup = () => {
    state.running = false;
    stopWatchers();
    document.getElementById('ym-scraper')?.remove();
    document.getElementById('ym-scraper-styles')?.remove();
    delete window[GLOBAL_KEY];
  };

  // =========================
  // EXTRACTION
  // =========================

  const extractTitle = (row, titleLink) => {
    const primary =
      safeText(titleLink?.querySelector(SELECTORS.titleText)) ||
      safeText(titleLink) ||
      safeText(row.querySelector('[data-test-id="TRACK_TITLE"]')) ||
      safeText(row.querySelector(SELECTORS.titleText));

    let title = primary;

    if (!title && titleLink) {
      title = (titleLink.getAttribute('aria-label') || '')
        .replace(/^(?:Track|Трек)\s+/i, '')
        .trim();
    }

    if (!title || isDurationText(title)) {
      return '';
    }

    const version = safeText(row.querySelector(SELECTORS.versionText));
    if (version && !title.toLowerCase().includes(version.toLowerCase())) {
      title = version.startsWith('(') ? `${title} ${version}` : `${title} (${version})`;
    }

    return title;
  };

  const extractArtists = (row) => {
    const fromLinks = unique(
      Array.from(row.querySelectorAll(SELECTORS.artistLink)).map(safeText)
    );
    if (fromLinks.length > 0) {
      return fromLinks.join(', ');
    }

    const fromCaptions = unique(
      Array.from(row.querySelectorAll(SELECTORS.artistCaption)).map(safeText)
    );
    if (fromCaptions.length > 0) {
      return fromCaptions.join(', ');
    }

    return safeText(row.querySelector(SELECTORS.artistContainer));
  };

  const extractDuration = (row) => {
    const fromElement = Array.from(row.querySelectorAll(SELECTORS.duration))
      .map(safeText)
      .find(isDurationText);

    if (fromElement) {
      return fromElement;
    }

    const match = safeText(row).match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
    return match ? match[0] : '';
  };

  const mergeTrack = (nextTrack) => {
    const current = tracks.get(nextTrack.key);

    if (!current) {
      tracks.set(nextTrack.key, {
        ...nextTrack,
        seenOrder: ++seenCounter
      });
      return true;
    }

    const nextIndex =
      typeof current.index === 'number'
        ? current.index
        : nextTrack.index;

    const merged = {
      ...current,
      index: nextIndex,
      title: current.title || nextTrack.title,
      artists: current.artists || nextTrack.artists,
      duration: current.duration || nextTrack.duration
    };

    const changed =
      merged.index !== current.index ||
      merged.title !== current.title ||
      merged.artists !== current.artists ||
      merged.duration !== current.duration;

    if (changed) {
      tracks.set(nextTrack.key, merged);
    }

    return changed;
  };

  const parseRow = (row) => {
    if (!row || row.closest(SELECTORS.excluded)) {
      return false;
    }

    const indexEl = row.closest('[data-index]');
    const rawIdx = indexEl?.getAttribute('data-index');
    const index =
      rawIdx !== null && rawIdx !== undefined && rawIdx !== '' && !Number.isNaN(Number(rawIdx))
        ? Number(rawIdx)
        : null;

    if (typeof index === 'number' && index > state.maxSeenIndex) {
      state.maxSeenIndex = index;
    }

    const titleLink = row.querySelector(SELECTORS.titleLink);
    const title = extractTitle(row, titleLink);

    if (!title) {
      return false;
    }

    const artists = extractArtists(row);
    const duration = extractDuration(row);
    const id = getTrackId(titleLink?.getAttribute('href') || titleLink?.href);

    const key = id
      ? `id:${id}`
      : typeof index === 'number'
        ? `idx:${index}`
        : `meta:${artists.toLowerCase()}::${title.toLowerCase()}`;

    return mergeTrack({ key, id, index, title, artists, duration });
  };

  const extractTracks = () => {
    let changed = false;

    const itemList = getItemList();
    const root = itemList || document;
    const rows = root.querySelectorAll(SELECTORS.row);

    if (rows.length > 0) {
      rows.forEach((row) => {
        if (parseRow(row)) {
          changed = true;
        }
      });
      return changed;
    }

    root.querySelectorAll(SELECTORS.titleLink).forEach((link) => {
      if (link.closest(SELECTORS.excluded)) {
        return;
      }

      const row = link.closest('[data-index]') || link.parentElement?.parentElement;
      if (parseRow(row)) {
        changed = true;
      }
    });

    return changed;
  };

  // =========================
  // SCROLLER DETECTION & AUTO-SCROLL
  // =========================

  const isDocScroller = (el) => {
    return (
      el === window ||
      el === document ||
      el === document.documentElement ||
      el === document.body ||
      el === document.scrollingElement
    );
  };

  const getScrollMetrics = (el) => {
    if (!el || isDocScroller(el)) {
      const docEl = document.scrollingElement || document.documentElement;
      return {
        isWindow: true,
        el: docEl,
        top: window.scrollY ?? docEl.scrollTop ?? 0,
        clientHeight: window.innerHeight || docEl.clientHeight,
        scrollHeight: docEl.scrollHeight
      };
    }

    return {
      isWindow: false,
      el,
      top: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight
    };
  };

  const setScrollTopInstant = (el, y) => {
    const targetY = Math.max(0, y);

    if (!el || isDocScroller(el)) {
      try {
        window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
      } catch {
        window.scrollTo(0, targetY);
      }
      return;
    }

    try {
      el.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
    } catch {
      el.scrollTop = targetY;
    }
  };

  const canElementScroll = (el) => {
    if (!el) {
      return false;
    }

    const m = getScrollMetrics(el);
    if (m.scrollHeight <= m.clientHeight + 20) {
      return false;
    }

    if (!m.isWindow && el instanceof Element) {
      const style = window.getComputedStyle(el);
      if (!/(auto|scroll|overlay)/.test(style.overflowY)) {
        return false;
      }
    }

    const prev = m.top;
    const probe = prev > 20 ? prev - 10 : prev + 10;
    setScrollTopInstant(el, probe);
    const after = getScrollMetrics(el).top;
    setScrollTopInstant(el, prev);

    return Math.abs(after - prev) > 0;
  };

  const findScroller = () => {
    if (
      state.detectedScroller &&
      (isDocScroller(state.detectedScroller) || document.contains(state.detectedScroller)) &&
      canElementScroll(state.detectedScroller)
    ) {
      return state.detectedScroller;
    }

    const itemList = getItemList() || document.querySelector(SELECTORS.row);
    const candidates = [];

    let cur = itemList;
    while (cur) {
      candidates.push(cur);
      cur = cur.parentElement;
    }

    candidates.push(
      document.scrollingElement,
      document.documentElement,
      document.body
    );

    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
    for (const el of uniqueCandidates) {
      if (canElementScroll(el)) {
        state.detectedScroller = el;
        return el;
      }
    }

    // Last resort: check any visible virtuoso scroller on the page
    const allScrollers = Array.from(document.querySelectorAll(SELECTORS.scroller));
    for (const el of allScrollers) {
      if (canElementScroll(el)) {
        state.detectedScroller = el;
        return el;
      }
    }

    return null;
  };

  const getVirtuosoPaddingBottom = () => {
    const list = getItemList();
    if (!list) {
      return 0;
    }

    const raw = window.getComputedStyle(list).paddingBottom;
    return Number.parseFloat(raw) || 0;
  };

  const hasUnloadedShimmers = () => {
    const list = getItemList();
    if (!list) {
      return false;
    }

    const slots = list.querySelectorAll(':scope > [data-index]');
    for (const slot of slots) {
      if (slot.querySelector('[class*="shimmer" i], [class*="skeleton" i]')) {
        return true;
      }
      if (!safeText(slot)) {
        return true;
      }
    }

    return false;
  };

  const waitForVisibleTracks = async () => {
    const deadline = Date.now() + CFG.shimmerWaitMs;

    while (state.autoScrolling && state.running && Date.now() < deadline) {
      extractTracks();
      if (!hasUnloadedShimmers()) {
        break;
      }
      await sleep(CFG.shimmerPollMs);
    }

    extractTracks();
  };

  const fallbackScrollByItem = () => {
    const list = getItemList();
    if (!list) {
      return false;
    }

    const items = Array.from(list.querySelectorAll(':scope > [data-index]'));
    if (items.length === 0) {
      return false;
    }

    // Pick an item near ~70% of currently rendered items so we don't skip rows
    const targetIdx = Math.min(items.length - 1, Math.max(0, Math.floor(items.length * 0.7)));
    const targetItem = items[targetIdx];

    try {
      targetItem.scrollIntoView({ block: 'start', behavior: 'instant' });
    } catch {
      targetItem.scrollIntoView(true);
    }

    return true;
  };

  const startAutoScroll = async () => {
    if (state.autoScrolling) {
      state.autoScrolling = false;
      updateUi('Auto-scroll paused — scroll manually or resume');
      return;
    }

    state.running = true;
    state.autoScrolling = true;
    updateUi('Finding scroll container...');

    let scroller = findScroller();
    if (!scroller) {
      // Trigger one scrollIntoView so the browser reveals the real scroll target
      fallbackScrollByItem();
      await sleep(250);
      scroller = findScroller();
    }

    if (scroller) {
      console.log('[YM Track Collector] Using scroller:', scroller);
    } else {
      console.warn('[YM Track Collector] Scroller not detected, using scrollIntoView fallback.');
    }

    let bottomTicks = 0;
    let stallTicks = 0;

    while (state.autoScrolling && state.running) {
      await waitForVisibleTracks();

      scroller = findScroller() || scroller;
      const paddingBottom = getVirtuosoPaddingBottom();

      if (scroller) {
        const m = getScrollMetrics(scroller);
        const maxScroll = Math.max(0, m.scrollHeight - m.clientHeight);
        const pct = maxScroll > 0
          ? Math.min(100, Math.round((m.top / maxScroll) * 100))
          : 0;

        updateUi(`Auto-scrolling... ${pct}%`);

        const atPhysicalBottom = maxScroll > 20 && m.top >= maxScroll - 4;
        const atVirtuosoBottom = paddingBottom < 50;

        if (atPhysicalBottom && atVirtuosoBottom) {
          await sleep(CFG.bottomConfirmMs);
          const changed = extractTracks();
          const newMax = Math.max(0, getScrollMetrics(scroller).scrollHeight - getScrollMetrics(scroller).clientHeight);

          if (changed || newMax > maxScroll + 10 || getVirtuosoPaddingBottom() >= 50 || hasUnloadedShimmers()) {
            bottomTicks = 0;
            continue;
          }

          bottomTicks += 1;
          if (bottomTicks >= CFG.bottomConfirmChecks) {
            state.autoScrolling = false;
            state.running = false;
            stopWatchers();
            updateUi('Done! Ready to download');
            return;
          }
          continue;
        }

        bottomTicks = 0;
        const step = Math.max(200, Math.floor(m.clientHeight * CFG.autoScrollStepRatio));
        const beforeTop = m.top;
        const beforeMaxIdx = state.maxSeenIndex;

        setScrollTopInstant(scroller, Math.min(maxScroll, beforeTop + step));
        await sleep(CFG.autoScrollStepMs);

        const afterTop = getScrollMetrics(scroller).top;
        extractTracks();

        if (Math.abs(afterTop - beforeTop) < 2 && state.maxSeenIndex === beforeMaxIdx) {
          // Try item-based scroll fallback before counting as stalled
          fallbackScrollByItem();
          await sleep(CFG.autoScrollStepMs);
          extractTracks();

          const retryTop = getScrollMetrics(scroller).top;
          if (Math.abs(retryTop - beforeTop) < 2 && state.maxSeenIndex === beforeMaxIdx) {
            stallTicks += 1;
            if (stallTicks >= CFG.maxStallTicks) {
              state.autoScrolling = false;
              updateUi('Scroll stuck — nudge wheel & press Auto-scroll');
              return;
            }
          } else {
            stallTicks = 0;
          }
        } else {
          stallTicks = 0;
        }
      } else {
        // Pure fallback mode if no scrollable container could be probed
        const beforeMaxIdx = state.maxSeenIndex;
        const beforeCount = tracks.size;

        updateUi('Auto-scrolling (fallback)...');
        fallbackScrollByItem();
        await sleep(CFG.autoScrollStepMs + 120);
        extractTracks();

        const advanced = state.maxSeenIndex > beforeMaxIdx || tracks.size > beforeCount;
        if (!advanced) {
          if (getVirtuosoPaddingBottom() < 50 && !hasUnloadedShimmers()) {
            bottomTicks += 1;
            if (bottomTicks >= CFG.bottomConfirmChecks) {
              state.autoScrolling = false;
              state.running = false;
              stopWatchers();
              updateUi('Done! Ready to download');
              return;
            }
          } else {
            stallTicks += 1;
            if (stallTicks >= CFG.maxStallTicks) {
              state.autoScrolling = false;
              updateUi('Could not auto-scroll — scroll manually');
              return;
            }
          }
        } else {
          bottomTicks = 0;
          stallTicks = 0;
        }
      }
    }

    if (state.running) {
      updateUi('Auto-scroll paused — scroll manually or resume');
    }
  };

  // =========================
  // FORMAT & DOWNLOAD
  // =========================

  const getSortedTracks = () => {
    return Array.from(tracks.values()).sort((a, b) => {
      const aHas = typeof a.index === 'number';
      const bHas = typeof b.index === 'number';
      if (aHas && bHas && a.index !== b.index) {
        return a.index - b.index;
      }
      if (aHas !== bHas) {
        return aHas ? -1 : 1;
      }
      return a.seenOrder - b.seenOrder;
    });
  };

  const formatTracks = () => {
    const array = getSortedTracks();

    const txt = array
      .map((t) => (t.artists ? `${t.artists} - ${t.title}` : t.title))
      .join('\n');

    const csvRows = array.map((t) =>
      [t.artists, t.title, t.duration].map(csvCell).join(',')
    );

    const csv = '\uFEFF' + ['Artist,Title,Duration', ...csvRows].join('\n');

    return { txt, csv };
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setManagedTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyTracks = async () => {
    const { txt } = formatTracks();
    try {
      await navigator.clipboard.writeText(txt);
      updateUi('Copied to clipboard');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      updateUi('Copied to clipboard');
    }
  };

  // =========================
  // PANEL UI
  // =========================

  const createPanel = () => {
    const panel = document.createElement('div');
    panel.id = 'ym-scraper';
    panel.innerHTML = `
      <div class="h">
        <div>
          <div class="l">YM Track Collector</div>
          <div class="v">v${VERSION}</div>
        </div>
        <div class="h-right">
          <div class="dot a" id="ym-dot"></div>
          <button id="ym-close" class="close" title="Close">×</button>
        </div>
      </div>

      <div class="c" id="ym-count">0</div>
      <div class="m" id="ym-meta"></div>
      <div class="s" id="ym-status"></div>

      <div id="ym-active-controls">
        <button id="ym-auto" class="p">Auto-scroll playlist</button>
        <button id="ym-stop">Stop &amp; export</button>
      </div>

      <div id="ym-export-controls" class="hidden">
        <button id="ym-dl-txt" class="p">Download .txt</button>
        <button id="ym-dl-csv">Download .csv</button>
        <button id="ym-copy">Copy .txt to clipboard</button>
        <button id="ym-resume">Resume collecting</button>
      </div>
    `;

    document.body.appendChild(panel);

    const ui = {
      panel,
      dot: panel.querySelector('#ym-dot'),
      count: panel.querySelector('#ym-count'),
      meta: panel.querySelector('#ym-meta'),
      status: panel.querySelector('#ym-status'),
      activeControls: panel.querySelector('#ym-active-controls'),
      exportControls: panel.querySelector('#ym-export-controls'),
      autoBtn: panel.querySelector('#ym-auto'),
      stopBtn: panel.querySelector('#ym-stop'),
      dlTxtBtn: panel.querySelector('#ym-dl-txt'),
      dlCsvBtn: panel.querySelector('#ym-dl-csv'),
      copyBtn: panel.querySelector('#ym-copy'),
      resumeBtn: panel.querySelector('#ym-resume'),
      closeBtn: panel.querySelector('#ym-close')
    };

    ui.closeBtn.addEventListener('click', () => state.cleanup());
    ui.autoBtn.addEventListener('click', () => startAutoScroll());

    ui.stopBtn.addEventListener('click', () => {
      extractTracks();
      state.running = false;
      stopWatchers();
      updateUi('Ready to download');
    });

    ui.dlTxtBtn.addEventListener('click', () => {
      downloadFile(formatTracks().txt, getPlaylistFilename('txt'), 'text/plain');
    });

    ui.dlCsvBtn.addEventListener('click', () => {
      downloadFile(formatTracks().csv, getPlaylistFilename('csv'), 'text/csv');
    });

    ui.copyBtn.addEventListener('click', () => copyTracks());

    ui.resumeBtn.addEventListener('click', () => {
      state.running = true;
      watchDomChanges();
      watchScroll();
      extractTracks();
      updateUi('Scroll manually or press Auto-scroll');
    });

    state.ui = ui;
    return ui;
  };

  const updateUi = (statusText) => {
    const ui = state.ui || createPanel();

    ui.count.textContent = String(tracks.size);
    ui.meta.textContent =
      state.maxSeenIndex >= 0
        ? `max index seen: #${state.maxSeenIndex + 1}`
        : '';

    if (typeof statusText === 'string') {
      ui.status.textContent = statusText;
    }

    ui.dot.classList.toggle('a', state.running);
    ui.activeControls.classList.toggle('hidden', !state.running);
    ui.exportControls.classList.toggle('hidden', state.running);
    ui.autoBtn.textContent = state.autoScrolling
      ? 'Pause auto-scroll'
      : 'Auto-scroll playlist';

    const empty = tracks.size === 0;
    ui.dlTxtBtn.disabled = empty;
    ui.dlCsvBtn.disabled = empty;
    ui.copyBtn.disabled = empty;
  };

  // =========================
  // WATCHERS
  // =========================

  const scheduleCollect = throttle(() => {
    if (!state.running) {
      return;
    }

    extractTracks();
    updateUi();
  }, CFG.throttleMs);

  const watchDomChanges = () => {
    if (state.observer || !document.body || !window.MutationObserver) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      const panel = state.ui?.panel;
      const hasPageChanges = mutations.some((m) => {
        if (!panel) {
          return true;
        }
        return !(m.target === panel || panel.contains(m.target));
      });

      if (hasPageChanges) {
        scheduleCollect();
      }
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  const watchScroll = () => {
    const onScroll = (event) => {
      const target =
        event.target === document || event.target === window
          ? (document.scrollingElement || document.documentElement)
          : event.target;

      const itemList = getItemList();
      if (target && itemList && (isDocScroller(target) || target === itemList || target.contains(itemList))) {
        state.detectedScroller = target;
      }

      scheduleCollect();
    };

    addListener(document, 'scroll', onScroll, {
      capture: true,
      passive: true
    });
  };

  // =========================
  // START
  // =========================

  injectStyles();
  createPanel();
  extractTracks();
  watchDomChanges();
  watchScroll();
  updateUi('Press Auto-scroll or scroll manually');

  console.log(`[YM Track Collector] Started v${VERSION}. Found ${tracks.size} tracks.`);
})();
