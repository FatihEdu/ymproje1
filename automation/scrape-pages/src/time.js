const DEFAULT_SLOT_MINUTES = [7];
const DEFAULT_TIMEZONE = "Europe/Istanbul";

export function getSlotMinutes() {
  const raw = process.env.SCRAPE_SLOT_MINUTES;

  if (!raw) return DEFAULT_SLOT_MINUTES;

  const parsed = raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^\d+$/.test(x))
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x >= 0 && x <= 59)
    .sort((a, b) => a - b);

  return parsed.length > 0 ? parsed : DEFAULT_SLOT_MINUTES;
}

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function getTimezone() {
  const timezone = process.env.SCRAPE_TIMEZONE || DEFAULT_TIMEZONE;

  if (!isValidTimezone(timezone)) {
    throw new Error(
      `Invalid SCRAPE_TIMEZONE: "${timezone}". Expected a valid IANA timezone name (for example "${DEFAULT_TIMEZONE}").`
    );
  }

  return timezone;
}

// Returns the UTC offset string (e.g. "+03:00") for `timezone` at `date`.
function getOffsetString(date, timezone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "longOffset"
  }).formatToParts(date);
  // `longOffset` returns values like "GMT+03:00", "GMT-05:30", or "GMT" for UTC.
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  if (raw === "GMT") return "+00:00";
  // Captures sign, two-digit hour, and optional two-digit minute (e.g. "+03:00" or "+05:30").
  const match = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return "+00:00";
  return `${match[1]}${match[2]}:${match[3]}`;
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
      // Roll back one calendar day using UTC date arithmetic.
      // Passing day=0 to Date.UTC yields the last day of the previous month, which is
      // correct for any month boundary. We only use the resulting year/month/day values
      // (not the time component), so UTC arithmetic is safe here regardless of DST.
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
  // scheduledDate is the same instant as scheduledFor but as a Date object,
  // used by getMonthKey() and passed to callers that need a Date for further arithmetic.
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