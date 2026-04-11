// automation/scrape-pages/src/scrapers/garanti.js
import {
  fetchJson,
  getMaxIsoDateTimeFromPairs,
  sha256Json
} from "./_shared.js";

export const meta = {
  id: "garanti",
  rev: 1,
  name: "Garanti BBVA",
  sourceUrl:
    "https://customers.garantibbva.com.tr/digital-public/currency-convertor-public/v2/currency-convertor/currency-list-detail"
};

function normalizeGarantiRows(rows) {
  const normalized = {};

  for (const row of rows) {
    if (!row?.currCode) continue;

    normalized[row.currCode] = {
      buy: row.exchBuyRate,
      sell: row.exchSellRate,
      description: row.currDesc ?? null,
      changeRatio: row.changeRatio ?? null,
      flagCode: row.currFlagCode ?? null
    };
  }

  return normalized;
}

export async function scrape(ctx) {
  const rows = await fetchJson(meta.sourceUrl, ctx?.signal);

  if (!Array.isArray(rows)) {
    throw new Error("Garanti response is not an array");
  }

  const data = normalizeGarantiRows(rows);
  const providerUpdatedAt = getMaxIsoDateTimeFromPairs(
    rows,
    "currDate",
    "currTime"
  );

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