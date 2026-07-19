# Streaming Scout

## Provenance of this repo

This repository was **reconstructed on 2026-07-16** from the live deployed
site at https://streamingscout.org. No original source files or git history
existed anywhere — the site only existed as deployed static assets on
Netlify. Every file here was rebuilt by fetching the live pages and assets
and reading back their markup/CSS/JS.

**Confidence by file:**

- `style.css` — recovered byte-for-byte (fetched twice via two independent
  methods that agreed exactly).
- `about.html` — recovered byte-for-byte via a full raw extraction of the
  live DOM.
- `index.html` — recovered with very high fidelity: the `<head>`, nav,
  "Right Now", footer, and the inline `<script>` block were extracted raw
  and verified character-for-character. The five Top Picks rows and ten
  Coming Soon rows were reconstructed from the same verified row template
  filled in with data (titles, scores, cast, poster URLs, hrefs) that was
  independently confirmed against the live page.
- `roadmap.html` / `guide.html` — the page shell, and the repeating
  "phase" / "step" block templates, were extracted raw and verified.
  The prose content of each phase/step was taken verbatim from the
  rendered page text, then placed into the verified template. This is a
  high-confidence reconstruction but was not independently byte-verified
  character-by-character for every paragraph the way `about.html` was.
- `manifest.json` — recovered byte-for-byte (fetched directly).
- Binary assets referenced in the markup (`apple-touch-icon.png`,
  `favicon-32.png`, `icon-192.png`, `icon-512.png`) have since been
  recovered from the live site and are present in this repo, verified
  live (distinct byte sizes, all loading correctly).

## Important architecture note (updated 2026-07-17)

As of 2026-07-16 this repo is connected to GitHub, and Netlify is
configured for Git-connected continuous deployment — pushes to `main`
auto-deploy, the same governance model as thefitnesslog.org and
vinylscout.org. As of 2026-07-17 the first real backend Function is
shipped: `netlify/functions/dismiss.mjs`, an open GET/POST/DELETE
endpoint (no edit key, same rationale as vinyl-scout's wishlist API —
nothing sensitive in a "not interested" flag, and a passphrase on mobile
isn't practical for a list this casual) backed by a Netlify Blobs store
called `dismissed-titles`. `index.html`'s inline `<script>` now calls it
alongside `localStorage`: dismissing a title still hides it locally and
instantly, but the dismiss also POSTs to the Function so every other
device syncs on next load — no chat round-trip needed for that part
anymore. What the Function does **not** do: make an exclusion permanent
across the next weekly rebuild. Top Picks and Coming Soon are static HTML
baked into `index.html` at publish time from `EXCLUDED_TITLES.md`, not
read live from the Blobs store, so keeping a title out of next week's
freshly-rebuilt list still means pasting the copied message to Claude and
updating that file. `app.js` still doesn't exist as a separate file; all
client-side JS is a single small inline `<script>` at the bottom of
`index.html`.

## Is Top Picks / Coming Soon data static or dynamic?

**Static.** The Top Picks and Coming Soon sections are plain HTML baked
into `index.html` at publish time (presumably by a Claude-run rebuild
step, per the Roadmap). The only client-side JavaScript is a small inline
script that:

- hides a row locally via `localStorage` when its "×" dismiss button is
  clicked,
- copies a message like `Streaming Scout: exclude "TITLE" from SECTION —
  don't re-add it.` to the clipboard for the user to paste into a Claude
  chat.

There is no `fetch()` call anywhere on the page — nothing is loaded from
an API at runtime. This matters for the planned availability-icon
(subscription-included vs. pay-to-watch) feature: it can be added as pure
markup/data in the same static rebuild step that already generates the
Top Picks and Coming Soon rows; it does not need a new backend or client
fetch.

## Before treating this as authoritative

Do a careful diff/review against the live site before relying on this as
the source of truth — parts of `roadmap.html` and `guide.html` were
reconstructed from rendered text plus a verified template rather than
extracted byte-for-byte, and the four icon/image binary assets are
missing entirely.
