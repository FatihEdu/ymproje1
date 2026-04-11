import path from "node:path";
import { fileURLToPath } from "node:url";

import { getRunTiming, getMonthKey } from "./time.js";

import { meta as garantiMeta, scrape as scrapeGaranti } from "./scrapers/garanti.js";
import { meta as kuveytMeta, scrape as scrapeKuveyt } from "./scrapers/kuveyt.js";
import { meta as yapiMeta, scrape as scrapeYapi } from "./scrapers/yapi.js";

const __filename = fileURLToPath(import.meta.url);

const SCRAPERS = [
  { meta: garantiMeta, scrape: scrapeGaranti },
  { meta: kuveytMeta, scrape: scrapeKuveyt },
  { meta: yapiMeta, scrape: scrapeYapi }
];

async function runOne(scraperDef, ctx) {
  try {
    const result = await scraperDef.scrape(ctx);
    return result;
  } catch (error) {
    return {
      meta: scraperDef.meta,
      ok: false,
      scrapedAt: new Date().toISOString(),
      providerUpdatedAt: null,
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function runAll() {
  const timing = getRunTiming();

  const ctx = {
    scheduledFor: timing.scheduledFor,
    runStartedAt: timing.runStartedAt,
    timezone: timing.timezone
  };

  const results = [];
  for (const scraperDef of SCRAPERS) {
    results.push(await runOne(scraperDef, ctx));
  }

  return {
    rev: 1,
    scheduledFor: timing.scheduledFor,
    runStartedAt: timing.runStartedAt,
    timezone: timing.timezone,
    results
  };
}

// If this file is run directly (e.g. `node run-all.js`), execute the scrapers and print results.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runAll()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}