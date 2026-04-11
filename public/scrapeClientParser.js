// Client-side parser for scraper outputs.
// Normalizes provider-specific payloads to a single shape.

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function splitPair(pair) {
  const [base, quote] = String(pair).split('/');
  return {
    base: base || null,
    quote: quote || null
  };
}

function normalizePairForGaranti(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;

  // Garanti uses TL; normalize to TRY for a single shared vocabulary.
  if (code === 'ALT/TL') return 'XAU/TRY';
  if (code === 'GMS/TL') return 'XAG/TRY';
  if (code === 'TL/ALT') return 'TRY/XAU';
  if (code === 'TL/GMS') return 'TRY/XAG';

  return code.replaceAll('TL', 'TRY');
}

function normalizePairForKuveyt(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;

  if (code.includes('/')) return code;

  if (code.startsWith('ALT')) return 'XAU/TRY';
  if (code.startsWith('GMS')) return 'XAG/TRY';
  if (code.startsWith('PLT')) return 'XPT/TRY';

  return `${code}/TRY`;
}

function normalizePairForYapi(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;
  if (code.includes('/')) return code;
  return `${code}/TRY`;
}

function normalizePair(providerId, rawCode) {
  if (providerId === 'garanti') return normalizePairForGaranti(rawCode);
  if (providerId === 'kuveyt') return normalizePairForKuveyt(rawCode);
  if (providerId === 'yapi') return normalizePairForYapi(rawCode);

  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;
  return code.includes('/') ? code : `${code}/TRY`;
}

function resolveChangePct(providerId, row) {
  if (providerId === 'garanti') {
    return toFiniteNumber(row?.changeRatio);
  }

  if (providerId === 'kuveyt') {
    const rate = toFiniteNumber(row?.changeRate);
    if (rate == null) return null;
    return row?.changeRateNegative ? -Math.abs(rate) : rate;
  }

  if (providerId === 'yapi') {
    const buy = toFiniteNumber(row?.buy);
    const prevBuy = toFiniteNumber(row?.previousDayBuyingPrice);
    if (buy != null && prevBuy != null && prevBuy !== 0) {
      return ((buy - prevBuy) / prevBuy) * 100;
    }
    return toFiniteNumber(row?.change);
  }

  return null;
}

function normalizeOne(providerResult, rawPair, row) {
  const providerId = providerResult?.meta?.id || 'unknown';
  const pair = normalizePair(providerId, rawPair);
  if (!pair) return null;

  const buy = toFiniteNumber(row?.buy);
  const sell = toFiniteNumber(row?.sell);
  if (buy == null || sell == null) return null;

  const mid = (buy + sell) / 2;
  const spread = sell - buy;
  const spreadPct = mid === 0 ? null : (spread / mid) * 100;
  const changePct = resolveChangePct(providerId, row);
  const time = providerResult?.providerUpdatedAt || providerResult?.scrapedAt || null;

  return {
    providerId,
    providerName: providerResult?.meta?.name || providerId,
    pair,
    ...splitPair(pair),
    buy,
    sell,
    parity: mid,
    spread,
    spreadPct,
    changePct,
    time,
    providerUpdatedAt: providerResult?.providerUpdatedAt || null,
    scrapedAt: providerResult?.scrapedAt || null,
    sourceUrl: providerResult?.sourceUrl || providerResult?.meta?.sourceUrl || null,
    rawKey: rawPair,
    raw: row
  };
}

export function parseProviderResult(providerResult) {
  const data = providerResult?.data;
  if (!data || typeof data !== 'object') return [];

  const parsed = [];
  for (const [rawPair, row] of Object.entries(data)) {
    const item = normalizeOne(providerResult, rawPair, row);
    if (item) parsed.push(item);
  }

  return parsed;
}

export function parseByProviderId(snapshotOrResults, providerId) {
  if (!providerId) return [];

  const results = Array.isArray(snapshotOrResults)
    ? snapshotOrResults
    : snapshotOrResults?.results || [];

  const target = results.find((r) => r?.meta?.id === providerId);
  if (!target) return [];
  return parseProviderResult(target);
}

export function parseAllProviders(snapshotOrResults) {
  const results = Array.isArray(snapshotOrResults)
    ? snapshotOrResults
    : snapshotOrResults?.results || [];

  return results.flatMap((r) => parseProviderResult(r));
}

export function groupByPair(snapshotOrResults) {
  const rows = parseAllProviders(snapshotOrResults);
  const out = {};

  for (const row of rows) {
    if (!out[row.pair]) out[row.pair] = [];
    out[row.pair].push(row);
  }

  return out;
}
