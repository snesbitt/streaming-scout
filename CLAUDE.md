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
  sibling sites (Fraunces serif, cream/serif shell, `.card`, `.pill-nav`,
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
4. Say so plainly in the post-flight summary — "checked the live site"
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
  control on the page) should have a real ~44px tap target even when the
  visible glyph stays small — see the `::after` hit-slop pattern on
  `.pick-dismiss` for how to do that without changing the visual density.
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
