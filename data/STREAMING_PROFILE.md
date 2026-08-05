# Streaming Profile

**Last updated:** 2026-07-21

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

## Premium/Channel Add-ons (tracked for Coming Soon schedules, not watch-history sync)
- BritBox (via Prime Video channel)
- PBS Masterpiece (via Prime Video channel)

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
for the recommendation-widening purpose this note already describes — Hulu
stays exactly as this note originally described (checked for candidates,
not synced).

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
