// netlify/functions/dismiss.mjs
// version: 2
// v1 (2026-07-17): first real backend for streaming-scout. Continuous
// deployment from GitHub was wired up 2026-07-16 (see README's "Important
// architecture note"), which unblocks Netlify Functions — this is the first
// one actually built and shipped. Persists dismissed Top Picks / Coming Soon
// titles in a Netlify Blobs store so a dismiss syncs across every device
// immediately, the same governance model vinyl-scout's wishlist API uses
// (open POST/DELETE, no edit key — a passphrase on mobile isn't practical
// for a list this casual, and there's nothing sensitive in a "not interested"
// flag). This does NOT make an exclusion permanent across the next weekly
// rebuild — that still means updating EXCLUDED_TITLES.md and pushing, since
// Top Picks/Coming Soon are static HTML baked in at rebuild time, not read
// from this store. What this closes is the "which device did I dismiss that
// on" gap, not the "will next week's rebuild bring it back" gap.
// v2 (2026-07-20): stays intentionally unauthenticated (unchanged design
// decision above) but now bounds the two ways an open, unauthenticated POST
// could be abused: MAX_FIELD_LENGTH rejects any title/section over 200 chars
// instead of persisting arbitrary-length junk, and MAX_LIST_SIZE caps the
// Blobs list at 500 entries by evicting the oldest entry (FIFO) once a new
// dismissal would exceed it, rather than rejecting new writes outright — a
// flood of junk entries ages itself out instead of either growing the store
// without bound or leaving the endpoint permanently stuck once full.

import { getStore } from "@netlify/blobs";

export const config = { path: "/api/dismiss" };

const MAX_FIELD_LENGTH = 200;
const MAX_LIST_SIZE = 500;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  const store = getStore("dismissed-titles");

  if (req.method === "GET") {
    const list = (await store.get("list", { type: "json" })) || [];
    return json({ dismissed: list });
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
    const section = ((body && body.section) || "").trim() || null;
    if (section && section.length > MAX_FIELD_LENGTH) {
      return json({ error: `section must be ${MAX_FIELD_LENGTH} characters or fewer` }, 400);
    }

    const list = (await store.get("list", { type: "json" })) || [];
    if (!list.some((e) => e.title === title)) {
      while (list.length >= MAX_LIST_SIZE) list.shift(); // evict oldest, FIFO
      list.push({ title, section, dismissedAt: new Date().toISOString() });
      await store.setJSON("list", list);
    }
    return json({ ok: true, dismissed: list });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const title = (url.searchParams.get("title") || "").trim();
    if (!title) return json({ error: "title query param is required" }, 400);

    const list = (await store.get("list", { type: "json" })) || [];
    const next = list.filter((e) => e.title !== title);
    await store.setJSON("list", next);
    return json({ ok: true, dismissed: next });
  }

  return json({ error: "Method not allowed" }, 405);
};
