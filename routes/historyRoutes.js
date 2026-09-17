const express = require('express');

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_PAIRS = new Set(['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'XAU/TRY']);
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const MAX_HISTORY_YEARS = 10;
const cache = new Map();
const bankCache = new Map();

const CANLIDOVIZ_API = 'https://a.canlidoviz.com/items/history';
const CANLIDOVIZ_HEADERS = {
  Accept: '*/*',
  Origin: 'https://canlidoviz.com',
  Referer: 'https://canlidoviz.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36'
};

const BANKS = [
  { id: 'garanti', name: 'Garanti BBVA' },
  { id: 'kuveyt', name: 'Kuveyt Türk' },
  { id: 'yapi', name: 'Yapı Kredi' }
];

// CanlıDöviz bank-specific historical item ids. These are daily historical
// quote series; the historical API exposes OHLC/close, not a historical
// bid/ask pair for every day.
const BANK_ITEM_IDS = {
  'USD/TRY': { garanti: 805, kuveyt: 1021, yapi: 819 },
  'EUR/TRY': { garanti: 807, kuveyt: 1031, yapi: 820 },
  'GBP/TRY': { garanti: 809, kuveyt: 841, yapi: 1475 },
  'XAU/TRY': { garanti: 806, kuveyt: 826, yapi: 821 }
};

function isValidDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateRange(start, end, pair) {
  if (!isValidDate(start) || !isValidDate(end) || start > end) {
    return 'Geçersiz tarih aralığı.';
  }
  if (!SUPPORTED_PAIRS.has(pair)) {
    return 'Desteklenmeyen parite.';
  }

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const maxEndDate = new Date(startDate);
  maxEndDate.setUTCFullYear(maxEndDate.getUTCFullYear() + MAX_HISTORY_YEARS);

  if (endDate > maxEndDate) {
    return `Tek sorguda en fazla ${MAX_HISTORY_YEARS} yıllık aralık seçilebilir.`;
  }
  return null;
}

function rangeDays(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  return Math.max(1, Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1);
}

function timeoutForRange(start, end) {
  const days = rangeDays(start, end);
  if (days > 2500) return 60000;
  if (days > 1000) return 45000;
  if (days > 366) return 30000;
  return 20000;
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

function timestampToIstanbulDate(timestampSeconds) {
  const date = new Date(timestampSeconds * 1000);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) return null;
  return `${values.year}-${values.month}-${values.day}`;
}

function parseCanliDovizHistory(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];

  const byDate = new Map();
  for (const [timestampText, ohlcText] of Object.entries(payload)) {
    const timestamp = Number(timestampText);
    if (!Number.isFinite(timestamp) || typeof ohlcText !== 'string') continue;

    const values = ohlcText.split('|').map(Number);
    if (values.length < 4 || !values.slice(0, 4).every(Number.isFinite)) continue;

    const date = timestampToIstanbulDate(timestamp);
    if (!date) continue;

    byDate.set(date, {
      date,
      open: values[0],
      high: values[1],
      low: values[2],
      close: values[3],
      value: values[3]
    });
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchBankSeries(bank, pair, start, end, signal) {
  const itemId = BANK_ITEM_IDS[pair]?.[bank.id];
  if (!itemId) {
    return { id: bank.id, name: bank.name, points: [], error: 'Bu parite için tarihsel seri yok.' };
  }

  const url = new URL(CANLIDOVIZ_API);
  url.searchParams.set('period', 'DAILY');
  url.searchParams.set('itemDataId', String(itemId));
  url.searchParams.set('startDate', `${start}T00:00:00`);
  url.searchParams.set('endDate', `${end}T23:59:59`);

  const response = await fetch(url, {
    headers: CANLIDOVIZ_HEADERS,
    signal
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 200);
    throw new Error(`${bank.name}: HTTP ${response.status}${details ? ` - ${details}` : ''}`);
  }

  const payload = await response.json();
  return {
    id: bank.id,
    name: bank.name,
    points: parseCanliDovizHistory(payload)
  };
}

router.get('/api/history/banks', async (req, res) => {
  const start = String(req.query.start || '');
  const end = String(req.query.end || '');
  const pair = String(req.query.pair || 'USD/TRY').toUpperCase();
  const validationError = validateRange(start, end, pair);
  if (validationError) return res.status(400).json({ error: validationError });

  const cacheKey = `banks:${pair}:${start}:${end}`;
  if (bankCache.has(cacheKey)) return res.json(bankCache.get(cacheKey));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutForRange(start, end));

  try {
    const series = await Promise.all(BANKS.map(async (bank) => {
      try {
        return await fetchBankSeries(bank, pair, start, end, controller.signal);
      } catch (error) {
        return {
          id: bank.id,
          name: bank.name,
          points: [],
          error: error?.name === 'AbortError' ? 'Zaman aşımı.' : (error?.message || String(error))
        };
      }
    }));

    const populated = series.filter((item) => item.points.length > 0);
    if (!populated.length) {
      const errors = series.map((item) => item.error).filter(Boolean).join(' | ');
      return res.status(502).json({
        error: `Üç bankadan da geçmiş veri alınamadı.${errors ? ` ${errors}` : ''}`,
        series
      });
    }

    const result = {
      source: 'CanlıDöviz banka tarihçesi',
      sourceType: 'third-party-bank-specific-history',
      valueType: 'daily-close',
      note: 'Seriler bankaya özel günlük tarihsel fiyat/kapanış değeridir; her gün için ayrı alış-satış çifti değildir.',
      maxHistoryYears: MAX_HISTORY_YEARS,
      pair,
      start,
      end,
      series
    };

    bankCache.set(cacheKey, result);
    return res.json(result);
  } finally {
    clearTimeout(timeout);
  }
});

router.get('/api/history/reference', async (req, res) => {
  const start = String(req.query.start || '');
  const end = String(req.query.end || '');
  const pair = String(req.query.pair || 'USD/TRY').toUpperCase();
  const validationError = validateRange(start, end, pair);
  if (validationError) return res.status(400).json({ error: validationError });

  const cacheKey = `${pair}:${start}:${end}`;
  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  const [base, quote] = pair.split('/');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutForRange(start, end));

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
