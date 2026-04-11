import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";

import { getRunTiming, getMonthKey } from "./time.js";

import { meta as garantiMeta, scrape as scrapeGaranti } from "./scrapers/garanti.js";
import { meta as kuveytMeta, scrape as scrapeKuveyt } from "./scrapers/kuveyt.js";
import { meta as yapiMeta, scrape as scrapeYapi } from "./scrapers/yapi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_ROOT =
  process.env.SCRAPE_OUTPUT_ROOT ||
  path.resolve(__dirname, "../.generated/site");

const SCRAPERS = [
  { meta: garantiMeta, scrape: scrapeGaranti },
  { meta: kuveytMeta, scrape: scrapeKuveyt },
  { meta: yapiMeta, scrape: scrapeYapi }
];

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function readJsonIfExists(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendJsonl(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function findPreviousResult(previousLatest, scraperId) {
  if (!previousLatest?.results || !Array.isArray(previousLatest.results)) {
    return null;
  }

  return previousLatest.results.find((r) => r?.meta?.id === scraperId) ?? null;
}

function shouldMarkNoChange(currentResult, previousResult) {
  if (!currentResult?.ok) return false;
  if (!previousResult?.ok) return false;

  const currentUpdated = currentResult.providerUpdatedAt ?? null;
  const previousUpdated = previousResult.providerUpdatedAt ?? null;

  if (currentUpdated && previousUpdated) {
    return currentUpdated === previousUpdated;
  }

  const currentFingerprint = currentResult.providerFingerprint ?? null;
  const previousFingerprint = previousResult.providerFingerprint ?? null;

  if (currentFingerprint && previousFingerprint) {
    return currentFingerprint === previousFingerprint;
  }

  return false;
}

function compactMonthlyResult(currentResult, previousLatest) {
  const previousResult = findPreviousResult(previousLatest, currentResult?.meta?.id);

  if (!shouldMarkNoChange(currentResult, previousResult)) {
    return {
      ...currentResult,
      noChange: false
    };
  }

  return {
    meta: currentResult.meta,
    ok: true,
    providerUpdatedAt: currentResult.providerUpdatedAt ?? null,
    noChange: true
  };
}

function buildIndexJson({ monthKey, latestSnapshot }) {
  return {
    rev: 1,
    latest: "latest_all.json",
    currentMonthly: `monthlies/current/${monthKey}.jsonl`,
    lastScheduledFor: latestSnapshot.scheduledFor,
    lastRunStartedAt: latestSnapshot.runStartedAt,
    timezone: latestSnapshot.timezone
  };
}

function buildIndexHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Scrape Pages</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; }
    table { border-collapse: collapse; width: 100%; max-width: 1000px; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; }
    code, pre { white-space: pre-wrap; word-break: break-word; }
    .ok { color: #0a7a0a; font-weight: 600; }
    .err { color: #b00020; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Scrape Pages</h1>
  <p><a href="./latest_all.json">latest_all.json</a></p>
  <div id="meta"></div>
  <table>
    <thead>
      <tr>
        <th>Scraper</th>
        <th>Status</th>
        <th>Provider Updated</th>
        <th>Scraped At</th>
        <th>Source</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>

  <script>
    async function main() {
      const res = await fetch("./latest_all.json", { cache: "no-store" });
      const latest = await res.json();

      document.getElementById("meta").innerHTML =
        "<p><strong>scheduledFor:</strong> " + latest.scheduledFor + "</p>" +
        "<p><strong>runStartedAt:</strong> " + latest.runStartedAt + "</p>" +
        "<p><strong>timezone:</strong> " + latest.timezone + "</p>";

      const tbody = document.getElementById("rows");
      tbody.innerHTML = "";

      for (const result of latest.results || []) {
        const tr = document.createElement("tr");

        const name = result?.meta?.name || result?.meta?.id || "unknown";
        const status = result?.ok ? '<span class="ok">ok</span>' : '<span class="err">error</span>';
        const providerUpdatedAt = result?.providerUpdatedAt || "-";
        const scrapedAt = result?.scrapedAt || "-";
        const sourceUrl = result?.sourceUrl || result?.meta?.sourceUrl || "-";

        tr.innerHTML =
          "<td>" + name + "</td>" +
          "<td>" + status + "</td>" +
          "<td><code>" + providerUpdatedAt + "</code></td>" +
          "<td><code>" + scrapedAt + "</code></td>" +
          "<td><a href=\\"" + sourceUrl + "\\">link</a></td>";

        tbody.appendChild(tr);
      }
    }

    main().catch((err) => {
      document.body.insertAdjacentHTML("beforeend", "<pre>" + String(err) + "</pre>");
    });
  </script>
</body>
</html>
`;
}

async function runOne(scraperDef, ctx) {
  try {
    return await scraperDef.scrape(ctx);
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
  const monthKey = getMonthKey(timing.scheduledDate);

  const ctx = {
    scheduledFor: timing.scheduledFor,
    runStartedAt: timing.runStartedAt,
    timezone: timing.timezone
  };

  const results = [];
  for (const scraperDef of SCRAPERS) {
    results.push(await runOne(scraperDef, ctx));
  }

  const latestSnapshot = {
    rev: 1,
    scheduledFor: timing.scheduledFor,
    runStartedAt: timing.runStartedAt,
    timezone: timing.timezone,
    results
  };

  const previousLatestPath = path.join(OUTPUT_ROOT, "latest_all.json");
  const previousLatest = await readJsonIfExists(previousLatestPath);

  const monthlyEntry = {
    rev: 1,
    scheduledFor: timing.scheduledFor,
    runStartedAt: timing.runStartedAt,
    timezone: timing.timezone,
    results: results.map((result) => compactMonthlyResult(result, previousLatest))
  };

  const currentMonthlyPath = path.join(
    OUTPUT_ROOT,
    "monthlies",
    "current",
    `${monthKey}.jsonl`
  );

  const indexJson = buildIndexJson({ monthKey, latestSnapshot });

  await writeJson(path.join(OUTPUT_ROOT, "latest_all.json"), latestSnapshot);
  await appendJsonl(currentMonthlyPath, monthlyEntry);
  await writeJson(path.join(OUTPUT_ROOT, "index.json"), indexJson);
  await writeFile(path.join(OUTPUT_ROOT, "index.html"), buildIndexHtml(), "utf8");

  return {
    outputRoot: OUTPUT_ROOT,
    latestSnapshot,
    monthlyEntry,
    currentMonthlyPath
  };
}

// If run directly (instead of imported), execute and print the results
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runAll()
    .then(({ latestSnapshot, currentMonthlyPath, outputRoot }) => {
      console.log(JSON.stringify(latestSnapshot, null, 2));
      console.log("\nWritten to:");
      console.log(`- ${path.join(outputRoot, "latest_all.json")}`);
      console.log(`- ${currentMonthlyPath}`);
      console.log(`- ${path.join(outputRoot, "index.json")}`);
      console.log(`- ${path.join(outputRoot, "index.html")}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}