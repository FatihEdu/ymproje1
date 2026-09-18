const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { execFileSync } = require("node:child_process");

describe("scrape-pages time handling", () => {
  test("normalizes hour 24 emitted by Intl and keeps scheduled date valid", () => {
    const modulePath = pathToFileURL(
      path.join(__dirname, "../automation/scrape-pages/src/time.js"),
    ).href;

    const script = `
      const realDateTimeFormat = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function(locale, options = {}) {
        if (options.timeZoneName === "longOffset") {
          return { formatToParts: () => [{ type: "timeZoneName", value: "GMT+03:00" }] };
        }
        if (options.hour === "2-digit" && options.minute === "2-digit") {
          return {
            formatToParts: () => [
              { type: "year", value: "2026" },
              { type: "month", value: "09" },
              { type: "day", value: "19" },
              { type: "hour", value: "24" },
              { type: "minute", value: "35" },
              { type: "second", value: "32" }
            ]
          };
        }
        return new realDateTimeFormat(locale, options);
      };
      process.env.SCRAPE_TIMEZONE = "Europe/Istanbul";
      process.env.SCRAPE_SLOT_MINUTES = "7";
      const { getRunTiming, getMonthKey } = await import(${JSON.stringify(modulePath)});
      const timing = getRunTiming(new Date("2026-09-18T21:35:32.000Z"));
      console.log(JSON.stringify({
        scheduledFor: timing.scheduledFor,
        monthKey: getMonthKey(timing.scheduledDate, "Europe/Istanbul"),
        isValidDate: !Number.isNaN(timing.scheduledDate.getTime())
      }));
    `;

    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });

    const result = JSON.parse(output.trim());
    expect(result.scheduledFor).toBe("2026-09-19T00:07:00+03:00");
    expect(result.isValidDate).toBe(true);
    expect(result.monthKey).toBe("2026-09");
  });
});
