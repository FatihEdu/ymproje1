function formatRelativeTime(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d)) return '-';
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'şimdi';
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  if (diffMin < 60) return `${diffMin} dk önce`;
  if (diffHour < 24) return `${diffHour} saat önce`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} gün önce`;
  // 7 gün ve fazlası için kısa tarih göster
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function formatShortDateTime(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d)) return '-';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getFreshnessClass(dateString) {
  if (!dateString) return 'freshness--unknown';
  const d = new Date(dateString);
  if (isNaN(d)) return 'freshness--unknown';
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 1000 / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 60 * 24) return 'freshness--fresh';
  if (diffDay < 7) return 'freshness--warn';
  return 'freshness--stale';
}
import { parseAllProviders } from './scrapeClientParser.js';

const DATA_BASE_URL = globalThis.__SCRAPE_BASE_URL__ || 'https://fatihedu.github.io/ymproje1';

const SELECTORS = {
  usdValue: '#val-usd',
  usdChange: '#chg-usd',
  eurValue: '#val-eur',
  eurChange: '#chg-eur',
  gbpValue: '#val-gbp',
  gbpChange: '#chg-gbp',
  goldValue: '#val-gold',
  goldChange: '#chg-gold',
  listBody: '#currency-list-body',
  listMeta: '#currency-list-meta',
  rangeStartInput: '#range-start-date',
  rangeEndInput: '#range-end-date',
  rangeButton: '#range-load-btn',
  chartPair: '#chart-pair',
  chartCanvas: '#range-chart',
  chartMeta: '#chart-meta',
  loadingOverlay: '#loading-overlay',
  loadingMessage: '#loading-message'
};

function qs(selector) {
  return document.querySelector(selector);
}

// state for sorting and last loaded rows (used when user toggles sort)
let latestLoadedRows = [];
let currentSort = { key: null, asc: true };
let latestSnapshotCache = null;
let currentMonthlyEntriesCache = null;
let chartLastSeries = [];
let chartLastPair = 'USD/TRY';
let chartPointPixels = [];
let chartHoverIndex = null;
let loadingDepth = 0;

function clearSortIndicators() {
  document.querySelectorAll('th[data-sort]').forEach((el) => {
    el.classList.remove('asc', 'desc');
    const btn = el.querySelector('.sort-btn');
    if (btn) btn.textContent = '⇅';
    const indicator = el.querySelector('.sort-indicator');
    if (indicator) indicator.textContent = '';
  });
}

function updateSortIndicator() {
  clearSortIndicators();
  if (!currentSort.key) return;
  const th = document.querySelector(`th[data-sort="${currentSort.key}"]`);
  if (th) {
    th.classList.add(currentSort.asc ? 'asc' : 'desc');
    const btn = th.querySelector('.sort-btn');
    if (btn) btn.textContent = currentSort.asc ? '▲' : '▼';
  }
}

function wireSortHeaders() {
  const headers = Array.from(document.querySelectorAll('th[data-sort]'));
  headers.forEach((th) => {
    th.classList.add('th-sortable');
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.key = key;
        currentSort.asc = true;
      }
      updateSortIndicator();
      renderCurrencyList(latestLoadedRows);
    });
  });
}

function showLoading(message = 'Yukleniyor...') {
  const overlay = qs(SELECTORS.loadingOverlay);
  const msg = qs(SELECTORS.loadingMessage);
  loadingDepth += 1;
  if (msg) msg.textContent = message;
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = qs(SELECTORS.loadingOverlay);
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (loadingDepth === 0 && overlay) overlay.classList.add('hidden');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatNumber(value, fractionDigits = 4) {
  if (value == null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}

function formatPct(value) {
  if (value == null || !Number.isFinite(value)) return '';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, 2)}%`;
}

function setText(selector, text) {
  const el = qs(selector);
  if (el) el.textContent = text;
}

function setChange(selector, value) {
  const el = qs(selector);
  if (!el) return;

  el.textContent = formatPct(value);
  el.classList.remove('up', 'down');
  if (value > 0) el.classList.add('up');
  if (value < 0) el.classList.add('down');
}

function getBestPerPair(rows, pairCandidates) {
  const matches = rows.filter((r) => pairCandidates.includes(r.pair));
  if (!matches.length) return null;

  // Use arithmetic mean across providers for a stable single summary value.
  const parityValues = matches.map((m) => m.parity).filter(Number.isFinite);
  const changeValues = matches.map((m) => m.changePct).filter(Number.isFinite);

  const parity = parityValues.length
    ? parityValues.reduce((a, b) => a + b, 0) / parityValues.length
    : null;

  const changePct = changeValues.length
    ? changeValues.reduce((a, b) => a + b, 0) / changeValues.length
    : null;

  return { parity, changePct };
}

const SELECTED_PAIRS = ['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'XAU/TRY'];
let isLoggedIn = false;
let csrfToken = '';
let favoriteSet = new Set();

function favoriteKey(pair, providerName) {
  return `${pair}::${providerName}`;
}

async function initAuthState() {
  try {
    const auth = await fetchJson('/auth/me');
    isLoggedIn = Boolean(auth?.user);
  } catch {
    isLoggedIn = false;
  }
}

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const data = await fetchJson('/csrf-token');
  csrfToken = data?.csrfToken || '';
  return csrfToken;
}

async function loadFavorites() {
  if (!isLoggedIn) {
    favoriteSet = new Set();
    return;
  }

  try {
    const data = await fetchJson('/api/favorites');
    const list = Array.isArray(data?.favorites) ? data.favorites : [];
    favoriteSet = new Set(list.map((f) => favoriteKey(f.pair, f.providerName)));
  } catch {
    favoriteSet = new Set();
  }
}

async function updateFavorite(pair, providerName, shouldAdd) {
  const token = await ensureCsrfToken();
  const body = new URLSearchParams({ pair, providerName }).toString();

  const url = shouldAdd ? '/api/favorites' : '/api/favorites/remove';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'x-csrf-token': token,
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const list = Array.isArray(data?.favorites) ? data.favorites : [];
  favoriteSet = new Set(list.map((f) => favoriteKey(f.pair, f.providerName)));
}

function filterVisibleRows(rows) {
  return rows.filter((row) => SELECTED_PAIRS.includes(row.pair));
}

function updateSummaryCards(rows) {
  const usd = getBestPerPair(rows, ['USD/TRY']);
  const eur = getBestPerPair(rows, ['EUR/TRY']);
  const gbp = getBestPerPair(rows, ['GBP/TRY']);
  const gold = getBestPerPair(rows, ['XAU/TRY', 'ALT/TRY']);

  setText(SELECTORS.usdValue, formatNumber(usd?.parity));
  setChange(SELECTORS.usdChange, usd?.changePct ?? null);

  setText(SELECTORS.eurValue, formatNumber(eur?.parity));
  setChange(SELECTORS.eurChange, eur?.changePct ?? null);

  setText(SELECTORS.gbpValue, formatNumber(gbp?.parity));
  setChange(SELECTORS.gbpChange, gbp?.changePct ?? null);

  setText(SELECTORS.goldValue, formatNumber(gold?.parity));
  setChange(SELECTORS.goldChange, gold?.changePct ?? null);
}

function renderCurrencyList(rows) {
  const body = qs(SELECTORS.listBody);
  if (!body) return;
  // keep latestLoadedRows in sync with what is being displayed so sorting works
  latestLoadedRows = Array.isArray(rows) ? rows.slice() : [];

  body.textContent = '';

  if (!rows.length) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="7" class="text-center text-muted">Kur verisi bulunamadı.</td>';
    body.appendChild(emptyRow);
    return;
  }

  const groups = rows.reduce((map, row) => {
    if (!map[row.pair]) map[row.pair] = [];
    map[row.pair].push(row);
    return map;
  }, Object.create(null));

  const sortedPairs = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  for (const pair of sortedPairs) {
    const groupRowsUnsorted = groups[pair] || [];
    let groupRows = groupRowsUnsorted.slice();
    // numeric comparator that pushes invalid numbers to the end
    const numericCompare = (ka, kb, asc = true) => (a, b) => {
      const avRaw = a[ka];
      const bvRaw = b[kb === ka ? ka : kb];
      const av = Number(avRaw);
      const bv = Number(bvRaw);
      const aNaN = !Number.isFinite(av);
      const bNaN = !Number.isFinite(bv);
      if (aNaN && bNaN) return 0;
      if (aNaN) return 1;
      if (bNaN) return -1;
      return asc ? av - bv : bv - av;
    };

    if (currentSort.key === 'spread') {
      groupRows.sort(numericCompare('spread', 'spread', currentSort.asc));
    } else if (currentSort.key === 'buy' || currentSort.key === 'sell') {
      groupRows.sort(numericCompare(currentSort.key, currentSort.key, currentSort.asc));
    } else {
      groupRows.sort((a, b) => a.providerName.localeCompare(b.providerName));
    }
    const displayPair = pair === 'XAU/TRY' ? 'ALTIN' : pair;

    const headerRow = document.createElement('tr');
    headerRow.className = 'currency-group-row';
    const headerTd = document.createElement('td');
    headerTd.colSpan = 7;
    const groupDiv = document.createElement('div');
    groupDiv.className = 'currency-group';
    const groupName = document.createElement('span');
    groupName.className = 'currency-group__name';
    groupName.textContent = displayPair;
    groupDiv.appendChild(groupName);
    headerTd.appendChild(groupDiv);
    headerRow.appendChild(headerTd);
    body.appendChild(headerRow);

    for (const row of groupRows) {
      const changeClass = row.changePct > 0 ? 'up' : row.changePct < 0 ? 'down' : '';
      const key = favoriteKey(row.pair, row.providerName);
      const isFav = favoriteSet.has(key);
      const freshnessClass = getFreshnessClass(row.time);

      const tr = document.createElement('tr');
      tr.className = 'bank-row';

      const favTd = document.createElement('td');
      favTd.className = 'col-fav';
      if (isLoggedIn) {
        const favBtn = document.createElement('button');
        favBtn.className = `fav-btn${isFav ? ' is-active' : ''}`;
        favBtn.type = 'button';
        favBtn.dataset.pair = row.pair;
        favBtn.dataset.provider = row.providerName;
        favBtn.setAttribute('aria-label', 'Favori');
        favBtn.textContent = '★';
        favTd.appendChild(favBtn);
      }
      tr.appendChild(favTd);

      const providerTd = document.createElement('td');
      providerTd.textContent = row.providerName;
      tr.appendChild(providerTd);

      const buyTd = document.createElement('td');
      buyTd.textContent = formatNumber(row.buy);
      tr.appendChild(buyTd);

      const sellTd = document.createElement('td');
      sellTd.textContent = formatNumber(row.sell);
      tr.appendChild(sellTd);

      const spreadTd = document.createElement('td');
      spreadTd.textContent = formatNumber(row.spread);
      tr.appendChild(spreadTd);

      const changeTd = document.createElement('td');
      changeTd.className = changeClass;
      changeTd.textContent = formatPct(row.changePct);
      tr.appendChild(changeTd);

      const freshnessTd = document.createElement('td');
      freshnessTd.className = `last-updated ${freshnessClass}`;
      freshnessTd.title = formatShortDateTime(row.time);
      const freshnessCell = document.createElement('div');
      freshnessCell.className = 'freshness-cell';
      const freshnessDot = document.createElement('span');
      freshnessDot.className = 'freshness-dot';
      freshnessCell.appendChild(freshnessDot);
      const freshnessText = document.createElement('span');
      freshnessText.className = 'freshness-text';
      freshnessText.textContent = formatRelativeTime(row.time);
      freshnessCell.appendChild(freshnessText);
      freshnessTd.appendChild(freshnessCell);
      tr.appendChild(freshnessTd);

      body.appendChild(tr);
    }
  }

  if (isLoggedIn) {
    body.querySelectorAll('.fav-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pair = btn.dataset.pair;
        const providerName = btn.dataset.provider;
        const currentlyFav = favoriteSet.has(favoriteKey(pair, providerName));
        btn.disabled = true;
        try {
          await updateFavorite(pair, providerName, !currentlyFav);
          renderCurrencyList(rows);
        } catch (error) {
          console.error(error);
          renderMeta(`Favori guncellenemedi: ${error.message}`);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchGzipText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const buffer = await res.arrayBuffer();

  if (!('DecompressionStream' in globalThis)) {
    throw new Error('Tarayici gzip acmayi desteklemiyor.');
  }

  const ds = new DecompressionStream('gzip');
  const decompressed = new Response(new Blob([buffer]).stream().pipeThrough(ds));
  return decompressed.text();
}

function parseJsonl(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function renderMeta(message) {
  const el = qs(SELECTORS.listMeta);
  if (el) el.textContent = message;
}

function renderChartMeta(message) {
  const el = qs(SELECTORS.chartMeta);
  if (el) el.textContent = message;
}

function createProviderMapFromSnapshot(snapshot) {
  const map = new Map();
  const results = Array.isArray(snapshot?.results) ? snapshot.results : [];
  for (const result of results) {
    const id = result?.meta?.id;
    if (!id) continue;
    map.set(id, result);
  }
  return map;
}

function applyCompactResultToMap(providerMap, result) {
  const id = result?.meta?.id;
  if (!id) return;

  const prev = providerMap.get(id);

  if (result?.data && typeof result.data === 'object') {
    providerMap.set(id, {
      ...prev,
      ...result,
      meta: result.meta || prev?.meta,
      data: result.data,
    });
    return;
  }

  if (prev) {
    providerMap.set(id, {
      ...prev,
      ...result,
      meta: result.meta || prev.meta,
      data: prev.data,
    });
    return;
  }

  providerMap.set(id, result);
}

function snapshotFromProviderMap(providerMap, template) {
  return {
    rev: template?.rev ?? 1,
    scheduledFor: template?.scheduledFor ?? null,
    runStartedAt: template?.runStartedAt ?? null,
    timezone: template?.timezone ?? null,
    results: Array.from(providerMap.values()),
  };
}

function formatChartPointLabel(dateString, fallbackMonthKey) {
  if (!dateString) return fallbackMonthKey;
  const d = new Date(dateString);
  if (isNaN(d)) return fallbackMonthKey;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function getLatestSnapshot() {
  if (latestSnapshotCache && Array.isArray(latestSnapshotCache.results)) {
    return latestSnapshotCache;
  }

  const latestUrl = `${DATA_BASE_URL}/latest_all.json`;
  latestSnapshotCache = await fetchJson(latestUrl);
  return latestSnapshotCache;
}

async function getCurrentMonthlyEntries() {
  if (Array.isArray(currentMonthlyEntriesCache)) {
    return currentMonthlyEntriesCache;
  }

  let currentMonthlyPath = null;
  try {
    const indexJson = await fetchJson(`${DATA_BASE_URL}/index.json`);
    if (indexJson?.currentMonthly) {
      currentMonthlyPath = `${DATA_BASE_URL}/${indexJson.currentMonthly}`;
    }
  } catch {
    currentMonthlyPath = null;
  }

  if (!currentMonthlyPath) {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    currentMonthlyPath = `${DATA_BASE_URL}/monthlies/current/${monthKey}.jsonl`;
  }

  const text = await fetchText(currentMonthlyPath);
  currentMonthlyEntriesCache = parseJsonl(text);
  return currentMonthlyEntriesCache;
}

function toDateOnlyString(dateValue) {
  if (typeof dateValue === 'string') {
    const isoDateMatch = dateValue.match(/^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))(?:$|T)/);
    if (isoDateMatch) return isoDateMatch[1];
  }
  const d = new Date(dateValue);
  if (isNaN(d)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function getAvailableDateBounds(entries) {
  const points = [];
  for (const entry of entries || []) {
    const iso = entry?.runStartedAt || entry?.scheduledFor;
    const dateOnly = toDateOnlyString(iso);
    if (dateOnly) points.push(dateOnly);
  }
  if (!points.length) return null;
  points.sort();
  return {
    minDate: points[0],
    maxDate: points[points.length - 1],
  };
}

function addDays(dateOnly, days) {
  const parts = typeof dateOnly === 'string' ? dateOnly.split('-') : [];
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(d)) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnlyString(d.toISOString());
}

async function applyDateInputBounds() {
  const rangeStartInput = qs(SELECTORS.rangeStartInput);
  const rangeEndInput = qs(SELECTORS.rangeEndInput);
  if (!rangeStartInput || !rangeEndInput) return;

  try {
    const entries = await getCurrentMonthlyEntries();
    const bounds = getAvailableDateBounds(entries);
    if (!bounds) return;

    const { minDate, maxDate } = bounds;
    rangeStartInput.min = minDate;
    rangeStartInput.max = maxDate;
    rangeEndInput.min = minDate;
    rangeEndInput.max = maxDate;

    const desiredStart = addDays(maxDate, -7);
    const safeStart = desiredStart && desiredStart >= minDate ? desiredStart : minDate;

    if (!rangeStartInput.value || rangeStartInput.value < minDate || rangeStartInput.value > maxDate) {
      rangeStartInput.value = safeStart;
    }
    if (!rangeEndInput.value || rangeEndInput.value < minDate || rangeEndInput.value > maxDate) {
      rangeEndInput.value = maxDate;
    }

    if (rangeStartInput.value > rangeEndInput.value) {
      rangeStartInput.value = rangeEndInput.value;
    }
  } catch (error) {
    console.warn('[homeDataLoader] date input bounds could not be applied', error?.message || error);
  }
}

function monthKeyToIndex(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

function indexToMonthKey(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function enumerateMonthKeys(startMonthKey, endMonthKey) {
  const startIndex = monthKeyToIndex(startMonthKey);
  const endIndex = monthKeyToIndex(endMonthKey);
  if (startIndex == null || endIndex == null || startIndex > endIndex) return [];
  const keys = [];
  for (let i = startIndex; i <= endIndex; i += 1) {
    keys.push(indexToMonthKey(i));
  }
  return keys;
}

async function fetchMonthlyEntries(monthKey) {
  let jsonlText = '';
  const currentPath = `${DATA_BASE_URL}/monthlies/current/${monthKey}.jsonl`;

  try {
    jsonlText = await fetchText(currentPath);
  } catch {
    const [year, month] = monthKey.split('-');
    const closedPath = `${DATA_BASE_URL}/monthlies/${year}/${month}.jsonl.gz`;
    jsonlText = await fetchGzipText(closedPath);
  }

  return parseJsonl(jsonlText);
}

function getPairParity(rows, pair) {
  const matches = rows.filter((r) => r.pair === pair).map((r) => r.parity).filter(Number.isFinite);
  if (!matches.length) return null;
  return matches.reduce((a, b) => a + b, 0) / matches.length;
}

function ensureChartHoverEvents(canvas) {
  if (!canvas || canvas.dataset.hoverBound === '1') return;

  canvas.addEventListener('mousemove', (event) => {
    if (!chartPointPixels.length) return;

    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    let nearest = null;
    let nearestDist = Infinity;

    chartPointPixels.forEach((p, i) => {
      const dx = mx - p.x;
      const dy = my - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });

    const nextHover = nearestDist <= 12 ? nearest : null;
    canvas.style.cursor = nextHover != null ? 'pointer' : 'default';

    if (nextHover !== chartHoverIndex) {
      chartHoverIndex = nextHover;
      drawRangeChart(chartLastSeries, chartLastPair);
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (chartHoverIndex != null) {
      chartHoverIndex = null;
      drawRangeChart(chartLastSeries, chartLastPair);
    }
    canvas.style.cursor = 'default';
  });

  canvas.dataset.hoverBound = '1';
}

function drawRangeChart(series, pair) {
  const canvas = qs(SELECTORS.chartCanvas);
  if (!canvas || typeof canvas.getContext !== 'function') return;

  chartLastSeries = Array.isArray(series) ? series.slice() : [];
  chartLastPair = pair;
  ensureChartHoverEvents(canvas);

  const dpr = globalThis.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 960;
  const cssHeight = 280;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!series.length) {
    chartPointPixels = [];
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Seçilen aralıkta grafik verisi bulunamadı.', cssWidth / 2, cssHeight / 2);
    
    // Default değerlere geri al
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  const padding = { top: 16, right: 20, bottom: 36, left: 56 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;

  const values = series.map((s) => s.value).filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin || 1;
  const min = rawMin - rawRange * 0.08;
  const max = rawMax + rawRange * 0.08;
  const range = max - min || 1;

  const xFor = (i) => {
    if (series.length === 1) return padding.left + plotWidth / 2;
    return padding.left + (i / (series.length - 1)) * plotWidth;
  };
  const yFor = (v) => padding.top + ((max - v) / range) * plotHeight;

  // chart area background
  ctx.fillStyle = '#f8fbff';
  ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);

  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (i / 4) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(cssWidth - padding.right, y);
    ctx.stroke();

    const val = max - (i / 4) * range;
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Segoe UI';
    ctx.fillText(formatNumber(val, 2), 8, y + 4);
  }

  // axis baseline
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + plotHeight);
  ctx.lineTo(cssWidth - padding.right, padding.top + plotHeight);
  ctx.stroke();

  // area fill under the line
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotHeight);
  gradient.addColorStop(0, 'rgba(26, 86, 219, 0.20)');
  gradient.addColorStop(1, 'rgba(26, 86, 219, 0.02)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  series.forEach((point, i) => {
    const x = xFor(i);
    const y = yFor(point.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xFor(series.length - 1), padding.top + plotHeight);
  ctx.lineTo(xFor(0), padding.top + plotHeight);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#1a56db';
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((point, i) => {
    const x = xFor(i);
    const y = yFor(point.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#1a56db';
  chartPointPixels = [];
  series.forEach((point, i) => {
    const x = xFor(i);
    const y = yFor(point.value);
    chartPointPixels.push({ x, y });
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  });

  if (chartHoverIndex != null && chartHoverIndex >= 0 && chartHoverIndex < series.length) {
    const hp = chartPointPixels[chartHoverIndex];
    const sv = series[chartHoverIndex];

    // highlight hovered point
    ctx.strokeStyle = '#1a56db';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const tooltipLine1 = sv?.label || '-';
    const tooltipLine2 = `${pair}: ${formatNumber(sv?.value, 4)}`;
    ctx.font = '12px Segoe UI';
    const w = Math.max(ctx.measureText(tooltipLine1).width, ctx.measureText(tooltipLine2).width) + 16;
    const h = 38;
    let tx = hp.x + 10;
    let ty = hp.y - h - 10;
    if (tx + w > cssWidth - 8) tx = hp.x - w - 10;
    if (tx < 8) tx = 8;
    if (ty < 8) ty = hp.y + 10;

    ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(tx, ty, w, h, 6);
    } else {
      ctx.rect(tx, ty, w, h);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(tooltipLine1, tx + 8, ty + 15);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tooltipLine2, tx + 8, ty + 30);
  }

  // Draw evenly spaced day labels (dd.mm) on x-axis.
  const desiredTicks = Math.max(3, Math.min(7, Math.floor(plotWidth / 120)));
  const tickIndexes = [];
  if (series.length === 1) {
    tickIndexes.push(0);
  } else {
    for (let t = 0; t < desiredTicks; t += 1) {
      const idx = Math.round((t * (series.length - 1)) / (desiredTicks - 1));
      if (tickIndexes[tickIndexes.length - 1] !== idx) tickIndexes.push(idx);
    }
  }

  ctx.fillStyle = '#64748b';
  ctx.font = '11px Segoe UI';
  let lastDrawnLabel = '';

  for (const pointIndex of tickIndexes) {
    const point = series[pointIndex];
    const dayLabel = String(point?.label || '').split(' ')[0] || '';
    if (!dayLabel) continue;

    // Skip only exact duplicates to avoid repeated same-day text.
    if (dayLabel === lastDrawnLabel && tickIndexes.length > 1) continue;

    const x = xFor(pointIndex);

    // small tick mark
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, padding.top + plotHeight);
    ctx.lineTo(x, padding.top + plotHeight + 4);
    ctx.stroke();

    const textWidth = ctx.measureText(dayLabel).width;
    const minX = padding.left;
    const maxX = cssWidth - padding.right - textWidth;
    const textX = Math.min(Math.max(x - textWidth / 2, minX), maxX);
    ctx.fillText(dayLabel, textX, cssHeight - 12);
    lastDrawnLabel = dayLabel;
  }

  ctx.fillStyle = '#111827';
  ctx.font = '600 13px Segoe UI';
  ctx.fillText(`${pair} aralik grafigi`, padding.left, 14);
}

async function loadRangeChart(startDateValue, endDateValue, pair, options = {}) {
  const { silentFailure = false, manageLoading = true } = options;
  const start = new Date(`${startDateValue}T00:00:00`);
  const end = new Date(`${endDateValue}T23:59:59`);
  if (isNaN(start) || isNaN(end) || start > end) {
    if (!silentFailure) {
      renderChartMeta('Aralık geçersiz. Başlangıç tarihi, bitiş tarihinden büyük olamaz.');
    }
    drawRangeChart([], pair);
    return false;
  }

  if (manageLoading) {
    showLoading(`${startDateValue} - ${endDateValue} günlük aralığı yükleniyor...`);
  }
  try {
    const series = [];
    const baseSnapshot = await getLatestSnapshot();
    const providerMap = createProviderMapFromSnapshot(baseSnapshot);
    const entries = await getCurrentMonthlyEntries();
    for (const entry of entries) {
      const results = Array.isArray(entry?.results) ? entry.results : [];
      for (const result of results) {
        applyCompactResultToMap(providerMap, result);
      }

      const fullSnapshot = snapshotFromProviderMap(providerMap, entry);
      const rows = filterVisibleRows(parseAllProviders(fullSnapshot));
      const ts = new Date(entry?.runStartedAt || entry?.scheduledFor || '');
      if (isNaN(ts) || ts < start || ts > end) continue;

      const value = getPairParity(rows, pair);
      if (Number.isFinite(value)) {
        series.push({
          label: formatChartPointLabel(ts.toISOString(), startDateValue),
          value,
        });
      }
    }

    drawRangeChart(series, pair);
    renderChartMeta('');
    return true;
  } catch (error) {
    console.error(error);
    if (!silentFailure) {
      renderChartMeta(`Grafik yuklenemedi: ${error.message}`);
    }
    return false;
  } finally {
    if (manageLoading) {
      hideLoading();
    }
  }
}

async function loadChartFromInputs() {
  const startInput = qs(SELECTORS.rangeStartInput);
  const endInput = qs(SELECTORS.rangeEndInput);
  const startDay = startInput?.value || '';
  const endDay = endInput?.value || '';
  const pair = qs(SELECTORS.chartPair)?.value || 'USD/TRY';

  if (!startDay || !endDay) {
    renderChartMeta('Lutfen baslangic ve bitis tarihini secin.');
    return false;
  }

  return loadRangeChart(startDay, endDay, pair);
}

async function loadChartFromInputsWithRetry(maxAttempts = 3) {
  let attempt = 0;
  const startDay = qs(SELECTORS.rangeStartInput)?.value || '';
  const endDay = qs(SELECTORS.rangeEndInput)?.value || '';
  showLoading(`${startDay} - ${endDay} gunluk araligi yukleniyor...`);
  
  try {
    while (attempt < maxAttempts) {
      const ok = await loadRangeChart(
        qs(SELECTORS.rangeStartInput)?.value || '',
        qs(SELECTORS.rangeEndInput)?.value || '',
        qs(SELECTORS.chartPair)?.value || 'USD/TRY',
        { silentFailure: attempt < maxAttempts - 1, manageLoading: false }
      );
      if (ok) return true;
      attempt += 1;
      if (attempt < maxAttempts) {
        await sleep(250 * attempt);
      }
    }
    return false;
  } finally {
    hideLoading();
  }
}

export async function loadLatestData() {
  showLoading('Son veriler yukleniyor...');
  try {
    const latestUrl = `${DATA_BASE_URL}/latest_all.json`;
    const latest = await fetchJson(latestUrl);
    latestSnapshotCache = latest;
    let rows = [];
    try {
      rows = filterVisibleRows(parseAllProviders(latest));
    } catch (e) {
      console.error('[homeDataLoader] parseAllProviders failed', e);
      rows = [];
    }

    latestLoadedRows = rows.slice();
    updateSummaryCards(rows);
    renderCurrencyList(rows);

    renderMeta(`Son guncelleme: ${formatShortDateTime(latest.runStartedAt)}`);
  } catch (error) {
    console.error(error);
    renderMeta(`Son veriler yuklenemedi: ${error.message}`);
  } finally {
    hideLoading();
  }
}

export async function loadMonthlyData(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    renderMeta('Ay formati gecersiz. Ornek: 2026-04');
    return;
  }

  showLoading(`${monthKey} ayi yukleniyor...`);
  try {
    let jsonlText = '';
    const currentPath = `${DATA_BASE_URL}/monthlies/current/${monthKey}.jsonl`;

    try {
      jsonlText = await fetchText(currentPath);
    } catch {
      const [year, month] = monthKey.split('-');
      const closedPath = `${DATA_BASE_URL}/monthlies/${year}/${month}.jsonl.gz`;
      jsonlText = await fetchGzipText(closedPath);
    }

    const entries = parseJsonl(jsonlText);
    if (!entries.length) {
      renderMeta(`${monthKey} icin veri bulunamadi.`);
      renderCurrencyList([]);
      return;
    }

    const latestEntry = entries[entries.length - 1];
    const rows = filterVisibleRows(parseAllProviders(latestEntry));

    latestLoadedRows = rows.slice();
    updateSummaryCards(rows);
    renderCurrencyList(rows);
    renderMeta(`${monthKey} yuklendi | Snapshot sayisi: ${entries.length} | Son run: ${latestEntry.runStartedAt || '-'}`);
  } catch (error) {
    console.error(error);
    renderMeta(`${monthKey} yuklenemedi: ${error.message}`);
  } finally {
    hideLoading();
  }
}

function wireRangeLoader() {
  const button = qs(SELECTORS.rangeButton);
  if (!button) return;

  button.addEventListener('click', () => {
    const startInput = qs(SELECTORS.rangeStartInput);
    const endInput = qs(SELECTORS.rangeEndInput);
    const startDay = startInput?.value || '';
    const endDay = endInput?.value || '';
    if (!startDay || !endDay) {
      renderChartMeta('Lutfen baslangic ve bitis tarihini secin.');
      return;
    }

    const minDay = startInput?.min || endInput?.min || '';
    const maxDay = startInput?.max || endInput?.max || '';
    if (minDay && (startDay < minDay || endDay < minDay)) {
      renderChartMeta(`Bu kaynakta en eski tarih ${minDay}. Daha onceki gunler secilemez.`);
      return;
    }
    if (maxDay && (startDay > maxDay || endDay > maxDay)) {
      renderChartMeta(`Bu kaynakta en yeni tarih ${maxDay}. Daha sonrasi secilemez.`);
      return;
    }

    void loadChartFromInputs();
  });
}

function setCurrentYear() {
  const el = document.getElementById('year');
  const now = new Date();
  if (el) el.textContent = now.getFullYear();

  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const prevDate = new Date(now);
  prevDate.setDate(now.getDate() - 7);
  const weekAgo = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(prevDate.getDate())}`;

  const rangeStartInput = qs(SELECTORS.rangeStartInput);
  const rangeEndInput = qs(SELECTORS.rangeEndInput);
  if (rangeStartInput && !rangeStartInput.value) {
    rangeStartInput.value = weekAgo;
  }
  if (rangeEndInput && !rangeEndInput.value) {
    rangeEndInput.value = today;
  }
}

async function init() {
  showLoading('Sayfa hazirlaniyor...');
  try {
    if (typeof setCurrentYear === 'function') setCurrentYear();
    const boundsPromise = applyDateInputBounds();
    if (typeof wireSortHeaders === 'function') wireSortHeaders();
    if (typeof wireRangeLoader === 'function') wireRangeLoader();
    drawRangeChart([], 'USD/TRY');
    renderChartMeta('');
    if (typeof initAuthState === 'function') {
      const doLoadFavs = typeof loadFavorites === 'function' ? loadFavorites : () => {};
      initAuthState()
        .then(doLoadFavs)
        .then(() => {
          if (latestLoadedRows.length > 0) {
            renderCurrencyList(latestLoadedRows);
            updateSortIndicator();
          }
        })
        .catch((error) => {
          console.warn('[homeDataLoader] auth state could not be initialized', error?.message || error);
        });
    }

    const latestPromise = typeof loadLatestData === 'function' ? loadLatestData() : Promise.resolve();
    const chartPromise = (async () => {
      await boundsPromise.catch((error) => {
        console.warn('[homeDataLoader] date bounds could not be applied', error?.message || error);
      });
      await loadChartFromInputsWithRetry(3);
    })();

    await Promise.allSettled([latestPromise, chartPromise, boundsPromise]);

    // safety: if nothing loaded shortly after init, try loading latest again
    setTimeout(() => {
      if ((!latestLoadedRows || latestLoadedRows.length === 0) && typeof loadLatestData === 'function') {
        console.warn('[homeDataLoader] no rows after init — retrying loadLatestData');
        loadLatestData();
      }
    }, 1200);
  } finally {
    hideLoading();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    void init();
  });
}
