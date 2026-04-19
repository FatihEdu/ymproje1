import { parseAllProviders } from './scrapeClientParser.js';

const DATA_BASE_URL = globalThis.__SCRAPE_BASE_URL__ || 'https://fatihedu.github.io/ymproje1';

const state = {
  allRows: [],
  favorites: [],
  undo: null,
};

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

function formatRelativeTime(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d)) return '-';
  const now = new Date();
  const diffMin = Math.floor((now - d) / 1000 / 60);
  if (diffMin < 1) return 'şimdi';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} saat önce`;
  const diffDay = Math.floor(diffMin / 60 / 24);
  if (diffDay < 7) return `${diffDay} gün önce`;
  return formatShortDateTime(dateString).slice(0, 10);
}

function getFreshnessClass(dateString) {
  if (!dateString) return 'freshness--unknown';
  const d = new Date(dateString);
  if (isNaN(d)) return 'freshness--unknown';
  const diffMin = Math.floor((new Date() - d) / 1000 / 60);
  if (diffMin < 60 * 24) return 'freshness--fresh';
  if (diffMin < 60 * 24 * 7) return 'freshness--warn';
  return 'freshness--stale';
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

async function addFavorite(pair, providerName) {
  const token = await getCsrfToken();
  const body = new URLSearchParams({ pair, providerName }).toString();
  const res = await fetch('/api/favorites', {
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

function getFilteredRows() {
  const keys = new Set(state.favorites.map((f) => favoriteKey(f.pair, f.providerName)));
  const rows = state.allRows
    .filter((r) => keys.has(favoriteKey(r.pair, r.providerName)));

  rows.sort((a, b) => {
    if (a.pair !== b.pair) return a.pair.localeCompare(b.pair, 'tr');
    return a.providerName.localeCompare(b.providerName, 'tr');
  });

  return rows;
}

function hideUndo() {
  const wrap = qs('#favs-undo');
  if (wrap) wrap.classList.add('hidden');
  state.undo = null;
}

function showUndo(removed) {
  if (state.undo?.timer) clearTimeout(state.undo.timer);
  const wrap = qs('#favs-undo');
  const text = qs('#favs-undo-text');
  if (!wrap || !text) return;
  text.textContent = `${removed.pair} - ${removed.providerName} favorilerden kaldırıldı.`;
  wrap.classList.remove('hidden');
  state.undo = {
    item: removed,
    timer: setTimeout(() => hideUndo(), 6000),
  };
}

async function handleUndo() {
  if (!state.undo?.item) return;
  const item = state.undo.item;
  try {
    await addFavorite(item.pair, item.providerName);
    const exists = state.favorites.some((f) => favoriteKey(f.pair, f.providerName) === favoriteKey(item.pair, item.providerName));
    if (!exists) state.favorites.push(item);
    renderTable();
    renderMeta(`Toplam favori: ${state.favorites.length}`);
  } catch (error) {
    console.error(error);
    renderMeta(`Geri alma başarısız: ${error.message}`);
  } finally {
    hideUndo();
  }
}

function renderTable() {
  const body = qs('#favs-list-body');
  if (!body) return;

  body.textContent = '';

  const tableRows = getFilteredRows();

  if (!tableRows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="8" class="text-center text-muted">Henüz favori eklenmemiş.</td>';
    body.appendChild(tr);
    return;
  }

  for (const row of tableRows) {
    const changeClass = row.changePct > 0 ? 'change-positive' : row.changePct < 0 ? 'change-negative' : 'change-neutral';
    const freshnessClass = getFreshnessClass(row.time);
    const tr = document.createElement('tr');
    tr.className = 'bank-row';
    tr.innerHTML = `
      <td>${row.pair === 'XAU/TRY' ? 'ALTIN' : row.pair}</td>
      <td>${row.providerName}</td>
      <td>${formatNumber(row.buy)}</td>
      <td>${formatNumber(row.sell)}</td>
      <td>${formatNumber(row.spread)}</td>
      <td class="${changeClass}">${formatPct(row.changePct)}</td>
      <td class="${freshnessClass}" title="${formatShortDateTime(row.time)}">
        <div class="freshness-cell">
          <span class="freshness-dot"></span>
          <span class="freshness-text">${formatRelativeTime(row.time)}</span>
        </div>
      </td>
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
        const key = favoriteKey(pair, providerName);
        const removed = state.favorites.find((f) => favoriteKey(f.pair, f.providerName) === key);
        state.favorites = state.favorites.filter((f) => favoriteKey(f.pair, f.providerName) !== key);
        renderTable();
        renderMeta(`Toplam favori: ${state.favorites.length}`);
        if (removed) showUndo(removed);
      } catch (error) {
        console.error(error);
        renderMeta(`Favori kaldirilamadi: ${error.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function wireControls() {
  const undoBtn = qs('#favs-undo-btn');

  if (undoBtn) {
    undoBtn.addEventListener('click', handleUndo);
  }
}

async function loadFavoritesPage() {
  try {
    const [favoritesData, latestData] = await Promise.all([
      fetchJson('/api/favorites'),
      fetchJson(`${DATA_BASE_URL}/latest_all.json`),
    ]);

    state.favorites = Array.isArray(favoritesData?.favorites) ? favoritesData.favorites : [];
    state.allRows = parseAllProviders(latestData);

    // Keep only favorites that still exist in latest dataset.
    state.favorites = state.favorites.filter((fav) => Boolean(findRowByFavorite(state.allRows, fav)));
    renderTable();
    renderMeta(`Toplam favori: ${state.favorites.length}`);
  } catch (error) {
    console.error(error);
    renderMeta(`Favorilerim yuklenemedi: ${error.message}`);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    wireControls();
    loadFavoritesPage();
  });
}
