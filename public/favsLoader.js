import { parseAllProviders } from './scrapeClientParser.js';

const DATA_BASE_URL = globalThis.__SCRAPE_BASE_URL__ || 'https://fatihedu.github.io/ymproje1';

function qs(selector) {
  return document.querySelector(selector);
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

function formatShortDateTime(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d)) return '-';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderMeta(message) {
  const el = qs('#favs-meta');
  if (el) el.textContent = message;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getCsrfToken() {
  const data = await fetchJson('/csrf-token');
  return data?.csrfToken || '';
}

function favoriteKey(pair, providerName) {
  return `${pair}::${providerName}`;
}

function findRowByFavorite(rows, favorite) {
  return rows.find((row) => row.pair === favorite.pair && row.providerName === favorite.providerName);
}

async function removeFavorite(pair, providerName) {
  const token = await getCsrfToken();
  const body = new URLSearchParams({ pair, providerName }).toString();
  const res = await fetch('/api/favorites/remove', {
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
}

function renderTable(rows, favorites) {
  const body = qs('#favs-list-body');
  if (!body) return;

  body.textContent = '';

  const keys = new Set(favorites.map((f) => favoriteKey(f.pair, f.providerName)));
  const tableRows = rows
    .filter((r) => keys.has(favoriteKey(r.pair, r.providerName)))
    .sort((a, b) => {
      if (a.pair !== b.pair) return a.pair.localeCompare(b.pair);
      return a.providerName.localeCompare(b.providerName);
    });

  if (!tableRows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="8" class="text-center text-muted">Henüz favori eklenmemiş.</td>';
    body.appendChild(tr);
    return;
  }

  for (const row of tableRows) {
    const changeClass = row.changePct > 0 ? 'change-positive' : row.changePct < 0 ? 'change-negative' : 'change-neutral';
    const tr = document.createElement('tr');
    tr.className = 'bank-row';
    tr.innerHTML = `
      <td>${row.pair === 'XAU/TRY' ? 'ALTIN' : row.pair}</td>
      <td>${row.providerName}</td>
      <td>${formatNumber(row.buy)}</td>
      <td>${formatNumber(row.sell)}</td>
      <td>${formatNumber(row.spread)}</td>
      <td class="${changeClass}">${formatPct(row.changePct)}</td>
      <td>${formatShortDateTime(row.time)}</td>
      <td><button class="btn btn-danger btn-sm" type="button" data-pair="${row.pair}" data-provider="${row.providerName}">Kaldır</button></td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll('button[data-pair][data-provider]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pair = btn.dataset.pair;
      const providerName = btn.dataset.provider;
      btn.disabled = true;
      try {
        await removeFavorite(pair, providerName);
        await loadFavoritesPage();
      } catch (error) {
        console.error(error);
        renderMeta(`Favori kaldirilamadi: ${error.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function loadFavoritesPage() {
  try {
    const [favoritesData, latestData] = await Promise.all([
      fetchJson('/api/favorites'),
      fetchJson(`${DATA_BASE_URL}/latest_all.json`),
    ]);

    const favorites = Array.isArray(favoritesData?.favorites) ? favoritesData.favorites : [];
    const allRows = parseAllProviders(latestData);

    // Keep only favorites that still exist in latest dataset.
    const existing = favorites.filter((fav) => Boolean(findRowByFavorite(allRows, fav)));
    renderTable(allRows, existing);
    renderMeta(`Toplam favori: ${existing.length}`);
  } catch (error) {
    console.error(error);
    renderMeta(`Favorilerim yuklenemedi: ${error.message}`);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', loadFavoritesPage);
}
