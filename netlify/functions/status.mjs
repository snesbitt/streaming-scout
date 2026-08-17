// netlify/functions/status.mjs
// Tracks per-title watch status ("watching" or "watched") so a flag from
// the "currently watching" / "mark watched" buttons on Top Picks and Coming
// Soon syncs across every device instantly, the same governance model
// dismiss.mjs uses (open GET/POST/DELETE, no edit key — nothing sensitive
// in a watch-status flag). Backed by its own Netlify Blobs store,
// "title-status", kept separate from dismiss.mjs's "dismissed-titles"
// store since the two are semantically different: a dismissal means "not
// interested, never show again"; a status means "here's what's happening
// with this title right now" and carries a bit more shape (status + a
// short meta string for the Currently Watching card).
//
// Like dismiss.mjs, this does NOT make anything permanent across the next
// weekly rebuild — Top Picks/Coming Soon are still static HTML baked in at
// rebuild time. What this closes is the same "which device did I flag that
// on" gap; the clipboard message the client copies after a flag is how
// Susan tells Claude to fold it into data/STREAMING_LOG.md for real.
//
// STORAGE MODEL, changed 2026-08-17. One blob per title, not one list blob.
//
// The previous version did read-modify-write against a single whole-list
// blob on every mutation: get("list"), rebuild the array, setJSON("list").
// Netlify Blobs reads are eventually consistent, measured at roughly 5
// seconds of lag against the live site, so two writes inside that window
// both read the same pre-write list and whichever finished second wrote its
// copy back whole and silently discarded the first. Reproduced live on
// 2026-08-16: POST "Reacher, season 4" -> watching, then POST "The Westies"
// -> watching a few seconds later; The Westies stuck and Reacher reverted to
// watched. It needed no user error at all, two quick clicks were enough,
// which makes it a likely contributor to the "a value is read correctly once
// but never carried through" pattern CLAUDE.md keeps naming.
//
// Each title now owns its own blob key, so two concurrent writes touch two
// different keys and neither can overwrite the other. That removes
// read-modify-write entirely rather than papering over it with a retry.
// The eventual-consistency lag itself is Netlify's and still exists: a GET
// issued immediately after a POST may not see the new entry for a few
// seconds. What is gone is the silent data loss.
//
// The GET response contract is unchanged ({ statuses: [...] }, same entry
// shape, same ordering) because index.html's inline script and
// scripts/check-status-drift.mjs both depend on it.
//
// dismiss.mjs carries the identical model. The two files deliberately keep
// their own copies of the helpers below rather than sharing a module: each
// Netlify Function is bundled independently, and a shared import across the
// netlify/functions boundary is a deploy-time risk that buys very little at
// this size. If you change the key encoding in one, change it in both.

import { getStore } from "@netlify/blobs";

export const config = { path: "/api/status" };

const MAX_FIELD_LENGTH = 200;
const MAX_LIST_SIZE = 500;
const VALID_STATUSES = ["watching", "watched"];

// Every per-title blob key starts with this. It keeps enumeration cleanly
// separated from the two bookkeeping keys below, which must never be read
// back as if they were title entries.
const KEY_PREFIX = "t_";
// The pre-2026-08-17 whole-list blob. Read once by the migration, then left
// alone forever. Deliberately NOT deleted here: the old data stays intact
// and recoverable until the per-title path has been confirmed live.
const LEGACY_KEY = "list";
// Written once the migration has finished. Its presence is what stops the
// migration re-running, which matters more than it looks: without it, a
// title deleted after the migration would be resurrected from the legacy
// blob by the next cold start. That exact resurrection bug has bitten this
// project before (Apex, 2026-08-11).
const MIGRATION_KEY = "migrated-to-per-title-v1";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Titles contain spaces, colons, commas and apostrophes ("Special Ops:
// Lioness, season 3", "Gardeners' World Winter Specials 2021"), none of
// which are safe to assume are valid blob keys. base64url of the UTF-8
// bytes is stable, reversible and uses only [A-Za-z0-9_-]. The raw title is
// also stored inside the blob, so reads never depend on decoding a key.
// The key only has to be unique and legal.
function keyForTitle(title) {
  const bytes = new TextEncoder().encode(title);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return (
    KEY_PREFIX +
    btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  );
}

function sortEntries(entries) {
  // Ascending by updatedAt reproduces the append-order the whole-list blob
  // had, so the client sees the same ordering it saw before.
  return entries.sort((a, b) => {
    const x = a.updatedAt || "";
    const y = b.updatedAt || "";
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

async function listTitleKeys(store) {
  const { blobs } = await store.list({ prefix: KEY_PREFIX });
  return (blobs || []).map((b) => b.key);
}

// Reads every per-title blob. More work than one list read (one enumerate
// plus N fetches instead of a single get), which is a real tradeoff worth
// naming. At this project's volume (single digits to low tens of titles,
// hard-capped at MAX_LIST_SIZE) it is not close to mattering. If the store
// ever grows past a few hundred entries, revisit before it becomes slow.
async function readAll(store) {
  const keys = await listTitleKeys(store);
  const entries = await Promise.all(
    keys.map((key) => store.get(key, { type: "json" }).catch(() => null)),
  );
  return sortEntries(mergePending(entries.filter((e) => e && e.title)));
}

let migrationPromise = null;

// Entries this instance wrote during the migration that its own reads cannot
// see yet. Without this, the first few seconds after the storage change goes
// live would serve an EMPTY list: the legacy blob has been copied out but the
// copies are still inside the read lag. An empty list is exactly the failure
// mode this project has been bitten by, so the writer holds its own work in
// memory until the store can confirm it. Purely a read-through for the lag
// window. Each title drops out the moment the store returns it for real, and
// the whole map is discarded once it is empty.
let pendingMigrated = null;

function mergePending(entries) {
  if (!pendingMigrated) return entries;
  const seen = new Set(entries.map((e) => e.title));
  for (const [title, entry] of pendingMigrated) {
    if (seen.has(title)) pendingMigrated.delete(title);
    else entries.push(entry);
  }
  if (pendingMigrated.size === 0) pendingMigrated = null;
  return entries;
}

// Copies the legacy whole-list blob into per-title keys exactly once.
// Idempotent by construction: an existing per-title blob always wins, so a
// value written since the migration started is never overwritten by the
// older list copy. Two cold starts racing here both write identical data.
async function migrateOnce(store) {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const done = await store.get(MIGRATION_KEY, { type: "json" });
      if (done) return;
      const legacy = (await store.get(LEGACY_KEY, { type: "json" })) || [];
      const written = new Map();
      for (const entry of legacy) {
        if (!entry || !entry.title) continue;
        const key = keyForTitle(entry.title);
        const existing = await store.get(key, { type: "json" });
        if (existing) continue;
        const copied = {
          title: entry.title,
          status: entry.status,
          meta: entry.meta,
          section: entry.section,
          updatedAt: entry.updatedAt || null,
        };
        await store.setJSON(key, copied);
        written.set(entry.title, copied);
      }
      if (written.size) pendingMigrated = written;
      await store.setJSON(MIGRATION_KEY, {
        migratedAt: new Date().toISOString(),
        count: legacy.length,
      });
    })().catch((err) => {
      // Let the next request try again rather than caching a failure for
      // the life of the instance.
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}

// MAX_LIST_SIZE is the abuse bound on an endpoint that is unauthenticated by
// design, so it survives the storage change rather than quietly disappearing.
// It can no longer be enforced by trimming an array in hand, so a POST that
// would add a brand-new title past the cap evicts the oldest entries first.
// This path only runs when the store is actually full, so the extra reads it
// costs never touch normal traffic. Two concurrent evictions can both delete
// the same oldest key (harmless, delete is idempotent) and can leave the
// store one or two over the cap for a moment, which is a far cheaper failure
// than losing a write.
async function enforceCap(store, newKey) {
  const keys = await listTitleKeys(store);
  if (keys.includes(newKey)) return; // replacing an existing title, not adding
  if (keys.length < MAX_LIST_SIZE) return;
  const dated = await Promise.all(
    keys.map(async (key) => {
      const value = await store.get(key, { type: "json" }).catch(() => null);
      return { key, ts: (value && value.updatedAt) || "" };
    }),
  );
  dated.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const evictCount = keys.length - MAX_LIST_SIZE + 1;
  for (const { key } of dated.slice(0, evictCount)) {
    await store.delete(key);
  }
}

export default async (req) => {
  const store = getStore("title-status");

  try {
    await migrateOnce(store);
  } catch (err) {
    // Failing loudly beats serving a list that is silently missing every
    // pre-migration title. The client already treats a failed /api/status
    // as "offline" and falls back to its local copy, so this degrades
    // safely rather than blanking the page.
    return json(
      { error: "Store migration failed, refusing to serve a partial list: " + err.message },
      503,
    );
  }

  if (req.method === "GET") {
    return json({ statuses: await readAll(store) });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const title = ((body && body.title) || "").trim();
    if (!title) return json({ error: "title is required" }, 400);
    if (title.length > MAX_FIELD_LENGTH) {
      return json({ error: `title must be ${MAX_FIELD_LENGTH} characters or fewer` }, 400);
    }
    const status = ((body && body.status) || "").trim();
    if (!VALID_STATUSES.includes(status)) {
      return json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, 400);
    }
    const meta = ((body && body.meta) || "").trim().slice(0, MAX_FIELD_LENGTH);
    const section = ((body && body.section) || "").trim() || null;
    if (section && section.length > MAX_FIELD_LENGTH) {
      return json({ error: `section must be ${MAX_FIELD_LENGTH} characters or fewer` }, 400);
    }

    const key = keyForTitle(title);
    await enforceCap(store, key);
    const entry = { title, status, meta, section, updatedAt: new Date().toISOString() };
    await store.setJSON(key, entry);
    // If this title is still being carried by the migration read-through,
    // replace the carried copy so the lag window never serves the old value
    // back over a fresh write.
    if (pendingMigrated) pendingMigrated.set(title, entry);

    // Fold the entry just written into the returned list by hand. A plain
    // re-read can lag behind its own write by a few seconds, and a response
    // that omits the thing it just saved is exactly the confusion this
    // change exists to end.
    const rest = (await readAll(store)).filter((e) => e.title !== title);
    return json({ ok: true, statuses: sortEntries(rest.concat([entry])) });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const title = (url.searchParams.get("title") || "").trim();
    if (!title) return json({ error: "title query param is required" }, 400);

    await store.delete(keyForTitle(title));
    // Drop it from the migration read-through too, or a delete during the lag
    // window would appear to undo itself.
    if (pendingMigrated) pendingMigrated.delete(title);
    const rest = (await readAll(store)).filter((e) => e.title !== title);
    return json({ ok: true, statuses: rest });
  }

  return json({ error: "Method not allowed" }, 405);
};
