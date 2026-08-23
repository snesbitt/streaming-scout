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

import { readFileSync, readdirSync } from "node:fs";

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

// The whole <p> element containing a needle, so a check can read a sentence
// plus the words that lead into it. Anchoring on "<p" rather than a fixed
// character count means rewording around the needle cannot silently truncate
// what gets searched.
function paragraphContaining(html, needle) {
  const i = html.indexOf(needle);
  if (i === -1) return null;
  const start = html.lastIndexOf("<p", i);
  const end = html.indexOf("</p>", i);
  if (start === -1 || end === -1) return null;
  return html.slice(start, end);
}

// The slice between two literal markers, used where the claim being checked
// spans several elements (a list inside a card, say) rather than one <p>.
function regionBetween(html, startNeedle, endNeedle) {
  const start = html.indexOf(startNeedle);
  if (start === -1) return null;
  const end = html.indexOf(endNeedle, start);
  if (end === -1) return null;
  return html.slice(start, end);
}

// Counts on these pages are written as words, not digits, so a check that
// only understood digits would never fire.
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function wordToNumber(word) {
  return NUMBER_WORDS[String(word).toLowerCase()];
}

// Visible prose only. Checks that read sentences must not match on markup,
// class names or href targets, or they fire on things no reader ever sees.
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(text) {
  return text.split(/(?<=\.)\s+/).filter((s) => s.trim().length > 0);
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

// Check 2: every public page that names the Coming Soon sources names all of
// them, as recorded in STREAMING_PROFILE.md.
//
// Caught by hand 2026-08-19. The per-service sources were researched and
// written down on 2026-08-16 (MGM+ and Paramount+ were the two that had been
// missing, and finding them closed roadmap Phase 10), but guide.html step 06
// still listed the pre-08-16 set and went on claiming Coming Soon drew from
// six sources when it drew from ten. A visitor reading the guide was being
// told something that had been untrue for three days. Exactly the bug class
// this file exists for, so it gets a check rather than another manual fix.
//
// 2026-08-21: this check read ONLY guide.html, which is precisely why
// about.html kept the pre-08-16 four-service set ("BritBox, PBS Masterpiece,
// MGM+, and Paramount+") for two days after guide.html was corrected and
// guarded. A check that watches one of the two pages making a claim is a
// check that certifies the other one drifting. PAGES below is the fix; add to
// it rather than writing a second copy of this check.
//
// The section heading carries a date, so it is located by its stable words
// rather than the full string: re-dating the entry must not silently disable
// this.
{
  const profile = readFileSync("data/STREAMING_PROFILE.md", "utf8");

  const PAGES = [
    // needle: a phrase inside the sentence that names the services, stable
    // enough to survive rewording around it but unique to that sentence.
    { file: "guide.html", needle: "Coming Soon draws only from named, verifiable sources" },
    { file: "about.html", needle: "each have their own official schedule or press page" },
  ];

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

    for (const page of PAGES) {
      const html = readFileSync(page.file, "utf8");
      // Only the naming sentence's own paragraph is searched. Matching anywhere
      // in the file would pass on an unrelated mention elsewhere on the page.
      const para = paragraphContaining(html, page.needle);
      if (para === null) {
        failures.push(
          `${page.file}: could not find the Coming Soon sources sentence (looked for "${page.needle}"). ` +
            "The copy may have been rewritten; update this check's needle so it keeps watching that sentence.",
        );
        continue;
      }
      const missing = services.filter((name) => !para.includes(name));
      if (missing.length) {
        failures.push(
          `${page.file}'s Coming Soon sources sentence does not name ${missing.join(", ")}, ` +
            `which data/STREAMING_PROFILE.md gives a dedicated source for. ` +
            `Add them to ${page.file}, or drop them from the profile, whichever is actually stale.`,
        );
      }
    }

    // about.html's lede also states the number of those sources as a word.
    // It went stale the same way the list did, so it gets checked too.
    const about = readFileSync("about.html", "utf8");
    const ledeMatch = about.match(/(\w+) services have a named source of their own/);
    if (!ledeMatch) {
      failures.push(
        'about.html: could not find the "N services have a named source of their own" claim in the lede ' +
          "(copy may have been rewritten; update this check's pattern or drop the claim).",
      );
    } else {
      const claimed = wordToNumber(ledeMatch[1]);
      if (claimed === undefined) {
        failures.push(
          `about.html's lede says "${ledeMatch[1]} services have a named source of their own", which is ` +
            "not a number word this check knows. Write it as a word (one through twelve) or extend NUMBER_WORDS.",
        );
      } else if (claimed !== services.length) {
        failures.push(
          `about.html's lede says "${ledeMatch[1]} services have a named source of their own" but ` +
            `data/STREAMING_PROFILE.md lists ${services.length}. Update the lede, or the profile, whichever is stale.`,
        );
      }
    }
  }
}

// Check 3: the signature-genre count on about.html and guide.html matches
// data/TASTE_PROFILE.md.
//
// Caught by hand 2026-08-21. Two veins were added on 2026-08-16 (#9 Neo-Western,
// #10 Heist thriller) and about.html's "what it is" paragraph kept enumerating
// the pre-08-16 eight, while about.html's own scoring note and guide.html both
// said "and six more" after naming four, i.e. ten. One page contradicted itself
// on a number both halves of it stated.
//
// Two separate claims are checked because they can drift independently: the
// full enumeration on about.html, and the "named four plus N more" shorthand
// that appears on both pages.
{
  const taste = readFileSync("data/TASTE_PROFILE.md", "utf8");
  const body = section(taste, "Signature Genres");
  const realCount = [...body.matchAll(/^\d+\.[ \t]+\*\*/gm)].length;

  if (realCount === 0) {
    failures.push(
      'data/TASTE_PROFILE.md: found no numbered "N. **Genre**" entries under "## Signature Genres". ' +
        "The heading or the list formatting moved; fix the file or this check's pattern.",
    );
  } else {
    // 3a: about.html enumerates the veins in full, comma-separated, after a colon.
    const about = readFileSync("about.html", "utf8");
    const listMatch = about.match(/the genres that keep recurring there: ([^.]+)\./);
    if (!listMatch) {
      failures.push(
        'about.html: could not find the "the genres that keep recurring there: ..." enumeration ' +
          "(copy may have been rewritten; update this check's pattern).",
      );
    } else {
      const named = listMatch[1].split(", ").filter((s) => s.trim().length > 0).length;
      if (named !== realCount) {
        failures.push(
          `about.html enumerates ${named} signature genre(s) but data/TASTE_PROFILE.md lists ${realCount} ` +
            `under "## Signature Genres". Add the missing ones to about.html, or drop them from the profile, ` +
            `whichever is actually stale.`,
        );
      }
    }

    // 3b: both pages use a "four named, and N more" shorthand. The four in the
    // anchor are counted literally, so the anchor and the arithmetic cannot
    // drift apart: rewording the named four fails the anchor rather than
    // quietly changing the sum.
    const NAMED_IN_ANCHOR = 4;
    const anchor =
      /British and European crime drama, spy thrillers, grounded action, music documentaries,? and (\w+) more/;
    for (const file of ["about.html", "guide.html"]) {
      const html = readFileSync(file, "utf8");
      const m = html.match(anchor);
      if (!m) {
        failures.push(
          `${file}: could not find the "British and European crime drama, spy thrillers, grounded action, ` +
            `music documentaries ... and N more" shorthand (copy may have been rewritten; update this check's anchor).`,
        );
        continue;
      }
      const more = wordToNumber(m[1]);
      if (more === undefined) {
        failures.push(
          `${file} says "and ${m[1]} more" signature genres, which is not a number word this check knows. ` +
            "Write it as a word (one through twelve) or extend NUMBER_WORDS.",
        );
      } else if (NAMED_IN_ANCHOR + more !== realCount) {
        failures.push(
          `${file} says "and ${m[1]} more" after naming ${NAMED_IN_ANCHOR}, i.e. ${NAMED_IN_ANCHOR + more} ` +
            `signature genres, but data/TASTE_PROFILE.md lists ${realCount}. Update the page, or the profile, ` +
            `whichever is actually stale.`,
        );
      }
    }
  }
}

// Check 4: the cadence the pages describe matches what is actually scheduled.
//
// Caught by hand 2026-08-21. about.html's stat tile said "Mon / automated
// weekly checks", about.html said "Automated upkeep runs on Mondays" and
// guide.html said "Mondays, automatic". Monday is right for GitHub Actions and
// the watch-log staleness report, but the artwork sweep runs Wednesdays and the
// five-site review runs Fridays, so "Mondays" was not a wrong day, it was a
// true day standing in for a week's worth of jobs. Compressing three days into
// one reads as a complete description and is not one.
//
// GitHub Actions crons are read from the workflow files, so changing a cron
// changes the answer here. The Claude scheduled tasks cannot be read from CI:
// they live on Susan's account, not in this repo, and there is no token here
// that could list them. They are recorded below instead, as a dated snapshot.
// Re-verify with list_triggers when a task is added, removed or rescheduled,
// and update this table in the same pass.
{
  const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Snapshot taken 2026-08-21 via list_triggers. Only tasks that act on
  // Streaming Scout are listed: a Vinyl Scout feed check and a data-broker
  // recheck also run weekly on Susan's account but say nothing about this
  // site's cadence, so including them would make this page claim upkeep it
  // does not get.
  const SCHEDULED_TASKS = [
    { name: "Streaming Scout, Monday watch-log staleness report", cron: "30 13 * * 1" },
    { name: "Weekly Streaming Scout artwork sweep", cron: "7 17 * * 3" },
    { name: "Weekly full-site review, five sites", cron: "0 13 * * 5" },
    { name: "Daily freshness sweep, portfolio sites", cron: "0 11 * * *" },
    { name: "Comprehensive end-to-end audit, all five sites", cron: "0 6 1 * *" },
  ];

  // Day-of-week field only. "*" means "every day", which is a daily job and
  // names no weekday, so it contributes nothing to the weekday set.
  function weekdaysOf(cron) {
    const field = cron.trim().split(/\s+/)[4];
    if (!field || field === "*") return [];
    const out = new Set();
    for (const part of field.split(",")) {
      const range = part.split("-").map((n) => Number(n));
      if (range.some((n) => Number.isNaN(n))) continue;
      const [from, to] = range.length === 2 ? range : [range[0], range[0]];
      for (let d = from; d <= to; d++) out.add(DOW_NAMES[d % 7]);
    }
    return [...out];
  }

  const workflowDir = ".github/workflows";
  const workflowCrons = [];
  for (const name of readdirSync(workflowDir)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const yml = readFileSync(`${workflowDir}/${name}`, "utf8");
    for (const m of yml.matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']/gm)) {
      workflowCrons.push(m[1]);
    }
  }

  if (workflowCrons.length === 0) {
    failures.push(
      `${workflowDir}: no "- cron:" entries found in any workflow file. Either the scheduled runs were ` +
        "removed (in which case the pages must stop promising weekly checks) or this check's pattern is stale.",
    );
  }

  const realWeekdays = new Set();
  for (const cron of [...workflowCrons, ...SCHEDULED_TASKS.map((t) => t.cron)]) {
    for (const day of weekdaysOf(cron)) realWeekdays.add(day);
  }

  // 4a: a page that describes the upkeep cadence must name every weekday that
  // actually has a job, not just the first one.
  const CADENCE_REGIONS = [
    { file: "about.html", start: "Automated upkeep is spread", end: "</p>" },
    { file: "guide.html", start: ">Scheduled tasks<", end: "</ul>" },
  ];

  for (const region of CADENCE_REGIONS) {
    const html = readFileSync(region.file, "utf8");
    const text = regionBetween(html, region.start, region.end);
    if (text === null) {
      failures.push(
        `${region.file}: could not find the cadence description (looked for "${region.start}" ` +
          `followed by "${region.end}"). The copy or markup moved; update this check's markers.`,
      );
      continue;
    }
    const missing = [...realWeekdays].filter((day) => !text.includes(day));
    if (missing.length) {
      failures.push(
        `${region.file}'s cadence description does not mention ${missing.join(", ")}, but a job actually ` +
          `runs then (GitHub Actions crons plus the recorded scheduled tasks cover ${[...realWeekdays].join(", ")}). ` +
          `Naming only some of the days reads as the full picture. Add the missing day(s), or retire the job.`,
      );
    }
  }

  // 4b: and no page may name a weekday that has no job at all. index.html is
  // excluded deliberately: its Currently Watching rows say which day an episode
  // airs, which is a fact about a TV schedule, not a claim about this site.
  for (const file of ["about.html", "guide.html", "roadmap.html"]) {
    const text = visibleText(readFileSync(file, "utf8"));
    const claimed = new Set(
      [...text.matchAll(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s?\b/g)].map((m) => m[1]),
    );
    const unsupported = [...claimed].filter((day) => !realWeekdays.has(day));
    if (unsupported.length) {
      failures.push(
        `${file} names ${unsupported.join(", ")} but nothing is scheduled then. Real scheduled weekdays are ` +
          `${[...realWeekdays].join(", ")}. Fix the page, or update the cron and this check's task snapshot.`,
      );
    }
  }

  // 4c: the stat tile abbreviates a weekday to three letters, which cannot
  // carry the "and Wednesday and Friday" nuance the paragraph does. It is only
  // honest if its label says which system it means, so require that.
  const about = readFileSync("about.html", "utf8");
  const tile = about.match(
    /<div class="stat-tile__num">(Mon|Tue|Wed|Thu|Fri|Sat|Sun)<\/div><div class="stat-tile__label">([^<]*)<\/div>/,
  );
  if (tile && !/github|\bCI\b/i.test(tile[2])) {
    failures.push(
      `about.html's stat tile reads "${tile[1]} / ${tile[2]}". A single weekday cannot describe upkeep that ` +
        `runs on ${[...realWeekdays].join(", ")}, so the label has to say which system runs that day ` +
        `(it should name GitHub or CI). Scope the label, or drop the tile.`,
    );
  }
}

// Check 5: every "#" cross-reference on the public pages resolves to an id
// that exists on the page it points at.
//
// Caught by hand 2026-08-21. guide.html said "see Roadmap, phase 04" and
// linked to /roadmap#phase-04. roadmap.html dropped numbered phases on
// 2026-08-19 and renamed every id, so the link had been landing at the top of
// the roadmap with no indication anything was wrong. A dead in-page anchor
// fails silently in every browser, which is exactly why it needs a test.
{
  const PAGE_FOR_PATH = {
    "": null, // same-page anchor, resolved against the linking file
    "/": "index.html",
    "/index.html": "index.html",
    "/roadmap": "roadmap.html",
    "/roadmap.html": "roadmap.html",
    "/guide": "guide.html",
    "/guide.html": "guide.html",
    "/about": "about.html",
    "/about.html": "about.html",
  };

  const idsOf = (html) => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const cache = new Map();
  function idsFor(file) {
    if (!cache.has(file)) cache.set(file, idsOf(readFileSync(file, "utf8")));
    return cache.get(file);
  }

  for (const file of ["guide.html", "about.html", "roadmap.html"]) {
    const html = readFileSync(file, "utf8");
    for (const m of html.matchAll(/href="([^"]*#[^"]*)"/g)) {
      const href = m[1];
      if (/^[a-z]+:/i.test(href)) continue; // external or mailto, not ours to resolve
      const hash = href.indexOf("#");
      const path = href.slice(0, hash);
      const frag = href.slice(hash + 1);
      if (frag === "") continue; // bare "#", a deliberate no-op link

      if (!(path in PAGE_FOR_PATH)) {
        failures.push(
          `${file} links to "${href}", whose path is not one this check knows how to resolve. ` +
            "Add it to PAGE_FOR_PATH, or fix the link.",
        );
        continue;
      }
      const target = PAGE_FOR_PATH[path] === null ? file : PAGE_FOR_PATH[path];
      if (!idsFor(target).has(frag)) {
        failures.push(
          `${file} links to "${href}" but ${target} has no id="${frag}". The anchor is dead and a browser ` +
            `will silently land at the top of the page. Point it at a real id (${target} has: ` +
            `${[...idsFor(target)].join(", ")}), or add the id.`,
        );
      }
    }
  }
}

// Check 6: the public pages agree with the endpoints about who can write.
//
// This check ran in the opposite direction until 2026-08-23. Both Functions
// were open, and about.html's lede claimed "Read-only for everyone else. Only
// Susan's Cowork sessions change it." while roadmap.html said plainly that
// anyone with the link could dismiss a title. The site contradicted itself and
// the half a visitor reads first was the wrong half.
//
// Phase 7 gated POST and DELETE behind the edit key, so the failure mode
// inverted: the risk now is a page still telling visitors the buttons are open
// to anyone, which would be wrong in the other direction and would read as an
// invitation. GET is still open and pages should still say so.
//
// Keyed on checkWriteAuth in the source, not on a comment. The previous version
// keyed on the string "no edit key", which survived this phase as HISTORY in
// dismiss.mjs's v1 header, so it went on passing against a state that had
// changed underneath it. A check that reads a comment is checking prose about
// the code, not the code.
{
  const dismissSrc = readFileSync("netlify/functions/dismiss.mjs", "utf8");
  const statusSrc = readFileSync("netlify/functions/status.mjs", "utf8");
  const gated = (src) =>
    /function checkWriteAuth/.test(src) &&
    /(?:POST|DELETE)[\s\S]{0,120}checkWriteAuth\(req\)/.test(src);
  const bothGated = gated(dismissSrc) && gated(statusSrc);

  if (!bothGated) {
    failures.push(
      "netlify/functions/: dismiss.mjs and/or status.mjs no longer gate POST/DELETE behind checkWriteAuth. " +
        "Phase 7 put them behind the edit key on 2026-08-23. If that was undone deliberately, the public " +
        "pages have to say the buttons are open again, and this check needs rewriting to match. Resolve it, " +
        "do not delete this check.",
    );
  } else {
    // Now that writes are gated, a page saying they are open is the error.
    // "Open" claims about READING are fine and expected, so a sentence only
    // fails when it ties openness to a WRITE.
    const WRITE_WORDS = /\bdismiss\b|\bdismissal\b|\bmark(?:ed|ing)? (?:one )?watched\b|saved changes|\bwrite(?:s)?\b|\bchange(?:s)?\b/i;
    const OPEN_CLAIM = /anyone with the link|no edit key|no key\b|without a key|unauthenticated|open to anyone|needs? nothing to (?:change|dismiss)/i;
    // Phrasing that is describing the PAST or a limitation being closed.
    const HISTORICAL = /\buntil\b|\bused to\b|\bpreviously\b|\bwas\b|\bwere\b|\bhad been\b|\bbefore\b|\bno longer\b|\bnow\b/i;

    for (const file of ["index.html", "about.html", "guide.html", "roadmap.html", "start.html"]) {
      const html = readFileSync(file, "utf8");
      for (const sentence of sentences(visibleText(html))) {
        if (WRITE_WORDS.test(sentence) && OPEN_CLAIM.test(sentence) && !HISTORICAL.test(sentence)) {
          failures.push(
            `${file} still tells visitors the write buttons are open: "${sentence.trim()}" ` +
              "Phase 7 gated POST/DELETE on 2026-08-23. Say what is true now, or phrase it as history.",
          );
        }
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
    "Content drift check passed: tracked-service count, Coming Soon source lists on guide.html and " +
      "about.html, signature-genre counts, upkeep cadence against the real crons, every in-page anchor, " +
      "and the public pages agreeing with the endpoints about who can write.",
  );
}
