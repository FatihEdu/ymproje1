import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import { getRunTiming, getMonthKey } from "./time.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_ROOT =
  process.env.SCRAPE_OUTPUT_ROOT ||
  path.resolve(__dirname, "../.generated/site");

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function compressMonthlies() {
  const currentDir = path.join(OUTPUT_ROOT, "monthlies", "current");

  // Use the same timing logic as run-all.js so both scripts agree on which
  // month is "active". Slot rounding can push scheduledDate into the previous
  // month during the early minutes of a new month, so we protect both the
  // slot-rounded month (what run-all.js uses) and the current calendar month
  // (wall-clock Istanbul time) to avoid compressing a file that runAll() still
  // needs to append to.
  const timing = getRunTiming();
  const slotMonthKey = getMonthKey(timing.scheduledDate);
  const calendarMonthKey = getMonthKey(new Date());

  let files = [];
  try {
    files = await readdir(currentDir);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { compressed: [] };
    }
    throw error;
  }

  const compressed = [];

  for (const fileName of files) {
    if (!fileName.endsWith(".jsonl")) continue;

    const monthKey = fileName.replace(/\.jsonl$/, "");
    if (monthKey === slotMonthKey || monthKey === calendarMonthKey) continue;

    const [year, month] = monthKey.split("-");
    const sourcePath = path.join(currentDir, fileName);
    const targetDir = path.join(OUTPUT_ROOT, "monthlies", year);
    const targetPath = path.join(targetDir, `${month}.jsonl.gz`);

    await ensureDir(targetDir);

    const content = await readFile(sourcePath);
    const gz = gzipSync(content);

    await writeFile(targetPath, gz);
    await rm(sourcePath);

    compressed.push({
      from: sourcePath,
      to: targetPath
    });
  }

  return { compressed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  compressMonthlies()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}