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

## Where the real logic lives (this repo is NOT it)

This repo is the *published snapshot* — static HTML, CSS, and one small
Netlify Function. It is not where recommendations get computed and it is
not where exclusions get tracked. Both of those live outside this repo,
in Susan's Claude app, as the `streaming-scout` Cowork skill bundle
(`streaming-setup`, `sync-watch-history`, `log-watched`, `top-picks`,
`coming-soon`):

- **The scoring logic** (signature vs. generic genre weighting, actor-
  affinity bonus, the taste profile) is not in this repo in any form —
  not as a script, not as a data file. It runs inside the Cowork skill
  bundle when Susan (or the Monday scheduled task) asks for a rebuild.
- **`EXCLUDED_TITLES.md`** — the file that makes a "not interested"
  dismissal stick across the *next* weekly rebuild — does not exist in
  this repo either. It's a data file inside the same skill bundle. Top
  Picks and Coming Soon in `index.html` are static HTML baked in at
  publish time by reading that file; this repo never reads or writes it
  directly.

If a task looks like "change how a title gets scored" or "make sure X
never comes back," the fix is in the Cowork skill bundle, not in any file
here — don't go hunting for a scoring script or an exclusion list in this
repo, they aren't here on purpose.

What genuinely does live in this repo: the dismiss Function
(`netlify/functions/dismiss.mjs`), which only makes a dismissal sync
across devices *instantly* — it is a separate, smaller thing from
`EXCLUDED_TITLES.md` and does not touch it. See the comment at the top of
that file and `README.md`'s "Important architecture note" for the exact
boundary between the two.

## Repository layout

- `index.html` — the dashboard. Everything is inline: styling comes from
  `style.css`, and all client-side JavaScript is a single `<script>` block
  at the bottom of the file. There is no `app.js` and none is planned —
  keep it that way; the whole point of this site is that it's simpler
  infrastructure than the other two sites, not the same shape at a smaller
  scale.
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
- `package.json` — exists only so Netlify bundles `@netlify/blobs` for the
  Function above. No build script, no test script, no dev dependencies.
- `manifest.json`, `netlify.toml`, icon/PNG assets — static PWA/deploy
  config, nothing dynamic.
- No `tests/`, no CI workflow, no `npm test`. Manual review is the only
  verification method this repo has — see "How to verify a deploy" below.

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

There is no automated health check for this site yet (Vinyl Scout and The
Fitness Log both have one; this is the honest gap Roadmap phase 06 and
Guide step 06 both call out — don't describe this site as having one it
doesn't). Until one exists, verifying a deploy means:

1. Confirm the Netlify build succeeded (green build ≠ nothing, but it only
   proves the files uploaded, not that a visitor sees a working page).
2. Open https://streamingscout.org (and any page you changed —
   `/about`, `/roadmap`, `/guide`) and actually look at it. Check that the
   change rendered, that nothing above/below it broke, and on a change
   touching `index.html`'s script, that dismiss still works.
3. Say so plainly in the post-flight summary — "checked the live site"
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
