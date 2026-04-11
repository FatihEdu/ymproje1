import {createHash} from 'node:crypto';

import {
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

const md5 = (str) => createHash('md5').update(str).digest('hex');

const headers = {
  "Accept": "application/json",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Authorization": "",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  "channel": "Internet",
  "client-type": "ArkClient",
  "dialect": "TR",
  "guid": md5(Date.now().toString() + "hi!!1" + Math.random().toString()), // make it uncorrelatable between runs
  "ip": "127.0.0.1",
  "state": "",
  "tenant-app-id": "",
  "tenant-company-id": "GAR",
  "tenant-geolocation": "TUR"
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
  const response = await fetch(meta.sourceUrl, {
    method: "GET",
    headers,
    signal: ctx?.signal
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${meta.sourceUrl}`);
  }

  const rows = await response.json();

  if (!Array.isArray(rows)) {
    throw new TypeError("Garanti response is not an array");
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