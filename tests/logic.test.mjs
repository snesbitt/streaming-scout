// tests/logic.test.mjs
// Tests for src/logic.mjs — the pure functions behind Coming Soon's
// auto-promote logic and the dismiss system. Run via `node tests/logic.test.mjs`
// (also wired into `npm test`, see package.json). No DOM, no network.

import assert from "node:assert/strict";
import { isReleased, serviceLabelFromBadgeTitle, mergeDismissedTitles } from "../src/logic.mjs";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

/* ---------- isReleased ---------- */

test("isReleased: a date before today is released", () => {
  assert.equal(isReleased("2026-07-20", new Date("2026-07-23T09:00:00")), true);
});

test("isReleased: a date equal to today is released (the Gone/BritBox case)", () => {
  assert.equal(isReleased("2026-07-23", new Date("2026-07-23T23:59:00")), true);
});

test("isReleased: a date after today is NOT released", () => {
  assert.equal(isReleased("2026-07-24", new Date("2026-07-23T09:00:00")), false);
});

test("isReleased: time-of-day on `today` never matters, only the calendar date", () => {
  assert.equal(isReleased("2026-07-23", new Date("2026-07-23T00:00:01")), true);
  assert.equal(isReleased("2026-07-23", new Date("2026-07-23T23:59:59")), true);
});

test("isReleased: a missing date string is treated as not released, not thrown", () => {
  assert.equal(isReleased("", new Date("2026-07-23")), false);
  assert.equal(isReleased(undefined, new Date("2026-07-23")), false);
});

test("isReleased: a malformed date string is treated as not released, not thrown", () => {
  assert.equal(isReleased("not-a-date", new Date("2026-07-23")), false);
});

/* ---------- serviceLabelFromBadgeTitle ---------- */

test("serviceLabelFromBadgeTitle: 'Included with X' strips to X", () => {
  assert.equal(serviceLabelFromBadgeTitle("Included with BritBox"), "BritBox");
  assert.equal(serviceLabelFromBadgeTitle("Included with PBS Masterpiece"), "PBS Masterpiece");
});

test("serviceLabelFromBadgeTitle: 'Requires X — not one of your tracked services' strips to just X", () => {
  assert.equal(
    serviceLabelFromBadgeTitle("Requires Paramount+ — not one of your tracked services"),
    "Paramount+"
  );
});

test("serviceLabelFromBadgeTitle: empty/missing title returns an empty string, not a crash", () => {
  assert.equal(serviceLabelFromBadgeTitle(""), "");
  assert.equal(serviceLabelFromBadgeTitle(undefined), "");
});

/* ---------- mergeDismissedTitles ---------- */

test("mergeDismissedTitles: a genuinely new title is added and reports changed=true", () => {
  const { list, changed } = mergeDismissedTitles(["Gone"], ["The Amateur"]);
  assert.deepEqual(list, ["Gone", "The Amateur"]);
  assert.equal(changed, true);
});

test("mergeDismissedTitles: re-merging an already-dismissed title reports changed=false", () => {
  const { list, changed } = mergeDismissedTitles(["Gone"], ["Gone"]);
  assert.deepEqual(list, ["Gone"]);
  assert.equal(changed, false);
});

test("mergeDismissedTitles: never mutates the input array (still pure with a fresh list each call)", () => {
  const original = ["Gone"];
  mergeDismissedTitles(original, ["The Amateur"]);
  assert.deepEqual(original, ["Gone"]);
});

test("mergeDismissedTitles: mixed new and existing titles only flags changed for the new ones", () => {
  const { list, changed } = mergeDismissedTitles(["Gone"], ["Gone", "The Amateur"]);
  assert.deepEqual(list, ["Gone", "The Amateur"]);
  assert.equal(changed, true);
});

console.log(`\n${passed} passed`);
