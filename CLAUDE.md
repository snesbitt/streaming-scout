# CLAUDE.md

## Standing operating rules (read first)

Portfolio-wide checklist distilled from incident history across travel-intelligence, vinyl-scout-repo, streaming-scout, and fitness-log. Full narrative and the canonical version of this checklist live in the Travel Intelligence Claude project's `claude/standing-rules.md` and `claude/travel-intelligence-build-log.md` — keep this block in sync with that source if it drifts.

**Before claiming anything is done:** never say "pushed," "fixed," "deleted," or "live" based on a tool's success signal or Susan's own report alone — verify independently, every time. Push landed: `git rev-parse HEAD` vs `git rev-parse origin/main`. Deploy is live: check the actual URL (cache-bust if the response could be cached) or the platform's own deploy record. Deletion happened: re-fetch the resource directly. A UI fix "worked": check it in a live browser, not just the source diff.

**Before delivering a multi-file change:** read the target file fresh from disk right now — never from a copy staged earlier in the session. Grep the about-to-deliver files for markers of every recent feature touching the same files, to catch an accidental revert before it ships. Treat any documented delivery convention (e.g. a cache-bust `?v=N` bump) as a literal checklist gate before calling something delivered, not a fact to remember.

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
