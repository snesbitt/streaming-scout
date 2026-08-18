#!/usr/bin/env node
// scripts/check-no-em-dash.mjs
//
// Fails the build if an em dash reaches a page Susan reads.
//
// This repo has exactly one hard style rule, and it is hers: no em dashes,
// unconditionally. It is recorded in CLAUDE.md and has been caught by hand at
// least once (2026-08-09, in a draft of two data-file entries, fixed before
// commit). Nothing enforced it.
//
// It had in fact been broken for some time, in two ways that a casual look
// would not catch. index.html carried five literal em dashes, two in visible
// Coming Soon copy and three inside the clipboard messages the buttons
// generate, which are text Susan pastes into a chat as if she had typed it.
// about.html and guide.html carried three more as `&mdash;` entities, which
// render identically and are invisible to a grep for the character. Both forms
// are checked here for that reason.
//
// Scope is the four public pages and the stylesheet: what a visitor reads.
// Deliberately NOT data/ or CLAUDE.md, which carry em dashes in older entries
// and in a portfolio-wide block synced from another repo. Retroactively
// rewriting historical records to satisfy a style rule would be worse than the
// inconsistency, and a check that fails on unfixable history gets disabled
// within a week. If those files are ever cleaned up, widen FILES then.
//
// Usage: node scripts/check-no-em-dash.mjs
// Exits 0 if clean, 1 otherwise. Node 18+.

import { readFileSync } from "node:fs";

const FILES = ["index.html", "about.html", "roadmap.html", "guide.html", "start.html", "style.css"];

const problems = [];
let checked = 0;

for (const file of FILES) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // an optional page that does not exist is not a failure
  }
  checked += 1;

  text.split("\n").forEach((line, i) => {
    for (const [pattern, label] of [[/—/g, "em dash"], [/&mdash;/gi, "&mdash; entity"], [/&#8212;|&#x2014;/gi, "numeric em dash entity"]]) {
      if (!pattern.test(line)) continue;
      pattern.lastIndex = 0;
      const col = line.search(pattern);
      problems.push({ file, line: i + 1, label, excerpt: line.slice(Math.max(0, col - 45), col + 45).trim() });
    }
  });
}

if (!checked) {
  console.error("Em-dash check FAILED: none of the expected pages could be read. Fix the file list rather than deleting the check.");
  process.exit(1);
}

if (problems.length) {
  console.error(`Em-dash check FAILED: ${problems.length} em dash(es) in text Susan reads:\n`);
  for (const p of problems) console.error(`  - ${p.file}:${p.line} (${p.label})\n      ...${p.excerpt}...`);
  console.error(
    "\nThis repo's one hard style rule is no em dashes, unconditionally. Use a comma, a colon, parentheses, or two sentences. Note that `&mdash;` and `&#8212;` render as one and count the same; three had got in that way, which is why this check looks for the entities too.",
  );
  process.exit(1);
}

console.log(`Em-dash check passed: ${checked} public file(s) clean of em dashes, in character and entity form.`);
