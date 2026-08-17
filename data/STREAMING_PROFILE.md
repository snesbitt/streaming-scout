# Streaming Profile

**Last updated:** 2026-08-16 (Apple TV+ and Hulu watch-history sync tested live for the first time; both failed, see the dated note below. Prior update 2026-08-14.)

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
  - Hulu — promoted to full watch-history sync tier 2026-08-14 (Susan logged in via Claude in Chrome specifically for this). Previously candidates-only per the Other-Services Recommendations Policy below; that note is now superseded for Hulu specifically (Apple TV+ precedent). Sync flow not yet verified live — needs the same first-run check Apple TV+ is still pending.

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
- **Apple TV+** — https://www.apple.com/tv-pr/ Official newsroom, one dated
  release per title. No consolidated calendar, so walk `/tv-pr/news/2026/<month>/`.
- **BritBox** — no official US press or schedule page exists. The ITV press
  centre BritBox section is UK-only and stale; the BBC Studios Americas room has
  nothing newer than 2024. Working proxy is the monthly writeup at
  britishtv.com, which reproduces BritBox's own monthly US press list. BritBox
  publishes its US slate roughly two weeks ahead, so September 2026 should
  surface in the last week of August.
- **Hulu** — no public Disney/Hulu page listing upcoming Hulu originals with
  dates. Third-party aggregators only. Low cost to skip: Hulu's confirmed slate
  after mid-August has nothing matching Susan's profile.

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
