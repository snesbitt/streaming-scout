# Excluded Titles

Titles Susan has permanently dismissed. Never re-add anything listed here to Top Picks
or Coming Soon without her explicitly asking.

## 2026-07-21 — data loss notice

The prior version of this file was lost along with the rest of the data/ folder (see
STREAMING_PROFILE.md). One entry below was recovered from the live `dismissed-titles`
Netlify Blobs store (via `GET https://streamingscout.org/api/dismiss`), which records
every dismiss made directly on the site regardless of this file's state. That store only
captures on-site dismiss-button clicks, not exclusions that were previously requested by
chat message and never clicked live — so this list is very likely incomplete relative to
before. If a previously-dismissed title reappears in Top Picks or Coming Soon, that's why
— just say so again and it'll go back on this list.

## 2026-08-09 — sync gap found and closed; now a standing recurring practice

The 2026-07-29 sync below was a one-time manual pass, not an ongoing process — `dismiss.mjs`'s
own code comment says this plainly: a live dismiss "does NOT make an exclusion permanent
across the next weekly rebuild... What this closes is the 'which device did I dismiss that
on' gap, not the 'will next week's rebuild bring it back' gap." Nothing kept this file synced
after that first pass. Checked the live store directly on 2026-08-09 (`GET /api/dismiss`) and
found 8 titles dismissed on-site between 2026-07-29 and 2026-08-05 that were never added here:
The Choral, Sunset Grove, Vanity Fair (2018), The Noble Detective, Prey, Grantchester season 11,
Kleo, and Tucci in Italy — all genuinely vulnerable to reappearing in a future Top Picks/Coming
Soon pass, since the `coming-soon`/`top-picks` skills only ever read this file, never the live
store directly. Susan asked directly to "always remember when I delete a suggestion from coming
soon" — per that request, this is now a recurring scheduled task (not just a one-off fix), see
`streaming-scout/CLAUDE.md`'s 2026-08-09 entry for the trigger id and cadence. All 14 live
entries as of this sync are captured below.

## Excluded

- **Wake Up Dead Man: A Knives Out Mystery** — Top Picks — dismissed 2026-07-21 (recovered from live Blobs store)
- **Gone** — Top Picks — dismissed on-site 2026-07-26
- **Hamnet** — Top Picks — dismissed on-site 2026-07-26
- **Return to Paradise, season 2** — Top Picks — dismissed on-site 2026-07-28. Not a dislike: she started watching it on Prime 2026-07-26 (see STREAMING_LOG.md), so it's excluded from picks as already-watching, not as negative taste signal.
- **Dark Winds** — Top Picks — dismissed on-site 2026-07-28
- **Coastal Unit** — Coming Soon — dismissed on-site 2026-07-28
- **The Choral** — Top Picks — dismissed on-site 2026-07-29
- **Sunset Grove** — Top Picks — dismissed on-site 2026-07-29
- **Vanity Fair (2018)** — Coming Soon — dismissed on-site 2026-07-29
- **The Noble Detective** — Top Picks — dismissed on-site 2026-07-29
- **Prey** — Coming Soon — dismissed on-site 2026-07-29
- **Grantchester, season 11** — Top Picks — dismissed on-site 2026-07-30
- **Kleo** — Top Picks — dismissed on-site 2026-07-31
- **Tucci in Italy** — Currently Watching — dismissed on-site 2026-08-05

*(Synced from the live dismiss store 2026-08-09. Now kept in sync automatically — see the 2026-08-09 note above.)*

- **Apex** — Currently Watching — dismissed on-site 2026-08-10 (auto-synced by CI)
- **Say Nothing** — Currently Watching — dismissed on-site 2026-08-12 (auto-synced by CI)

- **1923** — Top Picks — dismissed on-site 2026-08-17 (auto-synced by CI)
- **Miss Austen** — Top Picks — dismissed on-site 2026-08-17 (auto-synced by CI)
- **Clarkson's Farm** — Top Picks — dismissed on-site 2026-08-17 (auto-synced by CI)
