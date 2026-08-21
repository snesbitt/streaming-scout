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

// Check 2: guide.html names every service that has a dedicated Coming Soon
// source in STREAMING_PROFILE.md.
//
// Caught by hand 2026-08-19. The per-service sources were researched and
// written down on 2026-08-16 (MGM+ and Paramount+ were the two that had been
// missing, and finding them closed roadmap Phase 10), but guide.html step 06
// still listed the pre-08-16 set and went on claiming Coming Soon drew from
// six sources when it drew from ten. A visitor reading the guide was being
// told something that had been untrue for three days. Exactly the bug class
// this file exists for, so it gets a check rather than another manual fix.
//
// The section heading carries a date, so it is located by its stable words
// rather than the full string: re-dating the entry must not silently disable
// this.
{
  const profile = readFileSync("data/STREAMING_PROFILE.md", "utf8");
  const guide = readFileSync("guide.html", "utf8");

  const headingLine = profile
    .split("\n")
    .find((line) => line.startsWith("## ") && line.includes("Coming Soon sources"));

  if (!headingLine) {
    failures.push(
      'data/STREAMING_PROFILE.md: no "## ... Coming Soon sources ..." heading found. ' +
        "It was renamed or removed; update this check or restore the heading.",
    );
  } else {
    const body = section(profile, headingLine.slice(3));
    // Bold lead-in on each bullet is the service name: "- **MGM+** ...".
    const services = [...body.matchAll(/^[ \t]*[-*+][ \t]+\*\*(.+?)\*\*/gm)].map((m) => m[1].trim());

    // Every bullet in the section must yield a name. Checking only that the
    // list is non-empty is not enough, and this file already learned that
    // lesson once: Check 1's original /^- /gm quietly depended on one line's
    // indentation and passed for the wrong reason for weeks. The same shape
    // applies here. If MGM+ and Paramount+ alone lost their bold lead-in, the
    // other four bullets would still parse, the list would still be non-empty,
    // and the two services this check was written for would drop out in
    // silence. Comparing the parsed count against the raw bullet count is what
    // makes a formatting change fail loudly instead.
    const bulletCount = countBullets(body);
    if (services.length !== bulletCount) {
      failures.push(
        `data/STREAMING_PROFILE.md: the Coming Soon sources section has ${bulletCount} bullet(s) ` +
          `but only ${services.length} carry a "- **Service name**" lead-in. The unparsed ones would ` +
          "drop out of this check without failing it. Restore the bold lead-in, or update this check's pattern.",
      );
    }

    // Only step 06's own sentence is searched. Matching anywhere in the file
    // would pass on an unrelated mention elsewhere on the page.
    const stepMatch = guide.match(/Coming Soon draws only from named, verifiable sources[^<]*/);
    if (!stepMatch) {
      failures.push(
        "guide.html: could not find the Coming Soon sources sentence in step 06 " +
          "(copy may have been rewritten; update this check's anchor).",
      );
    } else {
      const missing = services.filter((name) => !stepMatch[0].includes(name));
      if (missing.length) {
        failures.push(
          `guide.html's Coming Soon sources sentence does not name ${missing.join(", ")}, ` +
            `which data/STREAMING_PROFILE.md gives a dedicated source for. ` +
            `Add them to guide.html, or drop them from the profile, whichever is actually stale.`,
        );
      }
    }
  }
}

if (failures.length) {
  console.error("Content drift check FAILED:\n");
  for (const f of failures) console.error("  - " + f);
  console.error("\nSee claude/travel-intelligence-build-log.md (2026-08-06 entries) for why this check exists.");
  process.exit(1);
} else {
  console.log(
    "Content drift check passed: about.html's tracked-service count and guide.html's " +
      "Coming Soon source list both match data/STREAMING_PROFILE.md.",
  );
}
