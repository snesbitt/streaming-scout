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
  `favicon-32.png`, `icon-192.png`, `icon-512.png`) were **not** recovered —
  only their filenames/paths are known. They'll need to be re-exported or
  re-created.

## Important architecture note (learned from the live site's own About/Roadmap pages)

Unlike its sibling projects (thefitnesslog.org, vinylscout.org), this site
currently has **no backend, no Netlify Functions, and no build step**. Its
own About and Roadmap pages explain why: a Netlify Function was built and
bundled but never went live, because this project deploys via Netlify's
manual upload page rather than Git-connected continuous deployment (Netlify
only runs Functions for the latter). So, deliberately, this repo does
**not** include a `netlify/functions/` directory or a `netlify.toml` —
adding either would misrepresent the live site's real architecture.
`app.js` also doesn't exist as a separate file; all client-side JS is a
single small inline `<script>` at the bottom of `index.html`.

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
