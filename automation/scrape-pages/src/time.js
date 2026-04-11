const DEFAULT_SLOT_MINUTES = [7];
const DEFAULT_TIMEZONE = "Europe/Istanbul";

export function getSlotMinutes() {
  const raw = process.env.SCRAPE_SLOT_MINUTES;

  if (!raw) return DEFAULT_SLOT_MINUTES;

  const parsed = raw
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isInteger(x) && x >= 0 && x <= 59)
    .sort((a, b) => a - b);

  return parsed.length > 0 ? parsed : DEFAULT_SLOT_MINUTES;
}

export function getTimezone() {
  return process.env.SCRAPE_TIMEZONE || DEFAULT_TIMEZONE;
}

// Returns the UTC offset string (e.g. "+03:00") for `timezone` at `date`.
function getOffsetString(date, timezone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "longOffset"
  }).formatToParts(date);
  // raw value is like "GMT+03:00", "GMT-05:30", or "GMT+0"
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = raw.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return "+00:00";
  const sign = match[1];
  const hh = match[2].padStart(2, "0");
  const mm = (match[3] ?? "00").padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

// Returns date/time parts for `date` expressed in `timezone`.
function getPartsInTz(date, timezone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

export function getRunTiming(now = new Date()) {
  const slotMinutes = getSlotMinutes();
  const timezone = getTimezone();
  const offset = getOffsetString(now, timezone);
  const p = getPartsInTz(now, timezone);

  const currentMinute = parseInt(p.minute, 10);
  const previousSlot = slotMinutes.filter((m) => m <= currentMinute).at(-1);

  let sYear = parseInt(p.year, 10);
  let sMonth = parseInt(p.month, 10); // 1-indexed
  let sDay = parseInt(p.day, 10);
  let sHour = parseInt(p.hour, 10);
  let sMinute;

  if (previousSlot === undefined) {
    sMinute = slotMinutes[slotMinutes.length - 1];
    sHour -= 1;
    if (sHour < 0) {
      sHour += 24;
      // Roll back one calendar day; Date.UTC with day=0 gives the last day of the previous month
      const prev = new Date(Date.UTC(sYear, sMonth - 1, sDay - 1));
      sYear = prev.getUTCFullYear();
      sMonth = prev.getUTCMonth() + 1;
      sDay = prev.getUTCDate();
    }
  } else {
    sMinute = previousSlot;
  }

  const pad2 = (n) => String(n).padStart(2, "0");
  const scheduledFor = `${sYear}-${pad2(sMonth)}-${pad2(sDay)}T${pad2(sHour)}:${pad2(sMinute)}:00${offset}`;
  const runStartedAt = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
  const scheduledDate = new Date(scheduledFor);

  return {
    timezone,
    runStartedAt,
    scheduledFor,
    scheduledDate
  };
}

export function getMonthKey(date = new Date(), timezone = getTimezone()) {
  const p = getPartsInTz(date, timezone);
  return `${p.year}-${p.month}`;
}