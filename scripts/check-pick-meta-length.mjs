#!/usr/bin/env node
// scripts/check-pick-meta-length.mjs
//
// The 2026-08-08 "copy tightening" pass had Susan flag five pick-meta lines
// by hand as too verbose (full cast lists, source-attribution clauses,
// leftover internal process commentary like "not yet scored against your
// taste profile"). This is a cheap, honest trip-wire for the same drift:
// not a style/taste judge, just two mechanical checks that catch the
// concrete symptoms that pass fixed.
//
// Offline, zero dependencies — part of `npm test`.

import { readFileSync } from "node:fs";

// Calibrated against the real live content (2026-08-16): 34 pick-meta
// lines ranged 25-186 chars (median 61, p90 127) — plenty of legitimate
// terse-but-information-dense lines run well past 100 chars (cast names,
// a sourcing note, a confirmed date). A tight threshold produced 8 false
// positives against real approved copy on first run, which would make this
// check noise, not signal. 220 sits just above the current real max (186)
// as a loose backstop against a genuinely runaway line (the "full sentence
// with a novel citation" class from 2026-08-08) — the banned-phrase check
// below is the check actually calibrated to catch that incident's root
// cause (leftover internal commentary), and doesn't depend on guessing a
// length that will still be right after the next legitimate long entry.
const MAX_LENGTH = 220;
const BANNED_PHRASES = [
  "not yet scored",
  "added directly",
  "not run through a full taste-profile rescore",
  "not part of a full rebuild",
];

const html = readFileSync("index.html", "utf8");
const matches = [...html.matchAll(/<p class="pick-meta">([^<]*)<\/p>/g)].map((m) => m[1]);

let failures = [];

for (const text of matches) {
  if (text.length > MAX_LENGTH) {
    failures.push(`too long (${text.length} chars, max ${MAX_LENGTH}): "${text}"`);
  }
  for (const phrase of BANNED_PHRASES) {
    if (text.toLowerCase().includes(phrase)) {
      failures.push(`contains internal-process commentary ("${phrase}"): "${text}"`);
    }
  }
}

if (failures.length) {
  console.error(`pick-meta copy check FAILED (${failures.length} issue(s)):\n`);
  for (const f of failures) console.error("  - " + f);
  console.error("\nSee CLAUDE.md's 2026-08-08 'Coming Soon copy tightened' entry for the house style this is checking against.");
  process.exit(1);
}

console.log(`pick-meta copy check passed: ${matches.length} line(s) checked, all within ${MAX_LENGTH} chars with no internal-process commentary.`);
