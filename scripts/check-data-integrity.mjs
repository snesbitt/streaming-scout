#!/usr/bin/env node
// scripts/check-data-integrity.mjs
//
// A trip-wire for the failure this project has actually suffered, which was
// not "no copy existed" but "the loss went unnoticed."
//
// On 2026-07-21 the whole data/ folder was lost: a scheduled task had been
// pointing at a dead ephemeral session folder for weeks, and the log, taste
// profile and exclusion list were quietly rebuilt as empty or near-empty
// files. Moving data/ into this repo (same date) means git now keeps every
// version, so the *copy* problem is solved. What git does not do is notice.
// A commit that empties STREAMING_LOG.md is just as green as any other, and
// EXCLUDED_TITLES.md still carries a "data loss notice" section recording
// that the recovered list is very likely incomplete relative to before.
//
// So this check asserts each data file still looks like itself: present,
// non-trivial, opening with its expected top-level heading, and not
// dramatically smaller than the last time the manifest was refreshed. It is
// offline and has no network or DOM dependency, so it runs in `npm test` on
// every push and pull request, before anything can land.
//
// The manifest, data/INTEGRITY_MANIFEST.json, is committed. Shrinking a file
// on purpose is fine; it just has to be deliberate:
//
//   node scripts/check-data-integrity.mjs --update
//
// which rewrites the manifest so the drop shows up as a reviewable diff in
// the same commit as the change, rather than being absorbed silently.
//
// Deliberately NOT a checksum or exact-match check. These files are edited
// constantly by real sessions; an exact check would fail every week and be
// ignored within a month, which is worse than no check. The thresholds below
// are wide enough that ordinary editing never trips them and narrow enough
// that a truncation or a blanked file always does.
//
// Usage:
//   node scripts/check-data-integrity.mjs            check, exit 1 on failure
//   node scripts/check-data-integrity.mjs --update    refresh the manifest
// Node 18+.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MANIFEST_PATH = "data/INTEGRITY_MANIFEST.json";

// Every file data/ is expected to hold, with the top-level heading each one
// must still open with. A file whose heading changed is either a different
// file or a rewritten one; both deserve a human look.
const EXPECTED = {
  "data/STREAMING_LOG.md": "# Streaming Log",
  "data/TASTE_PROFILE.md": "# Taste Profile",
  "data/STREAMING_PROFILE.md": "# Streaming Profile",
  "data/EXCLUDED_TITLES.md": "# Excluded Titles",
};

// A file may lose this much against the manifest before the check fires.
// 0.7 means "a 30% drop is fine, a 30%+ drop needs explaining." Calibrated
// against real edit history rather than guessed: the largest single-session
// shrink in this repo's data files is well under 10%.
const SHRINK_TOLERANCE = 0.7;

// Absolute floors, independent of the manifest. These catch the July failure
// mode directly: a file that exists but has been blanked or reduced to a
// stub still fails even if the manifest were somehow also wrong.
const MIN_BYTES = 500;
const MIN_LINES = 10;

function measure(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  return {
    bytes: Buffer.byteLength(text, "utf8"),
    lines: lines.length,
    // "- **Title**" is the entry shape both the log and the exclusion list
    // use, so this counts real records rather than prose. Files that don't
    // use it simply record 0 and the entry check is skipped for them.
    entries: lines.filter((l) => l.startsWith("- **")).length,
    headings: lines.filter((l) => l.startsWith("## ")).length,
    firstHeading: (lines.find((l) => l.trim() !== "") || "").trim(),
  };
}

function buildManifest() {
  const files = {};
  for (const path of Object.keys(EXPECTED)) {
    const m = measure(path);
    files[path] = {
      bytes: m.bytes,
      lines: m.lines,
      entries: m.entries,
      headings: m.headings,
    };
  }
  return {
    note:
      "Refreshed by scripts/check-data-integrity.mjs --update. Records how big each data file was when it was last known good, so a later truncation is caught. Shrinking a file on purpose is fine; refresh this in the same commit so the drop is reviewable.",
    updatedAt: new Date().toISOString().slice(0, 10),
    files,
  };
}

if (process.argv.includes("--update")) {
  const missing = Object.keys(EXPECTED).filter((p) => !existsSync(p));
  if (missing.length) {
    console.error(
      "Refusing to refresh the manifest while data files are missing: " + missing.join(", "),
    );
    process.exit(1);
  }
  const manifest = buildManifest();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Manifest refreshed (${MANIFEST_PATH}):`);
  for (const [path, m] of Object.entries(manifest.files)) {
    console.log(`  ${path}: ${m.bytes} bytes, ${m.lines} lines, ${m.entries} entries, ${m.headings} sections`);
  }
  process.exit(0);
}

const failures = [];

if (!existsSync(MANIFEST_PATH)) {
  console.error(
    `Data integrity check FAILED: ${MANIFEST_PATH} is missing.\n\n` +
      "Create it with: node scripts/check-data-integrity.mjs --update",
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

for (const [path, heading] of Object.entries(EXPECTED)) {
  if (!existsSync(path)) {
    failures.push(`${path} is MISSING entirely.`);
    continue;
  }

  const now = measure(path);
  const was = (manifest.files && manifest.files[path]) || null;

  if (now.bytes === 0) {
    failures.push(`${path} is EMPTY (0 bytes).`);
    continue;
  }
  if (now.bytes < MIN_BYTES) {
    failures.push(`${path} is only ${now.bytes} bytes, below the ${MIN_BYTES}-byte floor. This is what a blanked or stubbed file looks like.`);
    continue;
  }
  if (now.lines < MIN_LINES) {
    failures.push(`${path} has only ${now.lines} lines, below the ${MIN_LINES}-line floor.`);
    continue;
  }
  if (now.firstHeading !== heading) {
    failures.push(`${path} should open with "${heading}" but opens with "${now.firstHeading}". Either it was rewritten or it is not the file it claims to be.`);
    continue;
  }

  if (!was) {
    failures.push(`${path} has no entry in ${MANIFEST_PATH}. Refresh the manifest so it is covered.`);
    continue;
  }

  const floor = (recorded) => Math.floor(recorded * SHRINK_TOLERANCE);
  if (now.bytes < floor(was.bytes)) {
    failures.push(`${path} shrank from ${was.bytes} to ${now.bytes} bytes (below the ${floor(was.bytes)}-byte floor from ${manifest.updatedAt}).`);
  }
  if (now.lines < floor(was.lines)) {
    failures.push(`${path} shrank from ${was.lines} to ${now.lines} lines (below the ${floor(was.lines)}-line floor from ${manifest.updatedAt}).`);
  }
  if (was.entries > 0 && now.entries < floor(was.entries)) {
    failures.push(`${path} lost records: ${was.entries} entries at ${manifest.updatedAt}, ${now.entries} now (floor ${floor(was.entries)}).`);
  }
  if (was.headings > 0 && now.headings < floor(was.headings)) {
    failures.push(`${path} lost sections: ${was.headings} at ${manifest.updatedAt}, ${now.headings} now (floor ${floor(was.headings)}).`);
  }
}

const unknown = Object.keys(manifest.files || {}).filter((p) => !(p in EXPECTED));
for (const path of unknown) {
  failures.push(`${MANIFEST_PATH} records ${path}, which this check no longer knows about. Either the file was removed without updating EXPECTED, or the manifest is stale.`);
}

if (failures.length) {
  console.error(`Data integrity check FAILED: ${failures.length} problem(s) with data/:\n`);
  for (const f of failures) console.error("  - " + f);
  console.error(
    "\ndata/ holds the only permanent record of what Susan has watched, what she has excluded, and the taste profile derived from both. The folder was lost once already (2026-07-21) and the loss was not noticed at the time. Do not update the manifest to make this pass unless the shrink is genuinely intended; if it is, run `node scripts/check-data-integrity.mjs --update` in the same commit so the drop is visible in review. Every prior version is recoverable with `git log -p -- data/`.",
  );
  process.exit(1);
}

const summary = Object.entries(EXPECTED)
  .map(([path]) => {
    const m = measure(path);
    return `${path.replace("data/", "")} ${m.bytes}B/${m.lines}L`;
  })
  .join(", ");
console.log(`Data integrity check passed: all 4 data files present and intact against the ${manifest.updatedAt} manifest (${summary}).`);
