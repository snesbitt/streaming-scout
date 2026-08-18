// scripts/lib/rows.mjs
//
// Removing a title row from index.html, shared by the two auto-fixing checks
// (check-watched-drift.mjs and check-dismiss-drift.mjs).
//
// Both need this for the same reason: recording a title in a data file
// without taking its row off the page leaves main red. The offline checks in
// `npm test` compare the two, so a half-applied fix fails the `test` job,
// which skips every other job in the workflow. That happened on 2026-08-17
// when dismiss-drift synced three dismissals and left their rows in place.
//
// Deliberately string-and-indent based rather than a DOM parser. index.html
// is hand-maintained, consistently indented, and has no build step; adding a
// parser dependency to rewrite it would change more than it fixes, and a
// parser would also reformat the whole file on every write. The tradeoff is
// that this refuses to guess: if the closing tag is not where the indentation
// says it should be, it throws rather than cutting at the wrong place.
//
// Node 18+. No dependencies.

/**
 * Remove every row whose class and data-title satisfy `shouldRemove`.
 *
 * Returns { html, removed: [{ rowClass, title }] }. `html` is the original
 * string when nothing matched, so a caller can skip the write entirely.
 *
 * A marker comment immediately above a row (`<!-- no-art: ... -->`,
 * `<!-- rewatch: ... -->`) is removed with it. Leaving it behind would orphan
 * a note about a row that no longer exists, and the next reader would attach
 * it to whatever row moved up into its place.
 */
export function removeRows(html, shouldRemove) {
  const lines = html.split("\n");
  const removed = [];
  const OPEN = /^(\s*)<div class="(watching-row|pick-row|soon-row|theater-row)"[^>]*data-title="([^"]+)"/;

  // Back to front so earlier indices stay valid as lines are spliced out.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const open = OPEN.exec(lines[i]);
    if (!open) continue;
    const [, indent, rowClass, title] = open;
    if (!shouldRemove({ rowClass, title })) continue;

    const close = lines.indexOf(`${indent}</div>`, i + 1);
    if (close === -1) {
      throw new Error(
        `removeRows: found the opening tag for "${title}" at line ${i + 1} but no matching close at the same indent. Refusing to guess at the row's boundaries.`,
      );
    }
    let start = i;
    if (start > 0 && /^\s*<!--.*-->\s*$/.test(lines[start - 1])) start -= 1;
    let end = close + 1;
    if (end < lines.length && lines[end].trim() === "") end += 1;
    lines.splice(start, end - start);
    removed.push({ rowClass, title });
  }

  return { html: removed.length ? lines.join("\n") : html, removed: removed.reverse() };
}

/** Human-readable section name for a row class. */
export const SECTION_OF = {
  "pick-row": "Top Picks",
  "soon-row": "Coming Soon",
  "watching-row": "Currently Watching",
  "theater-row": "In Theaters",
};
