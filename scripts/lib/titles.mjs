// scripts/lib/titles.mjs
//
// Title matching shared by the checks that compare a row in index.html
// against a title recorded somewhere else (the watch log, the exclusion
// list, the live stores).
//
// This is a shared module rather than a copy in each script on purpose, and
// the reasoning is the opposite of the one in netlify/functions/*.mjs, where
// the helpers are deliberately duplicated. Those two files are bundled
// independently at deploy time, so a shared import is a real deployment risk.
// These scripts all run from the repo root under the same node process,
// so there is no such risk, and the cost of divergence is high: two checks
// that disagree about whether "Reacher, season 4" is the same thing as
// "Reacher (Seasons 1-3)" will silently contradict each other, and this
// repo's history is largely a list of things that were wrong in two places
// at once.
//
// Node 18+. No dependencies, no I/O.

// Matches ", season 4", "(Season 1)", "(Seasons 1-3)", "series 16", "S4".
const SEASON_RE = /[,(]?\s*(?:season|series)\s+(\d+)\s*\+?\)?|\bs(\d+)\b|\(seasons?\s+([\d–—-]+)\+?\)/i;

/** First season number mentioned in a title, or null if it names no season. */
export function seasonOf(title) {
  const m = SEASON_RE.exec(title);
  if (!m) return null;
  const first = /(\d+)/.exec(m[1] || m[2] || m[3] || "");
  return first ? Number(first[1]) : null;
}

/**
 * Every season a title covers. "(Seasons 1-3)" is three seasons, not one:
 * treating it as one is how "Reacher season 2" slips past a check that was
 * meant to catch it.
 */
export function seasonsOf(title) {
  const out = new Set();
  const range = /\(seasons?\s+(\d+)\s*[–—-]\s*(\d+)/i.exec(title);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
    for (let n = a; n <= b; n += 1) out.add(n);
    return out;
  }
  const one = seasonOf(title);
  if (one !== null) out.add(one);
  return out;
}

/** Lowercase, entity-decoded, punctuation-free, season-free, article-free. */
export function baseTitle(title) {
  return String(title)
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(SEASON_RE, " ")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .trim();
}

/** Lighter normalisation that keeps season markers, for exact-title lookups. */
export function normalizeTitle(title) {
  return String(title)
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Index a list of recorded titles by base title, remembering which seasons
 * each base has been recorded for.
 */
export function indexByBase(titles) {
  const index = new Map();
  for (const raw of titles) {
    const base = baseTitle(raw);
    if (!base) continue;
    const entry = index.get(base) || { titles: [], seasons: new Set() };
    entry.titles.push(String(raw).trim());
    for (const n of seasonsOf(raw)) entry.seasons.add(n);
    index.set(base, entry);
  }
  return index;
}

/**
 * Does `candidate` name something already covered by the index?
 *
 * Returns null for no match, otherwise { titles, season }. A candidate that
 * names no season matches its base outright: it IS the thing already
 * recorded. A candidate naming a season matches only when that exact season
 * is recorded, because a later season of a finished show is a legitimately
 * new thing (Reacher season 4 after seasons 1 to 3) and must not be treated
 * as a duplicate.
 */
export function findCovered(candidate, index) {
  const hit = index.get(baseTitle(candidate));
  if (!hit) return null;
  const season = seasonOf(candidate);
  if (season === null) return { titles: hit.titles, season: null };
  return hit.seasons.has(season) ? { titles: hit.titles, season } : null;
}

/** Titles recorded as "- **Title** ..." list entries in a markdown file. */
export function titlesFromMarkdownList(markdown) {
  const out = [];
  for (const line of String(markdown).split("\n")) {
    const m = /^\s*-\s*\*\*(.+?)\*\*/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}
