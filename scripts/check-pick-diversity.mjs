#!/usr/bin/env node
// scripts/check-pick-diversity.mjs
//
// Fails the build when Top Picks collapses into one or two kinds of thing.
//
// Susan gave this instruction on 2026-07-25: recommendations should be "much
// more diversified", drawing from multiple signature clusters every week
// including at least one long-tail interest. It is recorded in
// data/TASTE_PROFILE.md under Explicit Preferences. On 2026-08-17 she said it
// again, less patiently, after a rebuild produced a page that was almost
// entirely crime and spy. An instruction that has to be repeated is one nothing
// is enforcing.
//
// So this enforces it, cheaply. Every Top Picks row carries a `pick-meta` line
// in a fixed shape:
//
//   Series &middot; British Detective, Scottish Noir, Wry Procedural
//   Film &middot; Music Documentary, Rock History, Archival
//
// The first comma-separated tag after the format word is the row's primary
// cluster. This counts those and fails if the list is too concentrated.
//
// Deliberately loose. It is a trip-wire for "the rebuild drifted back to
// British crime again", not an attempt to score taste. Two thresholds, both
// generous enough that a genuinely varied list always passes:
//
//   - no single cluster may be more than half the list
//   - a list of 5 or more picks must span at least 4 distinct clusters
//
// Under 5 picks the check reports and passes: a short list is a rebuild
// artefact, not evidence of drift, and failing on it would just be noise.
//
// What this does NOT do: judge whether the picks are any good, or whether the
// long-tail interest requirement was met. Cluster names come from copy written
// by the same process that chose the picks, so a rebuild could in principle
// satisfy this by relabelling rather than rebalancing. It catches honest drift,
// which is the failure that has actually happened twice, not adversarial
// gaming.
//
// Usage: node scripts/check-pick-diversity.mjs
// Exits 0 if the spread is acceptable, 1 otherwise. Node 18+.

import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");

const ROW_RE = /<div class="pick-row"[^>]*data-title="([^"]+)"[\s\S]*?<p class="pick-meta">([^<]*)<\/p>/g;

const picks = [];
for (const m of html.matchAll(ROW_RE)) {
  const title = m[1];
  const meta = m[2];
  // "Series &middot; British Detective, Scottish Noir" -> "british detective".
  // index.html contains BOTH the &middot; entity and a literal middot, so split
  // on either. Getting this wrong is silent: the cluster becomes
  // "series · espionage" and every row looks distinct, which is exactly how a
  // diversity check would pass while the list is entirely one genre.
  const parts = meta.split(/&middot;|\u00b7/);
  const afterFormat = parts.length > 1 ? parts.slice(1).join(" ") : meta;
  const cluster = afterFormat.split(",")[0].trim().toLowerCase();
  if (cluster) picks.push({ title, cluster });
}

if (!picks.length) {
  console.error(
    "Pick diversity check FAILED: found no Top Picks rows with a pick-meta line in index.html. Either the markup changed shape and this check is now blind, or Top Picks is empty. Fix the pattern rather than deleting the check.",
  );
  process.exit(1);
}

const counts = new Map();
for (const p of picks) counts.set(p.cluster, (counts.get(p.cluster) || 0) + 1);
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
const [topCluster, topCount] = ranked[0];

const summary = ranked.map(([c, n]) => `${c} x${n}`).join(", ");

if (picks.length < 5) {
  console.log(`Pick diversity check skipped: only ${picks.length} Top Picks row(s), too few to judge drift (${summary}).`);
  process.exit(0);
}

const problems = [];
if (topCount * 2 > picks.length) {
  problems.push(`"${topCluster}" is ${topCount} of ${picks.length} picks, more than half the list.`);
}
if (counts.size < 4) {
  problems.push(`only ${counts.size} distinct cluster(s) across ${picks.length} picks; at least 4 are expected.`);
}

if (problems.length) {
  console.error(`Pick diversity check FAILED: Top Picks has collapsed into too few kinds of thing.\n`);
  for (const p of problems) console.error("  - " + p);
  console.error(`\n  Spread: ${summary}`);
  console.error(
    "\ndata/TASTE_PROFILE.md's Explicit Preferences record this instruction twice, 2026-07-25 and 2026-08-17: Top Picks must draw from multiple signature clusters every week, including at least one long-tail interest (music documentary, food, art and design, garden and country, and the six stated interests added 2026-08-17). Sixteen years of history has real breadth; a list that reads as one genre is not using it. Rebuild with a wider spread rather than widening the thresholds here.",
  );
  process.exit(1);
}

console.log(`Pick diversity check passed: ${picks.length} Top Picks across ${counts.size} clusters, largest is "${topCluster}" at ${topCount} (${summary}).`);
