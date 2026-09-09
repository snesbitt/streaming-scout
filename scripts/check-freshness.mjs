#!/usr/bin/env node
// Automation-freshness check: are the data files behind the recommendations
// still being fed? Written 2026-09-09, the day the daily portfolio freshness
// sweep (0 11 * * *) discovered it had been specified to run
// `npm run check:freshness` here for weeks while no such script existed —
// and that data/TASTE_PROFILE.md and data/STREAMING_LOG.md had both sat
// untouched since 2026-08-17, 23 days, with nothing in the repo counting.
// check-content-drift.mjs watches whether the pages agree with the data;
// this watches whether the data is still arriving at all.
//
// Read-only, zero dependencies, no network. Prints [STALE] findings (the
// pipeline is not doing its job — urgent) and [REVIEW] findings (worth a
// look). Exits 1 only on [STALE].
//
// Not checked here, deliberately: the live-records backup. That job commits
// to the auto/live-records-backup branch, not main, so a main checkout can't
// see its latest snapshot — the Monday watch-log staleness report in test.yml
// covers it from the Actions side instead.
//
// Deliberately NOT wired into `npm test`: these thresholds fail on the
// calendar, not on the code. Netflix/Prime syncing needs Susan's logged-in
// browser (documented on the roadmap), so a stale stamp here is a prompt for
// a sync session, never something CI should redden an unrelated push over.

import { readFileSync } from "node:fs";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const stale = [];
const review = [];

// Every data file carries a "**Last updated:** YYYY-MM-DD (...)" line near
// the top; that stamp is the contract this check reads. A file that loses
// the line is itself a finding — the stamp going missing is how staleness
// would otherwise become invisible again.
function lastUpdated(path) {
  const md = readFileSync(path, "utf8");
  const m = md.match(/\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function ageDays(isoDate) {
  return Math.floor((now - Date.parse(isoDate + "T00:00:00Z")) / DAY_MS);
}

// Check 1: the taste profile. Everything the site recommends is ranked
// against this file; ten days without a rebuild stamp means picks are being
// served against a profile no recent viewing has touched.
{
  const stamp = lastUpdated("data/TASTE_PROFILE.md");
  if (!stamp) {
    stale.push(
      "data/TASTE_PROFILE.md: no '**Last updated:** YYYY-MM-DD' stamp found — the header format changed; restore the stamp or update this check to read the new one.",
    );
  } else {
    const age = ageDays(stamp);
    if (age > 10) {
      stale.push(
        `data/TASTE_PROFILE.md last updated ${stamp} — ${age} days ago (threshold 10). Run a sync + profile rebuild from a session with Susan's logged-in browser; picks are ranking against a profile that predates current viewing.`,
      );
    }
  }
}

// Check 2: the watch log the profile derives from. The sync-watch-history
// skill's own guideline calls this file stale at 3 days, but a quiet week is
// normal life, not a broken pipeline — so this only reaches [REVIEW] at the
// same 10-day mark, and it is the taste profile above that hard-fails.
{
  const stamp = lastUpdated("data/STREAMING_LOG.md");
  if (!stamp) {
    stale.push(
      "data/STREAMING_LOG.md: no '**Last updated:** YYYY-MM-DD' stamp found — restore the stamp or update this check.",
    );
  } else {
    const age = ageDays(stamp);
    if (age > 10) {
      review.push(
        `data/STREAMING_LOG.md last updated ${stamp} — ${age} days ago. The watch history behind the taste profile is going quiet; worth a sync session when Susan's browser is available.`,
      );
    }
  }
}

for (const f of review) console.log("[REVIEW] " + f);
for (const f of stale) console.log("[STALE] " + f);

if (stale.length) {
  console.error(`\nFreshness check FAILED: ${stale.length} pipeline(s) not doing their job.`);
  process.exit(1);
}
console.log(
  `Freshness check passed: taste profile within its 10-day window${review.length ? ` (${review.length} item(s) to review above)` : ""}.`,
);
