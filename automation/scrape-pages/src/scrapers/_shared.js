import { createHash } from "node:crypto";

export async function fetchJson(url, signal) {
  const response = await fetch(url, {
    method: "GET",
    signal
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

export async function fetchJsonWithHeaders(url, headers, signal) {
  const response = await fetch(url, {
    method: "GET",
    headers,
    signal
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

export function sha256Json(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function parseTurkishDateTime(dateStr, timeStr = "00:00:00") {
  // dateStr: "2026-04-10" or "11.04.2026"
  if (!dateStr) return null;

  if (dateStr.includes("-")) {
    return `${dateStr}T${timeStr}+03:00`;
  }

  const [dd, mm, yyyy] = dateStr.split(".");
  return `${yyyy}-${mm}-${dd}T${timeStr}+03:00`;
}

export function getMaxIsoDateTimeFromPairs(rows, dateKey, timeKey) {
  let max = null;

  for (const row of rows) {
    const dateStr = row?.[dateKey];
    const timeStr = row?.[timeKey];
    if (!dateStr || !timeStr) continue;

    const iso = parseTurkishDateTime(dateStr, timeStr);
    if (!max || iso > max) {
      max = iso;
    }
  }

  return max;
}

export function pickDefined(value, fallback = null) {
  return value ?? fallback;
}