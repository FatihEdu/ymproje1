import { parseAllProviders } from './scrapeClientParser.js';

const DATA_BASE_URL = globalThis.__SCRAPE_BASE_URL__ || 'https://fatihedu.github.io/ymproje1';

const state = {
  allRows: [],
  favorites: [],
  query: '',
  sortKey: 'pair',
  sortDir: 'asc',
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

let csrfTokenCache = '';
let csrfTokenPromise = null;

async function getCsrfToken() {
  if (csrfTokenCache) return csrfTokenCache;
  if (csrfTokenPromise) return csrfTokenPromise;

  csrfTokenPromise = fetchJson('/csrf-token')
    .then((data) => {
      csrfTokenCache = data?.csrfToken || '';
      return csrfTokenCache;
    })
    .finally(() => {
      csrfTokenPromise = null;
    });

  return csrfTokenPromise;
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
  const q = state.query.trim().toLowerCase();
  const rows = state.allRows
    .filter((r) => keys.has(favoriteKey(r.pair, r.providerName)))
    .filter((r) => {
      if (!q) return true;
      return r.pair.toLowerCase().includes(q) || r.providerName.toLowerCase().includes(q);
    });

  const sign = state.sortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const k = state.sortKey;
    if (k === 'pair' || k === 'providerName') {
      return sign * String(a[k]).localeCompare(String(b[k]), 'tr');
    }
    if (k === 'time') {
      const av = new Date(a.time || 0).getTime() || 0;
      const bv = new Date(b.time || 0).getTime() || 0;
      return sign * (av - bv);
    }
    const av = Number(a[k]);
    const bv = Number(b[k]);
    const aInvalid = !Number.isFinite(av);
    const bInvalid = !Number.isFinite(bv);
    if (aInvalid && bInvalid) return 0;
    if (aInvalid) return 1;
    if (bInvalid) return -1;
    return sign * (av - bv);
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
    renderMeta(`Toplam favori: ${state.favorites.length} | Gösterilen: ${getFilteredRows().length}`);
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

    const pairTd = document.createElement('td');
    pairTd.textContent = row.pair === 'XAU/TRY' ? 'ALTIN' : row.pair;
    tr.appendChild(pairTd);

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
    freshnessTd.className = freshnessClass;
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

    const actionTd = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger btn-sm';
    removeBtn.type = 'button';
    removeBtn.dataset.pair = row.pair;
    removeBtn.dataset.provider = row.providerName;
    removeBtn.textContent = 'Kaldır';
    actionTd.appendChild(removeBtn);
    tr.appendChild(actionTd);

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
        renderMeta(`Toplam favori: ${state.favorites.length} | Gösterilen: ${getFilteredRows().length}`);
        if (removed) showUndo(removed);
      } catch (error) {
        console.error(error);
        renderMeta(`Favori kaldırılamadı: ${error.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function wireControls() {
  const search = qs('#favs-search');
  const sort = qs('#favs-sort');
  const dir = qs('#favs-sort-dir');
  const undoBtn = qs('#favs-undo-btn');

  if (search) {
    search.addEventListener('input', () => {
      state.query = search.value || '';
      renderTable();
      renderMeta(`Toplam favori: ${state.favorites.length} | Gösterilen: ${getFilteredRows().length}`);
    });
  }

  if (sort) {
    sort.addEventListener('change', () => {
      state.sortKey = sort.value;
      renderTable();
    });
  }

  if (dir) {
    dir.addEventListener('click', () => {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      dir.textContent = state.sortDir === 'asc' ? 'Artan ↑' : 'Azalan ↓';
      renderTable();
    });
  }

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
    renderMeta(`Toplam favori: ${state.favorites.length} | Gösterilen: ${getFilteredRows().length}`);
  } catch (error) {
    console.error(error);
    renderMeta(`Favorilerim yüklenemedi: ${error.message}`);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    wireControls();
    loadFavoritesPage();
  });
}
