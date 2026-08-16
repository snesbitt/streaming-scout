#!/usr/bin/env node
// scripts/check-status-drift.mjs
//
// Closes the gap behind two real bugs documented in CLAUDE.md: a title
// marked "watching" via the live /api/status endpoint only renders
// correctly forever once it's ALSO baked into index.html as a static
// `.watching-row` block (2026-08-10: three titles stuck on stale "New"
// text because that follow-through step never happened; 2026-08-11:
// Apex kept resurrecting after being marked finished because it never had
// static markup for the fix to work against). status.mjs's own header
// comment already says this plainly: a status flag is not permanent past
// the next weekly rebuild on its own.
//
// This checks the other direction from that comment: is anything CURRENTLY
// "watching" live that has no matching text anywhere in the static
// index.html? If so, it's running only on the fragile per-device
// localStorage/live-API render path this project has already been bitten
// by twice, not the permanent baked-in one.
//
// 2026-08-16: this originally only checked ONE direction, and a manual
// review found the opposite one had been silently drifting for weeks. The
// live store said watched for The Westies (2026-07-30), Scarpetta
// (2026-07-31) and Reacher S4 (2026-08-12), yet all three were still baked
// into index.html as currently-watching, a live Top Pick, and an upcoming
// release respectively. The original check passed the whole time, because
// nothing was missing; something was stale. Both directions are now checked.
//
// Live-network check — same placement/reasoning as check-dismiss-drift.mjs:
// schedule-only, not part of the push/PR `npm test` job.
//
// Usage: node scripts/check-status-drift.mjs [baseUrl]
// Exits 0 if every live "watching" title has matching static markup in
// index.html, 1 otherwise. Node 18+ (global fetch).

import { readFileSync } from "node:fs";

const BASE = (process.argv[2] || "https://streamingscout.org").replace(/\/$/, "");

function normalize(s) {
  return s.trim().toLowerCase();
}

async function main() {
  const res = await fetch(BASE + "/api/status");
  if (!res.ok) {
    console.error(`Could not reach ${BASE}/api/status (status ${res.status}). Skipping drift check — this is a reachability failure, not a confirmed drift.`);
    process.exit(1);
  }
  const { statuses } = await res.json();
  const watching = (statuses || []).filter((s) => s && s.status === "watching");

  const indexHtml = readFileSync("index.html", "utf8").toLowerCase();

  const missing = watching.filter((entry) => entry.title && !indexHtml.includes(normalize(entry.title)));

  // Direction 2: anything marked "watched" live that is STILL presented as
  // current or upcoming in the static page. Deliberately narrow — it only
  // looks inside the row markup for the three sections that make a
  // present/future claim, so a finished title referenced in a comment, a
  // taste-profile bar or an already-correct historical mention never trips
  // it. Merely appearing somewhere in index.html is not drift.
  const watched = (statuses || []).filter((s) => s && s.status === "watched" && s.title);
  const rowRe = /<div class="(watching-row|pick-row|soon-row)"[^>]*data-title="([^"]+)"/g;
  const liveClaims = new Map();
  for (const m of readFileSync("index.html", "utf8").matchAll(rowRe)) {
    liveClaims.set(normalize(m[2]), m[1]);
  }
  const SECTION = {
    "watching-row": "Currently Watching",
    "pick-row": "Top Picks",
    "soon-row": "Coming Soon",
  };
  const stale = watched
    .map((entry) => ({ entry, section: liveClaims.get(normalize(entry.title)) }))
    .filter((x) => x.section);

  if (stale.length) {
    console.error(`Status drift check FAILED: ${stale.length} title(s) marked "watched" live but still presented as current or upcoming in index.html:\n`);
    for (const { entry, section } of stale) {
      console.error(`  - "${entry.title}" (watched ${entry.updatedAt || "unknown date"}) — still rendered in ${SECTION[section]}.`);
    }
    console.error("\nRemove the stale row from index.html and record the title as finished in data/STREAMING_LOG.md. Not auto-fixed: dropping a row is a content decision, and a rebuild may want to replace it rather than just delete it.");
    process.exit(1);
  }

  if (missing.length) {
    console.error(`Status drift check FAILED: ${missing.length} title(s) marked "watching" live but with no matching static markup in index.html:\n`);
    for (const m of missing) {
      console.error(`  - "${m.title}" (updated ${m.updatedAt || "unknown date"}) — relying only on the live/localStorage render path.`);
    }
    console.error("\nFold these into a static .watching-row block in index.html (and data/STREAMING_LOG.md for the permanent log), same pattern as every other Currently Watching entry, before the next rebuild.");
    process.exit(1);
  }

  console.log(`Status drift check passed: all ${watching.length} live "watching" title(s) have static markup, and none of the ${watched.length} "watched" title(s) are still shown as current or upcoming.`);
}

main().catch((err) => {
  console.error("Status drift check errored: " + err.message);
  process.exit(1);
});
