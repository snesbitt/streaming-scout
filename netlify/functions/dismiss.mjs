// netlify/functions/dismiss.mjs
// version: 1
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

import { getStore } from "@netlify/blobs";

export const config = { path: "/api/dismiss" };

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
    const section = ((body && body.section) || "").trim() || null;

    const list = (await store.get("list", { type: "json" })) || [];
    if (!list.some((e) => e.title === title)) {
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
