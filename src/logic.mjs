// src/logic.mjs
// Pure, DOM-free logic pulled out of index.html's inline <script> so it can
// be unit tested directly — the same "export the pure logic for
// testability" pattern used by vinyl-scout's audio-preview.mjs and
// travel-intelligence's fares.mjs. Everything here takes plain inputs and
// returns plain outputs; no localStorage, no fetch, no DOM.

// Has a Coming Soon title's release date arrived, as of `today`?
// dateStr is "YYYY-MM-DD" (from a .soon-row's data-date attribute).
// A missing or malformed date is treated as "not released" (stays in
// Coming Soon) rather than throwing or silently promoting bad data.
export function isReleased(dateStr, today = new Date()) {
  if (!dateStr) return false;
  const released = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(released.getTime())) return false;
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  return released <= cutoff;
}

// Turns an avail-badge's title attribute ("Included with BritBox",
// "Requires Paramount+ — not one of your tracked services") into just the
// service name, for the "New · <service>" label a promoted row gets.
export function serviceLabelFromBadgeTitle(titleAttr) {
  if (!titleAttr) return "";
  return titleAttr
    .replace(/^Included with /, "")
    .replace(/^Requires /, "")
    .split(" — ")[0];
}

// Merges a list of newly-dismissed titles into the current dismissed list.
// Pure — takes and returns plain arrays, no localStorage. Returns both the
// merged list and whether anything actually changed, so a caller can skip
// a redundant re-render/re-save when nothing new came in.
export function mergeDismissedTitles(current, incoming) {
  const merged = current.slice();
  let changed = false;
  for (const title of incoming) {
    if (!merged.includes(title)) {
      merged.push(title);
      changed = true;
    }
  }
  return { list: merged, changed };
}
