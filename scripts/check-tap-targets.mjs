#!/usr/bin/env node
// scripts/check-tap-targets.mjs
//
// The .pick-dismiss / .pick-watching / .pick-watched tap target was fixed
// twice for real, live regressions: 2026-07-30 (invisible ::after hit-slop
// let adjacent buttons steal each other's clicks) and 2026-08-05 (the real
// computed height was still only ~32-37px against a documented ~40-44px
// target). Both were caught by hand. This is a static, honest trip-wire
// against a third regression — NOT a real computed-box-height check (that
// needs an actual browser/layout engine, which this offline check doesn't
// have). It asserts the specific CSS rule known to produce a safe tap
// target is still present, byte-for-byte, on the shared selector. If a
// future edit shrinks or removes that padding, this fails loudly instead
// of waiting for Susan to notice a missed click.
//
// Offline, zero dependencies — part of `npm test`.

import { readFileSync } from "node:fs";

const REQUIRED_SELECTOR = ".pick-dismiss, .pick-watching, .pick-watched";
const REQUIRED_PADDING = "padding: 13px 8px";

const css = readFileSync("style.css", "utf8");

const selectorIndex = css.indexOf(REQUIRED_SELECTOR);
if (selectorIndex === -1) {
  console.error(`Tap-target check FAILED: could not find the shared selector "${REQUIRED_SELECTOR}" in style.css at all (markup/CSS may have been restructured — update this check).`);
  process.exit(1);
}

// The rule block is the text between the selector and its closing "}".
const blockEnd = css.indexOf("}", selectorIndex);
const block = css.slice(selectorIndex, blockEnd === -1 ? undefined : blockEnd);

if (!block.includes(REQUIRED_PADDING)) {
  console.error(`Tap-target check FAILED: "${REQUIRED_SELECTOR}" no longer has "${REQUIRED_PADDING}".`);
  console.error("This padding is what keeps the real click box at ~40-45px tall (see CLAUDE.md 2026-07-30 and 2026-08-05 entries for the two regressions this fixed). Shrinking it risks a third.");
  console.error("Note: this check only confirms the CSS rule text is present, not the actual rendered box height — a real height check needs a browser.");
  process.exit(1);
}

console.log(`Tap-target check passed: "${REQUIRED_SELECTOR}" still has "${REQUIRED_PADDING}".`);
