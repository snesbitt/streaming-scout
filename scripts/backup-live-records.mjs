#!/usr/bin/env node
// scripts/backup-live-records.mjs
//
// Snapshots the two live Netlify Blobs stores into the repo, because they are
// the last thing in this project with no backup at all.
//
// data/ is version-controlled, so every past version of the log, taste
// profile and exclusion list is recoverable from git. The watching/watched
// flags in the `title-status` store and the dismissals in `dismissed-titles`
// are not: they exist only inside Netlify, they are written by an
// unauthenticated endpoint from any device, and if that store were ever wiped
// there would be nothing to restore from. `check-dismiss-drift.mjs` carries
// dismissals into data/EXCLUDED_TITLES.md, but only dismissals, and only the
// ones that are missing; nothing has ever preserved the status store.
//
// Writes backups/live-records/YYYY-MM-DD.json plus a `latest.json` pointer.
// Run from CI on a schedule, which opens a pull request when the snapshot
// changes. Nothing here pushes anything.
//
// The interesting behaviour is what it REFUSES to do. A backup script that
// happily writes an empty file over a good one is worse than no backup, and
// that is close to the shape of the 2026-07-21 data loss. So:
//
//   - a failed or non-OK fetch aborts the run; it never writes a partial
//     snapshot,
//   - a malformed response (not an array) aborts,
//   - a snapshot with FEWER records than the last good one aborts, unless
//     --allow-shrink says the shrink is intended,
//   - an identical snapshot is not rewritten, so a quiet week produces no
//     empty pull request.
//
// Usage:
//   node scripts/backup-live-records.mjs [baseUrl] [--allow-shrink]
// Node 18+ (global fetch).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const allowShrink = args.includes("--allow-shrink");
const BASE = (args.find((a) => !a.startsWith("--")) || "https://streamingscout.org").replace(/\/$/, "");

const DIR = "backups/live-records";
const LATEST = `${DIR}/latest.json`;

// Same retry shape as scripts/smoke.mjs, and for the same reason: on
// 2026-08-16 a single dropped connection failed the smoke job and opened a
// noisy issue against a site that was verifiably healthy. A backup that
// cries wolf gets ignored, and an ignored backup is not a backup.
const TIMEOUT_MS = 10000;
const ATTEMPTS = 3;

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      lastErr = err;
      const why = err.name === "TimeoutError" ? `timed out after ${TIMEOUT_MS}ms` : err.message;
      if (attempt < ATTEMPTS) {
        console.log(`  .. ${url} attempt ${attempt}/${ATTEMPTS} failed (${why}), retrying`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw new Error(`network error after ${ATTEMPTS} attempts: ${lastErr.message}`);
}

async function fetchList(path, key) {
  const res = await fetchWithRetry(BASE + path);
  if (!res.ok) throw new Error(`GET ${path} returned ${res.status}`);
  const data = await res.json();
  const list = data && data[key];
  if (!Array.isArray(list)) {
    throw new Error(`GET ${path} response has no "${key}" array. Refusing to snapshot a shape this script does not recognise.`);
  }
  return list;
}

function abort(message) {
  console.error("Live-records backup ABORTED: " + message);
  console.error("\nNo file was written. The previous snapshot is untouched.");
  process.exit(1);
}

async function main() {
  let statuses, dismissed;
  try {
    statuses = await fetchList("/api/status", "statuses");
    dismissed = await fetchList("/api/dismiss", "dismissed");
  } catch (err) {
    abort(err.message);
  }

  const snapshot = { source: BASE, statuses, dismissed };

  let previous = null;
  if (existsSync(LATEST)) {
    try {
      previous = JSON.parse(readFileSync(LATEST, "utf8"));
    } catch (err) {
      abort(`${LATEST} exists but could not be parsed (${err.message}). Fix or remove it by hand rather than letting this script overwrite an unreadable backup.`);
    }
  }

  if (previous) {
    const wasS = (previous.statuses || []).length;
    const wasD = (previous.dismissed || []).length;
    const shrank = statuses.length < wasS || dismissed.length < wasD;
    if (shrank && !allowShrink) {
      abort(
        `the live stores are SMALLER than the last snapshot (${previous.fetchedAt || "unknown date"}): ` +
          `statuses ${wasS} -> ${statuses.length}, dismissed ${wasD} -> ${dismissed.length}. ` +
          "This is either real data loss on the live site, in which case the existing snapshot is exactly what you need and must not be overwritten, " +
          "or an intended removal, in which case re-run with --allow-shrink.",
      );
    }
    if (shrank && allowShrink) {
      console.log(`  !! snapshot is smaller than ${previous.fetchedAt || "the previous one"} and --allow-shrink was passed; writing anyway.`);
    }

    // Compare on content only. fetchedAt changes every run and would
    // otherwise make every scheduled run look like a change and open an
    // empty pull request every week.
    const sameAsBefore =
      JSON.stringify({ statuses: previous.statuses, dismissed: previous.dismissed }) ===
      JSON.stringify({ statuses, dismissed });
    if (sameAsBefore) {
      console.log(
        `Live-records backup: no change since ${previous.fetchedAt || "the last snapshot"} ` +
          `(${statuses.length} statuses, ${dismissed.length} dismissals). Nothing written.`,
      );
      return;
    }
  }

  const fetchedAt = new Date().toISOString();
  const dated = `${DIR}/${fetchedAt.slice(0, 10)}.json`;
  const body = JSON.stringify({ fetchedAt, ...snapshot }, null, 2) + "\n";

  mkdirSync(DIR, { recursive: true });
  writeFileSync(dated, body);
  writeFileSync(LATEST, body);

  console.log(
    `Live-records backup written: ${statuses.length} statuses, ${dismissed.length} dismissals ` +
      `-> ${dated} (and ${LATEST}).`,
  );
}

main().catch((err) => {
  console.error("Live-records backup errored: " + err.message);
  process.exit(1);
});
