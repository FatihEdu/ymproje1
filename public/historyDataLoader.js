const qs = (selector) => document.querySelector(selector);
const pad = (value) => String(value).padStart(2, '0');

const BANK_COLORS = {
  garanti: '#e11d48',
  kuveyt: '#059669',
  yapi: '#f59e0b'
};

let chartState = null;

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

function formatFullDate(dateString) {
  const [year, month, day] = String(dateString || '').split('-');
  return year && month && day ? `${day}.${month}.${year}` : dateString;
}

function formatPrice(value, pair) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: pair === 'XAU/TRY' ? 2 : 4,
    maximumFractionDigits: pair === 'XAU/TRY' ? 2 : 4
  }).format(value);
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
    legendItem.style.setProperty('--legend-color', item.color);

    const dot = document.createElement('span');
    dot.className = 'chart-legend__dot';
    dot.style.background = item.color;

    const label = document.createElement('span');
    label.className = 'chart-legend__text';
    label.textContent = item.name;

    legendItem.appendChild(dot);
    legendItem.appendChild(label);
    container.appendChild(legendItem);
  }
}

function ensureTooltip() {
  const wrap = qs('.chart-wrap');
  if (!wrap) return null;

  let tooltip = qs('#chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'chart-tooltip';
    tooltip.className = 'chart-tooltip hidden';
    tooltip.setAttribute('role', 'tooltip');
    wrap.appendChild(tooltip);
  }
  return tooltip;
}

function hideTooltip() {
  const tooltip = qs('#chart-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

function showTooltipForPointer(event) {
  const canvas = qs('#range-chart');
  const tooltip = ensureTooltip();
  if (!canvas || !tooltip || !chartState?.allDates?.length) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const { padding, plotWidth, plotHeight, allDates, xForIndex, series, pair } = chartState;

  if (
    x < padding.left - 22 ||
    x > padding.left + plotWidth + 22 ||
    y < padding.top - 22 ||
    y > padding.top + plotHeight + 22
  ) {
    hideTooltip();
    return;
  }

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  allDates.forEach((date, index) => {
    const distance = Math.abs(x - xForIndex(index));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  const date = allDates[nearestIndex];
  const rows = series
    .map((item) => {
      const point = item.points.find((candidate) => candidate.date === date);
      return point ? { item, point } : null;
    })
    .filter(Boolean);

  if (!rows.length) {
    hideTooltip();
    return;
  }

  tooltip.textContent = '';

  const title = document.createElement('div');
  title.className = 'chart-tooltip__date';
  title.textContent = formatFullDate(date);
  tooltip.appendChild(title);

  for (const { item, point } of rows) {
    const row = document.createElement('div');
    row.className = 'chart-tooltip__row';

    const label = document.createElement('span');
    label.className = 'chart-tooltip__bank';

    const dot = document.createElement('span');
    dot.className = 'chart-tooltip__dot';
    dot.style.background = item.color;

    const name = document.createElement('span');
    name.textContent = item.name;

    label.appendChild(dot);
    label.appendChild(name);

    const value = document.createElement('strong');
    value.className = 'chart-tooltip__value';
    value.textContent = `${formatPrice(point.value, pair)} ₺`;

    row.appendChild(label);
    row.appendChild(value);
    tooltip.appendChild(row);
  }

  tooltip.classList.remove('hidden');

  const wrapRect = canvas.parentElement.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const localX = event.clientX - wrapRect.left;
  const localY = event.clientY - wrapRect.top;

  let left = localX + 14;
  let top = localY + 14;
  if (left + tooltipRect.width > wrapRect.width - 8) left = localX - tooltipRect.width - 14;
  if (top + tooltipRect.height > wrapRect.height - 8) top = localY - tooltipRect.height - 14;

  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function bindCanvasHover(canvas) {
  if (canvas.dataset.hoverBound === '1') return;
  canvas.dataset.hoverBound = '1';
  canvas.addEventListener('mousemove', showTooltipForPointer);
  canvas.addEventListener('mouseleave', hideTooltip);
}

function drawBankHistory(rawSeries, pair) {
  const canvas = qs('#range-chart');
  if (!canvas || typeof canvas.getContext !== 'function') return;

  hideTooltip();
  const series = normalizeSeries(rawSeries).filter((item) => item.points.length > 0);
  renderLegend(series);

  const allDates = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.date)))).sort();
  const dateIndex = new Map(allDates.map((date, index) => [date, index]));
  const values = series.flatMap((item) => item.points.map((point) => point.value)).filter(Number.isFinite);

  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(320, Math.round(rect.width || canvas.clientWidth || 960));
  const cssHeight = 320;
  const dpr = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));

  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!values.length || !allDates.length) {
    chartState = null;
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
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

  const padding = { top: 30, right: 22, bottom: 42, left: 70 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;
  const xForIndex = (index) => allDates.length === 1
    ? padding.left + plotWidth / 2
    : padding.left + (index / (allDates.length - 1)) * plotWidth;
  const yFor = (value) => padding.top + ((max - value) / range) * plotHeight;

  chartState = { series, allDates, pair, padding, plotWidth, plotHeight, xForIndex, yFor };
  bindCanvasHover(canvas);

  ctx.fillStyle = '#fbfdff';
  ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);

  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (i / 4) * plotHeight;
    const crispY = Math.round(y) + 0.5;
    ctx.strokeStyle = '#dfe5ec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, crispY);
    ctx.lineTo(cssWidth - padding.right, crispY);
    ctx.stroke();

    const value = max - (i / 4) * range;
    ctx.fillStyle = '#4b5563';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(formatPrice(value, pair), 6, y);
  }

  for (const item of series) {
    const pointsByDate = new Map(item.points.map((point) => [point.date, point]));
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
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
      ctx.arc(xForIndex(index), yFor(point.value), allDates.length > 80 ? 2 : 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const desiredTicks = Math.max(2, Math.min(7, Math.floor(plotWidth / 125)));
  ctx.textBaseline = 'alphabetic';
  for (let i = 0; i < desiredTicks; i += 1) {
    const index = Math.round((i * (allDates.length - 1)) / Math.max(1, desiredTicks - 1));
    const date = allDates[index];
    if (!date) continue;
    ctx.fillStyle = '#4b5563';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatDateLabel(date), xForIndex(index), cssHeight - 12);
  }

  ctx.fillStyle = '#111827';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  const title = pair === 'XAU/TRY'
    ? 'Gram altın banka geçmiş fiyat grafiği'
    : `${pair} banka geçmiş fiyat grafiği`;
  ctx.fillText(title, padding.left, 18);
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

  renderMeta('');
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

    // Başarılı yüklemede üstte teknik durum metni göstermiyoruz.
    renderMeta('');
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
    ensureTooltip();
    setTimeout(configureDateInputs, 1200);
  });
}
