// automation/scrape-pages/src/scrapers/yapi.js
import {
  parseTurkishDateTime,
  sha256Json,
  pickDefined
} from "./_shared.js";

export const meta = {
  id: "yapi",
  rev: 1,
  name: "Yapı Kredi",
  sourceUrl:
    "https://www.yapikredi.com.tr/_ajaxproxy/general.aspx/LoadMainCurrencies"
};

function normalizeYapiRows(rows) {
  const normalized = {};

  for (const row of rows) {
    if (!row?.code) continue;

    normalized[row.code] = {
      buy: row.buy,
      sell: row.sell,
      dailyStatus: pickDefined(row.DailyStatus),
      change: pickDefined(row.Change),
      previousDayBuyingPrice: pickDefined(row.PreviousDayBuyingPrice),
      previousDaySellingPrice: pickDefined(row.PreviousDaySellingPrice)
    };
  }

  return normalized;
}

function extractProviderUpdatedAt(rows) {
  const lastUpdate = rows.find((row) => row?.lastUpdate)?.lastUpdate;
  if (!lastUpdate) return null;

  const [datePart, timePart] = lastUpdate.split(" ");
  return parseTurkishDateTime(datePart, timePart);
}

export async function scrape(ctx) {
  const response = await fetch(meta.sourceUrl, {
    method: "GET",
    signal: ctx?.signal
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${meta.sourceUrl}`);
  }

  const payload = await response.json();
  const rows = payload?.d;

  if (!Array.isArray(rows)) {
    throw new Error("Yapi response does not contain payload.d array");
  }

  const data = normalizeYapiRows(rows);
  const providerUpdatedAt = extractProviderUpdatedAt(rows);

  return {
    meta: meta,
    ok: true,
    scrapedAt: new Date().toISOString(),
    providerUpdatedAt,
    providerFingerprint: sha256Json(data),
    sourceUrl: meta.sourceUrl,
    data
  };
}