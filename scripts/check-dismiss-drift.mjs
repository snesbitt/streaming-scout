#!/usr/bin/env node
// scripts/check-dismiss-drift.mjs
//
// Closes the gap documented in CLAUDE.md's 2026-08-09 entry: the live
// "not interested" button (dismiss.mjs) syncs a dismissal across devices
// immediately, but does NOT make it survive the next weekly rebuild —
// that only happens if the title also gets added to data/EXCLUDED_TITLES.md
// by hand. That 2026-08-09 pass found 8 titles dismissed on-site over a
// week that were never carried into the file, all vulnerable to
// reappearing in a future Coming Soon/Top Picks rebuild.
//
// 2026-08-16: the weekly "Streaming Scout dismissed-title sync" Claude Code
// Remote scheduled task that entry describes no longer exists (verified via
// list_triggers — only a weekly artwork sweep and a five-site review remain).
// Rather than recreate it as its own agentic session, this gap is fully
// mechanical (diff two lists, append in an existing format) with zero
// editorial judgment involved, so it's a better fit for --fix mode below,
// run by GitHub Actions' own CI job using the repo's default token — see
// .github/workflows/test.yml's `live-drift` job, which runs this in --fix
// mode and opens a PR via GitHub's own bot identity when it finds anything,
// never a Claude session pushing directly (that stays off-limits per this
// project's standing rule).
//
// Live-network check (fetches the real /api/dismiss endpoint) — deliberately
// NOT part of `npm test` (which stays offline-safe for push/PR runs, same
// reasoning as smoke.mjs).
//
// Usage:
//   node scripts/check-dismiss-drift.mjs [baseUrl]          report only, exit 1 on drift
//   node scripts/check-dismiss-drift.mjs [baseUrl] --fix     also appends missing
//                                                             entries to
//                                                             data/EXCLUDED_TITLES.md,
//                                                             exits 0 if it fixed
//                                                             everything found
// Node 18+ (global fetch).

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

import { normalizeTitle } from "./lib/titles.mjs";
import { removeRows, SECTION_OF } from "./lib/rows.mjs";

const args = process.argv.slice(2);
const fix = args.includes("--fix");
const BASE = (args.find((a) => !a.startsWith("--")) || "https://streamingscout.org").replace(/\/$/, "");

function normalize(title) {
  return title.trim().toLowerCase();
}

function formatDate(iso) {
  if (!iso) return "unknown date";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : iso;
}

async function main() {
  const res = await fetch(BASE + "/api/dismiss");
  if (!res.ok) {
    console.error(`Could not reach ${BASE}/api/dismiss (status ${res.status}). Skipping drift check — this is a reachability failure, not a confirmed drift.`);
    process.exit(1);
  }
  const { dismissed } = await res.json();

  const excludedRaw = readFileSync("data/EXCLUDED_TITLES.md", "utf8");

  // Match against the file's actual ENTRY LINES, not its whole text.
  //
  // This used to be `excludedRaw.toLowerCase().includes(title)`, which reads
  // the explanatory prose as if it were the list. EXCLUDED_TITLES.md opens with
  // a data-loss notice that names real titles in passing, so "Prey", "Kleo" and
  // "The Choral" all appear in prose as well as in their own entries. Any one of
  // them could have been genuinely missing from the list while this check
  // reported everything accounted for. That is the dangerous direction for a
  // drift check: a false negative means a dismissed title stays vulnerable to
  // reappearing in the next rebuild, silently, which is the exact gap this
  // script exists to close.
  //
  // Verified 2026-08-17 against the real file: three of sixteen titles matched
  // on prose alone.
  const excludedTitles = new Set(
    excludedRaw
      .split("\n")
      .map((line) => /^\s*-\s*\*\*(.+?)\*\*/.exec(line))
      .filter(Boolean)
      .map((m) => normalize(m[1])),
  );

  const missing = (dismissed || []).filter(
    (entry) => entry && entry.title && !excludedTitles.has(normalize(entry.title)),
  );

  if (!missing.length) {
    console.log(`Dismiss drift check passed: all ${(dismissed || []).length} live-dismissed title(s) accounted for in data/EXCLUDED_TITLES.md.`);
    return;
  }

  if (fix) {
    const lines = missing.map(
      (m) => `- **${m.title}** — ${m.section || "Unknown section"} — dismissed on-site ${formatDate(m.dismissedAt)} (auto-synced by CI)`,
    );
    appendFileSync("data/EXCLUDED_TITLES.md", "\n" + lines.join("\n") + "\n");
    console.log(`Dismiss drift check: appended ${missing.length} missing title(s) to data/EXCLUDED_TITLES.md:\n`);
    for (const m of missing) console.log(`  - "${m.title}"`);

    // 2026-08-17: also take the rows off the page. Recording the dismissal
    // without removing the markup is exactly half a fix, and the half that is
    // missing turns main red: check-rows-against-exclusions.mjs compares these
    // two files in `npm test`, so the `test` job fails and every other job in
    // the workflow is skipped. That happened the day this was added, when
    // three dismissals synced cleanly and their rows stayed put.
    //
    // Which rows go depends on what the dismissal meant, the same distinction
    // check-rows-against-exclusions.mjs enforces: a Top Picks or Coming Soon
    // dismissal is "not interested" and bars those two row types, while a
    // Currently Watching dismissal is "finished" and bars only Currently
    // Watching and In Theaters. Getting that backwards would make finishing a
    // show delete it from the recommendation pool, which is the 2026-08-05
    // conflation bug.
    const notInterested = new Set();
    const finished = new Set();
    for (const m of missing) {
      const section = String(m.section || "").toLowerCase();
      (section.includes("currently watching") ? finished : notInterested).add(normalizeTitle(m.title));
    }
    const barred = {
      "pick-row": notInterested,
      "soon-row": notInterested,
      "watching-row": finished,
      "theater-row": finished,
    };

    let removed = [];
    try {
      const html = readFileSync("index.html", "utf8");
      const result = removeRows(html, ({ rowClass, title }) => barred[rowClass].has(normalizeTitle(title)));
      removed = result.removed;
      if (removed.length) writeFileSync("index.html", result.html);
    } catch (err) {
      console.error(`Dismiss drift check FAILED while editing index.html: ${err.message}`);
      process.exit(1);
    }

    if (removed.length) {
      console.log(`\nRemoved ${removed.length} now-dismissed row(s) from index.html:`);
      for (const r of removed) console.log(`  - ${r.title} (${SECTION_OF[r.rowClass]})`);
    } else {
      console.log(`\nNo rows in index.html needed removing.`);
    }
    return; // exit 0, the caller (CI) diffs the files and opens a PR if either changed
  }

  console.error(`Dismiss drift check FAILED: ${missing.length} title(s) dismissed live but missing from data/EXCLUDED_TITLES.md:\n`);
  for (const m of missing) {
    console.error(`  - "${m.title}" (${m.section || "no section"}, dismissed ${formatDate(m.dismissedAt)})`);
  }
  console.error("\nThese are vulnerable to reappearing in the next Coming Soon/Top Picks rebuild. Re-run with --fix, or add them to data/EXCLUDED_TITLES.md by hand.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Dismiss drift check errored: " + err.message);
  process.exit(1);
});
