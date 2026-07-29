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

import { getStore } from "@netlify/blobs";

export const config = { path: "/api/status" };

const MAX_FIELD_LENGTH = 200;
const MAX_LIST_SIZE = 500;
const VALID_STATUSES = ["watching", "watched"];

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  const store = getStore("title-status");

  if (req.method === "GET") {
    const list = (await store.get("list", { type: "json" })) || [];
    return json({ statuses: list });
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

    const list = (await store.get("list", { type: "json" })) || [];
    const next = list.filter((e) => e.title !== title);
    while (next.length >= MAX_LIST_SIZE) next.shift(); // evict oldest, FIFO
    next.push({ title, status, meta, section, updatedAt: new Date().toISOString() });
    await store.setJSON("list", next);
    return json({ ok: true, statuses: next });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const title = (url.searchParams.get("title") || "").trim();
    if (!title) return json({ error: "title query param is required" }, 400);

    const list = (await store.get("list", { type: "json" })) || [];
    const next = list.filter((e) => e.title !== title);
    await store.setJSON("list", next);
    return json({ ok: true, statuses: next });
  }

  return json({ error: "Method not allowed" }, 405);
};
