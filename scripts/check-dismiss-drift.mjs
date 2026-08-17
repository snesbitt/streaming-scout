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

import { readFileSync, appendFileSync } from "node:fs";

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
    return; // exit 0 — caller (CI) diffs the file and opens a PR if it changed
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
