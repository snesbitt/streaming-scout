#!/usr/bin/env node
// scripts/check-picks-against-log.mjs
//
// Fails the build when Top Picks recommends something Susan has already
// watched, according to her own watch log.
//
// This exists because the 2026-08-17 rebuild did exactly that, three times in
// one list of twelve:
//
//   Abstract: The Art of Design  Netflix, 9 plays, 2017-02-20 to 2019-09-28
//   The Old Man                  Prime, 2 plays, 2022-07-18 to 2025-05-03
//   Call My Agent!               Prime, 2 plays, 2026-07-09 to 2026-07-14
//
// The last one had finished five weeks before it was recommended back to her.
// All three were sitting in data/STREAMING_LOG.md the whole time, in the same
// repo, and nothing compared the two files. Susan found the symptom by marking
// titles watched on the live site, which is the slowest possible way for this
// to surface and puts the work on her.
//
// What counts as a match. Titles are normalised (lowercased, punctuation and
// articles stripped, season markers removed) and compared on the base title.
// A pick with NO season marker that matches a logged base title is a failure:
// the pick is the same thing she already watched.
//
// A pick WITH a season marker is different, and is deliberately allowed. A new
// season of a show she has finished is a good recommendation, not a bug
// (Reacher season 4 after seasons 1 to 3 is the obvious case). It only fails
// when that exact season is already in the log.
//
// Declaring a deliberate rewatch. Occasionally recommending a rewatch is a
// real editorial choice. Say so rather than tripping the check by accident:
//
//   <!-- rewatch: comfort pick, she has asked for these before -->
//
// put immediately before the row. The reason then shows up in the diff.
//
// What this does NOT do: judge whether an unwatched pick is any good, or catch
// a title watched off-platform and never logged. The log is the only source of
// truth it has, so a gap in the log is a gap here.
//
// Usage: node scripts/check-picks-against-log.mjs
// Exits 0 if no pick duplicates the log, 1 otherwise. Node 18+.

import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const log = readFileSync("data/STREAMING_LOG.md", "utf8");

const SEASON_RE = /[,(]?\s*(?:season|series)\s+(\d+)\s*\+?\)?|\bs(\d+)\b|\(seasons?\s+([\d–—-]+)\+?\)/i;

function seasonOf(title) {
  const m = SEASON_RE.exec(title);
  if (!m) return null;
  const raw = m[1] || m[2] || m[3] || "";
  const first = /(\d+)/.exec(raw);
  return first ? Number(first[1]) : null;
}

function base(title) {
  return title
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(SEASON_RE, " ")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .trim();
}

// Logged watch history: lines like "- **Title** · Service · 2 plays · dates"
const logged = new Map();
for (const line of log.split("\n")) {
  const m = /^\s*-\s*\*\*(.+?)\*\*/.exec(line);
  if (!m) continue;
  const title = m[1];
  const b = base(title);
  if (!b) continue;
  const entry = logged.get(b) || { titles: [], seasons: new Set() };
  entry.titles.push(title.trim());
  const s = seasonOf(title);
  if (s !== null) entry.seasons.add(s);
  logged.set(b, entry);
}

const ROW_RE = /<div class="pick-row"[^>]*data-title="([^"]+)"/g;

const problems = [];
const allowedSeasons = [];
const declared = [];
let checked = 0;

for (const match of html.matchAll(ROW_RE)) {
  const title = match[1];
  checked += 1;

  const before = html.slice(Math.max(0, match.index - 400), match.index);
  const marker = /<!--\s*rewatch:\s*([^>]*?)-->\s*$/.exec(before);
  if (marker) {
    declared.push({ title, reason: marker[1].trim() });
    continue;
  }

  const hit = logged.get(base(title));
  if (!hit) continue;

  const pickSeason = seasonOf(title);
  if (pickSeason === null) {
    problems.push({ title, why: `already in the watch log as ${hit.titles.map((t) => `"${t}"`).join(", ")}` });
  } else if (hit.seasons.has(pickSeason)) {
    problems.push({ title, why: `season ${pickSeason} is already in the watch log as ${hit.titles.map((t) => `"${t}"`).join(", ")}` });
  } else {
    allowedSeasons.push(title);
  }
}

if (!checked) {
  console.error(
    "Picks-against-log check FAILED: matched zero pick-row entries in index.html. The markup has probably changed shape and this check is now blind. Fix the pattern rather than deleting the check.",
  );
  process.exit(1);
}

if (!logged.size) {
  console.error(
    "Picks-against-log check FAILED: parsed zero entries out of data/STREAMING_LOG.md. The log format has probably changed and this check is now blind. Fix the pattern rather than deleting the check.",
  );
  process.exit(1);
}

if (problems.length) {
  console.error(`Picks-against-log check FAILED: ${problems.length} Top Pick(s) recommend something already watched:\n`);
  for (const p of problems) console.error(`  - "${p.title}": ${p.why}`);
  console.error(
    "\nA recommendation for something already finished is the most obvious kind of wrong this page can be, and data/STREAMING_LOG.md is right here in the repo. Drop the pick and choose something else, or, if the rewatch is deliberate, put <!-- rewatch: reason --> immediately before the row so the choice is visible in the diff.",
  );
  process.exit(1);
}

const notes = [];
if (allowedSeasons.length) notes.push(`${allowedSeasons.length} later-season pick(s) allowed (${allowedSeasons.join(", ")})`);
if (declared.length) notes.push(`${declared.length} declared rewatch(es) (${declared.map((d) => d.title).join(", ")})`);
console.log(
  `Picks-against-log check passed: ${checked} Top Pick(s) checked against ${logged.size} logged title(s)${notes.length ? ", " + notes.join(", ") : ""}.`,
);
