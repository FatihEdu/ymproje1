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
  }, {});

  const sortedPairs = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  for (const pair of sortedPairs) {
    const groupRows = groups[pair].sort((a, b) => a.providerName.localeCompare(b.providerName));
    const displayPair = pair === 'XAU/TRY' ? 'ALTIN' : pair;

    const headerRow = document.createElement('tr');
    headerRow.className = 'currency-group-row';
    headerRow.innerHTML = `
      <td colspan="7">
        <div class="currency-group">
          <span class="currency-group__name">${displayPair}</span>
          <span class="currency-group__info">${groupRows.length} banka</span>
        </div>
      </td>
    `;
    body.appendChild(headerRow);

    for (const row of groupRows) {
      const changeClass = row.changePct > 0 ? 'up' : row.changePct < 0 ? 'down' : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.providerName}</td>
        <td>${formatNumber(row.buy)}</td>
        <td>${formatNumber(row.sell)}</td>
        <td>${formatNumber(row.parity)}</td>
        <td>${formatNumber(row.spread)}</td>
        <td class="${changeClass}">${formatPct(row.changePct)}</td>
        <td>${row.time || '-'}</td>
      `;
      body.appendChild(tr);
    }
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

export async function loadLatestData() {
  showLoading('Son veriler yukleniyor...');
  try {
    const latestUrl = `${DATA_BASE_URL}/latest_all.json`;
    const latest = await fetchJson(latestUrl);
    const rows = filterVisibleRows(parseAllProviders(latest));

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
    const rows = filterVisibleRows(parseAllProviders(latestEntry));

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
