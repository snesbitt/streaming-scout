#!/usr/bin/env node
// scripts/check-watched-drift.mjs
//
// Carries titles Susan has ticked on the live site into the repo's permanent
// record, and takes their rows off the page.
//
// The gap. Susan confirmed on 2026-08-17 that the on-site tick means "seen
// it, take it away", not "I watched this on this date". Clicking it writes
// `watched` to /api/status and does nothing else. That hides the row on her
// own devices, but the row stays in index.html and the title stays absent
// from data/STREAMING_LOG.md, so the next rebuild is free to recommend it
// again and check-picks-against-log.mjs cannot see anything wrong. On
// 2026-08-17 this had to be cleaned up by hand twice in one day, the second
// time within hours of the first.
//
// The dismiss path already had the answer: a scheduled job reads the live
// store, updates a repo file, and opens a pull request through GitHub's own
// bot identity (see the dismiss-drift job in .github/workflows/test.yml).
// This is that same shape for the tick.
//
// What --fix does, and what it deliberately does not:
//
//   Appends each newly-ticked title to data/STREAMING_LOG.md, dated as
//   CLEARED rather than watched, and says "watch date unknown" in the entry.
//   A tick carries no watch date. Recording its click date as a viewing date
//   would inflate the apparent recency of exactly the titles she rejects,
//   every week, and several weights in TASTE_PROFILE.md lean on recency.
//
//   Removes the matching Top Picks and Coming Soon rows from index.html, so
//   the repo is left consistent. Without this the log entry alone would make
//   check-picks-against-log.mjs fail on main and block every later push until
//   a human deleted the row by hand, which is a worse outcome than the bug.
//
//   Does NOT touch Currently Watching or In Theaters rows. A tick on those
//   plausibly means "finished this season" and what should replace the row
//   is an editorial decision (does the show return, is there a later season
//   to promote). Same reasoning that keeps the status-drift job report-only.
//
//   Does NOT infer a service, season or date beyond what the live record
//   already states. The service, when recorded, comes verbatim from the
//   status entry's own meta text.
//
// Matching uses scripts/lib/titles.mjs, shared with
// check-picks-against-log.mjs, so the two cannot disagree about whether a
// ticked title and a logged one are the same thing.
//
// Usage:
//   node scripts/check-watched-drift.mjs [baseUrl]          report only, exit 1 on drift
//   node scripts/check-watched-drift.mjs [baseUrl] --fix    apply and exit 0
//
// Node 18+. Read-only against the network either way; it never writes to the
// live store.

import { readFileSync, writeFileSync } from "node:fs";

import { indexByBase, findCovered, normalizeTitle, titlesFromMarkdownList } from "./lib/titles.mjs";

const args = process.argv.slice(2);
const FIX = args.includes("--fix");
const BASE = (args.find((a) => !a.startsWith("--")) || "https://streamingscout.org").replace(/\/$/, "");
const LOG_PATH = "data/STREAMING_LOG.md";
const HTML_PATH = "index.html";
const HEADING = "## Cleared from the page via the tick button (auto-synced)";

function fail(message) {
  console.error(`Watched-drift check FAILED: ${message}`);
  process.exit(1);
}

let payload;
try {
  const res = await fetch(`${BASE}/api/status?cb=${Date.now()}`, { headers: { accept: "application/json" } });
  if (!res.ok) fail(`GET ${BASE}/api/status returned ${res.status}. Not treating an unreachable endpoint as "nothing to sync".`);
  payload = await res.json();
} catch (err) {
  fail(`could not reach ${BASE}/api/status (${err.message}). Not treating an unreachable endpoint as "nothing to sync".`);
}

if (!payload || !Array.isArray(payload.statuses)) {
  fail("the /api/status response had no `statuses` array. Refusing to act on a shape this script does not recognise.");
}

const watched = payload.statuses.filter((e) => e && e.status === "watched" && typeof e.title === "string" && e.title.trim());

const log = readFileSync(LOG_PATH, "utf8");
const logged = indexByBase(titlesFromMarkdownList(log));
if (!logged.size) {
  fail(`parsed zero titles out of ${LOG_PATH}. The log format has probably changed and this check is now blind. Fix the pattern rather than deleting the check.`);
}

const missing = watched.filter((e) => !findCovered(e.title, logged));

if (!missing.length) {
  console.log(
    `Watched-drift check passed: all ${watched.length} title(s) ticked on the live site are already recorded in ${LOG_PATH}.`,
  );
  process.exit(0);
}

if (!FIX) {
  console.error(`Watched-drift check FAILED: ${missing.length} title(s) ticked on the live site are missing from ${LOG_PATH}:\n`);
  for (const e of missing) console.error(`  - "${e.title}" (ticked ${String(e.updatedAt || "date unknown").slice(0, 10)})`);
  console.error(
    "\nUntil these are recorded, the next rebuild is free to recommend them back to Susan, and check-picks-against-log.mjs cannot see the problem. Re-run with --fix to append them and remove their Top Picks / Coming Soon rows.",
  );
  process.exit(1);
}

// ---- --fix ----------------------------------------------------------------

/** Service name from a status entry's meta ("93% · Prime" -> "Prime"). */
function serviceFrom(meta) {
  if (typeof meta !== "string" || !meta.trim()) return null;
  const last = meta.split(/·|&middot;/).pop().trim();
  if (!last || /^\d+%$/.test(last)) return null;
  return last;
}

function entryLine(e) {
  const service = serviceFrom(e.meta);
  const when = String(e.updatedAt || "").slice(0, 10) || "date unknown";
  const where = service ? ` · ${service}` : " · service not recorded";
  return `- **${e.title}**${where} (cleared via the on-site tick button, ${when}, auto-synced by CI) · already seen, watch date unknown`;
}

let nextLog = log;
if (!nextLog.includes(HEADING)) {
  nextLog = `${nextLog.replace(/\s*$/, "")}\n\n\n${HEADING}\n\nTitles Susan cleared from the live page with the tick button, carried here by\nthe weekly watched-drift job so the next rebuild will not offer them again.\nThe date is when she cleared it, NOT when she watched it: a tick carries no\nwatch date. See "What the tick button means" above before using these dates\nfor anything.\n`;
}
nextLog = `${nextLog.replace(/\s*$/, "")}\n\n${missing.map(entryLine).join("\n")}\n`;
writeFileSync(LOG_PATH, nextLog);

// Remove the now-redundant Top Picks / Coming Soon rows.
const html = readFileSync(HTML_PATH, "utf8");
const wanted = new Set(missing.map((e) => normalizeTitle(e.title)));
const lines = html.split("\n");
const removed = [];

for (let i = lines.length - 1; i >= 0; i -= 1) {
  const open = /^(\s*)<div class="(pick-row|soon-row)"[^>]*data-title="([^"]+)"/.exec(lines[i]);
  if (!open) continue;
  const [, indent, rowClass, title] = open;
  if (!wanted.has(normalizeTitle(title))) continue;

  const close = lines.indexOf(`${indent}</div>`, i + 1);
  if (close === -1) {
    fail(`found the opening tag for "${title}" but no matching close at the same indent. Refusing to guess at the boundaries of a row.`);
  }
  let start = i;
  if (start > 0 && /^\s*<!--.*-->\s*$/.test(lines[start - 1])) start -= 1;
  let end = close + 1;
  if (end < lines.length && lines[end].trim() === "") end += 1;
  lines.splice(start, end - start);
  removed.push(`${title} (${rowClass === "pick-row" ? "Top Picks" : "Coming Soon"})`);
}

if (removed.length) writeFileSync(HTML_PATH, lines.join("\n"));

console.log(`Watched-drift fix applied: recorded ${missing.length} ticked title(s) in ${LOG_PATH}.`);
for (const e of missing) console.log(`  + ${e.title}`);
if (removed.length) {
  console.log(`\nRemoved ${removed.length} now-redundant row(s) from ${HTML_PATH}:`);
  for (const r of removed) console.log(`  - ${r}`);
} else {
  console.log(`\nNo Top Picks or Coming Soon rows needed removing.`);
}
console.log(
  `\nCurrently Watching and In Theaters rows are deliberately left alone: a tick there may mean "finished this season", and what replaces the row is an editorial call.`,
);
