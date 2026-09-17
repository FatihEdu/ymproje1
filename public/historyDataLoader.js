import { parseAllProviders } from './scrapeClientParser.js';

const DATA_BASE_URL = globalThis.__SCRAPE_BASE_URL__ || 'https://fatihedu.github.io/ymproje1';
const HISTORY_START_MONTH = '2026-04';
const SELECTED_PAIRS = ['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'XAU/TRY'];
const PALETTE = ['#1a56db', '#e11d48', '#059669', '#f59e0b', '#8b5cf6'];
const monthlyCache = new Map();

const qs = (selector) => document.querySelector(selector);
const pad = (value) => String(value).padStart(2, '0');

function monthKeyToIndex(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || '')) return null;
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

function indexToMonthKey(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${pad(month)}`;
}

function enumerateMonthKeys(startMonthKey, endMonthKey) {
  const start = monthKeyToIndex(startMonthKey);
  const end = monthKeyToIndex(endMonthKey);
  if (start == null || end == null || start > end) return [];
  const result = [];
  for (let i = start; i <= end; i += 1) result.push(indexToMonthKey(i));
  return result;
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function fetchArchiveText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Some CDNs/browser stacks transparently decompress .gz responses. Detect that case
  // before trying DecompressionStream so the same code works in both situations.
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  if (!('DecompressionStream' in globalThis)) {
    throw new Error('Tarayıcı gzip arşivlerini açmayı desteklemiyor.');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function parseJsonl(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function fetchMonthlyEntries(monthKey) {
  if (monthlyCache.has(monthKey)) return monthlyCache.get(monthKey);

  const [year, month] = monthKey.split('-');
  const currentUrl = `${DATA_BASE_URL}/monthlies/current/${monthKey}.jsonl`;
  const archiveUrl = `${DATA_BASE_URL}/monthlies/${year}/${month}.jsonl.gz`;

  let entries = [];
  let source = 'missing';

  try {
    entries = parseJsonl(await fetchText(currentUrl));
    source = 'current';
  } catch {
    try {
      entries = parseJsonl(await fetchArchiveText(archiveUrl));
      source = 'archive';
    } catch (error) {
      console.warn(`[historyDataLoader] ${monthKey} bulunamadı`, error?.message || error);
    }
  }

  const value = { entries, source };
  monthlyCache.set(monthKey, value);
  return value;
}

function applyCompactResult(providerMap, result) {
  const id = result?.meta?.id;
  if (!id) return;

  const previous = providerMap.get(id);
  if (result?.data && typeof result.data === 'object') {
    providerMap.set(id, {
      ...previous,
      ...result,
      meta: result.meta || previous?.meta,
      data: result.data,
    });
    return;
  }

  if (previous) {
    providerMap.set(id, {
      ...previous,
      ...result,
      meta: result.meta || previous.meta,
      data: previous.data,
    });
  }
}

function snapshotFromMap(providerMap, entry) {
  return {
    rev: entry?.rev ?? 1,
    scheduledFor: entry?.scheduledFor ?? null,
    runStartedAt: entry?.runStartedAt ?? null,
    timezone: entry?.timezone ?? 'Europe/Istanbul',
    results: Array.from(providerMap.values()),
  };
}

function getPairParity(rows, pair) {
  const values = rows
    .filter((row) => row.pair === pair)
    .map((row) => row.parity)
    .filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPointLabel(date) {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderMeta(message, isError = false) {
  const element = qs('#chart-meta');
  if (!element) return;
  element.textContent = message || '';
  element.classList.remove('chart-meta--info', 'chart-meta--error');
  if (message) element.classList.add(isError ? 'chart-meta--error' : 'chart-meta--info');
}

function showLoading(message) {
  const overlay = qs('#loading-overlay');
  const text = qs('#loading-message');
  if (text) text.textContent = message;
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = qs('#loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function renderLegend(seriesList) {
  const container = qs('#chart-legend');
  if (!container) return;
  container.textContent = '';

  for (const series of seriesList) {
    if (!series.data.some((point) => Number.isFinite(point.value))) continue;
    const item = document.createElement('span');
    item.className = 'chart-legend__item';
    item.style.setProperty('--legend-color', series.color);

    const swatch = document.createElement('span');
    swatch.style.display = 'inline-block';
    swatch.style.width = '10px';
    swatch.style.height = '10px';
    swatch.style.borderRadius = '999px';
    swatch.style.background = series.color;
    swatch.style.marginRight = '6px';

    const label = document.createElement('span');
    label.className = 'chart-legend__text';
    label.textContent = series.name;

    item.appendChild(swatch);
    item.appendChild(label);
    container.appendChild(item);
  }
}

function drawChart(seriesList, pair) {
  const canvas = qs('#range-chart');
  if (!canvas || typeof canvas.getContext !== 'function') return;

  const populated = seriesList.filter((series) => series.data.some((point) => Number.isFinite(point.value)));
  renderLegend(populated);

  const dpr = globalThis.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 960;
  const cssHeight = 280;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!populated.length) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Seçilen aralıkta geçmiş veri bulunamadı.', cssWidth / 2, cssHeight / 2);
    return;
  }

  const values = populated.flatMap((series) => series.data.map((point) => point.value)).filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.02, 1);
  const min = rawMin - rawRange * 0.08;
  const max = rawMax + rawRange * 0.08;
  const range = max - min || 1;
  const pointCount = Math.max(...populated.map((series) => series.data.length));

  const padding = { top: 22, right: 24, bottom: 40, left: 64 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;
  const xFor = (index) => pointCount <= 1
    ? padding.left + plotWidth / 2
    : padding.left + (index / (pointCount - 1)) * plotWidth;
  const yFor = (value) => padding.top + ((max - value) / range) * plotHeight;

  ctx.fillStyle = '#f8fbff';
  ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (i / 4) * plotHeight;
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(cssWidth - padding.right, y);
    ctx.stroke();

    const value = max - (i / 4) * range;
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Segoe UI';
    ctx.textAlign = 'left';
    ctx.fillText(new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value), 6, y + 4);
  }

  for (const series of populated) {
    ctx.strokeStyle = series.color;
    ctx.lineWidth = series.id === 'avg' ? 2.4 : 1.5;
    ctx.beginPath();
    let started = false;

    series.data.forEach((point, index) => {
      if (!Number.isFinite(point.value)) {
        started = false;
        return;
      }
      const x = xFor(index);
      const y = yFor(point.value);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  const reference = populated[0];
  const tickCount = Math.max(2, Math.min(7, Math.floor(plotWidth / 120)));
  for (let i = 0; i < tickCount; i += 1) {
    const index = Math.round((i * (pointCount - 1)) / Math.max(1, tickCount - 1));
    const label = reference.data[index]?.label?.split(' ')[0] || '';
    if (!label) continue;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(label, xFor(index), cssHeight - 12);
  }

  ctx.fillStyle = '#111827';
  ctx.font = '600 13px Segoe UI';
  ctx.textAlign = 'left';
  ctx.fillText(`${pair} geçmiş veri grafiği`, padding.left, 15);
}

async function buildSnapshots(startDateValue, endDateValue) {
  const start = new Date(`${startDateValue}T00:00:00`);
  const end = new Date(`${endDateValue}T23:59:59`);
  const endMonthKey = endDateValue.slice(0, 7);
  const monthKeys = enumerateMonthKeys(HISTORY_START_MONTH, endMonthKey);

  const providerMap = new Map();
  const snapshots = [];
  const monthReport = [];
  let previousRealTimestamp = null;

  // Always replay from the first archive month so compact no-change records inherit
  // the correct provider data before the user's selected start date.
  for (const monthKey of monthKeys) {
    const { entries, source } = await fetchMonthlyEntries(monthKey);
    monthReport.push({ monthKey, count: entries.length, source });

    for (const entry of entries) {
      const timestamp = new Date(entry?.runStartedAt || entry?.scheduledFor || '');
      if (Number.isNaN(timestamp.getTime())) continue;

      for (const result of Array.isArray(entry?.results) ? entry.results : []) {
        applyCompactResult(providerMap, result);
      }

      if (timestamp < start || timestamp > end) continue;

      if (previousRealTimestamp && timestamp - previousRealTimestamp > 36 * 60 * 60 * 1000) {
        snapshots.push({ ts: new Date(previousRealTimestamp.getTime() + 1), rows: [], snapshot: null, gap: true });
      }

      const snapshot = snapshotFromMap(providerMap, entry);
      const rows = parseAllProviders(snapshot).filter((row) => SELECTED_PAIRS.includes(row.pair));
      snapshots.push({ ts: timestamp, rows, snapshot, gap: false });
      previousRealTimestamp = timestamp;
    }
  }

  return { snapshots, monthReport };
}

function buildSeries(snapshots, pair) {
  const labels = snapshots.map((item) => item.gap ? '' : formatPointLabel(item.ts));
  const providerNames = new Map();

  for (const item of snapshots) {
    for (const result of item.snapshot?.results || []) {
      const id = result?.meta?.id;
      if (id) providerNames.set(id, result?.meta?.name || id);
    }
  }

  const average = {
    id: 'avg',
    name: 'Ortalama',
    color: PALETTE[0],
    data: snapshots.map((item, index) => ({
      label: labels[index],
      value: item.gap ? null : getPairParity(item.rows, pair),
    })),
  };

  const providers = Array.from(providerNames.entries()).map(([providerId, providerName], index) => ({
    id: providerId,
    name: providerName,
    color: PALETTE[(index + 1) % PALETTE.length],
    data: snapshots.map((item, snapshotIndex) => {
      if (item.gap) return { label: '', value: null };
      const rows = item.rows.filter((row) => row.providerId === providerId);
      return { label: labels[snapshotIndex], value: getPairParity(rows, pair) };
    }),
  }));

  return [average, ...providers];
}

async function loadHistoryChart() {
  const startValue = qs('#range-start-date')?.value || '';
  const endValue = qs('#range-end-date')?.value || '';
  const pair = qs('#chart-pair')?.value || 'USD/TRY';

  if (!startValue || !endValue) {
    renderMeta('Lütfen başlangıç ve bitiş tarihini seçin.', true);
    return;
  }

  const start = new Date(`${startValue}T00:00:00`);
  const end = new Date(`${endValue}T23:59:59`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    renderMeta('Aralık geçersiz.', true);
    return;
  }

  showLoading(`${startValue} - ${endValue} geçmiş verileri çekiliyor...`);
  try {
    const { snapshots, monthReport } = await buildSnapshots(startValue, endValue);
    const realSnapshots = snapshots.filter((item) => !item.gap);
    const series = buildSeries(snapshots, pair);
    drawChart(series, pair);

    const loadedMonths = monthReport.filter((item) => item.count > 0).map((item) => `${item.monthKey} (${item.count})`);
    const missingMonths = monthReport.filter((item) => item.count === 0).map((item) => item.monthKey);

    if (!realSnapshots.length) {
      renderMeta(`Bu aralıkta snapshot yok. Bulunan aylar: ${loadedMonths.join(', ') || 'yok'}.`, true);
      return;
    }

    let message = `${startValue} - ${endValue} aralığından ${realSnapshots.length} snapshot çekildi.`;
    if (loadedMonths.length) message += ` Kaynak: ${loadedMonths.join(', ')}.`;
    if (missingMonths.length) message += ` Veri olmayan aylar: ${missingMonths.join(', ')}.`;
    renderMeta(message, false);
  } catch (error) {
    console.error('[historyDataLoader]', error);
    renderMeta(`Geçmiş veri çekilemedi: ${error.message}`, true);
  } finally {
    hideLoading();
  }
}

function configureDateInputs() {
  const startInput = qs('#range-start-date');
  const endInput = qs('#range-end-date');
  if (!startInput || !endInput) return;

  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  startInput.min = '2026-04-01';
  endInput.min = '2026-04-01';
  startInput.max = today;
  endInput.max = today;
}

function takeOwnershipOfChartButton() {
  const button = qs('#range-load-btn');
  if (!button) return;

  // Capture phase prevents the old current-month-only handler from racing and
  // overwriting the historical chart after this loader finishes.
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void loadHistoryChart();
  }, true);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    configureDateInputs();
    takeOwnershipOfChartButton();
  });
}
