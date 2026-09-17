const qs = (selector) => document.querySelector(selector);
const pad = (value) => String(value).padStart(2, '0');

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

function renderLegend(source) {
  const container = qs('#chart-legend');
  if (!container) return;
  container.textContent = '';

  const item = document.createElement('span');
  item.className = 'chart-legend__item';

  const dot = document.createElement('span');
  dot.style.display = 'inline-block';
  dot.style.width = '10px';
  dot.style.height = '10px';
  dot.style.borderRadius = '999px';
  dot.style.background = '#1a56db';
  dot.style.marginRight = '6px';

  const label = document.createElement('span');
  label.className = 'chart-legend__text';
  label.textContent = source || 'Geçmiş referans';

  item.appendChild(dot);
  item.appendChild(label);
  container.appendChild(item);
}

function drawHistory(points, pair, source) {
  const canvas = qs('#range-chart');
  if (!canvas || typeof canvas.getContext !== 'function') return;

  const cleanPoints = (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(Number(point?.value)))
    .map((point) => ({ date: point.date, value: Number(point.value) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  renderLegend(source);

  const dpr = globalThis.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 960;
  const cssHeight = 280;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!cleanPoints.length) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Seçilen aralık için geçmiş veri bulunamadı.', cssWidth / 2, cssHeight / 2);
    return;
  }

  const values = cleanPoints.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.02, 1);
  const min = rawMin - rawRange * 0.08;
  const max = rawMax + rawRange * 0.08;
  const range = max - min || 1;

  const padding = { top: 24, right: 24, bottom: 40, left: 64 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;
  const xFor = (index) => cleanPoints.length === 1
    ? padding.left + plotWidth / 2
    : padding.left + (index / (cleanPoints.length - 1)) * plotWidth;
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
    ctx.fillText(new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value), 6, y + 4);
  }

  ctx.strokeStyle = '#1a56db';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  cleanPoints.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#1a56db';
  cleanPoints.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);
    ctx.beginPath();
    ctx.arc(x, y, cleanPoints.length > 80 ? 1.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  const desiredTicks = Math.max(2, Math.min(7, Math.floor(plotWidth / 120)));
  for (let i = 0; i < desiredTicks; i += 1) {
    const index = Math.round((i * (cleanPoints.length - 1)) / Math.max(1, desiredTicks - 1));
    const point = cleanPoints[index];
    if (!point) continue;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(formatDateLabel(point.date), xFor(index), cssHeight - 12);
  }

  ctx.fillStyle = '#111827';
  ctx.font = '600 13px Segoe UI';
  ctx.textAlign = 'left';
  const title = pair === 'XAU/TRY' ? 'ALTIN (gram)/TRY geçmiş veri grafiği' : `${pair} geçmiş veri grafiği`;
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

  showLoading(`${start} - ${end} geçmiş verileri çekiliyor...`);
  try {
    const params = new URLSearchParams({ start, end, pair });
    const response = await fetch(`/api/history/reference?${params.toString()}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }

    const points = Array.isArray(payload?.points) ? payload.points : [];
    drawHistory(points, pair, payload?.source || 'Geçmiş referans');

    if (!points.length) {
      renderMeta(`${start} - ${end} aralığında geçmiş veri bulunamadı.`, true);
      return;
    }

    renderMeta(`${start} - ${end} aralığından ${points.length} gerçek geçmiş veri noktası çekildi. Kaynak: ${payload.source}.`);
  } catch (error) {
    console.error('[historyDataLoader]', error);
    drawHistory([], pair, 'Geçmiş referans');
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
  startInput.min = '1999-01-04';
  endInput.min = '1999-01-04';
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
