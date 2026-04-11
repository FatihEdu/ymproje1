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

export function getRunTiming(now = new Date()) {
  const slotMinutes = getSlotMinutes();
  const timezone = getTimezone();

  const runStartedDate = new Date(now);
  const scheduledDate = new Date(now);

  const currentMinute = scheduledDate.getMinutes();
  const previousSlot = slotMinutes.filter((m) => m <= currentMinute).at(-1);

  if (previousSlot === undefined) {
    scheduledDate.setHours(scheduledDate.getHours() - 1);
    scheduledDate.setMinutes(slotMinutes[slotMinutes.length - 1], 0, 0);
  } else {
    scheduledDate.setMinutes(previousSlot, 0, 0);
  }

  return {
    timezone,
    runStartedAt: runStartedDate.toISOString(),
    scheduledFor: scheduledDate.toISOString(),
    scheduledDate
  };
}

export function getMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}