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

// Every control that has to survive a thumb. .row-dismiss was added to this
// list on 2026-08-17: it was left on the old 9px 6px when the other three were
// bumped in 2026-08-05, and measured 22x35 in a live browser, so this check
// passed for twelve days while a real control was still too small. A check
// that only covers some of the affected selectors is how that happens.
const REQUIRED = [
  { selector: ".pick-dismiss, .pick-watching, .pick-watched", padding: "padding: 13px 8px" },
  { selector: ".row-dismiss {", padding: "padding: 13px 8px" },
];

const css = readFileSync("style.css", "utf8");

let checked = 0;
for (const { selector, padding } of REQUIRED) {
  const selectorIndex = css.indexOf(selector);
  if (selectorIndex === -1) {
    console.error(`Tap-target check FAILED: could not find "${selector}" in style.css at all (markup/CSS may have been restructured, update this check).`);
    process.exit(1);
  }
  const blockEnd = css.indexOf("}", selectorIndex);
  const block = css.slice(selectorIndex, blockEnd === -1 ? undefined : blockEnd);
  if (!block.includes(padding)) {
    console.error(`Tap-target check FAILED: "${selector}" no longer has "${padding}".`);
    console.error("This padding is what keeps the real click box at ~40-45px tall (see CLAUDE.md 2026-07-30, 2026-08-05 and 2026-08-17 for the three regressions this covers). Shrinking it risks a fourth.");
    console.error("Note: this check only confirms the CSS rule text is present, not the actual rendered box height. A real height check needs a browser.");
    process.exit(1);
  }
  checked += 1;
}

console.log(`Tap-target check passed: all ${checked} touch-control rule(s) still carry "padding: 13px 8px".`);
