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
  auto-promote logic from `src/logic.mjs`
  instead of defining them inline, purely so that logic can be unit
  tested (see `tests/` below) — this is not the start of a bigger
  refactor. Everything else stays inline; the whole point of this site is
  that it's simpler infrastructure than the other two sites, not the same
  shape at a smaller scale.
- `src/logic.mjs` — the only extracted (non-inline) client-side logic:
  `isReleased`, `serviceLabelFromBadgeTitle`, `newPickScoreLabel` (all three
  imported by `index.html`) and `mergeDismissedTitles` (tested, but no longer
  imported by the page). Pure
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
- `netlify/functions/dismiss.mjs` — one of two backend Functions. GET is
  open; POST and DELETE need an `X-Edit-Key` header matching the site's
  `EDIT_SECRET` (roadmap phase 8, shipped 2026-08-23) and fail closed with a
  500 if that variable is unset. Bounded as well: a 200-char cap on `title`/`section`, and the Blobs list evicts
  its oldest entry once it would exceed 500. Backed by a Netlify Blobs
  store named `dismissed-titles`.
- `netlify/functions/status.mjs` — added 2026-07-29. Same
  design as dismiss.mjs above (open GET, edit-key writes, 200-char field cap,
  500-entry FIFO Blobs list), in its own store (`title-status`) since a watch
  status is a different signal than a dismissal. Tracks `watching`/
  `watched` per title so the Currently Watching (▶) and Watched (✓)
  buttons next to every pick sync across devices. Also does not touch
  the next weekly rebuild by itself — same gap as dismiss.mjs.
- `package.json` — bundles `@netlify/blobs` for the Function above, and as
  of 2026-07-23 runs the test suite via `npm test`. Still no build script,
  no dev dependencies.
- `manifest.json`, `netlify.toml`, icon/PNG assets — static PWA/deploy
  config, nothing dynamic.
- `tests/` and `scripts/` — what `npm test` runs (see `package.json` for the
  exact chain): seven suites in `tests/` (logic, blobs-concurrency,
  request-contract, write-auth, backup-guards, dismiss-drift, watched-drift)
  and ten offline checks in `scripts/` (data-integrity, poster-coverage,
  picks-against-log, rows-against-exclusions, pick-diversity, content-drift,
  tap-targets, pick-meta-length, no-em-dash, no-hardcoded-counts). Assertion
  counts are not stated here on purpose: they drifted before. **Still not
  covered:** whether a poster URL resolves, whether a rendered tap target is
  44px, and whether the page looks right. Those need a browser. `npm test`
  passing does not mean the site is fine; the live check in "How to verify a
  deploy" is the control of record.

## Deploy workflow

Git-connected continuous deployment, same governance model as
thefitnesslog.org and vinylscout.org — confirmed working since
2026-07-16:

```bash
git add <the files you changed>   # never -A: untracked cruft sits in this repo
git commit -m "..."
git push           # Netlify webhook auto-deploys main
```

Claude sessions commit; Susan runs the push when working from the cloud
bridge (no network access there) — end any "commit is ready" message with
the exact push command block.

## How to verify a deploy

As of 2026-08-14, there IS an automated *health* check (`scripts/smoke.mjs`
+ the `smoke` job in `.github/workflows/test.yml`) — but it is schedule-
triggered (weekly, Mondays 20:00 UTC since 2026-10-26, plus manual `workflow_dispatch`), not
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

## Older history

Dated entries from 2026-07-26 to 2026-09-14 live in `CLAUDE_HISTORY.md` (moved there 2026-10-30, text unchanged). Comments elsewhere that cite a date in that range, such as "CLAUDE.md 2026-08-05", mean that file.


## 2026-09-29 - Right Now: two finished seasons still said "thru" a passed date

Reacher season 4 ended 2026-09-16 (8 episodes, verified against the episode
list) and Special Ops: Lioness season 3 ended 2026-09-20 (verified against
coverage of the finale). Both Currently Watching rows still read "Wednesdays
thru Sep 16" / "Sundays thru Sep 20" with "in progress". Both metas now read
"season complete", matching the Westies/Grantchester/Sugar rows. Rows kept,
not removed: whether a finished season keeps its row is Susan's call, per the
status-drift job's own scope note.

Checked and current, no change: The Odyssey stays In Theaters (home release
2026-11-17, still in cinemas), Ted Lasso S4 "thru Oct 7" is correct. Tony is
possibly out of theatres (reported digital 2026-09-15, not confirmed by A24);
left alone rather than guessed.

**Verified:** npm test green end to end, exit 0 (in the Cowork session).

**Delivered:** index.html, this file.

## 2026-09-29 - In Theaters refreshed, and the EDIT_SECRET blocker confirmed again

Susan hit "The server rejected this change (error 500)" deleting The Odyssey and
clicking Currently Watching rows. Same root cause as 2026-09-14: `EDIT_SECRET`
is unset on the streamingscout.org Netlify project (Netlify MCP listed zero
environment variables). Not set by a session, per the standing rule. Susan sets
it in Netlify, then redeploys, then `npm run smoke` check 5c flips 500 to 401.

In Theaters had two rows (The Odyssey, Tony) and had not been refreshed since
2026-08-08. Added Heart of the Beast (Paramount, dir. David Ayer, opened
2026-09-25) and Primetime (A24, dir. Lance Oppenheim, opened 2026-09-25). Dates,
directors and cast read from Deadline, Wikipedia, Gold Derby and TechRadar.
Posters from TMDB (movie ids 1263337 and 1375441), identity matched on synopsis,
both rendered and looked at in a browser. Tony still unconfirmed as out of
cinemas, left alone. The Uprising skipped: on digital 2026-09-29 after a weak
run. Verity (Oct 2) and Sense and Sensibility (Oct 16) are next to add.

The weekly resync task has failed two Mondays running because it runs in the
cloud. Section "In Theaters" has no automated refresh at all.

**Verified:** npm test green end to end.
**Delivered:** index.html, this file. Committed on main, not pushed.

### 2026-09-29, later: In Theaters is now scored against the taste profile

Susan: In Theaters must map to her viewing history and preferences, not be a
list of what is playing. Each row now carries a reason tied to a logged anchor.
Heart of the Beast: director David Ayer made The Beekeeper and A Working Man
(vein 3). Primetime: Mindhunter and Griselda (vein 5), same studio as Tony.
Tony: the Bourdain shelf. Added Linkin Park: Unshatter (music documentary, vein
4, limited run from 2026-09-30, dir. Joe Hahn, TMDB id 1388805, poster looked at).

Considered and rejected on evidence: Heaven in Stone and Glass (two nights only,
Sep 20 and 23, already over), Ai Weiwei's Turandot (US theatrical date not
confirmed), Practical Magic 2, Hope and Whalefall (horror or sci-fi, on the
avoid list), The Uprising (fits British history but went to digital 2026-09-29).
Next to add when they open: Verity (Oct 2), The Social Reckoning (Oct 9), Sense
and Sensibility (Oct 16, vein 8), Club Kid (A24, Nov 6, vein 7).

**Verified:** npm test green through poster coverage and exclusions checks.
**Delivered:** index.html, this file. Committed on main, not pushed.

- 2026-09-30: EDIT_SECRET is now set by Susan on Netlify (graceful-lebkuchen-0dd57d) and redeployed. Delete confirmed working on the live site. The 500 popup is resolved; a wrong key now gives 401. npm run smoke check 5c should now show 401.

- 2026-10-26: Both Monday crons in `.github/workflows/test.yml` moved from 13:00 and 15:00 UTC to 18:00 and 20:00 UTC, at Susan's request, so no scheduled run starts before 10 am Pacific (18:00 UTC is 10:00 PST and 11:00 PDT). The 2 hour gap is unchanged. The six `if:` conditions that match the second cron string moved with it. `npm test` passed. Left alone on purpose: older entries in this file that name 15:00 UTC describe the design as it was on those dates. `data/STREAMING_PROFILE.md` still lists the old Claude task times (Mon 13:30 UTC, Wed 17:07 UTC, Fri 13:00 UTC, daily 11:00 UTC), which no longer match the live scheduled tasks; that is a separate drift fix. Committed on main, not pushed.

- 2026-10-27: Cleared a title the weekly resync had re-recommended. Susan ticked "Animals" as already seen on 2026-10-14, but the resync does not read the live tick record, so it put Animals back in Top Picks. The watched-drift job had already caught it on 2026-10-26 and opened PR #16, but that PR was built on the main from before the resync and conflicted with it in `index.html`. Fix, mirroring what `scripts/check-watched-drift.mjs --fix` does: appended the two cleared entries from that PR to `data/STREAMING_LOG.md` (Animals, and Slow Horses, season 6) and removed the Animals Top Picks row. The Slow Horses, season 6 Coming Soon row was already gone after the rebuild. Top Picks is now 8 rows across 8 veins. `npm test` passed. The script itself could not run here, because the Mac sandbox cannot reach streamingscout.org, so the lines were copied from the bot's own branch (`auto/watched-drift-sync`, commit b987ad1). Note: the log now holds both an in-progress entry and a cleared entry for Slow Horses, season 6. The tick on 2026-10-24 is the later fact. PR #14 (dismiss-drift) needed nothing, because all 12 of its titles were already in `data/EXCLUDED_TITLES.md` from the resync. PR #13 (live-records backup) merges cleanly. Lesson: handle the open bot PRs before running the weekly resync, or the resync will not know what Susan ticked since the last one. Committed on main, not pushed.

## 2026-10-27 — live site stuck on 2026-09-30; the deploy-skip script made it invisible

streamingscout.org served `160ba48` (2026-09-30) from 2026-10-19 on. Four
production deploys (`1e5c583`, `e376acf`, `01b425d`, `0af3779`) were cancelled
by this repo's own `scripts/netlify-ignore.sh`; Netlify showed them as
"Failed"/skipped and never alarmed. Found by comparing live page bytes with the
repo, not by any data check. The cause on Netlify's side (what it passes as
`CACHED_COMMIT_REF`) is inferred, not confirmed. Fix: the script now builds
whenever `CACHED_COMMIT_REF` equals `COMMIT_REF`, since an empty diff against
the same commit proves nothing. Cost: occasional extra builds. After the push,
confirm with `npm run check:deploy --wait` that live matches `main`.


## 2026-10-28: About roadmap summary fixed, and a check added so it cannot drift again

about.html said "Seven of eleven items are done" and listed the edit key as still
ahead. roadmap.html had marked Protect saved changes Live on 2026-08-23, so the
real count is eight done, one in progress, two ahead. The lede also said the edit
key was "not built yet". Both sentences were written before Phase 7 shipped and
never updated. Nothing compared About's summary with the roadmap, so it stayed
wrong for two months. Fixed both sentences. Added Check 7 to
scripts/check-content-drift.mjs: it counts the status pills on roadmap.html and
fails if About's "N of M items are done / in progress / still ahead" disagrees.
Tested against the old About text from HEAD: it fails with the two expected
messages. Not pushed.

## 2026-10-30: weekly audit

Fixed: roadmap.html lede said "three ideas are still ahead" (two Next items); Ted Lasso S4 row said "Wednesdays thru Oct 7" after the Oct 7 finale (now "season complete", finale date confirmed against TVLine's release schedule); `backups/`, `tests/`, `.github/` and `netlify/` were publicly reachable (the backups hold a snapshot of live watching and dismissed records), now 404 in netlify.toml (verify after the push); index.html gets an h1 and a clean heading tree, about.html section titles move from h3 to h2; focus-visible, reduced-motion, text-wrap, 44px nav and button heights; the header is no longer sticky below 640px; the history above moved to `CLAUDE_HISTORY.md`; stale test and logic.mjs descriptions corrected. Open: In Theaters has no retirement date (Club Kid opens Nov 6 but sits under In Theaters; Heart of the Beast opened Sep 25). Hulu is tracked per Susan's 2026-08-19 decision; its history sync has never been seen working. Not pushed.
