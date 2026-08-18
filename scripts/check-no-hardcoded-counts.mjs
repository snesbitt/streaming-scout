#!/usr/bin/env node
// scripts/check-no-hardcoded-counts.mjs
//
// Fails the build if a public page states a raw count of titles watched.
//
// CLAUDE.md's Conventions section has said this since 2026-07: "Don't hardcode
// a title count. The homepage banner and About/Roadmap used to state a
// specific 'N titles analyzed' and drifted out of sync with each other. Both
// were reworded to describe the watch history qualitatively instead."
//
// The convention was written down and then broken anyway. On 2026-08-17
// roadmap.html was still advertising a "919-title, 2010-2026 log" while the
// real log held 958 entries, because only one page's rebuild step ever
// updated that number and nothing else looked at it. That is exactly the
// failure the convention describes, repeated, which is what a rule with no
// check does.
//
// The point is not that 958 is a better number than 919. It is that the
// number is only correct on the day it is written, and no reader can tell
// which day that was. Describe the history qualitatively ("every title back
// to 2010", "a multi-year history") and it cannot go stale.
//
// What this catches: "919-title", "919 titles", "919 titles analyzed",
// "of 919 titles". What it deliberately does NOT catch: years (2010, 2026),
// percentages, prices, season numbers, or the tracked-service count, which is
// a small, stable number that check-content-drift.mjs already verifies
// against data/STREAMING_PROFILE.md rather than banning.
//
// Usage: node scripts/check-no-hardcoded-counts.mjs
// Exits 0 if clean, 1 otherwise. Node 18+.

import { readFileSync } from "node:fs";

const FILES = ["index.html", "about.html", "roadmap.html", "guide.html", "start.html"];

// A count of 100 or more immediately attached to the word "title(s)". Small
// numbers are left alone: "one title", "13 titles" in a Top Picks context is
// a description of the page you are looking at, not a claim about history.
const PATTERNS = [
  /\b(\d{3,5})\s*[-‑–]?\s*title\b/i,
  /\b(\d{3,5})\s+titles\b/i,
];

const problems = [];
let checked = 0;

for (const file of FILES) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  checked += 1;

  text.split("\n").forEach((line, i) => {
    for (const pattern of PATTERNS) {
      const m = pattern.exec(line);
      if (!m) continue;
      const col = m.index;
      problems.push({ file, line: i + 1, found: m[0].trim(), excerpt: line.slice(Math.max(0, col - 50), col + 60).trim() });
    }
  });
}

if (!checked) {
  console.error("Hardcoded-count check FAILED: none of the expected pages could be read. Fix the file list rather than deleting the check.");
  process.exit(1);
}

if (problems.length) {
  console.error(`Hardcoded-count check FAILED: ${problems.length} hardcoded watch-history count(s) on a public page:\n`);
  for (const p of problems) console.error(`  - ${p.file}:${p.line} states "${p.found}"\n      ...${p.excerpt}...`);
  console.error(
    "\nCLAUDE.md's Conventions section rules this out, and the reason is drift: only one page's rebuild step ever updates the number, so within a week it disagrees with the log and with the other pages, and a reader has no way to tell which is right. Describe the history qualitatively instead, for example \"every title back to 2010\" or \"a multi-year history\". If a real number genuinely has to appear somewhere, give it its own check against data/ the way check-content-drift.mjs does for tracked services.",
  );
  process.exit(1);
}

console.log(`Hardcoded-count check passed: ${checked} public page(s) describe the watch history without a stale-able title count.`);
