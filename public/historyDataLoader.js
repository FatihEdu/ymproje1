const qs = (selector) => document.querySelector(selector);
const pad = (value) => String(value).padStart(2, '0');

const BANK_COLORS = {
  garanti: '#e11d48',
  kuveyt: '#059669',
  yapi: '#f59e0b'
};

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

function formatDateLabel(dateString) {
  const [year, month, day] = String(dateString || '').split('-');
  return year && month && day ? `${day}.${month}` : dateString;
}

function normalizeSeries(series) {
  return (Array.isArray(series) ? series : []).map((item) => ({
    id: item?.id || 'unknown',
    name: item?.name || item?.id || 'Banka',
    error: item?.error || null,
    color: BANK_COLORS[item?.id] || '#1a56db',
    points: (Array.isArray(item?.points) ? item.points : [])
      .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point?.date || '') && Number.isFinite(Number(point?.value)))
      .map((point) => ({
        date: point.date,
        value: Number(point.value),
        open: Number(point.open),
        high: Number(point.high),
        low: Number(point.low),
        close: Number(point.close)
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }));
}

function renderLegend(series) {
  const container = qs('#chart-legend');
  if (!container) return;
  container.textContent = '';

  for (const item of series) {
    const legendItem = document.createElement('span');
    legendItem.className = 'chart-legend__item';

    const dot = document.createElement('span');
    dot.style.display = 'inline-block';
    dot.style.width = '10px';
    dot.style.height = '10px';
    dot.style.borderRadius = '999px';
    dot.style.background = item.color;
    dot.style.marginRight = '6px';

    const label = document.createElement('span');
    label.className = 'chart-legend__text';
    label.textContent = item.name;

    legendItem.appendChild(dot);
    legendItem.appendChild(label);
    container.appendChild(legendItem);
  }
}

function drawBankHistory(rawSeries, pair) {
  const canvas = qs('#range-chart');
  if (!canvas || typeof canvas.getContext !== 'function') return;

  const series = normalizeSeries(rawSeries).filter((item) => item.points.length > 0);
  renderLegend(series);

  const allDates = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.date)))).sort();
  const dateIndex = new Map(allDates.map((date, index) => [date, index]));
  const values = series.flatMap((item) => item.points.map((point) => point.value)).filter(Number.isFinite);

  const dpr = globalThis.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 960;
  const cssHeight = 280;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!values.length || !allDates.length) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Seçilen aralık için banka geçmiş verisi bulunamadı.', cssWidth / 2, cssHeight / 2);
    return;
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.02, 1);
  const min = rawMin - rawRange * 0.08;
  const max = rawMax + rawRange * 0.08;
  const range = max - min || 1;

  const padding = { top: 24, right: 24, bottom: 40, left: 64 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;
  const xForIndex = (index) => allDates.length === 1
    ? padding.left + plotWidth / 2
    : padding.left + (index / (allDates.length - 1)) * plotWidth;
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
    ctx.fillText(new Intl.NumberFormat('tr-TR', { maximumFractionDigits: pair === 'XAU/TRY' ? 2 : 4 }).format(value), 6, y + 4);
  }

  for (const item of series) {
    const pointsByDate = new Map(item.points.map((point) => [point.date, point]));
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;

    allDates.forEach((date, index) => {
      const point = pointsByDate.get(date);
      if (!point || !Number.isFinite(point.value)) {
        started = false;
        return;
      }

      const x = xForIndex(index);
      const y = yFor(point.value);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    ctx.fillStyle = item.color;
    for (const point of item.points) {
      const index = dateIndex.get(point.date);
      if (index == null) continue;
      ctx.beginPath();
      ctx.arc(xForIndex(index), yFor(point.value), allDates.length > 80 ? 1.3 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const desiredTicks = Math.max(2, Math.min(7, Math.floor(plotWidth / 120)));
  for (let i = 0; i < desiredTicks; i += 1) {
    const index = Math.round((i * (allDates.length - 1)) / Math.max(1, desiredTicks - 1));
    const date = allDates[index];
    if (!date) continue;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(formatDateLabel(date), xForIndex(index), cssHeight - 12);
  }

  ctx.fillStyle = '#111827';
  ctx.font = '600 13px Segoe UI';
  ctx.textAlign = 'left';
  const title = pair === 'XAU/TRY'
    ? 'Gram altın banka geçmiş fiyat grafiği'
    : `${pair} banka geçmiş fiyat grafiği`;
  ctx.fillText(title, padding.left, 16);
}

async function loadHistoryChart() {
  const start = qs('#range-start-date')?.value || '';
  const end = qs('#range-end-date')?.value || '';
  const pair = qs('#chart-pair')?.value || 'USD/TRY';

  if (!start || !end) {
    renderMeta('Lütfen başlangıç ve bitiş tarihini seçin.', true);
    return;
  }
  if (start > end) {
    renderMeta('Başlangıç tarihi bitiş tarihinden büyük olamaz.', true);
    return;
  }

  showLoading(`${start} - ${end} Garanti BBVA, Kuveyt Türk ve Yapı Kredi geçmiş verileri çekiliyor...`);
  try {
    const params = new URLSearchParams({ start, end, pair });
    const response = await fetch(`/api/history/banks?${params.toString()}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }

    const series = Array.isArray(payload?.series) ? payload.series : [];
    drawBankHistory(series, pair);

    const populated = series.filter((item) => Array.isArray(item?.points) && item.points.length > 0);
    if (!populated.length) {
      renderMeta(`${start} - ${end} aralığında üç banka için geçmiş veri bulunamadı.`, true);
      return;
    }

    const counts = populated.map((item) => `${item.name}: ${item.points.length} gün`).join(' · ');
    const missing = series.filter((item) => !item?.points?.length && item?.error);
    const missingText = missing.length
      ? ` · Alınamayan: ${missing.map((item) => item.name).join(', ')}`
      : '';

    renderMeta(`${start} - ${end} banka geçmişi yüklendi. ${counts}${missingText}. Kaynak: ${payload.source}. Değer tipi: günlük kapanış.`);
  } catch (error) {
    console.error('[historyDataLoader]', error);
    drawBankHistory([], pair);
    renderMeta(`Banka geçmiş verileri çekilemedi: ${error.message}`, true);
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
  startInput.min = '2020-01-01';
  endInput.min = '2020-01-01';
  startInput.max = today;
  endInput.max = today;
}

function takeOwnershipOfChartButton() {
  const button = qs('#range-load-btn');
  if (!button) return;

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
    setTimeout(configureDateInputs, 1200);
  });
}
