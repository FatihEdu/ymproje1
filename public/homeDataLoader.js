import { parseAllProviders } from './scrapeClientParser.js';

const DATA_BASE_URL = globalThis.__SCRAPE_BASE_URL__ || 'https://fatihedu.github.io/ymproje1';
const qs = (s) => document.querySelector(s);

const SELECTORS = {
  usdValue: '#val-usd', usdChange: '#chg-usd',
  eurValue: '#val-eur', eurChange: '#chg-eur',
  gbpValue: '#val-gbp', gbpChange: '#chg-gbp',
  goldValue: '#val-gold', goldChange: '#chg-gold',
  listBody: '#currency-list-body',
  listMeta: '#currency-list-meta',
  loadingOverlay: '#loading-overlay',
  authSection: '#nav-auth-section',
  heroActions: '#hero-auth-actions'
};

// --- YARDIMCI: Aktif Kullanıcının Favori Anahtarı ---
function getFavKey() {
  const user = localStorage.getItem('currentUser') || 'guest';
  return `favs_${user}`;
}

// --- AUTH MANTIĞI ---
function updateAuthNavbar() {
  const authEl = qs(SELECTORS.authSection);
  const heroEl = qs(SELECTORS.heroActions);
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

  if (!authEl) return;
  authEl.innerHTML = ''; 

  if (isLoggedIn) {
    authEl.innerHTML = `
      <li><a href="index.html">Ana Sayfa</a></li>
      <li><a href="favs.html">Favoriler</a></li>
      <li>
        <button type="button" id="logout-btn" class="btn btn-outline-white btn-nav" style="border: 1px solid white; margin-left: 10px; cursor:pointer;">Çıkış Yap</button>
      </li>
    `;
    
    qs('#logout-btn')?.addEventListener('click', () => {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('currentUser');
      window.location.href = 'logout.html';
    });

    if (heroEl) heroEl.innerHTML = `<a href="favs.html" class="btn btn-white">Favorilerime Git</a>`;
  } else {
    authEl.innerHTML = `
      <li><a href="index.html">Ana Sayfa</a></li>
      <li><a href="login.html">Giriş Yap</a></li>
      <li><a href="register.html">Kayıt Ol</a></li>
    `;
    if (heroEl) {
      heroEl.innerHTML = `
        <a href="register.html" class="btn btn-white">Ücretsiz Kayıt Ol</a>
        <a href="login.html" class="btn btn-outline-white">Giriş Yap</a>
      `;
    }
  }
}

// --- FAVORİ SİSTEMİ (Parite Bazlı) ---
function togglePairFavorite(pairName) {
  if (localStorage.getItem('isLoggedIn') !== 'true') {
    alert("Favori eklemek için giriş yapmalısın ŞAMPİYON!");
    window.location.href = 'login.html';
    return;
  }

  const key = getFavKey();
  let favPairs = JSON.parse(localStorage.getItem(key) || '[]');
  
  const index = favPairs.indexOf(pairName);
  if (index > -1) {
    favPairs.splice(index, 1); // Zaten varsa çıkar
  } else {
    favPairs.push(pairName); // Yoksa ekle
  }
  
  localStorage.setItem(key, JSON.stringify(favPairs));
  renderTable(allRows); // Yıldızın güncellenmesi için tabloyu yenile
}

function isPairFavorite(pairName) {
  const key = getFavKey();
  const favPairs = JSON.parse(localStorage.getItem(key) || '[]');
  return favPairs.includes(pairName);
}

// --- VERİ & TABLO MANTIĞI ---
let allRows = []; 

function normalizePair(name) {
  if (!name) return 'DİĞER';
  let p = name.toUpperCase().trim().replace('/TL', '').replace('/TRY', '').replace(' (GR)', '');
  if (p === 'USD') return 'USD/TRY';
  if (p === 'EUR') return 'EUR/TRY';
  if (p === 'GBP') return 'GBP/TRY';
  if (['ALT', 'XAU', 'ALTIN'].includes(p)) return 'GRAM ALTIN';
  return p.includes('/') ? p : p + '/TRY';
}

function renderTable(rows) {
  const body = qs(SELECTORS.listBody);
  if (!body) return;
  body.innerHTML = '';

  const cleaned = rows.map(r => ({ ...r, pair: normalizePair(r.pair) }));
  const pairCounts = cleaned.reduce((acc, row) => {
    acc[row.pair] = (acc[row.pair] || 0) + 1;
    return acc;
  }, {});

  const filtered = cleaned.filter(row => pairCounts[row.pair] > 1);
  filtered.sort((a, b) => a.pair.localeCompare(b.pair) || a.providerName.localeCompare(b.providerName));

  let lastGroup = '';
  filtered.forEach(row => {
    // GRUP BAŞLIĞI OLUŞTURMA (Yıldız buraya geldi!)
    if (lastGroup !== row.pair) {
      lastGroup = row.pair;
      const isFav = isPairFavorite(lastGroup);
      
      const gr = document.createElement('tr');
      gr.className = 'pair-group-header';
      gr.innerHTML = `
        <td colspan="8" style="background:var(--brand-light); padding: 12px 15px !important;">
          <button class="fav-group-btn ${isFav ? 'active' : ''}" 
                  style="background:none; border:none; cursor:pointer; font-size:1.4rem; color:${isFav ? '#f59e0b' : '#94a3b8'}; margin-right: 10px;">
            ${isFav ? '★' : '☆'}
          </button>
          <span style="font-weight:800; color:var(--brand-dark);">📊 ${lastGroup}</span>
        </td>
      `;
      
      // Yıldız butonuna tıklandığında pariteyi favoriler
      const btn = gr.querySelector('.fav-group-btn');
      btn.onclick = () => togglePairFavorite(row.pair);
      
      body.appendChild(gr);
    }
    
    // BANKA SATIRLARI (Burada yıldız yok, sadece veri var)
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center; color:var(--muted)">•</td>
      <td style="font-weight:600">${row.providerName}</td>
      <td>${(row.buy || 0).toFixed(4)}</td>
      <td>${(row.sell || 0).toFixed(4)}</td>
      <td style="font-weight:bold">${(row.parity || 0).toFixed(4)}</td>
      <td style="color:var(--muted); font-size:0.8rem">${(row.spread || 0).toFixed(4)}</td>
      <td class="${row.changePct > 0 ? 'up' : 'down'}">${row.changePct > 0 ? '+' : ''}${(row.changePct || 0).toFixed(2)}%</td>
      <td style="text-align:right">${row.time?.split('T')[1]?.substring(0, 5) || '-'}</td>
    `;
    body.appendChild(tr);
  });
}

// Veri yükleme ve Kart güncelleme aynı kalıyor...
export async function loadData() {
  const overlay = qs(SELECTORS.loadingOverlay);
  overlay?.classList.remove('hidden');
  try {
    const res = await fetch(`${DATA_BASE_URL}/latest_all.json`);
    const data = await res.json();
    allRows = parseAllProviders(data);
    updateCards(allRows);
    renderTable(allRows);
  } catch (e) {
    console.error("Veri yükleme hatası:", e);
  } finally {
    overlay?.classList.add('hidden');
  }
}

function updateCards(rows) {
  const map = { usd: 'USD/TRY', eur: 'EUR/TRY', gbp: 'GBP/TRY', gold: 'GRAM ALTIN' };
  Object.keys(map).forEach(key => {
    const m = rows.filter(r => normalizePair(r.pair) === map[key]);
    if (m.length) {
      const avg = m.reduce((a, b) => a + b.parity, 0) / m.length;
      const v = qs(SELECTORS[`${key}Value`]);
      if (v) v.textContent = avg.toFixed(4);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updateAuthNavbar();
  loadData();
});