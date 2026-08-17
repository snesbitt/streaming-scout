# CLAUDE.md

## Standing operating rules (read first)

Portfolio-wide checklist distilled from incident history across travel-intelligence, vinyl-scout-repo, streaming-scout, and fitness-log. Full narrative and the canonical version of this checklist live in the Travel Intelligence Claude project's `claude/standing-rules.md` and `claude/travel-intelligence-build-log.md` — keep this block in sync with that source if it drifts.

**Before claiming anything is done:** never say "pushed," "fixed," "deleted," or "live" based on a tool's success signal or Susan's own report alone — verify independently, every time. Push landed: `git rev-parse HEAD` vs `git rev-parse origin/main`. Deploy is live: check the actual URL (cache-bust if the response could be cached) or the platform's own deploy record. Deletion happened: re-fetch the resource directly. A UI fix "worked": check it in a live browser, not just the source diff.

**Before delivering a multi-file change:** read the target file fresh from disk right now — never from a copy staged earlier in the session. Grep the about-to-deliver files for markers of every recent feature touching the same files, to catch an accidental revert before it ships. Treat any documented delivery convention (e.g. a cache-bust `?v=N` bump) as a literal checklist gate before calling something delivered, not a fact to remember.

**Never copy a staged file over a working file.** On 2026-08-17 a `cp` from `/mnt/user-data/uploads/.../TASTE_PROFILE.md` onto `data/TASTE_PROFILE.md` silently reverted a full day of edits (26538 bytes back to 13671). It was caught only because the next edit's anchor string had vanished, and it was the second time in the same session. A staged copy goes stale the moment anything else writes to the real file, and a stage reporting a plausible byte count is not evidence it is current. Three rules, all cheap: re-stage immediately before editing rather than once at the top of the session; edit the real file in place instead of round-tripping it through a copy; and before any write that replaces a whole file, assert on its current size or a known marker string and refuse the write if it would shrink. For anything under `data/`, `scripts/check-data-integrity.mjs` catches this, so run `npm test` before delivering rather than leaving it to CI.

**git via device_bash:** safe, no lock risk — `git rev-parse HEAD`, `git rev-parse origin/main`, `git log`, `git show <ref>:<path>`. Unsafe — reliably creates a stale `.git/index.lock` — `git status`, `git diff`, `git branch -vv`. Never run any git command here while Susan says she's actively committing in this repo, regardless of which command it is.

**Cross-origin/cross-site features:** any endpoint called from a different origin needs an explicit `Access-Control-Allow-Origin` header with its own test assertion in the endpoint's suite — same-origin or server-side checks passing does not prove this. Verify any two-site feature with an actual two-origin browser check before calling it done.

**Testing that actually proves something:** passing unit tests proves the logic is right, not that it runs in production — dynamic `require()`/`import()` reaching across a deployment boundary can pass every local test and still fail in the real bundle. "Deploy is ready" on the platform doesn't mean the custom domain is serving correctly — check the deploy's own permalink URL first.

**Trusting reads:** a tool reporting success (a stage/read returning a plausible byte count) isn't the same as it returning current data. If a "bug" is discovered purely by reading a file rather than an independent signal (error message, screenshot, deploy record, git history), diff the claim against git history before writing it down as fact.

Guidance for Claude (and any AI agent) working in this repository. This is
the canonical source of truth for how this project's *website* is built and
deployed. It is not the canonical source for how recommendations get made —
see the next section before going looking for that here.

## What this is

The Streaming Scout: a personal streaming-recommendation dashboard for
Susan, sibling to The Fitness Log (thefitnesslog.org) and Vinyl Scout —
ranks what to watch next from her real, multi-year Netflix and Prime Video
history (plus BritBox and PBS Masterpiece), matched against her stated
taste, instead of a generic trending chart. Live at
https://streamingscout.org.

## Where the real logic lives (this repo is NOT the scoring logic)

This repo is the *published snapshot* — static HTML, CSS, and one small
Netlify Function — plus, as of 2026-07-21, the persistent data the
scoring logic reads and writes (see below). It is still not where
recommendations get *computed*: the scoring logic itself runs in Susan's
Claude app, as the `streaming-scout` Cowork skill bundle (`streaming-setup`,
`sync-watch-history`, `log-watched`, `top-picks`, `coming-soon`).

- **The scoring logic** (signature vs. generic genre weighting, actor-
  affinity bonus, the taste profile) is not in this repo in any form —
  not as a script, not as a data file. It runs inside the Cowork skill
  bundle when Susan (or the Monday scheduled task) asks for a rebuild.
- **`data/STREAMING_LOG.md`, `data/TASTE_PROFILE.md`, `data/STREAMING_PROFILE.md`,
  `data/EXCLUDED_TITLES.md`** — these ARE in this repo (see "Where the
  persistent data actually lives" below). Top Picks and Coming Soon in
  `index.html` are static HTML baked in at publish time by reading
  `data/EXCLUDED_TITLES.md`; nothing on the live page reads it at
  runtime.

If a task looks like "change how a title gets scored," the fix is in the
Cowork skill bundle, not in any file here. If a task looks like "make sure
X never comes back" or "why did an old exclusion disappear," check
`data/EXCLUDED_TITLES.md` in this repo first.

## Where the persistent data actually lives (corrected 2026-07-21)

Until 2026-07-21, the skill bundle's own docs (and the `streaming-scout-weekly-resync`
scheduled task) assumed these files could live in a Cowork session's own ephemeral
output folder — described as "the workspace root" — and that this location was stable
across sessions. It is not: that folder is only reachable by the exact session that
created it. The scheduled task silently pointed at a dead session for an unknown
number of weeks, and the prior watch-history log, taste profile, and most of the
exclusion list were unrecoverable as a result. One dismissed title was recovered from
the live `dismissed-titles` Netlify Blobs store (the `dismiss.mjs` Function below);
everything else in `data/` was reset. See each file's own header in `data/` for exactly
what was recovered vs. reset.

The fix: `data/` now lives inside this git repo, so it's real, versioned, and
accessible from any session that has this repo connected. Any skill invocation
(manual or via the scheduled task) must explicitly treat
`/Users/snesbitt/Projects/streaming-scout/data/` as the working root for
`STREAMING_LOG.md` / `TASTE_PROFILE.md` / `STREAMING_PROFILE.md` / `EXCLUDED_TITLES.md`
— never an ambiguous "current workspace."

What genuinely does live in this repo: the dismiss Function
(`netlify/functions/dismiss.mjs`), which only makes a dismissal sync
across devices *instantly* — it is a separate, smaller thing from
`EXCLUDED_TITLES.md` and does not touch it. See the comment at the top of
that file and `README.md`'s "Important architecture note" for the exact
boundary between the two.

## Repository layout

- `data/` — persistent state for the recommendation skill bundle
  (`STREAMING_LOG.md`, `TASTE_PROFILE.md`, `STREAMING_PROFILE.md`,
  `EXCLUDED_TITLES.md`). Added 2026-07-21; see "Where the persistent
  data actually lives" above for why. Nothing here is read by the live
  site at runtime — it's read/written only by the Cowork skill bundle
  during a rebuild, then baked into `index.html` as static HTML.
- `index.html` — the dashboard. Styling comes from `style.css`. Almost all
  client-side JavaScript is still a single `<script type="module">` block
  at the bottom of the file — there is no `app.js` and none is planned,
  keep it that way. As of 2026-07-23 that script imports its date-based
  auto-promote logic and its dismiss-merge logic from `src/logic.mjs`
  instead of defining them inline, purely so that logic can be unit
  tested (see `tests/` below) — this is not the start of a bigger
  refactor. Everything else stays inline; the whole point of this site is
  that it's simpler infrastructure than the other two sites, not the same
  shape at a smaller scale.
- `src/logic.mjs` — the only extracted (non-inline) client-side logic:
  `isReleased`, `serviceLabelFromBadgeTitle`, `mergeDismissedTitles`. Pure
  functions only — no DOM, no localStorage, no fetch — so they're directly
  testable. If you add logic here, keep it pure; DOM-touching code stays
  inline in `index.html`.
- `about.html`, `roadmap.html`, `guide.html` — public, self-contained
  explainer pages, no build step, no imports. Shared house style with the
  sibling sites (Lora serif, cream/serif shell, `.card`, `.pill-nav`,
  `.phase`, `.step`, `.stat-strip`, `.field-note`). `about.html` and
  `guide.html` each carry a small page-scoped `<style>` block for
  page-only components (stat strip, stack comparison, diagram figures) —
  if you add a page-scoped class there, check it doesn't already exist in
  `style.css` under the same name (`.wont-list--about` was renamed from a
  plain `.wont-list` for exactly this reason — see git history).
- `style.css` — shared styling for every page above. Mobile-first: base
  rules target a narrow viewport, `@media (min-width: 640px)` layers on
  desktop refinements. `--ink-dim` / `--ink-faint` are the secondary-text
  colors and were deliberately darkened to clear WCAG AA (4.5:1) against
  both `--bg` and `--card` — don't lighten them back toward the original
  values without rechecking contrast.
- `netlify/functions/dismiss.mjs` — one of two backend Functions. Open
  GET/POST/DELETE, no auth, by design (nothing sensitive in a "not
  interested" flag, same rationale as Vinyl Scout's wishlist API) but
  bounded: a 200-char cap on `title`/`section`, and the Blobs list evicts
  its oldest entry once it would exceed 500. Backed by a Netlify Blobs
  store named `dismissed-titles`.
- `netlify/functions/status.mjs` — added 2026-07-29. Same open,
  bounded design as dismiss.mjs above (200-char field cap, 500-entry FIFO
  Blobs list, no auth), in its own store (`title-status`) since a watch
  status is a different signal than a dismissal. Tracks `watching`/
  `watched` per title so the Currently Watching (▶) and Watched (✓)
  buttons next to every pick sync across devices. Also does not touch
  the next weekly rebuild by itself — same gap as dismiss.mjs.
- `package.json` — bundles `@netlify/blobs` for the Function above, and as
  of 2026-07-23 runs the test suite via `npm test`. Still no build script,
  no dev dependencies.
- `manifest.json`, `netlify.toml`, icon/PNG assets — static PWA/deploy
  config, nothing dynamic.
- `tests/` and `scripts/` — what `npm test` actually runs, as of
  2026-08-17: `tests/logic.test.mjs` (15 assertions on `src/logic.mjs`, no
  network, no DOM), `tests/blobs-concurrency.test.mjs` (27 groups driving
  both Netlify Functions against a fake Blobs store that reproduces the real
  read lag), `tests/backup-guards.test.mjs` (20 groups driving the data
  integrity and live-records backup scripts end to end), plus five offline
  static checks: `check-data-integrity.mjs`, `check-poster-coverage.mjs`,
  `check-content-drift.mjs`, `check-tap-targets.mjs`,
  `check-pick-meta-length.mjs`. This description was stale for weeks (it
  still claimed 13 assertions and no CI workflow long after both changed),
  so keep it current or delete it rather than letting it drift again.
  **Still not covered by any of it:** whether a poster URL actually
  resolves, whether a rendered tap target is really 44px, and whether the
  page looks right. Those need a browser. `npm test` passing does not mean
  the site is fine; the live check in "How to verify a deploy" is still the
  control of record.

## Deploy workflow

Git-connected continuous deployment, same governance model as
thefitnesslog.org and vinylscout.org — confirmed working since
2026-07-16:

```bash
git add -A
git commit -m "..."
git push           # Netlify webhook auto-deploys main
```

Claude sessions commit; Susan runs the push when working from the cloud
bridge (no network access there) — end any "commit is ready" message with
the exact push command block.

## How to verify a deploy

As of 2026-08-14, there IS an automated *health* check (`scripts/smoke.mjs`
+ the `smoke` job in `.github/workflows/test.yml`) — but it is schedule-
triggered (weekly, Mondays 15:00 UTC, plus manual `workflow_dispatch`), not
push-triggered, and read-only against whatever is live at the moment it
runs. It answers "is the site fundamentally healthy right now" — home page
loads, `/CLAUDE.md` stays blocked, `/api/dismiss` and `/api/status` are
reachable and validating input — not "did the change I just pushed
actually publish." Don't describe it as more than that; the manual check
below is still the real control of record for any specific change. There
is also a small *unit* test suite (`npm test`, added 2026-07-23) — run it
before any change touching `src/logic.mjs` or the auto-promote/dismiss
logic in `index.html`'s script, but it doesn't touch a browser or the live
site either. Verifying a deploy means:

1. Run `npm test` if the change touched `src/logic.mjs` or the inline
   `<script>`'s dismiss/promote logic. It only proves that logic still
   behaves correctly in isolation — not that the page renders.
2. Confirm the Netlify build succeeded (green build ≠ nothing, but it only
   proves the files uploaded, not that a visitor sees a working page).
3. Open https://streamingscout.org (and any page you changed —
   `/about`, `/roadmap`, `/guide`) and actually look at it. Check that the
   change rendered, that nothing above/below it broke, and on a change
   touching `index.html`'s script, that dismiss still works.
4. On any change touching `index.html`'s script, also click a pick's
   ▶ (currently watching) button, then RELOAD THE PAGE and confirm the
   row still shows real poster art, not just the initials monogram. A
   "poster references check out" grep of the HTML source is not enough —
   see the 2026-08-05 entry below for the bug this exact check would have
   caught before Susan had to report it.
5. Say so plainly in the post-flight summary — "checked the live site"
   is the real control of record here, not a claim of automated
   verification that doesn't exist.

## Conventions

- **Static, not live.** Nothing on this site calls a live API at page-load
  time except the dismiss Function's own GET/POST/DELETE. Top Picks,
  Coming Soon, and the Taste Profile are all baked-in HTML from the last
  rebuild. Don't add a runtime `fetch()` for recommendation data without
  raising it with Susan first — that's a scope change, not a bug fix.
- **Don't hardcode a title count.** The homepage banner and About/Roadmap
  used to state a specific "N titles analyzed" and drifted out of sync
  with each other. Both were reworded to describe the watch history
  qualitatively instead — keep new copy in that spirit rather than
  reintroducing a number that only one page's rebuild step updates.
- **Mobile-first, and mind tap targets.** Susan mostly opens this on her
  phone. Interactive controls (`.pick-dismiss` in particular, the busiest
  control on the page) should have a real ~40-44px tap target even when the
  visible glyph stays small. As of 2026-07-30 this is real padding on the
  button box itself (`display:inline-flex; padding:13px 8px`), shared by
  `.pick-dismiss`, `.pick-watching`, and `.pick-watched` — not the old
  `::after` hit-slop overlay (an invisible, absolutely-positioned pseudo-
  element), which let adjacent buttons' clickable zones overlap and steal
  each other's clicks. Real padding means each button's own box is the hit
  area, so siblings can never overlap; see the 2026-07-30 changelog entry
  below for the bug that prompted the change.
- **Brand mark matches the family, in both glyph and size.** The nav
  brand mark is `⦿` (bullseye, not a plain `•`) at 19px/22px (mobile/desktop)
  next to `.brand .word` at 24px/30px — sized to visually match Vinyl
  Scout's and The Fitness Log's larger masthead treatment, not just share
  the same character. (2026-07-21: first the glyph was unified, then Susan
  flagged the two families still read as different sizes — the type scale
  was the other half of the fix.)
- **Spend requires Susan's go-ahead.** Domain registration, paid API keys,
  or any other real spend is her call, never taken on the agent's behalf —
  same rule the sibling sites operate under.

## Working principles

- **Brevity.** Explanations are a paragraph, not an essay. Don't
  re-explain how Netlify Functions or Blobs work in general.
- **Build to spec.** If it's not in this file, `README.md`, or a direct
  ask, it's not in scope.
- **Honesty over confidence.** If something can't be verified (a stat, a
  claimed automated check that doesn't exist), say so rather than
  asserting it.
- **This repo was reconstructed, not original.** Per `README.md`, every
  file here was rebuilt from the live deployed site on 2026-07-16/17 —
  there's no deep git history to lean on the way the sibling repos have.
  Treat anything not independently verified against the live site with
  appropriate caution, especially in `roadmap.html`/`guide.html`.

## 2026-07-26 — fonts + poster hygiene

- Fonts are SELF-HOSTED in `/fonts` (Lora latin-400
  normal+italic, official Fontsource release); the Google Fonts link tags
  are gone and netlify.toml serves `/fonts/*` immutable for a year. Don't
  reintroduce a Google Fonts request.
- Every poster `<img>` carries `decoding="async" width="1000" height="1500"`,
  and `loading="lazy"` on all but the first two (those stay eager for LCP).
  When the weekly artwork sweep adds or replaces a poster, keep these
  attributes intact and give new imgs the same set.

## Editorial standard

Editorial standard for external-facing docs: see ~/Projects/project-hub/EDITORIAL_STYLE.md (added 2026-07-28). Also re-verify watch-history-span claims against data/STREAMING_LOG.md; they drift.

## 2026-07-29 — serif swap: Instrument Serif to Lora

Susan didn't like Instrument Serif's high-contrast display feel. Replaced
with Lora everywhere the serif shows up (wordmark, page titles, poster
monograms, phase rails, stat numbers) — same self-hosted pattern, same
italic-only usage, same 400-weight-only files (`fonts/lora-latin-400-normal.
woff2` + `-italic.woff2`, official Fontsource release). This is scoped to
Streaming Scout only — the other 4 sites in the portfolio still use
Instrument Serif. Old `fonts/instrument-serif-*.woff2` files were left in
place rather than deleted (small, harmless, avoids touching netlify.toml).

## 2026-07-30 — Currently Watching fixes, tap-target bug, roadmap/guide cleanup

- Fixed a real bug: clicking "watching" could register as "watched" instead,
  because the old hit-slop technique (an invisible `::after` pseudo-element,
  absolutely positioned and centered on each button) let adjacent buttons'
  clickable zones overlap by ~20px when spaced only 1px apart. Replaced with
  real padding on the button elements themselves (`display:inline-flex;
  padding:9px 6px`) so each button's own box is the hit area and siblings
  can never overlap. Verified via `getBoundingClientRect()` before/after.
- Added visible `title` tooltips (matching existing `aria-label`s) to all
  `pick-watching`/`pick-watched`/`pick-dismiss` buttons — they had
  accessible names for screen readers but nothing for sighted mouse users.
- Added a `row-dismiss` (×) button to Currently Watching and In Theaters
  rows, reusing the existing dismiss/localStorage-sync infrastructure
  (`ssDismiss`, `applyDismissed`, `/api/dismiss`), extended to also match
  `.watching-row`/`.theater-row`.
- Removed the 23 redundant green-checkmark `avail-included` badges from
  Top Picks rows (kept the $ `avail-pay` badge, which still carries real
  information).
- Currently Watching now has 4 permanent static entries: Tucci in Italy,
  Grantchester (season 11), The Westies, and Say Nothing — all previously
  only reachable via the ephemeral client-side "watching" button, now
  committed directly so they persist regardless of localStorage state.
  Tucci's poster is Susan's own photo at `posters/tucci-in-italy.jpg`.
- Simplified the Taste Profile subheading (dropped the "full weight
  (rebuilt ... from the full 16-year history of 919 titles)" aside).

## 2026-07-31 — Security audit fix: stored XSS in Currently Watching

`renderWatchingRow(title, meta, posterHTML)` interpolated `title`/`meta`
straight into innerHTML. Both come from `/api/status`, which length-caps
them (200 chars) but never HTML-escapes them server-side — an attacker
could plant a script via that open endpoint. Added an `esc()` helper
(`&<>"'` character-map) and escaped `title`/`meta` everywhere they're
used in the row template, including the dismiss button's `title=`/
`aria-label=` attributes. `row.dataset.title` (a property assignment, not
an innerHTML sink) was correctly left unescaped. Top Picks/Coming Soon
rows are a separate render path fed from static rebuild-time HTML, not
this endpoint, so out of scope. Committed `335be2b`.

## 2026-08-05 — audit fixes: deploy-skip gap, contrast, dismiss/finished conflation, tap targets, docs

- `scripts/netlify-ignore.sh` only watched `*.html`/`style.css`/icons/
  `manifest.json`/`netlify/**`/`netlify.toml`/`package*.json` — not `src/`,
  even though `index.html` imports `src/logic.mjs` as a live ES module. A
  commit that only changed `src/logic.mjs` was silently treated as a
  no-op deploy. Added `src`, plus `fonts` and `posters` (also referenced
  by the pages, also uncovered), to the watched-path list.
- Two real WCAG AA contrast failures, despite roadmap.html's claim of
  meeting AA: `--mid` on `--mid-dim` (used by `.soon-date.tbd`,
  `.avail-badge.avail-pay`, and also `.chip.mid`/`.ro-chip.ro-progress`/
  `.phase__status--progress`, which share the same pair) measured
  3.22:1; darkened `--mid` from `#9c7a35` to `#7a5f29`, now 4.84:1.
  `.soon-date.unconfirmed` (`--ink-dim` on `--accent-dim`) measured
  4.35:1; switched its foreground to `--accent` (the pairing
  `.theater-badge` already uses successfully), now 7.10:1. `--ink-dim`
  itself was left untouched — it's tuned against `--bg`/`--card`
  elsewhere and touching it would have had a much wider blast radius than
  this one selector needed.
- `ssDismiss()`/`applyDismissed()` shared one flat `ssDismissedTitles`
  list for two different meanings: "not interested" (Top Picks/Coming
  Soon) and "finished watching" (Currently Watching/In Theaters).
  Marking something finished silently made it permanently ineligible to
  ever reappear as a Top Pick. Storage is now a list of
  `{title, reason, dismissedAt}` entries (`reason` is `"not-interested"`
  or `"finished"`); each row type in `applyDismissed()` only checks its
  own relevant reason. Old bare-string entries in a browser's existing
  localStorage are read as `"not-interested"` for backward compatibility.
  `/api/dismiss` already recorded `section` server-side, so
  `syncFromServer()` now derives `reason` from that instead of discarding
  it. `data/EXCLUDED_TITLES.md`'s own format is untouched — this only
  affects the client-side/localStorage + Blobs sync layer, not that file.
- Bumped `.pick-dismiss`/`.pick-watching`/`.pick-watched` padding from
  `9px 6px` to `13px 8px` — the real computed tap target after the
  2026-07-30 fix was only ~32-37px tall, short of the ~40-44px this file
  promised. Now ~40-45px tall across breakpoints. Horizontal padding was
  bumped more conservatively (6px → 8px) to avoid crowding three buttons
  plus the title/score into one row on narrow phones.
- about.html and roadmap.html both still said "one Netlify Function"
  (dismiss only); `status.mjs` has been live since 2026-07-29. Updated
  both to describe both functions.
- Removed guide.html's page-scoped `<style>` redefinition of
  `.mode-card`/`.mode-card.tint-*`, which duplicated rules already in
  `style.css` (the same class of issue `.wont-list--about` was renamed
  to avoid — see "Repository layout" above).

## 2026-08-05 — Currently Watching poster art lost on reload (Susan: "lioness is missing artwork ... do better")

Susan reported "Special Ops: Lioness, season 3" showing a gray "SP"
monogram instead of its real poster in Currently Watching. The actual bug
is more general than one title's image URL: `markStatus()` (fired by the
▶ button) captures the row's real `posterHTML` at click time and passes
it straight to `renderWatchingRow`, so it displays correctly in that
instant — but only `{status, meta}` were ever written into the persisted
status map (`getStatusMap`/`setStatusMap`, and the mirrored server copy
via `/api/status`). `applyStatuses()`, which is what actually rebuilds
Currently Watching on every page load and on every cross-device sync via
`syncStatusFromServer()`, called `renderWatchingRow(title, entry.meta)`
with no poster argument at all — so EVERY title ever marked "watching"
lost its poster the moment the page was reloaded or opened on another
device, not just Lioness. It happened to be the one Susan noticed first.

Fixed in `applyStatuses()`: before hiding the now-redundant `.pick-row`/
`.soon-row` for a watching title, it re-derives `posterHTML` from that
row's still-present `.poster-wrap` (same DOM the row was rendered with on
this page load, same technique `markStatus()` already uses) and passes it
through to `renderWatchingRow`. Deliberately NOT persisting posterHTML
itself into localStorage or the open, unauthenticated `/api/status`
endpoint — round-tripping raw HTML through that endpoint would reopen the
exact stored-XSS class the 2026-07-31 `esc()` fix closed for `title`/
`meta`. Re-deriving locally from markup this device already trusts avoids
that entirely.

**Why the earlier 2026-08-05 audit missed this:** that pass's frontend
review checked that every poster `<img src>` reference in the static HTML
was well-formed and that the `onerror="this.remove()"` fallback mechanism
existed — true, and irrelevant here, since this isn't a bad URL or a
broken fallback. It's a state bug: real poster markup gets fetched
correctly, then thrown away one render later. A static/grep-based review
of markup can't catch a "collected but never persisted" bug — it only
shows up by actually clicking the control and reloading. Added that exact
click-then-reload check to "How to verify a deploy" above so it's a
standing step, not a one-off; also this class of bug ("a value is read
correctly once but never carried through to the next render/reload") is
now a named thing to check for across the whole portfolio, not just here.

**Follow-up same day — the fix above was real but incomplete for Lioness
specifically.** At the time this entry was first written, the Lioness
`<img src>` pointed at
`upload.wikimedia.org/.../Lioness_%282025%29_title_card.jpg` — flagged in
that session's own notes as a suspected wrong file (the filename says
"(2025)"; the show premiered 2023) but left unfixed because Wikipedia's
domains all returned "cache-only, cannot be fetched" to WebFetch and IMDb
returned `ROBOTS_DISALLOWED`, so the URL couldn't be verified from this
environment and guessing a replacement risked shipping an equally wrong
one. That caveat should have been surfaced to Susan more clearly as "the
underlying image itself may still be broken, please check" rather than
implied only in an internal note — it wasn't, and the reload-persistence
fix above, while a real and separate bug, did NOT fix what Susan actually
saw: if the source image 404s, `onerror="this.remove()"` deletes the `img`
element itself, so `markStatus()`'s "capture the current poster markup"
step had nothing to capture in the first place, on every page load, reload
fix or not. Susan sent the correct official artwork directly. Rather than
re-attempt an external hotlink (Wikipedia or otherwise) that this
environment still can't verify loads, it's now hosted locally at
`posters/lioness.jpg` — the same pattern already established for Tucci in
Italy (`posters/tucci-in-italy.jpg`, per the Repository Layout section
above), which removes the "unverifiable remote URL" failure mode for this
title entirely rather than trading one unverified link for another.
`index.html`'s Coming Soon row updated to `src="posters/lioness.jpg"`.
**Worth a broader pass:** every other remote (non-`posters/`) poster URL in
this file carries the same unverified risk — a follow-up session should
spot-check each one loads (a live browser check, not another WebFetch
attempt against domains already confirmed to block it) rather than wait
for Susan to notice each broken one individually.

Separately, while tracing this: the Lioness poster's own source URL
(`upload.wikimedia.org/.../Lioness_%282025%29_title_card.jpg`) is the
only poster in this file sourced from Wikipedia rather than IMDb
(`m.media-amazon.com`, the pattern every other row uses and the only one
independently verified working here), and its filename's "(2025)" doesn't
match the show's 2023 premiere year — worth Susan's own eyeball check
next time the page is open; WebFetch cannot reach `upload.wikimedia.org`
to verify it directly (cache-only domain), and IMDb blocks automated
fetches via robots.txt, so this couldn't be confirmed or fixed
independently this session. If it does turn out broken, the existing
`onerror` fallback means it was already failing safely (monogram, not a
broken-image icon) — this note is about correctness, not an outage.

## 2026-08-06 — Kill Jackie poster art added

"Kill Jackie" (Prime Video, Catherine Zeta-Jones, Action Thriller) had
shipped in Coming Soon with no `<img>` at all — monogram-only ("KJ") — per
the note on Ted Lasso S4 above ("not sourcing an unverified hotlink after
the Lioness lesson"): no IMDb/Wikipedia search was attempted for it either,
same reasoning. Susan sent the official Prime Video key art directly
(a small, low-res promo still, ~200x251 — noticeably softer than the
1000x1500 IMDb-sourced posters elsewhere on this page, but real, sourced,
and hers). Hosted locally at `posters/kill-jackie.jpg`, same pattern as
`posters/lioness.jpg` and `posters/tucci-in-italy.jpg` — no unverified
remote hotlink. `index.html`'s Kill Jackie row updated to reference it;
the date label was also tightened from generic "TBD 2026" to "Fall 2026"
to match what the key art itself states, still marked with the `tbd` CSS
class since no specific date has been announced.

**Process note for future sessions:** this environment cannot browse
Wikipedia/IMDb (cache-only / robots-blocked, see above) and has no other
verified image search path for poster art — so for any title still
showing monogram-only, the honest move is to say so plainly rather than
leave it looking like an oversight, and ask Susan to send the art directly
if she wants it filled in before a real fix (working search access) exists.

## 2026-08-06 — Full Coming Soon artwork audit (per Susan's "find and replace it all") + Babylon Berlin S5 added

Scanned every row in Coming Soon, Currently Watching, and Top Picks for a
missing `<img>` inside its `poster-wrap`. Result: **Ted Lasso, season 4 is
the only remaining gap** — Kill Jackie (above) already closed the other
one. Same root cause and same fix path as documented above: no working
IMDb/Wikipedia search from this environment, so no new hotlink was
guessed. If Susan wants it filled in, sending the official key art
directly (same as Kill Jackie) is the fastest real fix.

Also added, same session: **Babylon Berlin, season 5** (final season) to
Coming Soon, per Susan's direct request. Real facts checked via web search
before adding (see below) — not assumed. US/Canada premiere is exclusive
to **MHz Choice**, not one of the three tracked services (Netflix/Prime
Video/Apple TV+) or the two Premium/Channel Add-ons already listed
(BritBox, PBS Masterpiece) — badged the same `avail-pay` "$" way Lioness's
Paramount+ requirement already is, per Susan's own standing preference
that off-tracked-service picks stay in the pool but get clearly badged.
No exact US date yet ("early 2027" per MHz Choice's own announcement,
German premiere confirmed Sep 2026) — `tbd` class, same convention as
Kill Jackie. No poster art, same reasoning as Ted Lasso S4 above. Not run
through a full taste-profile rescore (direct add, not a rebuild).

**Also surfaced, NOT added — flagging instead of guessing:** Susan asked
to add "the crow girl on prime" to Coming Soon. Checked before adding:
*The Crow Girl* is fundamentally a **Paramount+** production (UK: Channel
5), reachable via Prime Video only as a paid Channels add-on — same
category as BritBox/PBS Masterpiece, not a native Prime Video Original.
More importantly, Season 2 already premiered (UK: Jul 20, 2026; a Prime
Video listing for it already exists), so it isn't "coming soon" — it's
already out. Left off Coming Soon pending Susan's steer: log it as
watched/currently-watching instead, or was a different, still-unreleased
season/title actually meant? **2026-08-06 update: Susan said "ignore for
now" — still parked, no further action.**

## 2026-08-06, later — Ted Lasso S4 art filled in; Kill Jackie art upgraded

Susan sent two images directly, unlabeled — matched them by content since
the only real open art gap was Ted Lasso S4:

- **Ted Lasso, season 4**: official Apple TV+ key art (full cast, "TED
  LASSO" wordmark) — this was the one title still on monogram-only per
  the audit above. Hosted locally at `posters/ted-lasso-s4.jpg`, same
  no-unverified-hotlink pattern as every other locally-hosted poster in
  this file. `index.html` row updated; the "no poster art" sentence
  removed from its `pick-meta` note since it's no longer true.
- **Kill Jackie**: the second image (Catherine Zeta-Jones in a red gown,
  cinematic still) wasn't explicitly labeled as Kill Jackie art — inferred
  from content (matches "Catherine Zeta-Jones, Action Thriller," the only
  other title this session touched art for) since there was no other open
  art request it could reasonably answer. Flagged this assumption to
  Susan rather than silently guessing. Replaces the earlier low-res
  (~201×251) key art at the same path, `posters/kill-jackie.jpg` — same
  file, better source image, no `index.html` change needed since the
  `src` was already correct.

**Full artwork audit is now clean: zero monogram-only titles in Coming
Soon.** Worth a periodic re-check as new titles get added, same as the
2026-08-06 audit above did once.
## 2026-08-07 — Coming Soon had a real coverage gap: Prime Video/Amazon originals and actor-affinity films weren't being checked

Susan, directly: she's seeing Instagram ads for titles that never showed up
in Coming Soon, and asked us to do better. Investigated rather than just
apologizing — pulled the live Coming Soon list and found it genuinely
skewed: 6 of 15 rows BritBox, 2 PBS Masterpiece, 2 Apple TV+, 1 Paramount+,
1 MHz Choice, and only ONE native Netflix original (Black Doves S2) and
ONE native Prime Video original (Kill Jackie) — despite Prime Video and
Netflix being two of the three fully-tracked services, and despite Prime
Video specifically being home to her single deepest completed-run vein
(action thriller / Reacher-Statham-Neeson shelf, 0.8 weight, "steady since
2020" per TASTE_PROFILE.md).

**Root cause:** the `coming-soon` skill's own source list (britishtv.com,
pbs.org, denofgeek, Tudum, whats-on-netflix, justwatch) has no dedicated
Amazon/Prime Video source and leans on general Netflix-calendar sites that
don't reliably surface big single-service tentpole content — so a
franchise premiere as major as **Reacher season 4** (Prime Video, premieres
Aug 12 2026, 5 days out at the time this was caught) was never on the
radar at all. Same gap on the actor-affinity side: TASTE_PROFILE.md lists
specific named actors (Gillian Anderson, Denzel Washington, etc.) as
explicit signals, including Gillian Anderson added directly at Susan's
request just one day before this session — but no Coming Soon pass has
ever run a direct "what's this actor doing next" search per top-weighted
affinity name; it only searches by genre/outlet.

**Fixed this session — four titles added to the live Coming Soon list**
(delivered directly to `index.html` via the device bridge, verified via
reread, no CSS/cache-bust change needed):

- **Reacher, season 4** — Prime Video, confirmed Aug 12, 2026 (weekly
  through Sep 16) — Alan Ritchson, direct continuation of a franchise in
  the log since 2022. The single biggest miss found.
- **Animals** — Netflix, TBD 2026 — Ben Affleck/Gillian Anderson/Kerry
  Washington crime thriller (kidnap-ransom plot). Direct match on the
  Gillian Anderson affinity Susan added 2026-08-06.
- **Here Comes the Flood** — Netflix, TBD 2026 — Denzel Washington/Robert
  Pattinson/Daisy Edgar-Jones heist thriller (Fernando Meirelles).
- **Nocturne** — Apple TV+, confirmed Oct 30, 2026 — Liev Schreiber/Zazie
  Beetz/Stephen Graham crime drama, matches the British/Euro crime vein.

All four sourced from primary/trade outlets (Wikipedia, Netflix Tudum,
Apple TV Press, Hollywood Reporter, About Amazon) with real facts checked
before adding, not guessed. None run through a full taste-profile rescore
— each row says so plainly (no `pick-score` badge, meta text flags it as a
direct add), same honesty convention as the Ted Lasso S4 row. No poster
art sourced (same no-fabrication reasoning as Kill Jackie/Ted Lasso before
Susan supplied real images) — monogram-only for now.

**Standing lesson — added as a real process gap, not a one-off miss:**
future Coming Soon passes should not rely solely on the skill's own
source list. Two additions worth making a habit (and worth eventually
folding into the `coming-soon` skill itself, not just this doc): (1) check
press.amazonmgmstudios.com / Apple TV Press directly for tracked-service
tentpole originals, not just British/PBS-weighted outlets; (2) run a
direct "[actor name] new movie/show 2026" search for each top-weighted
name in TASTE_PROFILE.md's Actor Affinity section, especially any added
recently at Susan's explicit request (like Gillian Anderson) — genre/venue
search alone will keep missing these.

**Susan still needs to `git add`/`commit`/`push`:** `index.html` (the four
new Coming Soon rows above).

## 2026-08-07, later — GitHub Actions CI wired for real, first genuine run

Part of a portfolio-wide push (see Travel Intelligence's own CLAUDE.md,
2026-08-07 entry, for the full write-up shared across all three repos'
Actions setup) to make every sibling site more GitHub-based rather than
relying on manual `device_bash`/Netlify-only workflows. This repo's
`.github/workflows/test.yml` ran for real for the first time this session
and failed on `npm ci`, which requires a committed `package-lock.json` —
this repo never had one, having only ever run `npm install` by hand.
Fixed by generating a real lockfile via `npm install` against the actual
npm registry (Node 20, no `EBADENGINE` warnings — nothing here is
version-sensitive the way Vinyl Scout's `jsdom` dependency turned out to
be) and committing it. No code changes; this repo's tests (`tests/
logic.test.mjs`) were already real and already passing locally, so once
the lockfile existed the run went green immediately. Verified: full test
suite unchanged and passing, Actions run #3 green (17s). Delivered and
committed by Susan as `7a0df79`.

Nothing user-facing changed — this is CI/dependency-management plumbing
only, so no front-end (roadmap/about) update is needed alongside this
entry.

## 2026-08-08 — Coming Soon copy tightened; artwork sweep #2 (2 of 5 sourced, 3 confirmed not yet released)

Susan flagged the four most-recently-added Coming Soon cards (Reacher S4,
Nocturne, Animals, Here Comes the Flood) as too verbose against the
established house style, with an exact before/after example (Black
Doves' terse card as the target). Ted Lasso S4's card had the same
problem (leftover meta-commentary about its own scoring status) and was
included in the same pass even though not explicitly named. All five
`pick-meta` lines were rewritten to drop full cast lists down to 1-2
names, remove source-attribution clauses that weren't carrying real
information, and remove every trace of internal process commentary
("not yet scored against your taste profile," "added directly after
being flagged as a gap, not part of a full rebuild") — none of that
belongs in front of Susan; it was leftover from how the entries were
built, not decided display copy. Verified via `grep` that the terse
versions render as single-line `pick-meta` paragraphs with no meta
commentary remaining; `tests/logic.test.mjs` re-run clean (13/13,
unaffected by this — pure copy change, no logic touched).

**Artwork sweep, second pass (first pass logged above, 2026-08-06/07):**
Susan asked for a recurring sweep of Coming Soon titles missing artwork,
explicitly asked to make this a regular practice, not a one-off. Five
titles had no poster art as of this pass: Reacher S4, Nocturne, Animals,
Here Comes the Flood, Babylon Berlin S5.

- **Reacher S4** — sourced from Amazon MGM Studios' own press site
  (press.amazonmgmstudios.com), key art wired in. One honest caveat: the
  press release page hosts two images with no alt text distinguishing
  Reacher S4 art from the "Neagley" spinoff teaser; the URL used is
  positioned immediately before the "Watch the Official Reacher S4
  Trailer" heading, which is strong but not certain confirmation it's
  the right image. Worth a visual spot-check next time the site is open.
- **Nocturne** — sourced from Apple's own official TV press site
  (apple.com/tv-pr), key art wired in. High confidence: found via the
  official press release itself, URL path literally says "key-art-01."
- **Animals, Here Comes the Flood** (both 2026 Netflix films) — **no
  official poster or key art exists in circulation yet**, confirmed via
  Wikipedia and Netflix Tudum: neither film has an announced release
  date or a launched marketing campaign as of this check. Left as
  monogram-only; not a sourcing failure, there is genuinely nothing to
  source yet. Worth re-checking on a future sweep once either film gets
  closer to release.
- **Babylon Berlin S5** — still not sourced, now for a second time (see
  the 2026-08-06/07 entry above for the first attempt). Confirmed this
  pass that Wikipedia's own infobox references a real file
  ("Babylon Berlin.png"), but every path to the actual image binary
  (Wikimedia Commons, Special:FilePath, the Wikipedia API, any
  non-already-cached Wikipedia URL) is blocked in this environment as
  "cache-only, cannot be fetched." IMDb blocks via `robots.txt`. This is
  a tooling ceiling, not a due-diligence gap — left as an honest
  placeholder per this project's standing no-fabrication rule. If Susan
  wants this one specifically, the fastest path is her supplying the
  image directly, same as Ted Lasso S4/Black Doves/The Gold/Kill Jackie.

**Standing lesson for the next sweep:** official press sites (Apple TV
Press, Amazon MGM Studios press site) reliably work with this session's
web tools; Wikipedia/Wikimedia does not, for anything not already in
this environment's page cache. Check press sites first for any tracked
tentpole title going forward, rather than defaulting to Wikipedia.

**Susan still needs to `git add`/`commit`/`push`:** `index.html` (the
copy tightening plus the Reacher S4/Nocturne poster wiring above).

## 2026-08-08, later — small agentification step: automated content-drift check, weekly-scheduled

Per `claude/github-agentic-architecture-review-2026-08-07.md`'s recommendation
5 (automated maintenance checks, the lowest-risk piece of it doable without
any new credentials), added a genuinely small, concrete step: a script that
catches the exact "About page says X, the real data says Y" bug class this
project has hit by hand at least three times (the "4 services tracked" vs.
real-7 gap, 2026-08-06, documented in `claude/travel-intelligence-build-log.md`).

**What it does:** `scripts/check-content-drift.mjs` parses
`data/STREAMING_PROFILE.md`'s "Services Tracked" and "Premium/Channel
Add-ons" sections, counts the real number of tracked services, and compares
it against the number `about.html`'s "N services tracked" stat tile
actually shows. Exits non-zero with a specific, actionable message on any
mismatch; zero dependencies, zero secrets, safe in CI. Wired into
`package.json`'s `test` script, so it runs every time `npm test` does.

**Also added a weekly `schedule:` trigger to `.github/workflows/test.yml`**
(`cron: "0 13 * * 1"`, Mondays), on top of the existing push/PR triggers.
This means the drift check (and the full test suite generally) now runs
even in a week with zero code changes, catching the case where the data
file and the page copy drift apart from two *separate* edits days or weeks
apart, not just from one bad commit. No new secrets needed since this
reuses the exact same `actions/checkout` + `npm ci` + `npm test` job that's
already running and already green.

**Verified before delivery:** ran the script directly against the real
files (passes, 7 matches 7); ran it a second time against a deliberately
corrupted copy of `about.html` in an isolated `/tmp` directory (fails with
the expected specific message, real files untouched); validated the edited
`.github/workflows/test.yml` parses as valid YAML via `python3 -c "import
yaml; yaml.safe_load(...)"`.

**Why this is a good "one small step," not a bigger swing at recommendation
1:** it needs no PAT, no credential handling of any kind (the standing
blocker on direct-to-GitHub commits), extends infrastructure that's
already built and already green (the CI workflow from recommendation 2),
and it directly targets a bug class this specific project has proven, by
its own history, that a human/manual pass reliably misses. It's a genuine
first instance of "GitHub Actions catches something a person would
otherwise have to remember to check," the exact shape recommendation 5
describes, just scoped down to something buildable today with zero new
infrastructure.

**Susan still needs to `git add`/`commit`/`push`:** `scripts/check-content-drift.mjs`
(new), `package.json`, `.github/workflows/test.yml`.

## 2026-08-08, later — Sugar, season 2 added to Currently Watching (Susan: "i'm watching Sugar season 2")

Added a new `.watching-row` to `index.html`'s Currently Watching list, same
markup pattern as the existing four rows (poster-wrap, watching-info,
dismiss button). Badged Apple TV+, confirmed via web search (Sugar is a
Colin Farrell series, season 2 renewed and now airing on Apple TV+).

**Poster art:** sourced from Apple's own press site
(apple.com/tv-pr/originals/sugar), a video-poster thumbnail
(`Poster_0201.jpg`) rather than a true portrait key-art asset; confirmed
as a real, resolvable image (not a 404) before wiring it in. It renders
inside the existing `.poster-wrap img { object-fit: cover }` rule, so a
non-portrait source image gets center-cropped into the fixed poster slot
the same way any mismatched-aspect image would; worth a visual spot-check
once this deploys, and swapping in a true portrait asset later if one
becomes available.

**Also logged to `data/STREAMING_LOG.md`**, under the "reported by Susan
directly" convention already used for Tucci in Italy/Slow Horses/Only
Murders in the Building, since Apple TV+ watch-history sync is not yet
verified working (see `STREAMING_PROFILE.md`).

**Verified before delivery:** an exact-match-count guarded Python patch
(caught and fixed a real self-inflicted bug the first attempt introduced,
a missing closing `</div>` on the prior row plus one extra closing `</div>`
after the new row, both from an imprecise string-replace anchor); a global
`<div>`/`</div>` count balance check (230/230 after the fix); a plain
`html.parser` parse with no exceptions; `tests/logic.test.mjs` re-run
clean (13/13, unrelated to this change but a routine sanity check).

**Susan still needs to `git add`/`commit`/`push`:** `index.html`,
`data/STREAMING_LOG.md`, plus everything already queued from the earlier
2026-08-08 entry above (`CLAUDE.md`, `package.json`,
`.github/workflows/test.yml`, `scripts/check-content-drift.mjs`).

## 2026-08-08, later still — real bug fixed: stale "watching" status text frozen forever, plus a dangling label it exposed

Susan reported "not seeing" the earlier changes; live-checking the deployed
site turned up two real, separate things worth telling apart. Reacher
S4/Nocturne posters were both actually fine, an earlier screenshot had
just caught Nocturne mid-lazy-load before scrolling gave it time to
render; re-checked and confirmed loaded (472x266, `complete: true`) via
the page's own JS, no code change needed there.

**The real bug: Special Ops: Lioness, season 3 was still showing "New ·
Paramount+, not one of your tracked services" under Currently Watching**,
days after Paramount+ became a tracked service and that badge was removed
from the source. Root cause, confirmed by reading Susan's own
`localStorage` directly rather than guessing: `markStatus()` captures a
row's `.pick-score` text (`meta`) at the moment its "Currently Watching"
button is clicked, and `applyStatuses()` (which re-renders watching rows
on every page load) trusted that frozen snapshot forever. This is the
exact same staleness class the 2026-08-05 posterHTML fix already closed,
documented in the code comment right above it, just never applied to
`meta`. Susan clicked "Currently Watching" on Lioness before the
Paramount+ fix; the stale badge text got frozen into her `ssTitleStatus`
localStorage entry and no source-code fix since could ever reach it.

**Fix:** `applyStatuses()` now re-derives `meta` fresh from the
currently-rendered row's `.pick-score` (same technique already used for
`posterHTML`) every time it runs, falling back to the stored `entry.meta`
only when no matching row exists in the source at all. This self-heals on
the very next page load, no localStorage clearing needed, and fixes the
bug for every title that's ever been marked "watching," not just Lioness.

**Fixing that exposed a second, smaller, real bug**, confirmed by
simulating the fix against the live DOM before shipping it: Lioness's
`.soon-row` had already been client-side promoted to a `.pick-row` (its
Aug 2 date has passed), and `promoteReleased()`'s inline `'New · ' +
serviceLabel` string leaves a dangling `"New · "` with a trailing
separator and no service name whenever a promoted title has no
`.avail-badge` at all (exactly Lioness's case, now that it's tracked).
Extracted `newPickScoreLabel(serviceLabel)` into `src/logic.mjs` (the same
"export the pure logic for testability" pattern the file's other
functions use) so a badge-less title reads clean `"New"` instead. Two new
tests in `tests/logic.test.mjs`.

**Tucci in Italy's disappearance from Currently Watching is NOT a bug.**
Checked Susan's own `ssDismissedTitles` directly: she genuinely marked it
finished on 2026-08-05 (`reason: "finished"`). The site is correctly
honoring a real, deliberate action, not silently losing data. Left
untouched, said so plainly rather than "fixing" something that was
already working.

**Verified before delivery:** the exact `freshMeta` value the fix will
produce was simulated directly against the live page's real DOM and
`localStorage` via the browser console before writing a line of the fix,
not assumed; `tests/logic.test.mjs` re-run clean (15/15, up from 13, the
two new tests cover both branches of `newPickScoreLabel`); the extracted
inline `<script type="module">` block parses clean via `node --check`;
`div`/`</div>` balance still 230/230; the content-drift check still
passes (unaffected by this change, re-run as a routine sanity check).

**Susan still needs to `git add`/`commit`/`push`:** `index.html`,
`src/logic.mjs`, `tests/logic.test.mjs`.

## 2026-08-08, later still — Tony (2026, A24's Anthony Bourdain biopic) added to In Theaters and Top Picks

Susan: "add Tony to in theaters and top picks" with a Rotten Tomatoes link (rottentomatoes.com/m/tony_2026). Sourced real details before writing anything: RT page (94% Tomatometer, 63 reviews; US limited release Aug 7, 2026; dir. Matt Johnson; cast Dominic Sessa as young Anthony Bourdain, Emilia Jones, Leo Woodall, Antonio Banderas), cross-checked against Wikipedia's infobox for the release date and full cast list. Poster art verified as a real, loading image before use (not guessed): found the infobox `<img>` on Wikipedia's live page via Claude-in-Chrome, resolved its thumb path to the full-resolution original (`/wikipedia/en/6/68/Tony_%282026_film%29_poster.jpg`), and confirmed it loads (259x384, no error) via a `new Image()` check before writing the URL into the page.

Added two entries, matching each section's exact existing markup pattern:
- **In Theaters** (`#right-now`): a second `.theater-row`, after The Odyssey (same card, both now visible — this card was single-item until now, nothing in the CSS/JS restricts it to one).
- **Top Picks** (`#top-picks`): a new `.pick-row` at the top of the list (94% ties the current top score; placed first given it opened yesterday). Score tag reads "94% · In Theaters" rather than a streaming-service badge, since it's a fresh theatrical release, not on any tracked service yet. The reason line ties to a real, logged taste signal rather than a generic guess: Susan has already watched Bourdain's own Parts Unknown, No Reservations, and The Layover, plus the full Chef's Table franchise (STREAMING_LOG.md / TASTE_PROFILE.md, Food/cooking vein). "Open" link points to the Rotten Tomatoes page Susan gave, since there's no streaming listing yet.

No data-file changes (STREAMING_LOG.md is watched history, not upcoming picks; this follows the same pattern as every other Top Picks/Coming Soon entry, which also has no log entry until actually watched).

Verified before delivery: div-balance check (239/239), a full `html.parser` parse with no exceptions, and the real test suite (`npm test` — 15/15 logic tests + content-drift check, both pass unrelated to this change but confirms nothing broke).

## 2026-08-08, later — doc alignment pass: Phase 10 and the "what it is" section were both behind reality

Per Susan's "check review align and update as needed all the roadmaps, guides and about pages" request. Two real fixes:

`roadmap.html` Phase 10 ("Catch the account list up to reality") was still marked Future and described the tracked-services audit as entirely undone — but the tracked-services stat correction, the STREAMING_PROFILE.md update, and MGM+/Paramount+'s promotion to reviewed services all already happened 2026-08-06, and the content-drift check (2026-08-08) now guards the stat number itself. Moved Phase 10 to In Progress and rewrote it to state plainly what's done versus what's still open (MGM+/Paramount+ still lack a dedicated Coming Soon source the way BritBox/PBS Masterpiece have; Nat Geo and Hulu are intentionally off the tracked list, not an oversight).

`about.html`'s "what it is" section (01) still described only Netflix/Prime/BritBox/PBS Masterpiece, while the page's own lede paragraph and stat tile above it already say 7 tracked services including Apple TV+, MGM+, and Paramount+ — an internal contradiction on the same page. Rewrote it to match.

Checked `guide.html` against the actual Coming Soon skill's source list (BritBox, PBS Masterpiece, Netflix Tudum, Den of Geek, What's on Netflix, JustWatch) — still accurate, no dedicated MGM+/Paramount+ source exists yet, consistent with the Phase 10 rewrite above. No change needed there. Verified: all 15 logic tests plus the content-drift check still pass.

## 2026-08-08, later still: poster-artwork sourcing made a real recurring practice, not just a one-off sweep

Susan asked on 2026-08-07 that the poster-artwork sourcing sweep (real key art for Coming Soon titles that would otherwise render as monogram-only) become a regular practice rather than something that only happens when someone remembers to ask. That was left as an open process question after the first two sweeps (2026-08-08, 2 of 5 titles sourced).

Resolved by creating an actual scheduled task, not a note-to-self: a Claude Code Remote scheduled task ("Streaming Scout poster-artwork sourcing sweep," trigger id `trig_017gHNEMXsiQjcB8twdfq1dV`) now fires on the 1st and 15th of every month, starting 2026-08-15. Each firing starts a fresh session with a fully self-contained prompt: stage the current index.html/CLAUDE.md, find every Coming Soon title still monogram-only, search official press sites for real key art (never inventing or guessing a URL, matching this project's standing no-fabrication discipline), wire in anything genuinely found, leave the rest monogram-only with a note, and deliver back through the usual staged-file-plus-md5 path, never committing or pushing directly.

Chose a twice-monthly cadence as a reasonable middle ground rather than the two extremes the earlier sweep left open (tied to every ad hoc Coming Soon update, or a slower monthly pass): frequent enough that a newly released poster doesn't sit un-sourced for a full month, infrequent enough not to burn a session on a sweep that usually finds nothing new. Susan can adjust the schedule at any time; this isn't meant to be the final word on cadence, just an actual mechanism instead of an open question.

## 2026-08-09: dismissed-title sync gap found and closed; made a real recurring practice

Susan asked directly: "be sure to always remember when i delete a suggestion from coming soon." Investigating turned up a real, structural gap, not just a one-off miss.

**Root cause:** `dismiss.mjs`'s own code comment already documented this precisely: clicking the live "not interested" button on the site persists to the `dismissed-titles` Netlify Blobs store immediately (so a dismiss syncs across devices right away), but "this does NOT make an exclusion permanent across the next weekly rebuild... What this closes is the 'which device did I dismiss that on' gap, not the 'will next week's rebuild bring it back' gap." Top Picks and Coming Soon are static HTML baked in at rebuild time from `data/EXCLUDED_TITLES.md`, not read live from the Blobs store — and the `coming-soon`/`top-picks` skills themselves only ever read `EXCLUDED_TITLES.md` (step 4.5 in both skills' instructions), never the live API. The one and only sync from the live store into that file happened once, 2026-07-29, as a one-time manual pass, not an ongoing process.

**Checked the live store directly (`GET /api/dismiss`) and found the gap was real:** 14 total entries live, only the first 6 (through 2026-07-29) were reflected in `EXCLUDED_TITLES.md`. Eight titles dismissed on-site between 2026-07-29 and 2026-08-05 were never added: The Choral, Sunset Grove, Vanity Fair (2018), The Noble Detective, Prey, Grantchester season 11, Kleo, and Tucci in Italy — all genuinely vulnerable to reappearing in a future Coming Soon or Top Picks pass, since nothing was protecting them.

**Fixed:** `data/EXCLUDED_TITLES.md` resynced with all 14 live entries, full titles/sections/dismiss dates preserved, plus a dated note explaining the gap so a future session doesn't repeat the "one manual sync, never repeated" mistake.

**Made into a real recurring practice, not just a fix, matching the exact pattern already used for the poster-artwork sourcing sweep:** a new Claude Code Remote scheduled task ("Streaming Scout dismissed-title sync") fires weekly, Mondays at 14:00 UTC. Each firing starts a fresh session with a self-contained prompt: fetch `GET https://streamingscout.org/api/dismiss` live, stage the current `data/EXCLUDED_TITLES.md` from the device bridge, diff the two, append any titles present in the live store but missing from the file (same format as existing entries — title, section, dismissed-on date), leave everything else untouched, and deliver back through the usual staged-file path. Never commits or pushes directly; Susan still reviews and pushes the file update herself like every other change in this repo.

This closes the gap for real going forward, not just for the 8 titles found this pass — any future on-site dismiss will be reflected in `EXCLUDED_TITLES.md` within a week automatically, without anyone having to remember to run the sync by hand.

## 2026-08-09, later: manually added Apex (Charlize Theron) to Currently Watching, folded into taste profile

Susan asked directly to add "Apex with Charlize Theron" to the Watching list. Verified it is a real title before touching anything (this repo's standing no-fabrication rule): "Apex" (2026) is a real Netflix survival/action thriller starring Charlize Theron and Taron Egerton, confirmed via Wikipedia, Netflix Tudum, and multiple review outlets. Exact critical reception is contested across outlets (some report a strong score, some a weak one), so no specific rating number was invented or recorded, only the verified fact of the title and service.

Two things done, both following existing conventions rather than inventing new ones:

1. **Live sync:** POST to `/api/status` (title: Apex, status: watching, meta: Netflix), same mechanism the site's own "mark as watching" button uses, so this shows up immediately on every device. Confirmed live via a read-back GET.
2. **Permanent record:** added to `data/STREAMING_LOG.md` under the 2026 section, same "reported by Susan directly" format already used for Sugar/Slow Horses/Only Murders, so it survives the next weekly rebuild instead of only living in the (rebuild-blind) live Blobs store per this file's own documented governance model.

Susan also asked that manual adds like this one factor into the recommendation logic going forward, not just get logged. Checked `data/STREAMING_LOG.md` for prior Theron history first rather than treating this as a cold request: found The Old Guard and The Old Guard 2 both completed in 2025, a real prior pattern, not just today's ask. Added a new Actor Affinity entry to `data/TASTE_PROFILE.md` (Charlize Theron, 0.55, positioned near Daniel Craig/Alan Ritchson by weight) citing both the Old Guard duology and this Apex add, and noting it fits the already-established grounded-thriller action taste (Statham, Neeson) rather than the superhero/franchise pattern the same file flags as thin. This means the next `coming-soon`/`top-picks` skill run will actually weight Theron-led titles higher, not just this one.

A mistake caught and fixed in the same pass, not shipped: the first draft of both the STREAMING_LOG.md and TASTE_PROFILE.md additions used an em dash, this repo's one hard style rule prohibits that unconditionally. Caught before committing, both entries rewritten with parentheses/a colon instead.

Not committed or pushed yet; sitting on disk alongside anything else pending review.

## 2026-08-10: three Currently Watching titles stuck on "New" instead of "in progress"; permanent fix and the render bug both closed

Susan flagged Special Ops: Lioness season 3 showing "New" in Currently Watching when it should read "in progress," then the same symptom on Ted Lasso season 4 and The Hardacres season 2.

**Root cause:** the same incomplete-workflow gap as the dismissed-title sync issue from 2026-08-09, applied to a different feature. `status.mjs`'s own header comment already says a status flag written through `/api/status` is not permanent past the next weekly rebuild; the real fix is supposed to happen when the clipboard message the "mark as watching" button generates gets folded into `data/STREAMING_LOG.md` and rebaked into the static Currently Watching markup, the same way the site's other titles are hardcoded into `index.html`. That follow-through step happened for the original five titles and never happened for these three, so the live page kept rendering a frozen snapshot of the original Top Picks blurb text (`meta`, captured at the moment the button was first clicked) instead of real progress.

**Fixed, two layers:**
1. **Permanent record:** all three titles folded into `data/STREAMING_LOG.md` under the 2026 section (commit `36ff08b`), matching the existing "reported by Susan directly" format.
2. **Static render:** three new `.watching-row` blocks baked directly into `index.html` (commit `96831bf`), matching the exact markup pattern, real poster art, and badge already used for the other five Currently Watching titles (Paramount+ for Lioness, Apple TV+ for Ted Lasso, BritBox for Hardacres), rather than relying on the dynamic/localStorage render path that produced the bug in the first place.

A first attempt at a quicker fix (writing directly to the browser's localStorage) was tried and abandoned: fragile, per-device, and Susan explicitly asked for a permanent fix instead. Both commits confirmed live via Netlify's own deploy record (commit_ref: 96831bf) after an early check read stale because it ran before the automatic build had finished, not because the fix was wrong.

## 2026-08-11: Apex kept resurrecting after being marked finished; the actual gap in the dismiss flow, not another purge

Susan reported having to remove Apex from Currently Watching more than once, it kept coming back on reload.

**Root cause, read directly from `window.ssDismiss` and its helpers in `index.html`:** dismissing a Currently Watching/In Theaters row only ever called `addDismissed()` (a local hide-flag) and `postDismiss()` (a separate `/api/dismiss` tracking store). It never touched the actual "watching" status record, not the local `getStatusMap()`/`setStatusMap()` map, not the server-side `/api/status` record. That record is exactly what `applyStatuses()` reads on every page load to decide what to render, so a "finished" title with no static markup of its own (Apex never got baked into `index.html` the way the five original titles did) would always come back, no matter how many times the X button was clicked or the server record purged by hand after the fact.

**Fixed at the source (commit `f988408`):** `ssDismiss()` now checks whether the dismissal reason is `finished`, and if so, deletes the title from the local status map and calls a new `deleteStatus(title)` function (`DELETE /api/status?title=...`, matching the existing `postStatus()`/`postDismiss()` pattern) to clear the server record too. This does not depend on the order `applyDismissed()` and `applyStatuses()` run in, the underlying record simply no longer exists for a later page load to find.

Verified independently at every layer, not assumed: the source diff before commit, a live grep against the deployed page confirming the new code was actually served (deleteStatus appearing twice), and a live server-side check after Susan re-clicked the X confirming Apex's record was actually gone from /api/status.

## 2026-08-14 — automated post-deploy health check (roadmap Phase 06 / guide step 06's honest gap, closed)

Part of a cross-project punch-list pass (Vinyl Scout, Streaming Scout, Travel Intelligence, Fitness Log). This site's own docs already named the exact gap plainly: roadmap.html Phase 06 said "backups and a health check are still ahead," and guide.html step 06 said "there's also no automated check that a Monday update actually published." Closed the health-check half.

**What was added:** `scripts/smoke.mjs`, mirroring Vinyl Scout's own `scripts/smoke.mjs` pattern — read-only, zero secrets, safe against production anytime. Checks: the home page loads and contains real title text; `/CLAUDE.md` still 404s (netlify.toml's own redirect rule blocking internal docs, confirmed still working, not just configured); `/api/dismiss` and `/api/status` are both reachable and return the expected `{dismissed: [...]}`/`{statuses: [...]}` shape; a malformed `/api/dismiss` POST (no `title`) is rejected with 400, not silently accepted or 500ing. Deliberately does not exercise a real write round-trip — both Functions are intentionally unauthenticated, so a real POST would insert real junk into Susan's live Blobs stores, the same non-goal Vinyl Scout's own smoke test documents for its wishlist API.

**Wired into CI on a schedule, not left manual-only (the one place this deliberately does MORE than Vinyl Scout's own smoke.mjs, which is `npm run smoke` only, no CI wiring yet there).** `.github/workflows/test.yml` gained a `smoke` job and a second weekly cron (`0 15 * * 1` — Mondays 15:00 UTC, one hour after the "Streaming Scout dismissed-title sync" scheduled task at 14:00 UTC) plus `workflow_dispatch` for on-demand runs. The `smoke` job's own `if:` restricts it to `schedule`/`workflow_dispatch` events only — it deliberately does NOT run on every push. Reason: hitting the live site immediately after a push races Netlify's own deploy, which is not guaranteed to have finished by the time the push itself lands on GitHub — confirmed the hard way the same day on vinylscout.org, where Netlify's deploy record was still showing the previous commit 30+ minutes after a push had already landed and passed CI. A scheduled check that doesn't assume "just pushed" means "just deployed" is a more honest signal than a push-triggered one would have been.

**Honest scope of what this catches vs. doesn't, updated in both roadmap.html and guide.html rather than oversold:** this answers "is the site fundamentally healthy right now," not "did today's specific change actually publish" — it's a general trip-wire, not per-change verification. The manual live-site check in this file's own "How to verify a deploy" section is still the real control of record for any specific change; that section's own intro paragraph was updated to say so explicitly rather than let the new automation read as more than it is.

**Verified:** `node --check scripts/smoke.mjs` (syntax); the edited `.github/workflows/test.yml` parses as valid YAML (`python3 -c "import yaml; yaml.safe_load(...)"`) and passes `action-validator` (the real GitHub Actions schema validator, not just a YAML parse — this repo's own history has one prior instance, in Vinyl Scout, of a schema-invalid-but-YAML-valid workflow silently breaking an entire run); full `npm test` (15 logic assertions + content-drift check) still passes clean, unaffected by this change. Not run against the live site from this session — no network access to streamingscout.org from this environment, same standing constraint as every other from-this-session check; worth Susan or a future live-capable session running `npm run smoke` for real once this deploys, and confirming the new `smoke` job goes green on its first real Monday run (2026-08-17 UTC) or via a manual "Run workflow" click.

**Delivered:** `scripts/smoke.mjs` (new), `package.json`, `.github/workflows/test.yml`, `roadmap.html`, `guide.html`, this file. Committed locally, not pushed directly — same standing rule as every other project.

## 2026-08-14, later still — Babylon Berlin S5 art sourced; its Coming Soon copy tightened to house style

Susan flagged both directly from a screenshot: Babylon Berlin S5 still showing monogram-only art, and its `pick-meta` line noticeably longer than every other row's (a full sentence with a novel citation and a parenthetical about MHz Choice's date vagueness, versus terse one-liners like Kill Jackie's "Prime Video · Catherine Zeta-Jones, Action Thriller").

**Art:** previous attempts (2026-08-06, 2026-08-08) both failed — Wikipedia/Wikimedia URLs are cache-only in this environment, IMDb blocks via robots.txt. Per this file's own standing lesson ("check press sites first... Wikipedia/Wikimedia does not [work]"), searched MHz Choice's own press site this time instead and found a real press release page with a genuine key art image (`mhzchoice.com/wp-content/uploads/2025/02/Babylon-Berlin-S5.jpg`, 1920x1080, confirmed via the page's own `og:image` meta tag). Verified the URL actually resolves to real image bytes (not a 404) before wiring it in — WebFetch returned "Image content is not supported" against the URL directly, which only happens when the server responds with real binary image data, not an error page. Wired in as a direct hotlink to the press site, same pattern already used for Reacher S4 (`media.press.amazonmgmstudios.com`) and Nocturne (`apple.com/tv-pr`) — official press URLs are hotlinked directly in this repo, only Susan-supplied or previously-broken sources get downloaded and hosted locally under `posters/`.

**Copy:** rewrote the `pick-meta` line from a full sentence (novel citation + a parenthetical justifying why the release date is vague) down to the same terse "Service · Cast · qualifier" shape every other row uses: "MHz Choice (US/Canada exclusive) · Volker Bruch, Liv Lisa Fries · the fifth and final season." Dropped the novel reference (not carrying real information for a viewing decision) and the date-vagueness justification (redundant with the "Early 2027 (US)" badge already on the row, same over-explaining pattern the 2026-08-08 copy-tightening pass already fixed for four other rows).

**Verified:** div-balance check (251/251), a full `html.parser` parse with no exceptions, `npm test` (15/15 + content-drift) unaffected and passing clean.

**Delivered:** `index.html`, this file. Bundled, not pushed directly.

## 2026-08-16 — full punch-list pass: GitHub does most of the recurring upkeep now, tests extended, docs realigned

Susan asked for a front/backend punch-list, said "let's do it all today," authorized driving the whole thing, then said she'd run git herself from her own Terminal. Executed accordingly: all edits made via the device bridge, everything committed locally (never pushed from this session, per the standing rule below), Susan pushes.

**A real credential decision surfaced and was resolved conservatively.** The original punch-list assumed a GitHub PAT would be needed for Claude sessions to auto-open PRs. Susan initially agreed to provide a classic PAT, then instead said she'd drive her own Terminal. Investigating *why* the existing scheduled tasks already say "NEVER git push" turned up the real reason: it's a deliberate, repeatedly-stated standing rule across all five of Susan's sites (this repo, Vinyl Scout, Fitness Log, Travel Intelligence, project-hub), embedded directly in the weekly scheduled-task prompts themselves, not an accident of this repo alone. No PAT was requested or used anywhere in this session. Every change below either (a) stays entirely inside GitHub Actions' own default `GITHUB_TOKEN`, scoped to a single CI run, the same trust boundary as Dependabot, or (b) is a local commit on Susan's own machine that she pushes herself.

**Doc-vs-reality gap found and corrected:** this file's 2026-08-09 entry describes a weekly "Streaming Scout dismissed-title sync" Claude Code Remote scheduled task. It no longer exists (`list_triggers` returned only the artwork sweep and a consolidated five-site review — confirmed, not assumed). Rather than recreate it as its own agentic session, the gap it covered is fully mechanical (diff two lists, append in an existing format), so it's now a GitHub Actions job instead (see below) — a strictly better fit, and the actual literal answer to "make GitHub do most of the work." Also found: the artwork sweep's real cadence is weekly (Wednesdays 17:07 UTC), not "1st and 15th monthly" as an earlier entry claimed — corrected here, schedule itself left alone since more-frequent is a reasonable drift, not a regression.

**New offline checks, all wired into `npm test`:**
- `scripts/check-tap-targets.mjs` — asserts the `.pick-dismiss`/`.pick-watching`/`.pick-watched` padding that fixed two real click-target bugs (2026-07-30, 2026-08-05) is still present. Honestly scoped in its own header comment: confirms the CSS rule text, not an actual rendered box height (needs a browser).
- `scripts/check-pick-meta-length.mjs` — catches leftover internal-process commentary in Coming Soon copy (the 2026-08-08 "copy tightening" bug class), plus a loose length backstop. First calibration attempt used a 100-char threshold and produced 8 false positives against real, already-approved copy (real range: 25-186 chars, median 61) — recalibrated to 220 (just above the real max) so the length check is a backstop, not noise; the banned-phrase check is the one actually calibrated to the real incident.

**`scripts/smoke.mjs` extended:** now also asserts every static Currently Watching row has a real `<img>`, not just the monogram fallback — targets the exact bug class from 2026-08-05/08-10/08-11 (a value captured correctly once but never carried through to the next render). Read-only, uses the home-page HTML already fetched by check 1.

**Two new live-network drift checks, `scripts/check-dismiss-drift.mjs` and `scripts/check-status-drift.mjs`**, both fetch the real `/api/dismiss` / `/api/status` endpoints and compare against the repo's static state (`data/EXCLUDED_TITLES.md`, `index.html`). Neither could be tested against the real live site from this session — same standing constraint as `smoke.mjs` (this cloud sandbox's egress is allowlisted to package registries and GitHub/Netlify infra only; confirmed directly this session, `curl -I https://streamingscout.org` and a Node `fetch` both got `403 Host not in allowlist`, not a real reachability failure). Both were instead verified with a synthetic-fetch harness (mocked API responses, real parsing/comparison logic) covering both the "drift found" and "clean" cases before being wired into CI, where a GitHub Actions runner's unrestricted network will exercise them against the real site for real.

**`.github/workflows/test.yml` gained three new jobs** (all schedule/`workflow_dispatch`-only, never push-triggered, same reasoning as the existing `smoke` job): `status-drift` (report-only, opens/updates a tracking GitHub issue on failure — a real fix needs editorial judgment, not auto-fixable); `dismiss-drift` (runs `check-dismiss-drift.mjs --fix`, which mechanically appends any missing entries to `data/EXCLUDED_TITLES.md`, then opens a PR via `peter-evans/create-pull-request` using the default `GITHUB_TOKEN` if the file changed — the actual "GitHub does the work" version of the now-removed scheduled task above); `smoke` gained an `issues:write`-backed failure-report step, same pattern as the two new jobs. New `permissions:` block at the workflow level (`issues: write`, `pull-requests: write`) scopes exactly what these three failure/PR steps need; the `test` job itself still needs nothing beyond the default read access. Workflow YAML validated both via `python3 -c "import yaml; yaml.safe_load(...)"` and the real GitHub Actions schema validator (`npx @action-validator/cli`), not just a YAML parse — this portfolio has one prior instance (Vinyl Scout) of a schema-invalid-but-YAML-valid workflow silently breaking a run.

**Weekly artwork-sourcing sweep scheduled task updated** (`trig_01XueAdMhthAKzKrtrnnCe7K`): previously ended with a plain `git push` command implying straight-to-main. Now works on a dedicated `artwork-sweep-YYYY-MM-DD` branch and ends with both the branch-push command and a ready `github.com/.../compare/...?expand=1` URL so Susan can open a PR with one click instead of merging blind — CI now runs against that branch automatically once pushed. The standing "never push, Susan pushes from her own Terminal" rule is unchanged and explicitly restated in the updated prompt.

**Docs realigned to match all of the above:** `README.md` (new "GitHub Actions / CI" section, corrected test count — 15 assertions, not the stale 13), `roadmap.html` Phase 06 (describes the new CI jobs plainly, including what's still not auto-fixable), `about.html`'s stack-compare section (moved "exclusions written without a chat round-trip" and "health check" from "where it's headed" to "today," since both are now true; corrected a line implying the Monday scheduled task pushes directly, which was never accurate — it was always local-commit-only, same as every other Claude-driven change here), `guide.html` step 06 "What's still manual" (rewritten: the dismiss-permanence gap is now closed by CI, the real remaining manual piece is turning a live "watching" flag into a proper permanent entry with real artwork, which genuinely needs judgment). `guide.html`'s "Copy this prompt to start" seed prompt was checked against today's changes and left unchanged — it already promises "have that stick permanently" and "refresh itself on a schedule," both still true and, if anything, more true after today.

**Explicitly NOT done this session, carried forward rather than guessed at:**
- The Reacher S4 poster ambiguity (two candidate images on the source press page, flagged 2026-08-08, never resolved) and the MGM+/Paramount+ Coming Soon source gap (Phase 10) both need either live web research or an image-loads check — this cloud sandbox can reach neither (confirmed: image CDNs and streamingscout.org itself are both outside its egress allowlist). Left for the next artwork-sweep run or a device-bridge session with Claude-in-Chrome.
- "The Crow Girl" (parked 2026-08-06 at Susan's "ignore for now") — nothing new to act on; still genuinely Susan's call, not re-decided here.
- Confirmed (no fix needed): `.theater-row`'s CSS (`display: flex; gap: 10px; padding: 4px 0;`) has no single-item assumption, no `nth-child` restriction — already safe for the N>1 case Tony (2026-08-08) proved out.

**Susan still needs to, from her own Terminal:** `git add -A && git commit -m "..."` for anything not already committed by this session, then `git push`. See this session's own final report for the exact file list and suggested commit message.
## 2026-08-17: the lost-update bug in both Functions, fixed: one blob per title instead of one whole-list blob

The bug was found and documented on 2026-08-16 but deliberately not fixed in passing, because it needs a data migration. Scoped in the Streaming Guide project doc `claude/streaming-scout-next-lost-update-fix.md`; this entry is what was actually built against that scope.

**What was wrong.** `netlify/functions/status.mjs` and `netlify/functions/dismiss.mjs` both did read-modify-write against a single whole-list blob on every mutation: `get("list")`, rebuild the array, `setJSON("list")`. Netlify Blobs reads are eventually consistent, measured at roughly 5 seconds of lag against the live site. Two writes inside that window both read the same pre-write list, and whichever finished second wrote its copy back whole and silently discarded the first. It required no user error at all: two quick clicks on the live site were enough. Reproduced live on 2026-08-16 (`POST` Reacher S4 -> watching, then `POST` The Westies -> watching a few seconds later; The Westies stuck, Reacher reverted to watched).

**What replaced it.** Each title now owns its own blob key, `t_` + base64url of the UTF-8 title bytes, so two concurrent writes touch two different keys and neither can overwrite the other. Read-modify-write is gone entirely rather than papered over with a retry. Netlify's read lag itself is unchanged and still real: a GET immediately after a POST may not see the new entry for a few seconds. What is gone is the silent data loss.

Points that had to be got right, all named in the scope doc and all handled:

- **Key encoding.** Titles carry spaces, colons, commas and apostrophes ("Special Ops: Lioness, season 3", "Gardeners' World Winter Specials 2021"), so raw titles are not assumed safe as keys. base64url is stable, reversible and uses only `[A-Za-z0-9_-]`. The raw title is also stored inside the blob, so a read never depends on decoding a key; the key only has to be unique and legal. `keyForTitle` uses `TextEncoder` + `btoa` rather than `Buffer` so it does not assume a Node-only runtime.
- **Migration.** The legacy `list` blob is copied into per-title keys exactly once, guarded by a `migrated-to-per-title-v1` marker blob. The marker is load-bearing, not bookkeeping: without it, a title deleted after the migration would be resurrected from the legacy blob by the next cold start, which is precisely the 2026-08-11 Apex resurrection bug. The migration is idempotent (an existing per-title blob always wins over the older list copy) so racing cold starts write identical data. **The legacy `list` blob is deliberately not deleted**. It stays intact and recoverable until the per-title path is confirmed live. Deleting it is a separate, later change.
- **The read lag applies to the migration's own writes**, which would otherwise have served an EMPTY list for the first few seconds after deploy. The instance that performs the migration holds the entries it wrote in memory (`pendingMigrated`) and merges them into reads until the store returns them for real, then discards them. `POST` replaces the carried copy and `DELETE` drops it, so nothing in that window can serve a stale value back over a fresh write or appear to undo a deletion. This is the piece the original scope did not anticipate; it was caught by the test suite, not in review.
- **The 500-entry FIFO cap survives.** Both endpoints are unauthenticated by design, so the cap is the abuse bound and was not silently dropped. It can no longer be enforced by trimming an array in hand, so a POST that would add a brand-new title past the cap enumerates and evicts the oldest entries first. That path only runs when the store is actually full, so its extra reads never touch normal traffic.
- **GET cost.** One enumerate plus N fetches instead of a single blob read. At this project's real volume (6 statuses, 16 dismissals) it is nowhere near mattering; the tradeoff is documented in both files rather than discovered later.
- **Backward compatibility.** The GET contract is byte-identical: `{statuses:[...]}` and `{dismissed:[...]}`, same entry shapes, same ascending-timestamp ordering that the append-only list produced. `index.html`'s inline script, `scripts/check-dismiss-drift.mjs` and `scripts/check-status-drift.mjs` all consume these and none needed a change. POST and DELETE responses now fold the just-written entry into the returned list by hand, so a response never omits the thing it just saved.
- **dismiss.mjs's no-op-on-repeat behaviour is preserved**, including during the migration window, so a second click never bumps the original `dismissedAt` that `check-dismiss-drift.mjs` reports.

The two files keep their own copies of the shared helpers rather than importing a common module. Each Netlify Function is bundled independently and a shared import across the `netlify/functions` boundary is a deploy-time risk that buys very little at this size. Both files say so, and say that a change to the key encoding must be made in both.

**How it was verified, given the sandbox still cannot reach the live site.** New `tests/blobs-concurrency.test.mjs`, wired into `npm test`, runs both Functions exactly as written against a fake `@netlify/blobs` that reproduces the ~5 second read lag on a virtual clock (no sleeping, no flakiness). The real bare import is redirected by a module resolve hook (`tests/register-blobs-mock.mjs`, `tests/blobs-resolve-hook.mjs`) rather than a stub package under `node_modules`, so the suite works on a clean CI checkout where `npm ci` installs the real `@netlify/blobs`, and so neither production file carries a test-only branch.

The load-bearing test is the first one: it inlines the **old** read-modify-write logic and asserts that it **does** lose a write. A green suite therefore cannot be an artefact of a fake store that is simply too forgiving. 27 assertion groups in total, covering both writes surviving, the exact live Reacher/Westies reproduction, ten writes in one window, punctuation round-tripping, ordering, the full validation and method surface, the migration (shape, dates, legacy blob untouched, no empty window, no resurrection after delete, racing cold starts, a live write not clobbered), and the cap in both endpoints. `npm test` is green on Susan's machine: 15 logic assertions, 27 concurrency groups, plus the three existing offline checks.

**A claim made in this session's commit message is wrong, and the mistake is worth keeping.** That commit says the live status store had `Reacher, season 4` and `The Westies` marked `watched` while `index.html` carried both as static `watching-row` blocks, and presents that as fresh evidence of the lost-update bug. It is not true. Both records were already correct live, restored at 2026-08-17T00:14:38Z and 00:15:21Z, sitting in Currently Watching with the right meta text ("Season 4 · weekly through Sep 16 · in progress"). The commit message cannot be edited now that it is pushed; this entry is the correction of record.

The cause was reading the live endpoint through the WebFetch tool, which caches per URL and returned a pre-restoration snapshot. **This file already warned about exactly that** ("WebFetch summaries can silently omit things ... check the file on disk before reporting a discrepancy", and the 2026-08-16 note that WebFetch's 15-minute cache produced one stale read). The rule was there and it was not followed. Restated more strongly, since this is now the second time a discrepancy has been reported off a WebFetch read: **for any live-state check after a write, or any check whose answer would be reported as a discrepancy, read through the browser (Claude in Chrome against Susan's logged-in session), not WebFetch.** A `?cb=` cache-busting query parameter on the fetch is cheap and worth adding.

**Live verification after the push, done through the browser.** All 6 status entries and all 16 dismissals survived the migration with identical dates, so nothing was lost. The acceptance test passed: two POSTs 1.5 seconds apart, well inside the read-consistency window that used to eat one of them, and **both survived**, along with two further probe writes. Under the old whole-list code the first of those two would have been silently discarded.

One observation worth recording for future deploys: for several minutes after the push, `GET /api/status` alternated between returning 6 entries and returning 10 (the 6 real ones plus the 4 throwaway probes). That is the old and new deploy versions both serving during Netlify's rollout: the old code reads the legacy `list` blob, which the new code deliberately leaves untouched, while the new code reads the per-title keys. It is the expected consequence of keeping the legacy blob, not a fault, and it resolves once the rollout completes. It is also a concrete reason **not** to delete the legacy `list` blob until well after a deploy has fully settled.

**Still open after this:** confirm the migration live (GET both endpoints after deploy, compare against the baseline, then re-run the two-quick-clicks reproduction and confirm both stick); correct the two status records above; delete the legacy `list` blob only once all of that is confirmed. Automated backups of `data/` (roadmap Phase 06) remain the next unstarted item.
## 2026-08-17, later: automated backups, closed against the hole that was actually open

The last item on roadmap.html Phase 06 said "automated backups are still ahead." Taken literally that is a copy job, and a copy job would have protected almost nothing: `data/` has been version-controlled since 2026-07-21, so GitHub already holds every past version of the log, taste profile and exclusion list. Susan chose to cover the two real gaps instead of the implied one.

**Gap 1: git keeps every version, but nothing notices a loss.** The 2026-07-21 failure was not a missing copy, it was that a scheduled task pointed at a dead ephemeral folder for weeks and the files were quietly rebuilt near-empty. A commit that empties STREAMING_LOG.md is just as green as any other. `scripts/check-data-integrity.mjs` is the trip-wire: every file in `data/` must be present, open with its own top-level heading, clear absolute floors (500 bytes, 10 lines), and not have dropped more than 30% in bytes, lines, `- **entry**` records or sections against `data/INTEGRITY_MANIFEST.json`. Offline, so it runs in `npm test` on every push and PR, before anything can land.

Deliberately not a checksum or exact-match check. These files are edited by real sessions every week; an exact check would fail constantly and be ignored within a month, which is worse than no check. Shrinking a file on purpose is fine and takes one command, `npm run data:manifest`, which rewrites the manifest so the drop appears as a reviewable diff in the same commit rather than being absorbed silently.

**Gap 2: the live records had no backup at all.** The watching/watched flags in the `title-status` Blobs store and the dismissals in `dismissed-titles` exist only inside Netlify, are written by an unauthenticated endpoint from any device, and if that store were wiped there would be nothing to restore from. `check-dismiss-drift.mjs` carries dismissals into `EXCLUDED_TITLES.md`, but only dismissals, and only the missing ones; nothing has ever preserved the status store. `scripts/backup-live-records.mjs` snapshots both into `backups/live-records/YYYY-MM-DD.json` plus a `latest.json` pointer, and the new schedule-only `backup` job in `.github/workflows/test.yml` runs it weekly and opens a PR through GitHub's own bot identity, same pattern and same trust boundary as `dismiss-drift`.

**The interesting part of that script is what it refuses to do**, since a backup that writes an empty file over a good one is worse than no backup and is close to the shape of the July loss. A failed or non-OK fetch aborts; a malformed response aborts; a snapshot with fewer records than the last good one aborts unless `--allow-shrink` says the shrink is intended; an unreadable existing snapshot aborts rather than being overwritten. An identical snapshot is not rewritten, so a quiet week produces no empty PR.

**Verified before delivery.** New `tests/backup-guards.test.mjs`, wired into `npm test`, drives both scripts end to end rather than testing extracted helpers: the integrity check against throwaway copies of the real `data/` in a temp directory (blanked file, stub file, large truncation that still looks plausible, deleted file, changed heading, missing manifest, and a realistic week of ordinary editing that must NOT trip it), and the backup script against a local synthetic HTTP server (first write, no-op on no change, real addition, refuses a shrink, refuses an empty, honours `--allow-shrink`, aborts on 500, aborts on malformed, aborts on unreachable, aborts on an unreadable existing snapshot). 20 assertion groups, all passing.

One harness bug worth recording because it looks exactly like a bug in the code under test: the first draft ran the child scripts with `execFileSync`, which deadlocked against the synthetic server running in the same process. The server could never answer, so every fetch timed out and the backup script looked broken. Switched to async `execFile`.

**Not seeded from this session.** The obvious next step is a first snapshot, but this sandbox cannot reach streamingscout.org and hand-transcribing the live JSON through a browser console would be exactly the kind of copy that introduces a silent error into the file whose whole job is to be trustworthy. The honest path is a manual "Run workflow" on the Actions tab once this is pushed, which produces the first snapshot as a reviewable PR through the same code path every later run uses.

**Workflow YAML validated** with both `yaml.safe_load` and the real GitHub Actions schema validator (`@action-validator/cli`), per the standing rule from the Vinyl Scout schema-valid-YAML incident.

**Delivered:** `scripts/check-data-integrity.mjs`, `scripts/backup-live-records.mjs`, `tests/backup-guards.test.mjs`, `data/INTEGRITY_MANIFEST.json` (all new), `.github/workflows/test.yml`, `package.json`, `README.md`, `roadmap.html`, `about.html`, this file.
## 2026-08-17, later: 21 rows were shipping as bare monograms. Susan found it, again. Now a check finds it first.

Susan, directly: "you're missing tons of artwork ... fix and DO BETTER." She was right, and the "do better" is the important half of this entry.

**What was actually wrong.** 21 of the 48 title rows in index.html had no `<img>` at all. Thirteen were visible on the page: five Top Picks from the 2026-08-17 rebuild (Annika, The Old Man, Tehran, Lupin, Omnivore) and eight Coming Soon. The other eight were the rest of that same rebuild (1923, A Working Man, Bookish, Becoming Led Zeppelin, The Bear, Miss Austen, A Very English Scandal, Clarkson's Farm), sitting in the file with no art, waiting to be seen. The rebuild added thirteen picks and sourced art for none of them.

**A false alarm on the way in, worth recording.** The first live-page scan reported 38 broken images. It was wrong. Rows hidden by the dismiss/status overlay keep their `loading="lazy"` images unloaded, so `naturalWidth === 0` reads as "broken" when nothing is broken at all. Scoping to rows the user can actually see, forcing `loading="eager"`, and scrolling the page first gave the real answer: nothing broken, 13 simply absent. Do not report an image as broken without ruling out that it was never asked to load.

**The sourcing problem is solved, and this is the part to remember.** Four previous sweeps (2026-08-06, 08-07, 08-08, 08-14) all ran into the same wall: Wikipedia and Wikimedia are cache-only from a Claude session, IMDb blocks on robots.txt, and official press sites only cover tentpole titles, so ordinary catalogue shows were left as monograms and Susan was asked to supply art by hand. **themoviedb.org works, from a real browser on Susan's machine.** It has a poster for essentially every title here including unreleased ones, its pages can be fetched same-origin from a TMDB tab so a whole batch resolves without navigating once per title, and its CDN (`image.tmdb.org`) hotlinks fine from streamingscout.org. All 21 posters were sourced in one pass.

Identity was confirmed per title rather than assumed, because the Reacher/Neagley ambiguity from 2026-08-08 is exactly how a plausible wrong image gets shipped: each candidate was matched on its synopsis, and the two genuinely ambiguous ones (Last Seen, American Hostage) were confirmed against their TMDB cast lists (Patrick Brammall and Maxine Peake; Jon Hamm and Mireille Enos) before use. Then all 21 were rendered in a grid and **looked at**, not just checked for a 200. Every one is the right title, at 500x750.

**The real fix: `scripts/check-poster-coverage.mjs`.** Artwork gaps have now been found by Susan, on the live site, four separate times. `scripts/smoke.mjs` checks exactly one section (Currently Watching), only against the live site, only weekly. Nothing checked the rest, so the next gap was always going to be found the same way. This new check fails the build if any `pick-row`, `soon-row`, `watching-row` or `theater-row` in index.html has no `<img>` in its poster-wrap. Offline, in `npm test`, on every push and pull request, so a rebuild that adds picks without art cannot land.

It found the eight hidden rows the live-page scan could not see, which is the whole argument for checking the source file rather than the rendered page.

A genuine gap is still allowed, it just has to be declared: an `<!-- no-art: reason -->` comment immediately before the row passes the check and puts the reason in the diff. Animals and Here Comes the Flood were in exactly that state for weeks (no announced date, no marketing campaign, nothing in circulation) and both now have real posters, but the next title in that position should say so rather than going quiet.

The check deliberately does not verify that each URL resolves; that needs a network fetch and a browser, and it is smoke.mjs's job against the live site. This is the cheap structural check, which is the one that was missing. It also fails loudly if it matches zero rows, so a future markup change cannot silently blind it.

**Verified:** the coverage check fails on a deliberately stripped copy and passes on the real file; index.html parses clean with `html.parser`; div balance unchanged at 286/286; every new `<img>` carries the house attribute set (`decoding="async"`, `loading="lazy"`, `width="1000"`, `height="1500"`, a real `alt`, and the `onerror="this.remove()"` fallback); full `npm test` green on Susan's machine.

**One thing for Susan to decide, not decided here:** TMDB asks for attribution when their images are used. Nothing visible was added to the page, since that is a copy decision, not a bug fix. A one-line credit in about.html's stack section would cover it.
## 2026-08-17, last: the stale-copy rule made durable, and the trip-wire that was pointed at the wrong baseline

Susan, on the stale staged file that reverted a day of taste-profile edits: "remember and do better." Two things came out of that, one written down and one found while writing it down.

**The rule is now in the standing-rules block at the top of this file**, not only in a commit message where the next session will never see it. The existing rule ("read the target file fresh from disk right now, never from a copy staged earlier in the session") was already there and was still not enough, because the failure was not a stale read. It was a `cp` of a stale staged copy on top of the live file, which is a write, and the rule named reads. The new paragraph names the write, and adds the mechanic that would actually have stopped it: assert on the current size or a known marker before any whole-file replacement, and refuse a write that would shrink the file.

**The thing found while writing it: `data/INTEGRITY_MANIFEST.json` was baselined on the damaged file.** The manifest was refreshed during the window when `TASTE_PROFILE.md` was sitting at its reverted 13671 bytes, so the floor for that file was recorded as 13671 rather than the real 26538. The check passed cleanly the whole time, because the file had grown since. An identical repeat of the exact revert this check exists to catch would have passed silently. Two other files (`STREAMING_LOG.md`, `EXCLUDED_TITLES.md`) had also grown past their recorded baselines.

Refreshed with `npm run data:manifest`, and then verified rather than assumed: a throwaway copy of `data/` in a temp directory with `TASTE_PROFILE.md` truncated back to exactly 13671 bytes now fails with four specific problems (bytes, lines, entries, sections), where against the old manifest it passed. The real files were not touched by that test.

**Worth generalising: a shrink-tolerance trip-wire is only as good as when its baseline was captured.** Refreshing the manifest is a normal part of an intended shrink, which means the refresh command will sometimes be run in a session that has already damaged a file. `npm run data:manifest` is not a no-op to reach for at the end of a pass; run the check first, look at what it says, and only refresh when the current state is the state worth defending.

**Delivered:** `CLAUDE.md`, `data/INTEGRITY_MANIFEST.json`.
## 2026-08-17, later still: eight of twelve Top Picks were dead, and the worst three were recommendations for things already in her own log

The Monday automation fired for the first real time and opened two PRs (the
dismissed-title sync, and the first live-records backup snapshot, which is the
seeding step that could not honestly be done from a sandbox). It also opened
issue #4, the status-drift check failing. That issue is what started this, and
the real finding was several times larger than what it reported.

**What was actually wrong with the twelve-pick list.** Six were dead on arrival
by Susan's own actions: three marked watched on-site (Tehran, Abstract: The Art
of Design, The Greatest Night in Pop) and three dismissed (Life on Our Planet,
Springsteen on Broadway, Turning Point: The Bomb and the Cold War). None had
been removed from `index.html`, so they were invisible to her only because the
live status and dismiss sync suppresses them client-side. The next rebuild, or
any fresh browser, puts them straight back in front of her.

**The two found after that are the ones that matter.** Cross-checking every
remaining pick against `data/STREAMING_LOG.md` turned up **The Old Man** (Prime,
2 plays, 2022 to 2025) and **Call My Agent!** (Prime, 2 plays, 2026-07-09 to
2026-07-14). The rebuild recommended a show she finished five weeks earlier.
Abstract belongs in this group too: 9 plays between 2017 and 2019, so it was
never a watched-today problem, it was a bad pick from the start. Three of twelve
picks were titles sitting in her own watch log, in this repo, which nothing
compared against. The Old Man was also badged Hulu, which this file's own Phase
10 notes lists as deliberately untracked.

That leaves four genuinely valid picks: Annika, Lupin, Omnivore, Bad Sisters.

**The fix that matters is not the eight removals, it is
`scripts/check-picks-against-log.mjs`.** It parses every `pick-row` title and
every `- **Title**` entry in the watch log, normalises both (articles,
punctuation, season markers) and fails on a match. A pick carrying an explicit
season marker is allowed when that season is not itself logged, because a new
season of a finished show is a good recommendation and not a bug; the obvious
case is Reacher season 4. A deliberate rewatch is allowed too, declared with
`<!-- rewatch: reason -->` before the row, same convention as the `no-art`
marker. It fails loudly if it parses zero picks or zero log entries, so a format
change cannot silently blind it.

Verified against reality rather than a fixture: run against `git show
HEAD:index.html`, the file as actually shipped, it fails with exactly the three
real titles. A synthetic case confirms a later season passes and the same season
does not, and that the rewatch marker works.

**Taste profile, per Susan's standing instruction that dismissals feed the
logic.** The four later dismissals looked at first like the long-tail
diversification failing outright, and that reading is wrong. In the same sitting
she marked three long-tail documentaries as watched. Split by subject rather
than breadth: she keeps music and rock history, design and craft, food and
travel; she rejects natural history, filmed stage performance, and archival
political history. The thread in what she keeps is a person making something.
Recorded in `data/TASTE_PROFILE.md` with that reasoning rather than as a flat
list of rejects.

**Also worth noting about PR #7:** it is already incomplete. The sync job ran
this morning and caught six of the day's ten dismissals; the last four came
after it. Merging it is still right, a later run picks up the remainder. Worth
remembering before reading any single automated PR as the complete picture.

**Delivered:** `index.html` (eight pick rows removed),
`scripts/check-picks-against-log.mjs` (new), `package.json`,
`data/STREAMING_LOG.md`, `data/TASTE_PROFILE.md`, `data/INTEGRITY_MANIFEST.json`,
this file. Backfilling the list back to twelve is the next step and is
rebuild-sized, not a patch.
## 2026-08-17, and finally: Top Picks backfilled to twelve against the corrected profile

Eight replacements for the eight removed above. Every one checked against
`data/STREAMING_LOG.md` (none previously watched), against the live dismiss
store (none previously rejected), and against JustWatch for current US
availability on a tracked service, before any markup was written.

- **Bodyguard** (Netflix), political thriller. Rests on the Bourne films she
  reported watching on 2026-08-17, not on the British-crime vein.
- **Line of Duty** (BritBox), police corruption. Criminal Record's subject at
  length. Deliberately the dark end of vein 1, not the village end the
  dismissal record has been rejecting for weeks.
- **Ripley** (Netflix), literary crime.
- **Presumed Innocent** (Apple TV+), legal thriller. The Morning Show register.
- **SAS Rogue Heroes** (MGM+), war action. Same service and shelf as A Working
  Man, which she marked watched today.
- **Mr. Scorsese** (Apple TV+), filmmaking documentary.
- **The Andy Warhol Diaries** (Netflix), art and design documentary.
- **Louis Armstrong's Black & Blues** (Apple TV+), music documentary.

The last three are the corrected long-tail read in practice: maker-led craft
documentary, which she watches, rather than natural history or archival
political history, which she has now dismissed. Replacing Abstract with two
single-artist profiles and a jazz documentary is a deliberate test of that
reading, and the next dismissal round will say whether it holds.

Poster art: all eight sourced from TMDB, confirmed loading at 500x750 (the
Warhol poster is 500x735), and then rendered in a grid and looked at, per the
standing rule that a 200 response is not proof the image is the right title.

Result: twelve picks across twelve distinct clusters, the widest spread the
list has ever had, and `check-pick-diversity.mjs` passes on real variety rather
than on relabelling.

**One weaker point, stated rather than hidden.** BritBox and MGM+ have no
verified deep-link search URL from here: `britbox.com/us/search?q=` loads but
returns nothing for the query (checked live, signed in), so those two rows link
to the service home page rather than a search result. Netflix, Apple TV+ and
Masterpiece rows keep their existing working search links. Worth fixing with a
real show-page URL for those two next time either service is open.

**Delivered:** `index.html`, this file.
## 2026-08-17: Great British Bake Off, Collection 14 added to Coming Soon

Susan's direct add, with her own source (whats-on-netflix.com). Facts checked
before writing rather than taken on the note alone, per the standing rule.

Confirmed: Nigella Lawson replaces Prue Leith as judge (Variety, CNN, Today,
all January 2026). Paul Hollywood continues. Netflix US follows the Channel 4
UK premiere by days, on Fridays, per whats-on-netflix's own account of the
pattern. The September 4 date that outlet gives is its own projection from
prior years, not an announcement, so the row is marked `tbd` with "Early Sep
2026" rather than a confirmed date, which matches what Susan asked for anyway.

Two small things her note got slightly off, worth recording rather than
silently correcting: Netflix US brands the show **The Great British Baking
Show**, not Bake Off, and "Collection" numbering is Netflix's own, running
behind Channel 4's series numbers (this is UK series 17). The row keeps Susan's
"Bake Off" wording since that is what she calls it and what the poster says,
and the Netflix link searches the Baking Show title so it actually resolves.

No score badge, since the season has not aired and inventing one is not on.
Several existing rows already ship without a score, so this needed no new
convention.

**Poster, and its one honest flaw.** No Collection 14 art exists yet. TMDB's
show-level poster is real and loads (500x735) and was looked at, not just
fetched, but it shows the Prue Leith and Matt Lucas lineup, so it pictures the
judge this row is about replacing. The alternative, TMDB's series 16 season
poster, is a clean wordmark with no cast at all but reads "SEASON SIXTEEN" in
large type, which is a worse thing to have on a row about a different season.
Chose the cast photo as the lesser problem and flagged it to Susan rather than
quietly picking one. Worth swapping when real Collection 14 key art appears.

**Noticed while working here, not fixed:** Coming Soon has the same dead-row
problem Top Picks just had. The Marlow Murder Club season 3, Agatha Christie's
Tommy & Tuppence and Cooper and Fry season 1 were all dismissed on 2026-08-17
and are all still rows in this file. `check-picks-against-log.mjs` only covers
`pick-row`, and the dismiss-drift job only syncs `EXCLUDED_TITLES.md`; nothing
removes a dismissed row from the markup. Left for Susan's call rather than
deleted in passing.

**Delivered:** `index.html`, this file.
## 2026-08-17, last: the same dead-row bug in Coming Soon, seven rows not three, and PR #7 must be closed rather than merged

Following the Top Picks cleanup earlier today. The three dismissed Coming Soon
rows flagged in passing turned out to be seven, and the automated pull request
that was supposed to help is stale.

**`scripts/check-rows-against-exclusions.mjs`, new, offline, in `npm test`.**
Fails when any `pick-row`, `soon-row`, `watching-row` or `theater-row` in
`index.html` shows a title listed in `data/EXCLUDED_TITLES.md`. It respects the
section semantics that already matter elsewhere in this project: a Top Picks or
Coming Soon dismissal means "not interested" and bars a pick or soon row, while
a Currently Watching dismissal means "finished" and bars only Currently Watching
and In Theaters rows, never a future pick. Getting that backwards would
re-create the 2026-08-05 conflation bug in a check meant to prevent bugs.

It compares against the file rather than the live API on purpose. The
dismiss-drift CI job already carries the live store into `EXCLUDED_TITLES.md`,
so the file is the repo's own record and the right thing for an offline check
to trust. Two stages, each doing one job.

**What it found on its first run: seven rows, not three.** Beyond today's four
(The Marlow Murder Club S3, Tommy & Tuppence, Colin From Accounts S3, Cooper
and Fry S1) it caught **Prey** and **Vanity Fair (2018)**, both dismissed
2026-07-29 and still shipping nineteen days later, and **Tucci in Italy**, which
Susan marked finished on 2026-08-05 and which was still a Currently Watching
row. None were visible to her, because the client-side sync hides them. All
seven removed.

**PR #7 should be closed, not merged, and the earlier advice to merge it was
wrong.** Its six entries are already on `main`; they were added by hand in the
same sitting the titles were dismissed. The bot branch was cut from an older
`main` that morning, so merging it now would duplicate all six. This is the
second stale bot PR in two days (PR #6 was the first). The pattern is worth
naming: a scheduled job's pull request is a snapshot of the repo at fire time,
and on a day with real activity it goes out of date within hours. Check a bot PR
against current `main` before merging rather than trusting that it is additive.

The four dismissals that arrived after the job ran (Life on Our Planet,
Springsteen on Broadway, Turning Point, Cooper and Fry S1) are now in
`EXCLUDED_TITLES.md` by hand, with a note saying why the automated PR is not the
full picture for the day.

**Verified:** the check fails on a synthetic conflict in both directions, passes
a finished-dismissal against a future pick row (the case it must not flag),
honours a declared `<!-- re-added: reason -->` marker, and fails loudly if it
parses zero rows or zero exclusions. `index.html` parses clean, div balance
267/267, full `npm test` green.

**Delivered:** `scripts/check-rows-against-exclusions.mjs` (new), `index.html`,
`data/EXCLUDED_TITLES.md`, `data/INTEGRITY_MANIFEST.json`, `package.json`, this
file.
## 2026-08-17, after the push: all three new documentaries were already seen, and that says something about the log, not the picks

Live-checked the deploy rather than trusting the green build. Everything landed
correctly: the Bake Off row is there, all seven dismissed rows are gone, and
none of the eight removed picks came back. But only nine of the twelve picks
render, and the three hidden ones are the three documentaries added hours
earlier: Mr. Scorsese, The Andy Warhol Diaries, Louis Armstrong's Black & Blues.

Susan had marked all three **watched**, not dismissed. So the corrected
long-tail read was right, and then some: she does watch maker-led documentary,
to the point that she had already seen every one chosen to test the theory.

**The real lesson is about the watch log, not the picks.**
`check-picks-against-log.mjs`, added the same day precisely to stop
already-watched titles being recommended, could not have caught any of these.
None of the three is in `data/STREAMING_LOG.md`. The check is only ever as good
as the log, and the log is not complete.

One of the three is genuinely diagnostic. The Andy Warhol Diaries is a **Netflix**
title, and the 2026-07-25 backfill claims to have read Netflix viewing activity
back to its first entry, which did capture Abstract's nine plays from 2017 to
2019. So either the backfill is not as complete as its own note says, or Susan
uses the watched button to mean "seen it, take it away" rather than strictly
logging a play. Both are worth knowing and neither is guessable from here.
Recorded against the log entry itself rather than left as an assumption.

All three logged and removed, leaving nine picks across nine clusters.

**Process change worth making rather than repeating this.** Backfilling picks
straight into the file has now been partly undone twice in one day by titles
Susan had already seen and the repo had no way to know about. Proposing
candidates in chat first, and wiring in only the survivors, costs one message
and avoids a commit, a deploy and a live-page correction each time. Doing that
for the next three.

**Delivered:** `index.html`, `data/STREAMING_LOG.md`,
`data/INTEGRITY_MANIFEST.json`, this file.
## 2026-08-17, closing out: four picks proposed in chat first, all four survived

The process change from the previous entry, used immediately. Four candidates
were verified for current US availability on a tracked service and checked
against the log and the dismiss store, then put to Susan in chat before any
markup was written. She had seen none of them, so all four went in rather than
the three needed, which restores some headroom given how fast this list has
been getting consumed.

- **Sr.** (Netflix), Robert Downey Jr. filming his father, dir. Chris Smith.
- **Still: A Michael J. Fox Movie** (Apple TV+), dir. Davis Guggenheim.
- **The Velvet Underground** (Apple TV+), dir. Todd Haynes.
- **Number One on the Call Sheet** (Apple TV+), two parts, dir. Reginald Hudlin
  and Shola Lynch.

Thirteen picks across thirteen distinct clusters. Posters sourced from TMDB,
all confirmed loading at 500x750, and rendered in a grid and looked at.

**The one cost worth naming:** three of the four are Apple TV+, taking that
service to six of thirteen picks. That is a real concentration, and it follows
from where maker-led documentary actually lives rather than from a preference.
`check-pick-diversity.mjs` measures genre clusters, not services, so nothing
would have flagged it. Worth watching, and worth considering a service-spread
check if it keeps drifting that way, but not worth adding a check on a single
observation.

**The proposal-first loop is the thing to keep.** Two backfills in one day were
partly undone within hours by titles Susan had already seen and the repo had no
record of. One message beat a commit, a deploy and a live correction both times
it would have been needed.

**Delivered:** `index.html`, this file.
## 2026-08-17, final: Susan confirmed what the tick button means, and it invalidates two things written earlier today

Asked directly, she confirmed the on-site tick means **"seen it, take it away"**,
not "I watched this on this date". That is a small sentence with real
consequences, and two of them were already wrong in the repo.

**Corrected: ten log entries implied a watch date they never had.** Every entry
written from a tick today read "reported by Susan directly, 2026-08-17, via the
on-site watched button". That reads as a viewing on 2026-08-17. It is not; it is
a clearing on 2026-08-17, of viewing that could be from any year. All ten now
read "cleared by Susan via the on-site tick button, 2026-08-17 ... already seen,
watch date unknown", and `data/STREAMING_LOG.md` has a new section next to its
entry format saying so once, properly.

This is not pedantry. Several weights in `TASTE_PROFILE.md` lean on recency, and
the titles Susan clears are precisely the ones a rebuild has just surfaced, so
reading tick dates as watch dates would inflate the apparent recency of whatever
she rejects, every single week. Abstract: The Art of Design is the proof
available in this repo: nine plays from 2017 to 2019, ticked in 2026. Recorded
in `TASTE_PROFILE.md` as "authoritative when excluding, undated when weighting".

**Retracted: the claim that the Netflix backfill is incomplete.** Earlier today,
The Andy Warhol Diaries being absent from the log was written down as evidence
that "the backfill is not complete for documentaries". That was too strong on
one data point. A tick carries no service and no date, so its absence from the
Netflix backfill is equally consistent with a different profile, or with viewing
that predates the account. Reworded to an open question. The underlying question
is still worth answering, it just was not answered.

**The structural gap this exposes, not yet built.** A tick writes `watched` to
`/api/status` and nothing else. That hides the row on Susan's devices and never
reaches any permanent record, so the title stays in `index.html` and stays
eligible for the next rebuild. That is exactly the dead-row problem cleaned up by
hand twice today, and it will recur on every tick. The dismiss path already has
its answer: a scheduled job carries the live store into a repo file and opens a
pull request. The tick path needs the same shape, carrying `watched` entries
into `STREAMING_LOG.md` as dated-as-cleared entries. Mechanical, no judgement
required, and it would have prevented every instance of this found today. Left
as a proposal rather than built unprompted, since it means a CI job writing to
the watch log.

**Delivered:** `data/STREAMING_LOG.md`, `data/TASTE_PROFILE.md`,
`data/INTEGRITY_MANIFEST.json`, this file.
