# CLAUDE.md

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
- `netlify/functions/dismiss.mjs` — the only backend Function. Open
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
- `tests/logic.test.mjs` — 13 assertions against `src/logic.mjs`, no
  network, no DOM. Run with `npm test`. This covers the pure logic only;
  there's still no CI workflow, and no coverage at all for the dismiss
  Function, the static Top Picks/Coming Soon markup, or the poster-art
  fallback — manual review (see "How to verify a deploy" below) is still
  the only check for those. Don't let the presence of `npm test` read as
  "this site is now fully tested" — it isn't; this is a real but narrow
  start.

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

There is no automated *health* check for this site yet — nothing pings the
live site post-deploy the way Vinyl Scout and The Fitness Log's checks do;
that's the honest gap Roadmap phase 06 and Guide step 06 both call out,
don't describe this site as having one it doesn't. There is now a small
*unit* test suite (`npm test`, added 2026-07-23) — run it before any change
touching `src/logic.mjs` or the auto-promote/dismiss logic in
`index.html`'s script, but it doesn't touch a browser or the live site, so
it's not a substitute for the manual check below. Verifying a deploy means:

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
