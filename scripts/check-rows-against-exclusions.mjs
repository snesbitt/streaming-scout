#!/usr/bin/env node
// scripts/check-rows-against-exclusions.mjs
//
// Fails the build when index.html still shows a title Susan has dismissed.
//
// The gap this closes. Dismissing a title on the live site writes to the
// dismiss Blobs store, and the weekly CI job carries that into
// data/EXCLUDED_TITLES.md so the next rebuild will not offer it again. Neither
// step removes the row from index.html. The live page hides it client-side, so
// nothing looks wrong, but the markup is still there and comes back the moment
// a browser has no synced state.
//
// This was found on 2026-08-17: eight of twelve Top Picks were dead, six of
// them by Susan's own dismiss or watched clicks, all still in the file. The
// Coming Soon section had the same problem in the same sitting.
//
// Why it compares against EXCLUDED_TITLES.md rather than the live API: this
// runs offline, in npm test, on every push and pull request. The live store is
// already carried into that file by the dismiss-drift job, so the file is the
// repo's own record and the right thing for an offline check to trust. A
// dismissal that has not synced yet is simply not visible here, and that is
// the correct division of labour rather than a gap.
//
// What counts as a conflict. A dismissal carries a section, and the section is
// what gives it meaning (this distinction is load-bearing, see CLAUDE.md
// 2026-08-05):
//
//   Top Picks / Coming Soon  =  "not interested". Bars the title from Top
//                               Picks and Coming Soon rows.
//   Currently Watching       =  "finished". Bars it from Currently Watching
//                               and In Theaters rows only. It is not a
//                               rejection and must not bar a future pick.
//
// Declaring a deliberate re-add. If a dismissed title is being put back on
// purpose, say so instead of tripping the check:
//
//   <!-- re-added: new season, the dismissal was for season 1 -->
//
// immediately before the row, and the reason lands in the diff.
//
// Usage: node scripts/check-rows-against-exclusions.mjs
// Exits 0 if no row conflicts with an exclusion, 1 otherwise. Node 18+.

import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const excluded = readFileSync("data/EXCLUDED_TITLES.md", "utf8");

function normalize(title) {
  return title
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Entries look like: - **Title** - Section - dismissed on-site YYYY-MM-DD
// The separator has been both a hyphen and an em dash over time, so match the
// title first and then look for the section anywhere in the rest of the line.
const NOT_INTERESTED = new Map();
const FINISHED = new Map();

for (const line of excluded.split("\n")) {
  const m = /^\s*-\s*\*\*(.+?)\*\*(.*)$/.exec(line);
  if (!m) continue;
  const title = m[1].trim();
  const rest = m[2].toLowerCase();
  const key = normalize(title);
  if (!key) continue;
  if (rest.includes("currently watching")) FINISHED.set(key, title);
  else NOT_INTERESTED.set(key, title);
}

const BARS = {
  "pick-row": { map: NOT_INTERESTED, section: "Top Picks", meaning: "not interested" },
  "soon-row": { map: NOT_INTERESTED, section: "Coming Soon", meaning: "not interested" },
  "watching-row": { map: FINISHED, section: "Currently Watching", meaning: "finished" },
  "theater-row": { map: FINISHED, section: "In Theaters", meaning: "finished" },
};

const ROW_RE = /<div class="(watching-row|pick-row|soon-row|theater-row)"[^>]*data-title="([^"]+)"/g;

const conflicts = [];
const declared = [];
let checked = 0;

for (const match of html.matchAll(ROW_RE)) {
  const [, rowClass, title] = match;
  checked += 1;

  const before = html.slice(Math.max(0, match.index - 400), match.index);
  const marker = /<!--\s*re-added:\s*([^>]*?)-->\s*$/.exec(before);
  if (marker) {
    declared.push({ title, reason: marker[1].trim() });
    continue;
  }

  const rule = BARS[rowClass];
  const hit = rule.map.get(normalize(title));
  if (hit) conflicts.push({ title, section: rule.section, listed: hit, meaning: rule.meaning });
}

if (!checked) {
  console.error(
    "Rows-against-exclusions check FAILED: matched zero title rows in index.html. The markup has probably changed shape and this check is now blind. Fix the pattern rather than deleting the check.",
  );
  process.exit(1);
}

if (!NOT_INTERESTED.size && !FINISHED.size) {
  console.error(
    "Rows-against-exclusions check FAILED: parsed zero entries out of data/EXCLUDED_TITLES.md. The file format has probably changed and this check is now blind. Fix the pattern rather than deleting the check.",
  );
  process.exit(1);
}

if (conflicts.length) {
  console.error(`Rows-against-exclusions check FAILED: ${conflicts.length} row(s) show a title Susan has dismissed:\n`);
  for (const c of conflicts) {
    console.error(`  - "${c.title}" is still a ${c.section} row, but is listed in data/EXCLUDED_TITLES.md as "${c.listed}" (${c.meaning}).`);
  }
  console.error(
    "\nThe live page hides these client-side, so the page looks fine while the markup is still wrong. Delete the row. If it is being re-added deliberately, put <!-- re-added: reason --> immediately before it so the choice shows up in the diff.",
  );
  process.exit(1);
}

const suffix = declared.length ? `, ${declared.length} declared re-add(s) (${declared.map((d) => d.title).join(", ")})` : "";
console.log(
  `Rows-against-exclusions check passed: ${checked} row(s) checked against ${NOT_INTERESTED.size} not-interested and ${FINISHED.size} finished exclusion(s)${suffix}.`,
);
