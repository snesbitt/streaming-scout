# Streaming Profile

**Last updated:** 2026-08-19 (Hulu confirmed tracked by Susan and its sync entry point written down here, see the dated notes below. Prior update 2026-08-16.)

## Services Tracked
- Netflix — active
- Prime Video — active
- Apple TV+ — added 2026-08-05 (Susan: "fold in apple+ as another service
  we'll want to check and hook up"), watch-history sync **not yet verified
  working** — see the dated note below and `sync-watch-history` SKILL.md's
  own note on this. Coming Soon / Top Picks candidate-checking for Apple
  TV+ was already active before this (see the policy note below, now
  partly superseded); this promotes it to the same tracked tier as
  Netflix/Prime for watch-history sync specifically.
- Hulu — tracked. Promoted to the full watch-history sync tier 2026-08-14
  (Susan logged in via Claude in Chrome specifically for this), and confirmed
  tracked again by Susan 2026-08-19 after the failed first sync run described
  below. Previously candidates-only per the Other-Services Recommendations
  Policy below, which is superseded for Hulu. Its sync entry point and the
  sign-in check that has to precede it are in "Watch-history sync entry
  points" below. Sync has not yet been seen working end to end.

## Watch-history sync entry points

The `sync-watch-history` skill hardcodes Netflix and Prime Video in its
navigation step and reads this file only for the list of tracked services.
Anything else tracked takes its entry point from here. That gap is what broke
Hulu's first live run: with no entry point recorded anywhere, the 2026-08-16
attempt guessed `hulu.com/profile/history`, a page that no longer exists.

- Hulu — start at https://www.hulu.com/hub/home, and check sign-in before
  reading anything. A redirect to https://www.hulu.com/welcome is Hulu's
  signed-out landing page, which means there is no history to read and the run
  should stop and say so. That is what happened on 2026-08-16. When the page
  loads signed in, the viewing history is the "Keep Watching" tray on it. Do
  not retry https://www.hulu.com/profile/history, which returned 404 the same
  day; Hulu appears to have retired the dedicated history page.
- Apple TV+ — https://tv.apple.com/ loads signed out in Susan's browser (last
  checked 2026-08-16), and no equivalent of Netflix's viewing-activity page is
  known even for a signed-in session. Leave Apple TV+ viewing as report-in-chat
  until both of those change.

If a page does not yield a clean history list, say so plainly and log nothing.
Never fill the gap by guessing at a URL. Guessing is how a 404 came to be
recorded as a Hulu capability limit in the first place.

## Premium/Channel Add-ons (tracked for Coming Soon schedules, not watch-history sync)
- BritBox (via Prime Video channel)
- PBS Masterpiece (via Prime Video channel)
- MGM+ — added 2026-08-06 (Susan: "just got their subscription," add it as
  a feed reviewed regularly for Coming Soon). Previously only referenced as
  an example "outside tracked services" badge case (see the Other-Services
  Recommendations Policy note below, e.g. The Westies) — now a real
  subscription, so Coming Soon candidate-checking should treat it the same
  as BritBox/PBS Masterpiece: reviewed regularly, badged plainly, no
  watch-history sync (no account activity page wired for it, same as the
  other two).
- Paramount+ — added 2026-08-06 (Susan flagged the live Coming Soon list
  badging "Special Ops: Lioness, season 3" as "Requires Paramount+, not one
  of your tracked services," and confirmed it should now count as tracked).
  Treated the same as MGM+/BritBox/PBS Masterpiece: reviewed regularly,
  badged plainly, no watch-history sync (no account activity page wired for
  it). The stale untracked-service badge on that title was removed from
  `index.html` the same day to match.

## Off-Platform Viewing (reported in chat, not syncable)
- Nat Geo — Tucci in Italy S1–S2, in progress (Susan, 2026-07-25). No account
  page to sync; log via the log-watched skill when she reports progress.

## Other-Services Recommendations Policy (Susan, 2026-07-25; expanded 2026-07-26)
High-match titles on services beyond the tracked four may appear in Top Picks,
clearly badged with their service. Susan confirmed 2026-07-26 that **Hulu and
Apple TV+ must always be checked** alongside MGM+-class opportunities — treat
both as accessible to her. This widens the candidate pool; it does not add
those services to watch-history sync (no page-scrape wired for them yet —
log Hulu/Apple viewing via the log-watched skill when she reports it).
**2026-08-05 update:** Apple TV+ has since moved to Services Tracked above
for the recommendation-widening purpose this note already describes. **2026-08-14 update:** Hulu has since moved to Services Tracked above too (full watch-history sync tier, same as Apple TV+), so this note is now fully superseded — both services this note originally described are tracked, not just checked for candidates.

## 2026-08-05 — Apple TV+ watch-history sync: honest status

Susan asked to "hook up" Apple TV+ the same way Netflix/Prime Video already
are. `sync-watch-history`'s `SKILL.md` has been updated with a best-effort
navigation step for it (tv.apple.com), but **the exact page/flow for a
clean viewing-history list has not been verified against the real site** —
Apple TV+ doesn't have a well-known "Viewing activity" page the way
Netflix/Prime do, so this needs a live Claude-in-Chrome check the next time
a sync actually runs. Per that skill's own existing rule, if the page
doesn't yield a clean history list, it should say so plainly rather than
guess or fabricate entries. Until that live check happens, treat Apple TV+
watch-history sync as "wired, not yet confirmed working" — not fully live.

## 2026-08-16 — Apple TV+ and Hulu watch-history sync: tested live, both failed

**Superseded for Hulu on 2026-08-19, see the note below.** Apple TV+ still
stands as written here.

Both had been carried as "wired, not yet confirmed working" since 2026-08-05
and 2026-08-14 respectively. A real Claude-in-Chrome sync attempt was finally
run today, and neither works. Recording the actual failure so the next session
does not re-derive it:

- **Apple TV+** (`tv.apple.com`) serves the signed-out marketing page, with an
  "Accept Free Trial" call to action, rather than any account view. Susan is not
  signed in to Apple TV on the web in this browser. Separately, Apple TV+ still
  has no viewing-activity page equivalent to Netflix's or Prime's even when
  signed in, so a clean history list may not be reachable this way at all.
- **Hulu** (`hulu.com`) shows a signed-in avatar on an error page, but
  `/profile/history` is a 404 and `/hub/home` redirects to `/welcome`, the
  signed-out landing page. Hulu also appears to have retired a dedicated
  viewing-history page in favour of a "Keep Watching" tray.

So Prime Video and Netflix remain the only two services with working
watch-history sync. Apple TV+ and Hulu viewing has to be reported in chat and
recorded via the log-watched skill, the same as Nat Geo. This is a capability
limit, not a bug to fix in this repo. Before promoting either back, someone has
to confirm Susan is actually signed in on the web for that service and that a
history list is reachable at all.

## 2026-08-16 — Coming Soon sources, finally named per service (closes roadmap Phase 10)

Phase 10's remaining open item was that MGM+ and Paramount+ had no dedicated
Coming Soon source the way BritBox and PBS Masterpiece do, so their premieres
were only caught incidentally through cross-service calendars. Both now have
one, and every service's best source is written down here so no future session
has to rediscover it:

- **MGM+** — https://press.amazonmgmstudios.com/us/en/upcoming-mgm-plus-series
  MGM+ press lives inside the Amazon MGM Studios press site, not a standalone
  MGM+ domain, which is why it was never found before. Per-title pages sit at
  `/us/en/mgm-plus-series/<title>/1`, full catalogue at `/us/en/all-mgm-plus`.
  Caveat: sparse. As of today only American Hostage carries a date; Legacy of
  Spies (le Carré, would be a very strong fit), Embassy, Treasure Island, A
  Tale of Two Cities, The Magnificent Seven, New Wave and Robin Hood S2 are all
  explicitly TBA. Worth re-checking monthly for dates landing on those.
- **Paramount+** — https://www.paramountpressexpress.com/paramount-plus/releases/
  Official Paramount Press Express, chronological, with per-show sub-feeds at
  `/paramount-plus/shows/<show>/releases/`. The best of the six by some margin;
  dates are stated directly in release headlines.
- **PBS Masterpiece** — https://www.pbs.org/wgbh/masterpiece/specialfeatures/masterpiece-mystery-on-pbs-fall-2026-shows-air-dates-where-to-watch/
  (seasonal grid) plus the full-year page and the press room at
  https://cm-pressroom.pbs.org/. Richest single source for Susan specifically.
- **Apple TV+** — two pages, different jobs. https://tv.apple.com/ is the
  service itself and the canonical entry point for Susan's own account, library
  and what is newly available (supplied by Susan 2026-08-16, recorded here as
  the Apple source of record). https://www.apple.com/tv-pr/ is the press
  newsroom, one dated release per title, no consolidated calendar, so walk
  `/tv-pr/news/2026/<month>/` for premiere dates.
  **Standing caveat on tv.apple.com:** as of 2026-08-16 it still loads signed
  out in Susan's browser, showing the "Get Apple TV free for 1 week" trial
  splash with no account avatar. Re-checked twice. Being signed in to the Apple
  TV app on a device does not carry into the browser session, so until Susan
  signs in at tv.apple.com specifically, nothing account-scoped is readable from
  here and Apple TV+ viewing still has to be reported in chat.
- **BritBox** — https://www.britbox.com/us/coming_soon (upcoming originals,
  premieres and exclusives) and https://www.britbox.com/us/channel-guide (a
  rolling 7-day EPG for the BritBox LIVE channel). Both supplied by Susan
  2026-08-16 after an earlier pass in this same session wrongly concluded no
  official page existed. **Note the underscore**: `/us/coming_soon` is the real
  path and the obvious `/us/coming-soon` returns a 404, which is the most likely
  reason previous searches missed it. Do not go looking for a BritBox press site
  again; this is the source. Caveat: it labels titles COMING SOON or NEW SEASON
  without exact dates, so pair it with the channel guide or the monthly
  britishtv.com writeup when a specific date is needed.
- **Hulu** — https://press.hulu.com/schedule/ Official Hulu press schedule, a
  month-by-month content calendar with dates and a downloadable version. Also
  supplied by Susan 2026-08-16, correcting the same wrong conclusion. This is a
  real official source and covers licensed additions as well as originals.

## 2026-08-19 — Hulu: tracked, and what is genuinely still broken

Asked directly, Susan's call is that Hulu should be tracked and working. It is
on the tracked list above, and `about.html` now counts 8 services to match.

The 2026-08-16 note called this a capability limit rather than anything
fixable. Half of that holds up. Two different things went wrong on that first
live run, and only one of them is about Hulu's site:

1. Nothing named a Hulu entry point. The `sync-watch-history` skill navigates
   to Netflix and Prime Video by name and gets everything else from this file,
   which listed Hulu as tracked without saying where to read it. So the run
   guessed, and `/profile/history` is a retired page. That is now fixed here:
   "Watch-history sync entry points" above carries Hulu's entry point, the
   sign-in preflight, and the dead URL to stay away from.
2. The browser session was signed out. `/hub/home` redirecting to `/welcome`
   is what Hulu serves a signed-out visitor, and it also explains the 404.
   Susan signed in on 2026-08-14, so the session did not survive two days.
   Nothing in this repo can hold a browser session open. She has to be signed
   in at hulu.com in the browser Claude in Chrome drives, at the moment a sync
   runs.

Hulu sync has still not been observed working end to end, and this pass could
not run one, so treat it as tracked and wired but unproven until a real sync
reports back. One change is left outside this repo: step 2 of the
`sync-watch-history` skill should walk whichever services this file lists and
take their entry points from the section above, instead of naming two services
in its own text.

## 2026-08-19 — MGM+ and Paramount+ sources re-checked live, both still good

The 2026-08-16 entry above said the MGM+ list was worth re-checking monthly
for dates landing on the TBA titles. Done today, in a real browser (this
sandbox cannot reach either host directly).

- **MGM+** — page live and unchanged in shape. One date has landed since
  2026-08-16: **American Hostage, season 1, September 20, 2026**. Everything
  else is still explicitly TBA: Treasure Island, A Tale of Two Cities,
  Embassy, Legacy of Spies, The Magnificent Seven, New Wave, Robin Hood
  season 2. Legacy of Spies being undated is also why it is the one title
  `scripts/check-poster-coverage.mjs` reports as having no art yet, so those
  two facts move together and a date landing there is worth acting on twice.
- **Paramount+** — press-release feed live and current, most recent item
  dated 08/18/2026, dates stated directly in headlines as described. Still
  the strongest of the six.
  **Do not guess a "streaming soon" URL here.** The site's own nav shows a
  "Streaming Soon" tab, and the obvious
  `paramountpressexpress.com/paramount-plus/streaming-soon/` returns a 404
  (checked 2026-08-19). Same trap as BritBox's `/us/coming_soon` underscore.
  `/paramount-plus/releases/` is the recorded source and it works; if a
  dedicated upcoming page is ever wanted, follow the nav link rather than
  constructing the path.

Also fixed today, and the reason this was worth a pass at all: `guide.html`
step 06 still told visitors Coming Soon drew from the pre-08-16 set of six
sources, three days after it started drawing from ten. `scripts/check-content-drift.mjs`
now has a second check that fails when a service listed here has no mention
in that sentence, so the two cannot drift apart again.

## Sync Cadence
Weekly (Monday, via the `streaming-scout-weekly-resync` scheduled task)

## Notes
Bootstrapped 2026-07-21 after the prior profile was found to be unrecoverable — it had
been written to a Cowork session's own ephemeral output folder (`workspace root`, per the
`streaming-setup` skill) instead of a stable location, and that session is gone. Service
list and cadence above are reconstructed from `/Users/snesbitt/Projects/streaming-scout/CLAUDE.md`
and `README.md`, which describe the product as ranking picks from Susan's real Netflix and
Prime Video history plus BritBox and PBS Masterpiece — not guessed. See
`STREAMING_LOG.md` and `EXCLUDED_TITLES.md` in this same folder for what could and
couldn't be recovered.

This file (and the rest of `data/`) now lives inside the git repo specifically so this
can't happen again — see CLAUDE.md's "Where the persistent data actually lives" section.
