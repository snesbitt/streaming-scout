#!/usr/bin/env node
// Content-drift check: catches the exact bug class this project has hit
// by hand at least three times (About page copy silently going stale
// after data/STREAMING_PROFILE.md changes, e.g. the "4 services tracked"
// vs. real-7 gap documented in claude/travel-intelligence-build-log.md,
// 2026-08-06). Zero external dependencies, zero secrets needed, safe to
// run in CI on a schedule or on every push.
//
// Add a new check here whenever a future session catches a new instance
// of "the page said X but the data said Y" by hand, so it stops needing
// to be caught by hand.

import { readFileSync } from "node:fs";

let failures = [];

function section(md, heading) {
  // Deliberately not using a regex "$" end anchor here: in multiline mode
  // "$" matches the end of ANY line, not the end of the string, so a lazy
  // "(?=\n## |$)" lookahead would stop at the first line break instead of
  // running to the real end of a heading-less final section. Find the
  // start/end boundaries with plain string search instead.
  const startMarker = "## " + heading;
  const start = md.indexOf(startMarker);
  if (start === -1) return "";
  const bodyStart = md.indexOf("\n", start) + 1;
  const nextHeading = md.indexOf("\n## ", bodyStart);
  return nextHeading === -1 ? md.slice(bodyStart) : md.slice(bodyStart, nextHeading);
}

// Count the service bullets in a section, whatever their indentation.
//
// This used to be /^- /gm, which quietly depended on Hulu being written as a
// nested "  - Hulu" under Services Tracked: it was excluded from the count,
// the count matched about.html, and the check passed for the wrong reason.
// Un-indenting that one line by two spaces would have changed the answer
// without anyone touching a service. Leading whitespace and the bullet
// character are both ignored here, so how a line is laid out cannot change
// what it counts as. Continuation lines of a wrapped bullet do not start with
// a bullet marker, so they are still skipped.
function countBullets(text) {
  return text
    .split("\n")
    .filter((line) => /^[ \t]*[-*+][ \t]+\S/.test(line)).length;
}

// Check 1: About page's "N services tracked" stat matches the real count
// in STREAMING_PROFILE.md (Services Tracked + Premium/Channel Add-ons).
{
  const profile = readFileSync("data/STREAMING_PROFILE.md", "utf8");
  const about = readFileSync("about.html", "utf8");

  const tracked = countBullets(section(profile, "Services Tracked"));
  const addons = countBullets(
    section(
      profile,
      "Premium/Channel Add-ons (tracked for Coming Soon schedules, not watch-history sync)",
    ),
  );
  const realCount = tracked + addons;

  // A heading that gets renamed returns an empty section, which would read as
  // a legitimate count of zero and compare against whatever about.html says.
  // Zero services is never true here, so treat it as this check being stale.
  if (tracked === 0 || addons === 0) {
    failures.push(
      `data/STREAMING_PROFILE.md: found ${tracked} service(s) under "Services Tracked" and ${addons} ` +
        "under Premium/Channel Add-ons. One of those sections is missing, renamed or empty, so the " +
        "count can't be trusted. Fix the file or this check's heading strings, whichever moved.",
    );
  }

  const statMatch = about.match(
    /<div class="stat-tile__num">(\d+)<\/div><div class="stat-tile__label">services tracked<\/div>/,
  );

  if (!statMatch) {
    failures.push(
      "about.html: could not find the \"services tracked\" stat tile at all (markup may have changed; update this check's regex).",
    );
  } else {
    const shownCount = Number(statMatch[1]);
    if (shownCount !== realCount) {
      failures.push(
        `about.html says "${shownCount} services tracked" but data/STREAMING_PROFILE.md lists ${realCount} ` +
          `(${tracked} under Services Tracked + ${addons} under Premium/Channel Add-ons). ` +
          `Update about.html's stat tile, or this check, whichever is actually stale.`,
      );
    }
  }
}

if (failures.length) {
  console.error("Content drift check FAILED:\n");
  for (const f of failures) console.error("  - " + f);
  console.error("\nSee claude/travel-intelligence-build-log.md (2026-08-06 entries) for why this check exists.");
  process.exit(1);
} else {
  console.log("Content drift check passed: about.html's tracked-service count matches data/STREAMING_PROFILE.md.");
}
