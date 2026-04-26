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
  monthInput: '#month-input',
  monthButton: '#month-load-btn',
  loadingOverlay: '#loading-overlay',
  loadingMessage: '#loading-message'
};

function qs(selector) {
  return document.querySelector(selector);
}
// state for sorting and last loaded rows (used when user toggles sort)
let latestLoadedRows = [];
let currentSort = { key: null, asc: true };
let attemptedMonthlyFallback = false;
let latestSnapshotCache = null;
let currentMonthlyEntriesCache = null;
// chart data kept as an array of series objects: { id, name, data: [{label, value}] }
let chartLastSeriesList = [];
let chartLastPair = 'USD/TRY';
let chartPointPixels = []; // entries: { x, y, si, pi }
let chartHover = null; // { seriesIndex, pointIndex } or null


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
  // reset neutral state for buttons
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    const btn = th.querySelector('.sort-btn');
    if (btn) btn.textContent = '⇅';
  });
  if (!currentSort.key) return;
  const th = document.querySelector(`th[data-sort="${currentSort.key}"]`);
  if (th) {
    th.classList.add(currentSort.asc ? 'asc' : 'desc');
    const btn = th.querySelector('.sort-btn');
    if (btn) btn.textContent = currentSort.asc ? '▲' : '▼';
  }
}

function sortByKey(key) {
  if (currentSort.key === key) {
    currentSort.asc = !currentSort.asc;
  } else {
    currentSort.key = key;
    currentSort.asc = true;
  }
  updateSortIndicator();
  renderCurrencyList(latestLoadedRows);
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
  if (msg) msg.textContent = message;
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = qs(SELECTORS.loadingOverlay);
  if (overlay) overlay.classList.add('hidden');
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

<<<<<<< main
=======
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
  try {
    latestSnapshotCache = await fetchJson(latestUrl);
    return latestSnapshotCache;
  } catch {
    latestSnapshotCache = await fetchJson('/latest_all_sample.json');
    return latestSnapshotCache;
  }
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
  const d = new Date(dateValue);
  if (isNaN(d)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  const d = new Date(`${dateOnly}T00:00:00`);
  d.setDate(d.getDate() + days);
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

    for (const p of chartPointPixels) {
      const dx = mx - p.x;
      const dy = my - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { seriesIndex: p.si, pointIndex: p.pi };
      }
    }

    const nextHover = nearestDist <= 12 ? nearest : null;
    canvas.style.cursor = nextHover != null ? 'pointer' : 'default';

    const hoverChanged = (chartHover === null && nextHover !== null) ||
      (chartHover !== null && nextHover === null) ||
      (chartHover !== null && nextHover !== null && (chartHover.seriesIndex !== nextHover.seriesIndex || chartHover.pointIndex !== nextHover.pointIndex));

    if (hoverChanged) {
      chartHover = nextHover;
      drawRangeChart(chartLastSeriesList, chartLastPair);
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (chartHover != null) {
      chartHover = null;
      drawRangeChart(chartLastSeriesList, chartLastPair);
    }
    canvas.style.cursor = 'default';
  });

  canvas.dataset.hoverBound = '1';
}



function drawRangeChart(seriesArg, pair) {
  const canvas = qs(SELECTORS.chartCanvas);
  if (!canvas || typeof canvas.getContext !== 'function') return;

  // Normalize incoming seriesArg to our internal seriesList format
  let seriesList = [];
  if (!seriesArg || (Array.isArray(seriesArg) && seriesArg.length === 0)) {
    seriesList = [];
  } else if (Array.isArray(seriesArg) && seriesArg[0] && Object.prototype.hasOwnProperty.call(seriesArg[0], 'value')) {
    // old single-series format: array of {label, value}
    seriesList = [{ id: 'avg', name: pair, color: '#1a56db', data: seriesArg.map((p) => ({ label: p.label, value: p.value })) }];
  } else if (Array.isArray(seriesArg) && seriesArg[0] && Object.prototype.hasOwnProperty.call(seriesArg[0], 'data')) {
    seriesList = seriesArg.map((s) => ({ id: s.id || s.name, name: s.name || s.id, color: s.color || null, data: Array.isArray(s.data) ? s.data.map((p) => ({ label: p.label, value: p.value })) : [] }));
  } else {
    // fallback: try to interpret as array of points
    seriesList = [{ id: 'avg', name: pair, color: '#1a56db', data: (Array.isArray(seriesArg) ? seriesArg : []).map((p) => ({ label: p && p.label ? p.label : '', value: p && p.value ? p.value : null })) }];
  }
  chartLastSeriesList = seriesList;
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

  if (!seriesList.length || !seriesList[0].data || seriesList[0].data.length === 0) {
    chartPointPixels = [];
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px Segoe UI';
    ctx.fillText('Secilen aralikta grafik verisi bulunamadi.', 16, 30);
    return;
  }

  const padding = { top: 16, right: 110, bottom: 36, left: 56 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;

  // collect all numeric values across series
  const values = seriesList.flatMap((s) => s.data.map((p) => p.value)).filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin || 1;
  const min = rawMin - rawRange * 0.08;
  const max = rawMax + rawRange * 0.08;
  const range = max - min || 1;

  const N = Math.max(1, seriesList[0].data.length);
  const xFor = (i) => {
    if (N === 1) return padding.left + plotWidth / 2;
    return padding.left + (i / (N - 1)) * plotWidth;
  };
  const yFor = (v) => padding.top + ((max - v) / range) * plotHeight;

  // chart area background
  ctx.fillStyle = '#f8fbff';
  ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);

  // horizontal grid + y labels
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

  // colors fallback
  const palette = ['#e11d48', '#059669', '#f59e0b', '#8b5cf6', '#06b6d4'];

  // draw average area/line first (if present as first series id === 'avg')
  const avgIndex = seriesList.findIndex((s) => s.id === 'avg');
  if (avgIndex !== -1) {
    const avgSeries = seriesList[avgIndex];
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotHeight);
    gradient.addColorStop(0, 'rgba(26, 86, 219, 0.20)');
    gradient.addColorStop(1, 'rgba(26, 86, 219, 0.02)');
    ctx.fillStyle = gradient;

    // build path only for defined points
    ctx.beginPath();
    let firstX = null;
    for (let i = 0; i < avgSeries.data.length; i += 1) {
      const p = avgSeries.data[i];
      if (!Number.isFinite(p.value)) continue;
      const x = xFor(i);
      const y = yFor(p.value);
      if (firstX === null) {
        ctx.moveTo(x, y);
        firstX = x;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (firstX !== null) {
      ctx.lineTo(xFor(avgSeries.data.length - 1), padding.top + plotHeight);
      ctx.lineTo(firstX, padding.top + plotHeight);
      ctx.closePath();
      ctx.fill();
    }
  }

  // draw each series line and points
  chartPointPixels = [];
  for (let si = 0; si < seriesList.length; si += 1) {
    const s = seriesList[si];
    const color = s.color || (si === avgIndex ? '#1a56db' : palette[(si - (avgIndex !== -1 && si > avgIndex ? 1 : 0)) % palette.length]);
    ctx.strokeStyle = color;
    ctx.lineWidth = (si === avgIndex ? 2 : 1.5);

    // draw path connecting defined points only
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < s.data.length; i += 1) {
      const p = s.data[i];
      if (!Number.isFinite(p.value)) {
        started = false;
        continue;
      }
      const x = xFor(i);
      const y = yFor(p.value);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // draw points and collect pixel positions
    ctx.fillStyle = color;
    for (let i = 0; i < s.data.length; i += 1) {
      const p = s.data[i];
      if (!Number.isFinite(p.value)) continue;
      const x = xFor(i);
      const y = yFor(p.value);
      chartPointPixels.push({ x, y, si, pi: i });
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // highlight hovered point
  if (chartHover != null) {
    const hpEntry = chartPointPixels.find((p) => p.si === chartHover.seriesIndex && p.pi === chartHover.pointIndex);
    if (hpEntry) {
      ctx.strokeStyle = '#1a56db';
      ctx.lineWidth = 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hpEntry.x, hpEntry.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const sv = seriesList[chartHover.seriesIndex].data[chartHover.pointIndex] || {};
      const tooltipLine1 = seriesList[chartHover.seriesIndex].name || '-';
      const tooltipLine2 = `${sv.label || '-'}: ${formatNumber(sv.value, 4)}`;
      ctx.font = '12px Segoe UI';
      const w = Math.max(ctx.measureText(tooltipLine1).width, ctx.measureText(tooltipLine2).width) + 16;
      const h = 38;
      let tx = hpEntry.x + 10;
      let ty = hpEntry.y - h - 10;
      if (tx + w > cssWidth - 8) tx = hpEntry.x - w - 10;
      if (tx < 8) tx = 8;
      if (ty < 8) ty = hpEntry.y + 10;

      ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(tx, ty, w, h, 6);
      else {
        ctx.rect(tx, ty, w, h);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(tooltipLine1, tx + 8, ty + 15);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tooltipLine2, tx + 8, ty + 30);
    }
  }

  // Draw evenly spaced day labels (dd.mm) on x-axis.
  const desiredTicks = Math.max(3, Math.min(7, Math.floor(plotWidth / 120)));
  const tickIndexes = [];
  if (N === 1) {
    tickIndexes.push(0);
  } else {
    for (let t = 0; t < desiredTicks; t += 1) {
      const idx = Math.round((t * (N - 1)) / (desiredTicks - 1));
      if (tickIndexes[tickIndexes.length - 1] !== idx) tickIndexes.push(idx);
    }
  }

  ctx.fillStyle = '#64748b';
  ctx.font = '11px Segoe UI';
  let lastDrawnLabel = '';

  for (const pointIndex of tickIndexes) {
    const point = seriesList[0].data[pointIndex];
    const dayLabel = String(point?.label || '').split(' ')[0] || '';
    if (!dayLabel) continue;
    if (dayLabel === lastDrawnLabel && tickIndexes.length > 1) continue;

    const x = xFor(pointIndex);
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

  // legend (right side)
  const legendX = cssWidth - padding.right + 8;
  let legendY = padding.top;
  ctx.font = '12px Segoe UI';
  for (let si = 0; si < seriesList.length; si += 1) {
    const s = seriesList[si];
    const color = s.color || (si === avgIndex ? '#1a56db' : palette[(si - (avgIndex !== -1 && si > avgIndex ? 1 : 0)) % palette.length]);
    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY + 4, 12, 12);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(s.name, legendX + 18, legendY + 14);
    legendY += 18;
  }

  ctx.fillStyle = '#111827';
  ctx.font = '600 13px Segoe UI';
  ctx.fillText(`${pair} aralik grafigi`, padding.left, 14);
}

async function loadRangeChart(startDateValue, endDateValue, pair) {
  const start = new Date(`${startDateValue}T00:00:00`);
  const end = new Date(`${endDateValue}T23:59:59`);
  if (isNaN(start) || isNaN(end) || start > end) {
    renderChartMeta('Aralik gecersiz. Baslangic tarihi, bitis tarihinden buyuk olamaz.');
    drawRangeChart([], pair);
    return;
  }

  showLoading(`${startDateValue} - ${endDateValue} gunluk araligi yukleniyor...`);
  try {
    const baseSnapshot = await getLatestSnapshot();
    const providerMap = createProviderMapFromSnapshot(baseSnapshot);
    const entries = await getCurrentMonthlyEntries();

    const snapshots = []; // { label, avg, providers: { providerId: value } }
    const providerNames = {}; // providerId -> display name

    for (const entry of entries) {
      const results = Array.isArray(entry?.results) ? entry.results : [];
      for (const result of results) {
        applyCompactResultToMap(providerMap, result);
      }

      const fullSnapshot = snapshotFromProviderMap(providerMap, entry);
      const rows = filterVisibleRows(parseAllProviders(fullSnapshot));
      const ts = new Date(entry?.runStartedAt || entry?.scheduledFor || '');
      if (isNaN(ts) || ts < start || ts > end) continue;

      // collect provider display names from snapshot
      for (const r of Array.isArray(fullSnapshot?.results) ? fullSnapshot.results : []) {
        const id = r?.meta?.id;
        if (!id) continue;
        providerNames[id] = r?.meta?.name || id;
      }

      const avg = getPairParity(rows, pair);
      const providerMapForSnapshot = {};
      for (const row of rows) {
        if (row?.pair !== pair) continue;
        if (row.providerId) providerMapForSnapshot[row.providerId] = row.parity;
      }

      snapshots.push({
        label: formatChartPointLabel(ts.toISOString(), startDateValue),
        avg: Number.isFinite(avg) ? avg : null,
        providers: providerMapForSnapshot,
      });
    }

    // build ordered provider list
    const providerIds = Array.from(new Set(snapshots.flatMap((s) => Object.keys(s.providers))));
    providerIds.sort((a, b) => (providerNames[a] || a).localeCompare(providerNames[b] || b, 'tr'));

    // build series: average first, then each provider
    const seriesList = [];
    seriesList.push({ id: 'avg', name: 'Ortalama', data: snapshots.map((s) => ({ label: s.label, value: Number.isFinite(s.avg) ? s.avg : null })) });
    for (const pid of providerIds) {
      const name = providerNames[pid] || pid;
      const data = snapshots.map((s) => ({ label: s.label, value: Number.isFinite(s.providers?.[pid]) ? s.providers[pid] : null }));
      seriesList.push({ id: pid, name, data });
    }

    drawRangeChart(seriesList, pair);
    renderChartMeta('');
  } catch (error) {
    console.error(error);
    renderChartMeta(`Grafik yuklenemedi: ${error.message}`);
  } finally {
    hideLoading();
  }
}

>>>>>>> local
export async function loadLatestData() {
  showLoading('Son veriler yukleniyor...');
  try {
    const latestUrl = `${DATA_BASE_URL}/latest_all.json`;
    const latest = await fetchJson(latestUrl);
    const rows = parseAllProviders(latest);

    updateSummaryCards(rows);
    renderCurrencyList(rows);

    renderMeta(`Son guncelleme: ${latest.runStartedAt || '-'} | Kayit sayisi: ${rows.length}`);
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
    const rows = parseAllProviders(latestEntry);

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

function getSelectedMonthKey() {
  const monthInput = qs(SELECTORS.monthInput);
  return monthInput?.value || '';
}

function wireMonthLoader() {
  const button = qs(SELECTORS.monthButton);
  if (!button) return;

  button.addEventListener('click', () => {
    const monthKey = getSelectedMonthKey();
    if (!monthKey) {
      renderMeta('Lutfen once bir ay secin.');
      return;
    }
    loadMonthlyData(monthKey);
  });
}

function setCurrentYear() {
  const el = document.getElementById('year');
  if (el) el.textContent = new Date().getFullYear();
}

function init() {
  setCurrentYear();
  wireMonthLoader();
  loadLatestData();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
