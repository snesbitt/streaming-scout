# Streaming Scout

## Provenance of this repo

This repository was **reconstructed on 2026-07-16** from the live deployed
site at https://streamingscout.org. No original source files or git history
existed anywhere; the site only existed as deployed static assets on
Netlify. Every file here was rebuilt by fetching the live pages and assets
and reading back their markup/CSS/JS.

**Confidence by file:**

- `style.css`: recovered byte-for-byte (fetched twice via two independent
  methods that agreed exactly).
- `about.html`: recovered byte-for-byte via a full raw extraction of the
  live DOM.
- `index.html`: recovered with very high fidelity: the `<head>`, nav,
  "Right Now", footer, and the inline `<script>` block were extracted raw
  and verified character-for-character. The five Top Picks rows and ten
  Coming Soon rows were reconstructed from the same verified row template
  filled in with data (titles, scores, cast, poster URLs, hrefs) that was
  independently confirmed against the live page.
- `roadmap.html` / `guide.html`: the page shell, and the repeating
  "phase" / "step" block templates, were extracted raw and verified.
  The prose content of each phase/step was taken verbatim from the
  rendered page text, then placed into the verified template. This is a
  high-confidence reconstruction but was not independently byte-verified
  character-by-character for every paragraph the way `about.html` was.
- `manifest.json`: recovered byte-for-byte (fetched directly).
- Binary assets referenced in the markup (`apple-touch-icon.png`,
  `favicon-32.png`, `icon-192.png`, `icon-512.png`) have since been
  recovered from the live site and are present in this repo, verified
  live (distinct byte sizes, all loading correctly).

## Important architecture note (updated 2026-07-17)

As of 2026-07-16 this repo is connected to GitHub, and Netlify is
configured for Git-connected continuous deployment: pushes to `main`
auto-deploy, the same governance model as thefitnesslog.org and
vinylscout.org. As of 2026-07-17 the first real backend Function is
shipped: `netlify/functions/dismiss.mjs`, an open GET/POST/DELETE
endpoint (no edit key, same rationale as vinyl-scout's wishlist API:
nothing sensitive in a "not interested" flag, and a passphrase on mobile
isn't practical for a list this casual) backed by a Netlify Blobs store
called `dismissed-titles`. On 2026-07-20 the Function was hardened without
changing that no-auth design: a 200-character cap on `title`/`section`
rejects oversized input, and the stored list evicts its oldest entry
(FIFO) once a new dismissal would push it past 500, so an open,
unauthenticated POST can't grow the store without bound. `index.html`'s
inline `<script>` now calls it
alongside `localStorage`: dismissing a title still hides it locally and
instantly, but the dismiss also POSTs to the Function so every other
device syncs on next load; no chat round-trip needed for that part
anymore. What the Function does **not** do: make an exclusion permanent
across the next weekly rebuild. Top Picks and Coming Soon are static HTML
baked into `index.html` at publish time from `EXCLUDED_TITLES.md`, not
read live from the Blobs store, so keeping a title out of next week's
freshly-rebuilt list still means pasting the copied message to Claude and
updating that file (or letting the `dismiss-drift` CI job below do it).
`app.js` still doesn't exist as a separate file; almost all client-side JS
is still a single small inline `<script>` at the bottom of `index.html`;
as of 2026-07-23 that script is a `type="module"` script and imports its
date/dismiss logic from `src/logic.mjs` rather than defining it inline, so
that logic now has real unit tests (see Tests, below).

## Tests

`src/logic.mjs` holds the pure logic behind several features: Coming
Soon's date-based auto-promotion into Top Picks, the dismiss system's
list-merge logic, and the badge-label helpers behind the Currently
Watching status text. All are plain functions with no DOM/localStorage/
fetch dependency, so they're directly unit tested, using the same "export
the pure logic for testability" pattern vinyl-scout's `audio-preview.mjs`
and travel-intelligence's `fares.mjs` use. `index.html`'s inline script
imports from this module rather than duplicating the logic, so the tested
code and the live code are the same code, not two copies that can drift
apart.

Run `npm test`: fifteen steps in all. 15 logic assertions
(`tests/logic.test.mjs`, no network, no DOM), 27 concurrency assertion
groups covering both Netlify Functions
(`tests/blobs-concurrency.test.mjs`, added 2026-08-17, runs the real
Function files against a fake `@netlify/blobs` that reproduces the roughly
5-second read-consistency lag that used to lose concurrent writes; its
first test asserts the OLD storage logic still fails, so a green suite
cannot be an artefact of a too-forgiving fake), 20 backup-guard assertion
groups (`tests/backup-guards.test.mjs`, added 2026-08-17, drives
`scripts/check-data-integrity.mjs` and `scripts/backup-live-records.mjs`
end to end against a throwaway copy of `data/` and a local synthetic
server, proving each one refuses what it claims to refuse), 10 dismiss-drift
assertion groups (`tests/dismiss-drift.test.mjs`, added 2026-08-17 after the
check was found matching against the file's prose rather than its entry
lines, which meant a genuinely missing title could be reported as
accounted for), and 14 watched-drift assertion groups
(`tests/watched-drift.test.mjs`, covering the tick button's own
record-and-remove path, including the season-range logic that decides
whether a later season of an already-logged show still counts as
unwatched). Then ten offline static checks, added over time: content drift
(`scripts/check-content-drift.mjs`, About page's tracked-service count vs.
`data/STREAMING_PROFILE.md`), a tap-target regression guard
(`scripts/check-tap-targets.mjs`, added 2026-08-16, confirms the
`.pick-dismiss`/`.pick-watching`/`.pick-watched` padding that fixed two
real click-target bugs, 2026-07-30 and 2026-08-05, is still present),
a pick diversity check (`scripts/check-pick-diversity.mjs`, added
2026-08-17, fails the build when Top Picks collapses into one or two
genres -- Susan asked for diversified recommendations on 2026-07-25 and
again on 2026-08-17, and nothing was enforcing it; deliberately loose,
no cluster over half the list and at least four clusters once there are
five or more picks), a poster coverage check (`scripts/check-poster-coverage.mjs`, added
2026-08-17, fails the build if any title row in `index.html` would
render as a bare monogram instead of real art -- artwork gaps had been
found by Susan on the live site four separate times and nothing in the
repo ever checked; declare a genuine gap with an
`<!-- no-art: reason -->` comment before the row rather than leaving it
silent), a data integrity check (`scripts/check-data-integrity.mjs`, added
2026-08-17, fails the build if any file in `data/` is emptied, deleted,
renamed or sharply shrunk against `data/INTEGRITY_MANIFEST.json` -- git
already keeps every version of those files, what it does not do is
notice; shrink one on purpose with `npm run data:manifest` in the same
commit so the drop is reviewable), and a pick-meta copy check
(`scripts/check-pick-meta-length.mjs`, added 2026-08-16, catches leftover internal-process commentary in Coming Soon
copy, the exact class of thing Susan flagged by hand 2026-08-08), a
picks-against-log check and a rows-against-exclusions check
(`scripts/check-picks-against-log.mjs` and
`scripts/check-rows-against-exclusions.mjs`, both added 2026-08-17, so a
rebuild cannot recommend something already watched or keep shipping a row
for a title that was removed), an em-dash check
(`scripts/check-no-em-dash.mjs`, in character and entity form, across the
public pages and the stylesheet), and a hardcoded-count check
(`scripts/check-no-hardcoded-counts.mjs`, which fails the build if a public
page states a raw "N titles" figure that will be stale within the week).
`npm run smoke` and `npm run check:live-drift` are separate, live-network
checks against the real deployed site. See "GitHub Actions / CI" below for
where those actually run.

## GitHub Actions / CI (added 2026-08-16, extending the 2026-08-07/08-14 work)

`.github/workflows/test.yml` runs six jobs:

- **`test`**: on every push and pull request, plus a weekly cron.
  `npm ci && npm test`, all fifteen offline steps above. This is the only
  job that runs on push/PR. The five below are schedule/
  `workflow_dispatch`-only so they never race Netlify's deploy (see the
  workflow file's own comments for why that matters, confirmed the hard
  way on a sibling site, whose deploy record lagged a landed, CI-passed
  push by 30+ minutes).
- **`smoke`**: weekly + on-demand. Read-only checks against the real live
  site: home page loads, internal docs stay blocked, both API Functions
  reachable and validating input, and, added 2026-08-16, every Currently
  Watching row has real poster art wired in rather than the monogram
  fallback. Opens/updates a tracking GitHub issue on failure.
- **`status-drift`**: weekly + on-demand. Checks whether anything marked
  "watching" live via `/api/status` is missing a matching static
  `.watching-row` in `index.html` (the exact gap behind two real bugs,
  CLAUDE.md's 2026-08-10 and 2026-08-11 entries). Report-only, since a real
  fix needs editorial judgment about poster art and season text. Opens or
  updates a tracking issue on failure.
- **`dismiss-drift`**: weekly + on-demand. Checks whether anything
  dismissed live via `/api/dismiss` is missing from
  `data/EXCLUDED_TITLES.md`. This one auto-fixes: it's a purely mechanical
  diff-and-append, so the job runs `check-dismiss-drift.mjs --fix` and
  opens a PR via GitHub's own bot identity (the workflow's default token,
  not a Claude session) when it finds and fixes anything. Susan reviews
  and merges.
- **`watched-drift`**: weekly + on-demand. The tick button's counterpart to
  `dismiss-drift`. Checks whether anything marked watched live via
  `/api/status` is missing from `data/STREAMING_LOG.md`, and can record it
  and strip the stale row itself.
- **`backup`**: weekly + on-demand, added 2026-08-17. Snapshots the live
  `/api/status` and `/api/dismiss` records into `backups/live-records/` and
  opens a PR when they have changed. These records live only inside Netlify
  Blobs and had no backup at all; `data/` has been version-controlled since
  July, so git already covers that side. The script refuses to overwrite a
  good snapshot with a smaller or empty one (a shrink fails the job rather
  than quietly replacing the copy you would restore from) and writes nothing
  when nothing changed, so a quiet week produces no PR.

**On the standing "Claude never pushes, only Susan pushes from her own
Terminal" rule:** unchanged, and still applies to every interactive Claude
session and scheduled Cowork task (the weekly artwork-sourcing sweep, for
example, works on a dedicated branch and hands Susan a one-click
PR-compare link instead of pushing to `main`). The `dismiss-drift` and
`backup` jobs above are a different trust boundary: they are this repo's own CI robot, acting
through GitHub's automatically-scoped token within a single Actions run,
the same pattern tools like Dependabot use. Neither is a Claude session
with push access.

## 2026-07-21 update: persistent data now lives in this repo

The `streaming-scout-weekly-resync` scheduled task previously pointed at a Cowork
session's own ephemeral output folder for `STREAMING_LOG.md`, `TASTE_PROFILE.md`,
`STREAMING_PROFILE.md`, and `EXCLUDED_TITLES.md`, believing it was reachable from any
session. It wasn't; that task had been silently failing for an unknown number of
weeks, and most of that data (years of watch history, the derived taste profile, most
of the exclusion list) is unrecoverable. One exclusion was recovered from the live
`dismiss.mjs` Blobs store. These four files now live in `data/` in this repo instead,
so they're real, versioned, and stable across sessions. See `CLAUDE.md`'s "Where the
persistent data actually lives" section and each file's own header in `data/` for
details.

## Is Top Picks / Coming Soon data static or dynamic?

**Mostly static, with one live sync.** The Top Picks and Coming Soon rows
themselves are plain HTML baked into `index.html` at publish time
(presumably by a Claude-run rebuild step, per the Roadmap); there's no
database and no per-visit content generation. The availability icon
(subscription-included vs. pay-to-watch) shipped as part of that same
static markup; it's not a separate feature anymore.

The one live piece is dismissals. Clicking a title's "×" calls
`/api/dismiss` (`netlify/functions/dismiss.mjs`, backed by Netlify Blobs)
so the dismissal syncs across every device immediately, in addition to
hiding the row locally via `localStorage`. That's the only `fetch()` on
the page. Making a dismissal stick through the *next* weekly rebuild used
to require updating `data/EXCLUDED_TITLES.md` by hand; as of 2026-08-16
the `dismiss-drift` CI job (see above) does this automatically via a PR.

## Before treating this as authoritative

Do a careful diff/review against the live site before relying on this as
the source of truth. Parts of `roadmap.html` and `guide.html` were
reconstructed from rendered text plus a verified template rather than
extracted byte-for-byte. The four icon/image binary assets, listed as
missing in earlier drafts of this file, have since been recovered and are
present in the repo.
