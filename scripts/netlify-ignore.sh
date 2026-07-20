#!/usr/bin/env bash
# netlify-ignore.sh — decide whether a push is worth a Netlify deploy.
#
# Netlify ignore-command contract:
#   exit 0   => SKIP the deploy (nothing user-facing changed)
#   exit !=0 => RUN the deploy
#
# Streaming Scout is a no-build static site, so the SERVED files are
# exactly what's in the repo:
#   *.html        pages (index, about, guide, roadmap)
#   style.css
#   apple-touch-icon.png, favicon-32.png, icon-192.png, icon-512.png
#   manifest.json
#   netlify/**, netlify.toml, package.json/package-lock.json
# Doc/dev-only churn skips the deploy: *.md.
#
# Referenced from netlify.toml:  [build] ignore = "bash scripts/netlify-ignore.sh"

set -u

# No previous build to diff against (first build, cache cleared) -> build, to be safe.
if [ -z "${CACHED_COMMIT_REF:-}" ]; then
  echo "netlify-ignore: no cached commit ref; building."
  exit 1
fi

# git diff --quiet exits 0 when the listed paths are unchanged (-> skip),
# non-zero when they changed or refs can't be compared (-> build).
if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- \
  '*.html' \
  style.css \
  apple-touch-icon.png favicon-32.png icon-192.png icon-512.png \
  manifest.json \
  netlify \
  netlify.toml \
  package.json package-lock.json
then
  echo "netlify-ignore: no user-facing changes; skipping deploy."
  exit 0
else
  echo "netlify-ignore: user-facing changes detected; building."
  exit 1
fi
