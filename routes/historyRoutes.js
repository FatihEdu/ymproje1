const express = require('express');

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_PAIRS = new Set(['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'XAU/TRY']);
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const cache = new Map();

function isValidDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function fetchRows(url, signal) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`HTTP ${response.status}: ${details}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function normalizePoints(rows, quote, divisor = 1) {
  return rows
    .filter((row) => String(row?.quote || '').toUpperCase() === quote && Number.isFinite(Number(row?.rate)))
    .map((row) => ({
      date: row.date,
      value: Number(row.rate) / divisor
    }))
    .filter((point) => DATE_RE.test(point.date || '') && Number.isFinite(point.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

router.get('/api/history/reference', async (req, res) => {
  const start = String(req.query.start || '');
  const end = String(req.query.end || '');
  const pair = String(req.query.pair || 'USD/TRY').toUpperCase();

  if (!isValidDate(start) || !isValidDate(end) || start > end) {
    return res.status(400).json({ error: 'Geçersiz tarih aralığı.' });
  }

  if (!SUPPORTED_PAIRS.has(pair)) {
    return res.status(400).json({ error: 'Desteklenmeyen parite.' });
  }

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (endDate - startDate > 366 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'Tek sorguda en fazla 366 günlük aralık seçilebilir.' });
  }

  const cacheKey = `${pair}:${start}:${end}`;
  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  const [base, quote] = pair.split('/');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    let rows = [];
    let source = '';
    let divisor = 1;

    if (base === 'XAU') {
      const url = new URL('https://api.frankfurter.dev/v2/rates');
      url.searchParams.set('from', start);
      url.searchParams.set('to', end);
      url.searchParams.set('base', 'XAU');
      url.searchParams.set('quotes', 'TRY');
      rows = await fetchRows(url, controller.signal);
      source = 'Altın referans kuru (Frankfurter resmi kaynak harmanı)';
      divisor = GRAMS_PER_TROY_OUNCE;
    } else {
      const tcmbUrl = new URL('https://api.frankfurter.dev/v2/providers/tcmb/rates');
      tcmbUrl.searchParams.set('from', start);
      tcmbUrl.searchParams.set('to', end);
      tcmbUrl.searchParams.set('base', base);
      tcmbUrl.searchParams.set('quotes', 'TRY');

      rows = await fetchRows(tcmbUrl, controller.signal);
      source = 'TCMB';

      if (!normalizePoints(rows, quote).length) {
        const fallbackUrl = new URL('https://api.frankfurter.dev/v2/rates');
        fallbackUrl.searchParams.set('from', start);
        fallbackUrl.searchParams.set('to', end);
        fallbackUrl.searchParams.set('base', base);
        fallbackUrl.searchParams.set('quotes', 'TRY');
        rows = await fetchRows(fallbackUrl, controller.signal);
        source = 'Frankfurter resmi kaynak harmanı';
      }
    }

    const points = normalizePoints(rows, quote, divisor);
    const result = { source, pair, start, end, points };
    cache.set(cacheKey, result);
    return res.json(result);
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Geçmiş kur servisi zaman aşımına uğradı.'
      : `Geçmiş kur verisi alınamadı: ${error?.message || error}`;
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;
