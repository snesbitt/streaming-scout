#!/usr/bin/env node
// scripts/check-poster-coverage.mjs
//
// Fails the build if any title row in index.html would render as a bare
// monogram instead of real poster art.
//
// This exists because artwork gaps have been found by Susan, on the live
// site, four separate times (2026-08-05 Lioness, 2026-08-06 Kill Jackie and
// Ted Lasso S4, 2026-08-08 the five-title sweep, 2026-08-17 thirteen rows at
// once: five Top Picks from a rebuild plus eight Coming Soon). Every one of
// those was noticed by a person looking at the page. Nothing in the repo
// ever checked, so the next gap was always going to be found the same way.
//
// `scripts/smoke.mjs` covers exactly one section, Currently Watching, and
// only against the live site on a weekly schedule. This is the offline
// version across every section, running in `npm test` on every push and pull
// request, so a rebuild that adds picks without art cannot land in the first
// place.
//
// What it does NOT check: that the image URL actually resolves. That needs a
// network fetch and a browser, and is smoke.mjs's job for the live site.
// This is the cheap structural check, which is the one that has actually
// been missing.
//
// Declaring a genuine gap. Some titles really have no art in circulation yet
// (Animals and Here Comes the Flood were both in that state for weeks: no
// announced date, no marketing campaign, nothing to source). That is a fine
// reason to ship a monogram, but it should be a stated decision rather than
// an oversight, so put a marker comment immediately before the row:
//
//   <!-- no-art: no key art in circulation yet, re-check after the date lands -->
//
// The check then passes for that row and the reason is visible in the diff.
//
// Usage: node scripts/check-poster-coverage.mjs
// Exits 0 if every row has art or a declared reason, 1 otherwise. Node 18+.

import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");

const ROW_RE = /<div class="(watching-row|pick-row|soon-row|theater-row)"[^>]*data-title="([^"]+)"[^>]*>([\s\S]{0,900}?)<div class="(?:pick-body|soon-body|watching-info|theater-body)/g;

const SECTION = {
  "watching-row": "Currently Watching",
  "pick-row": "Top Picks",
  "soon-row": "Coming Soon",
  "theater-row": "In Theaters",
};

const missing = [];
const declared = [];
let checked = 0;

for (const match of html.matchAll(ROW_RE)) {
  const [full, rowClass, title, body] = match;
  checked += 1;

  if (/<img\b/.test(body)) continue;

  // Look just before the row for an explicit "this one has no art" marker.
  const before = html.slice(Math.max(0, match.index - 400), match.index);
  const marker = /<!--\s*no-art:\s*([^>]*?)-->\s*$/.exec(before);
  if (marker) {
    declared.push({ title, section: SECTION[rowClass], reason: marker[1].trim() });
    continue;
  }

  missing.push({ title, section: SECTION[rowClass] });
}

if (!checked) {
  console.error(
    "Poster coverage check FAILED: matched zero rows in index.html. The row markup has probably changed shape and this check is now blind. Fix the pattern rather than deleting the check.",
  );
  process.exit(1);
}

if (missing.length) {
  console.error(`Poster coverage check FAILED: ${missing.length} row(s) would render as a bare monogram:\n`);
  for (const m of missing) console.error(`  - "${m.title}" (${m.section})`);
  console.error(
    "\nSource real key art before shipping these. What works: themoviedb.org has a poster for essentially every title here, including unreleased ones, and its CDN (image.tmdb.org) hotlinks fine from the site. Official press sites (Apple TV Press, Amazon MGM Studios, PBS, Paramount Press Express, MHz Choice) are the other reliable source. Wikipedia and IMDb are blocked or cache-only from a Claude session, so do not plan around them. Verify the image actually loads and shows the right title before wiring it in, and never guess a URL.",
  );
  console.error(
    '\nIf a title genuinely has no art in circulation yet, say so instead of leaving it silent: put <!-- no-art: reason --> immediately before the row.',
  );
  process.exit(1);
}

const suffix = declared.length
  ? `, ${declared.length} declared as having no art yet (${declared.map((d) => d.title).join(", ")})`
  : "";
console.log(`Poster coverage check passed: all ${checked} title row(s) in index.html have real poster art${suffix}.`);
