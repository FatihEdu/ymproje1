import { sha256Json, pickDefined } from "./_shared.js";

export const meta = {
  id: "kuveyt",
  rev: 1,
  name: "Kuveyt Türk",
  sourceUrl:
    "https://www.kuveytturk.com.tr/ck0d84?B83A1EF44DD940F2FEC85646BDB25EA0"
};

function normalizeKuveytRows(rows) {
  const normalized = {};

  for (const row of rows) {
    if (!row?.CurrencyCode) continue;

    normalized[row.CurrencyCode] = {
      buy: row.BuyRate,
      sell: row.SellRate,
      description: pickDefined(row.CurrencyDescription),
      title: pickDefined(row.Title),
      changeRate: pickDefined(row.ChangeRate),
      changeRateNegative: pickDefined(row.ChangeRateNegative)
    };
  }

  return normalized;
}

export async function scrape(ctx) {
  const response = await fetch(meta.sourceUrl, {
    method: "GET",
    signal: ctx?.signal
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${meta.sourceUrl}`);
  }

  const rows = await response.json();

  if (!Array.isArray(rows)) {
    throw new TypeError("Kuveyt response is not an array");
  }

  const data = normalizeKuveytRows(rows);

  return {
    meta: meta,
    ok: true,
    scrapedAt: new Date().toISOString(),
    providerUpdatedAt: null,
    providerFingerprint: sha256Json(data),
    sourceUrl: meta.sourceUrl,
    data
  };
}