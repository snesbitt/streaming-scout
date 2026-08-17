// tests/blobs-concurrency.test.mjs
//
// Verifies the 2026-08-17 per-title storage change in netlify/functions/
// status.mjs and dismiss.mjs against a fake Netlify Blobs store that
// reproduces the real ~5s read-consistency lag. The real @netlify/blobs
// import is redirected by tests/register-blobs-mock.mjs, so the Functions run
// exactly as written, with no test-only branches in them. No network, no deploy.
//
// The load-bearing test is "the old shape fails, the new shape passes": the
// harness first runs the pre-change read-modify-write logic and asserts it
// DOES lose a write, so a passing suite cannot be an artefact of a fake store
// that is simply too forgiving.

import assert from "node:assert/strict";
import { getStore, advance, resetStores, LAG_MS } from "./fake-blobs.mjs";

let passed = 0;
function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log("  ok  " + label);
    })
    .catch((err) => {
      console.error("  FAIL  " + label);
      console.error("        " + err.message);
      process.exitCode = 1;
    });
}

// Cache-busting import so each scenario gets a genuine cold start (the
// migration guard lives at module scope).
let coldStarts = 0;
async function load(name) {
  coldStarts += 1;
  const mod = await import(`../netlify/functions/${name}.mjs?cold=${coldStarts}`);
  return mod.default;
}

const settle = () => advance(LAG_MS + 1);

function post(path, body) {
  return new Request("https://streamingscout.org" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = (path) => new Request("https://streamingscout.org" + path);
const del = (path) => new Request("https://streamingscout.org" + path, { method: "DELETE" });

const body = (res) => res.json();

// ---------------------------------------------------------------------------
// 0. The harness itself must be able to see the bug.
// ---------------------------------------------------------------------------

console.log("\nharness sanity (old whole-list logic)");

await check("the pre-change read-modify-write loses a concurrent write", async () => {
  resetStores();
  const store = getStore("old-shape");

  // Exactly the old code path, inlined.
  async function oldPost(title) {
    const list = (await store.get("list", { type: "json" })) || [];
    const next = list.filter((e) => e.title !== title);
    next.push({ title, updatedAt: new Date().toISOString() });
    await store.setJSON("list", next);
  }

  await oldPost("Reacher, season 4");
  advance(1000); // second click, well inside the lag window
  await oldPost("The Westies");
  settle();

  const list = (await store.get("list", { type: "json" })) || [];
  const titles = list.map((e) => e.title);
  assert.deepEqual(titles, ["The Westies"], "expected the old shape to drop Reacher");
});

// ---------------------------------------------------------------------------
// 1. status.mjs
// ---------------------------------------------------------------------------

console.log("\nstatus.mjs");

await check("two writes inside the lag window both survive", async () => {
  resetStores();
  const handler = await load("status");

  await handler(post("/api/status", { title: "Reacher, season 4", status: "watching", meta: "S4 E3" }));
  advance(1000);
  await handler(post("/api/status", { title: "The Westies", status: "watching", meta: "" }));
  settle();

  const { statuses } = await body(await handler(get("/api/status")));
  const titles = statuses.map((e) => e.title).sort();
  assert.deepEqual(titles, ["Reacher, season 4", "The Westies"]);
  const reacher = statuses.find((e) => e.title === "Reacher, season 4");
  assert.equal(reacher.status, "watching", "Reacher must not have reverted");
});

await check("the live 2026-08-16 reproduction no longer reverts Reacher", async () => {
  resetStores();
  const handler = await load("status");

  // Reacher starts out marked watched, as it was live.
  await handler(post("/api/status", { title: "Reacher, season 4", status: "watched", meta: "" }));
  settle();
  // The correction, then a second unrelated correction a few seconds later.
  await handler(post("/api/status", { title: "Reacher, season 4", status: "watching", meta: "through Sep 16" }));
  advance(2000);
  await handler(post("/api/status", { title: "The Westies", status: "watching", meta: "" }));
  settle();

  const { statuses } = await body(await handler(get("/api/status")));
  const reacher = statuses.find((e) => e.title === "Reacher, season 4");
  assert.equal(reacher.status, "watching");
  assert.equal(reacher.meta, "through Sep 16");
});

await check("ten writes in one lag window all survive", async () => {
  resetStores();
  const handler = await load("status");
  const titles = Array.from({ length: 10 }, (_, i) => `Title ${i}`);
  for (const title of titles) {
    await handler(post("/api/status", { title, status: "watching", meta: "" }));
    advance(200);
  }
  settle();
  const { statuses } = await body(await handler(get("/api/status")));
  assert.equal(statuses.length, 10);
});

await check("a POST response includes the entry it just wrote, despite the lag", async () => {
  resetStores();
  const handler = await load("status");
  const res = await handler(post("/api/status", { title: "Annika", status: "watching", meta: "" }));
  const { ok, statuses } = await body(res);
  assert.equal(ok, true);
  assert.ok(statuses.some((e) => e.title === "Annika"), "POST response omitted its own write");
});

await check("re-posting a title replaces it rather than duplicating it", async () => {
  resetStores();
  const handler = await load("status");
  await handler(post("/api/status", { title: "Annika", status: "watching", meta: "S1" }));
  settle();
  await handler(post("/api/status", { title: "Annika", status: "watched", meta: "done" }));
  settle();
  const { statuses } = await body(await handler(get("/api/status")));
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].status, "watched");
  assert.equal(statuses[0].meta, "done");
});

await check("DELETE removes only its own title", async () => {
  resetStores();
  const handler = await load("status");
  await handler(post("/api/status", { title: "Annika", status: "watching", meta: "" }));
  await handler(post("/api/status", { title: "Bookish", status: "watching", meta: "" }));
  settle();
  await handler(del("/api/status?title=Annika"));
  settle();
  const { statuses } = await body(await handler(get("/api/status")));
  assert.deepEqual(statuses.map((e) => e.title), ["Bookish"]);
});

await check("titles with punctuation round-trip intact", async () => {
  resetStores();
  const handler = await load("status");
  const awkward = [
    "Special Ops: Lioness, season 3",
    "Gardeners' World Winter Specials 2021",
    "Clarkson's Farm",
    "A Very English Scandal",
    "Bron/Broen",
    "Cafe Amoré, café test",
  ];
  for (const title of awkward) {
    await handler(post("/api/status", { title, status: "watching", meta: "" }));
    advance(100);
  }
  settle();
  const { statuses } = await body(await handler(get("/api/status")));
  assert.deepEqual(statuses.map((e) => e.title).sort(), [...awkward].sort());
  // And each is individually deletable by its own title.
  await handler(del("/api/status?title=" + encodeURIComponent("Special Ops: Lioness, season 3")));
  settle();
  const after = (await body(await handler(get("/api/status")))).statuses;
  assert.equal(after.length, awkward.length - 1);
  assert.ok(!after.some((e) => e.title === "Special Ops: Lioness, season 3"));
});

await check("GET keeps ascending updatedAt order", async () => {
  resetStores();
  const handler = await load("status");
  for (const title of ["First", "Second", "Third"]) {
    await handler(post("/api/status", { title, status: "watching", meta: "" }));
    advance(1500); // distinct ISO seconds
  }
  settle();
  const { statuses } = await body(await handler(get("/api/status")));
  assert.deepEqual(statuses.map((e) => e.title), ["First", "Second", "Third"]);
});

await check("validation and method rules are unchanged", async () => {
  resetStores();
  const handler = await load("status");
  assert.equal((await handler(post("/api/status", { status: "watching" }))).status, 400);
  assert.equal((await handler(post("/api/status", { title: "x", status: "nope" }))).status, 400);
  assert.equal(
    (await handler(post("/api/status", { title: "x".repeat(201), status: "watching" }))).status,
    400,
  );
  assert.equal(
    (await handler(post("/api/status", { title: "x", status: "watching", section: "y".repeat(201) }))).status,
    400,
  );
  assert.equal((await handler(del("/api/status"))).status, 400);
  assert.equal(
    (await handler(new Request("https://streamingscout.org/api/status", { method: "PUT" }))).status,
    405,
  );
  const bad = new Request("https://streamingscout.org/api/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal((await handler(bad)).status, 400);
});

await check("legacy list blob migrates, keeping shape, order and dates", async () => {
  resetStores();
  const store = getStore("title-status");
  const legacy = [
    { title: "Apex", status: "watched", meta: "", section: "Top Picks", updatedAt: "2026-08-09T10:00:00.000Z" },
    { title: "Reacher, season 4", status: "watching", meta: "S4", section: "Coming Soon", updatedAt: "2026-08-12T10:00:00.000Z" },
    { title: "Say Nothing", status: "watched", meta: "", section: "Top Picks", updatedAt: "2026-08-14T10:00:00.000Z" },
  ];
  store._seed("list", legacy);

  const handler = await load("status");
  const { statuses } = await body(await handler(get("/api/status")));
  assert.deepEqual(statuses, legacy, "migrated list must match the legacy list exactly");

  // The legacy blob is left in place, untouched.
  const stillThere = await store.get("list", { type: "json" });
  assert.deepEqual(stillThere, legacy, "the old list blob must not be deleted or rewritten");
});

await check("a title deleted after migration does not come back on the next cold start", async () => {
  resetStores();
  const store = getStore("title-status");
  store._seed("list", [
    { title: "Apex", status: "watched", meta: "", section: "Top Picks", updatedAt: "2026-08-09T10:00:00.000Z" },
    { title: "Bookish", status: "watching", meta: "", section: "Top Picks", updatedAt: "2026-08-10T10:00:00.000Z" },
  ]);

  const first = await load("status");
  await first(get("/api/status"));
  settle();
  await first(del("/api/status?title=Apex"));
  settle();

  // Cold start: a fresh instance with no in-memory migration state.
  const second = await load("status");
  const { statuses } = await body(await second(get("/api/status")));
  assert.deepEqual(statuses.map((e) => e.title), ["Bookish"], "Apex resurrected from the legacy blob");
});

await check("there is no empty-list window while the migration writes settle", async () => {
  resetStores();
  const store = getStore("title-status");
  const legacy = [
    { title: "Apex", status: "watched", meta: "", section: "Top Picks", updatedAt: "2026-08-09T10:00:00.000Z" },
    { title: "Bookish", status: "watching", meta: "", section: "Top Picks", updatedAt: "2026-08-10T10:00:00.000Z" },
  ];
  store._seed("list", legacy);
  const handler = await load("status");

  // Every read from the moment of migration through the lag settling must
  // show the full list, never a partial one.
  for (let elapsed = 0; elapsed <= LAG_MS + 2000; elapsed += 500) {
    const { statuses } = await body(await handler(get("/api/status")));
    assert.deepEqual(statuses, legacy, `empty or partial list at +${elapsed}ms`);
    advance(500);
  }
});

await check("a write during the migration window is not shadowed by the old copy", async () => {
  resetStores();
  const store = getStore("title-status");
  store._seed("list", [
    { title: "Apex", status: "watched", meta: "stale", section: "Top Picks", updatedAt: "2026-08-09T10:00:00.000Z" },
  ]);
  const handler = await load("status");
  await handler(get("/api/status")); // triggers the migration
  advance(500); // still well inside the lag window
  await handler(post("/api/status", { title: "Apex", status: "watching", meta: "fresh" }));
  advance(500);
  const during = (await body(await handler(get("/api/status")))).statuses;
  assert.equal(during.length, 1);
  assert.equal(during[0].meta, "fresh", "the migration copy shadowed a newer write");
  settle();
  const after = (await body(await handler(get("/api/status")))).statuses;
  assert.equal(after.length, 1);
  assert.equal(after[0].meta, "fresh");
});

await check("migration runs once even under concurrent cold-start requests", async () => {
  resetStores();
  const store = getStore("title-status");
  store._seed("list", [
    { title: "Annika", status: "watching", meta: "", section: "Top Picks", updatedAt: "2026-08-10T10:00:00.000Z" },
  ]);
  const handler = await load("status");
  await Promise.all([handler(get("/api/status")), handler(get("/api/status")), handler(get("/api/status"))]);
  settle();
  const { statuses } = await body(await handler(get("/api/status")));
  assert.equal(statuses.length, 1);
});

await check("a live write during migration is not overwritten by the legacy copy", async () => {
  resetStores();
  const store = getStore("title-status");
  store._seed("list", [
    { title: "Annika", status: "watched", meta: "stale", section: "Top Picks", updatedAt: "2026-08-01T10:00:00.000Z" },
  ]);
  // Simulate the per-title blob already having a newer value (the migration
  // must yield to it rather than clobber it).
  store._seed("t_" + Buffer.from("Annika", "utf8").toString("base64url"), {
    title: "Annika",
    status: "watching",
    meta: "fresh",
    section: "Top Picks",
    updatedAt: "2026-08-16T10:00:00.000Z",
  });
  const handler = await load("status");
  const { statuses } = await body(await handler(get("/api/status")));
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].meta, "fresh", "migration overwrote a newer per-title write");
});

await check("the 500-entry abuse cap still holds", async () => {
  resetStores();
  const handler = await load("status");
  const store = getStore("title-status");
  // Seed 500 entries directly, all visible, so the cap is already reached.
  for (let i = 0; i < 500; i += 1) {
    const title = `Filler ${String(i).padStart(3, "0")}`;
    const bytes = Buffer.from(title, "utf8").toString("base64url");
    store._seed("t_" + bytes, {
      title,
      status: "watching",
      meta: "",
      section: null,
      updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
    });
  }
  await handler(post("/api/status", { title: "One more", status: "watching", meta: "" }));
  settle();
  const { statuses } = await body(await handler(get("/api/status")));
  assert.equal(statuses.length, 500, "cap breached");
  assert.ok(statuses.some((e) => e.title === "One more"), "the new title was not stored");
  assert.ok(!statuses.some((e) => e.title === "Filler 000"), "the oldest entry was not evicted");
});

await check("re-posting an existing title at the cap evicts nothing", async () => {
  resetStores();
  const handler = await load("status");
  const store = getStore("title-status");
  for (let i = 0; i < 500; i += 1) {
    const title = `Filler ${String(i).padStart(3, "0")}`;
    store._seed("t_" + Buffer.from(title, "utf8").toString("base64url"), {
      title,
      status: "watching",
      meta: "",
      section: null,
      updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
    });
  }
  await handler(post("/api/status", { title: "Filler 250", status: "watched", meta: "" }));
  settle();
  const { statuses } = await body(await handler(get("/api/status")));
  assert.equal(statuses.length, 500);
  assert.ok(statuses.some((e) => e.title === "Filler 000"), "an existing-title update evicted an entry");
});

// ---------------------------------------------------------------------------
// 2. dismiss.mjs
// ---------------------------------------------------------------------------

console.log("\ndismiss.mjs");

const getD = () => new Request("https://streamingscout.org/api/dismiss");

await check("two dismissals inside the lag window both survive", async () => {
  resetStores();
  const handler = await load("dismiss");
  await handler(post("/api/dismiss", { title: "The Choral", section: "Top Picks" }));
  advance(1000);
  await handler(post("/api/dismiss", { title: "Kleo", section: "Top Picks" }));
  settle();
  const { dismissed } = await body(await handler(getD()));
  assert.deepEqual(dismissed.map((e) => e.title).sort(), ["Kleo", "The Choral"]);
});

await check("a repeat dismissal does not bump the original date", async () => {
  resetStores();
  const handler = await load("dismiss");
  await handler(post("/api/dismiss", { title: "Kleo", section: "Top Picks" }));
  settle();
  const first = (await body(await handler(getD()))).dismissed[0].dismissedAt;
  advance(600000);
  await handler(post("/api/dismiss", { title: "Kleo", section: "Coming Soon" }));
  settle();
  const { dismissed } = await body(await handler(getD()));
  assert.equal(dismissed.length, 1);
  assert.equal(dismissed[0].dismissedAt, first, "a repeat click rewrote the dismissal date");
  assert.equal(dismissed[0].section, "Top Picks", "a repeat click rewrote the original section");
});

await check("un-dismiss removes only its own title", async () => {
  resetStores();
  const handler = await load("dismiss");
  await handler(post("/api/dismiss", { title: "The Choral", section: "Top Picks" }));
  await handler(post("/api/dismiss", { title: "Kleo", section: "Top Picks" }));
  settle();
  await handler(del("/api/dismiss?title=Kleo"));
  settle();
  const { dismissed } = await body(await handler(getD()));
  assert.deepEqual(dismissed.map((e) => e.title), ["The Choral"]);
});

await check("legacy dismissal list migrates with dates and sections intact", async () => {
  resetStores();
  const store = getStore("dismissed-titles");
  const legacy = [
    { title: "The Choral", section: "Top Picks", dismissedAt: "2026-08-02T09:00:00.000Z" },
    { title: "Sunset Grove", section: "Top Picks", dismissedAt: "2026-08-05T09:00:00.000Z" },
    { title: "Kleo", section: "Coming Soon", dismissedAt: "2026-08-11T09:00:00.000Z" },
  ];
  store._seed("list", legacy);
  const handler = await load("dismiss");
  const { dismissed } = await body(await handler(getD()));
  assert.deepEqual(dismissed, legacy);
  assert.deepEqual(await store.get("list", { type: "json" }), legacy, "legacy blob was modified");
});

await check("dismissals stay visible for the whole migration lag window", async () => {
  resetStores();
  const store = getStore("dismissed-titles");
  const legacy = [
    { title: "The Choral", section: "Top Picks", dismissedAt: "2026-08-02T09:00:00.000Z" },
    { title: "Kleo", section: "Coming Soon", dismissedAt: "2026-08-11T09:00:00.000Z" },
  ];
  store._seed("list", legacy);
  const handler = await load("dismiss");
  for (let elapsed = 0; elapsed <= LAG_MS + 2000; elapsed += 500) {
    const { dismissed } = await body(await handler(getD()));
    assert.deepEqual(dismissed, legacy, `dismissals vanished at +${elapsed}ms`);
    advance(500);
  }
});

await check("a repeat dismissal during the migration window keeps the original date", async () => {
  resetStores();
  const store = getStore("dismissed-titles");
  store._seed("list", [
    { title: "Kleo", section: "Coming Soon", dismissedAt: "2026-08-11T09:00:00.000Z" },
  ]);
  const handler = await load("dismiss");
  await handler(getD()); // triggers the migration
  advance(500);
  await handler(post("/api/dismiss", { title: "Kleo", section: "Top Picks" }));
  settle();
  const { dismissed } = await body(await handler(getD()));
  assert.equal(dismissed.length, 1);
  assert.equal(dismissed[0].dismissedAt, "2026-08-11T09:00:00.000Z");
  assert.equal(dismissed[0].section, "Coming Soon");
});

await check("an un-dismissed title does not resurrect on the next cold start", async () => {
  resetStores();
  const store = getStore("dismissed-titles");
  store._seed("list", [
    { title: "The Choral", section: "Top Picks", dismissedAt: "2026-08-02T09:00:00.000Z" },
    { title: "Kleo", section: "Coming Soon", dismissedAt: "2026-08-11T09:00:00.000Z" },
  ]);
  const first = await load("dismiss");
  await first(getD());
  settle();
  await first(del("/api/dismiss?title=Kleo"));
  settle();
  const second = await load("dismiss");
  const { dismissed } = await body(await second(getD()));
  assert.deepEqual(dismissed.map((e) => e.title), ["The Choral"]);
});

await check("dismiss validation and method rules are unchanged", async () => {
  resetStores();
  const handler = await load("dismiss");
  assert.equal((await handler(post("/api/dismiss", {}))).status, 400);
  assert.equal((await handler(post("/api/dismiss", { title: "x".repeat(201) }))).status, 400);
  assert.equal((await handler(post("/api/dismiss", { title: "x", section: "y".repeat(201) }))).status, 400);
  assert.equal((await handler(del("/api/dismiss"))).status, 400);
  assert.equal(
    (await handler(new Request("https://streamingscout.org/api/dismiss", { method: "PUT" }))).status,
    405,
  );
});

await check("the dismiss cap still holds", async () => {
  resetStores();
  const handler = await load("dismiss");
  const store = getStore("dismissed-titles");
  for (let i = 0; i < 500; i += 1) {
    const title = `Junk ${String(i).padStart(3, "0")}`;
    store._seed("t_" + Buffer.from(title, "utf8").toString("base64url"), {
      title,
      section: null,
      dismissedAt: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
    });
  }
  await handler(post("/api/dismiss", { title: "One more", section: "Top Picks" }));
  settle();
  const { dismissed } = await body(await handler(getD()));
  assert.equal(dismissed.length, 500);
  assert.ok(dismissed.some((e) => e.title === "One more"));
  assert.ok(!dismissed.some((e) => e.title === "Junk 000"));
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} assertion group(s) passed.`);
if (process.exitCode) console.error("Concurrency suite FAILED.");
else console.log("Concurrency suite passed.");
