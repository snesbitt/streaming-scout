// tests/request-contract.test.mjs
//
// Covers the REQUEST CONTRACT of netlify/functions/dismiss.mjs and
// netlify/functions/status.mjs: input validation, error codes, field
// normalisation, and blob-key encoding.
//
// This is deliberately the complement of tests/blobs-concurrency.test.mjs,
// which covers the 2026-08-17 per-title storage model (lost updates, the
// migration, the 500-entry cap, 405 on an unknown method). That file proves
// the functions store data correctly. This one proves they REJECT bad input
// correctly, which nothing checked before: the punch-list note about the
// dismiss/status Functions having "no coverage for their actual logic"
// predates the concurrency suite and was only ever half-closed by it.
//
// Both endpoints are unauthenticated by design (see dismiss.mjs's v1 header),
// so their validation bounds are the only thing standing between an open POST
// and arbitrary junk in the store. That makes these bounds worth pinning down
// rather than assuming.
//
// Same harness as the concurrency suite: the real @netlify/blobs import is
// redirected by tests/register-blobs-mock.mjs, so the Functions run exactly as
// written with no test-only branches. No network, no deploy.
//
// Run: node --import ./tests/register-blobs-mock.mjs tests/request-contract.test.mjs

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

let coldStarts = 0;
async function load(name) {
  coldStarts += 1;
  const mod = await import(`../netlify/functions/${name}.mjs?contract=${coldStarts}`);
  return mod.default;
}

const settle = () => advance(LAG_MS + 1);
const body = (res) => res.json();

function post(path, payload) {
  return new Request("https://streamingscout.org" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}
const del = (path) => new Request("https://streamingscout.org" + path, { method: "DELETE" });

// The two endpoints share almost all of their validation, so the shared cases
// run against both rather than being written twice and drifting apart. Each
// entry carries what differs: the path, the store name, the response list key,
// and the extra fields a valid POST needs.
const ENDPOINTS = [
  {
    name: "dismiss",
    path: "/api/dismiss",
    store: "dismissed-titles",
    listKey: "dismissed",
    validExtra: {},
  },
  {
    name: "status",
    path: "/api/status",
    store: "title-status",
    listKey: "statuses",
    validExtra: { status: "watching" },
  },
];

console.log("=== Shared request contract (dismiss.mjs + status.mjs) ===");

for (const ep of ENDPOINTS) {
  await check(`${ep.name}: a body that is not JSON is a 400, not a 500`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(post(ep.path, "{not json"));
    assert.equal(res.status, 400);
    assert.equal((await body(res)).error, "Invalid JSON body");
  });

  await check(`${ep.name}: a missing title is a 400`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(post(ep.path, { ...ep.validExtra }));
    assert.equal(res.status, 400);
    assert.equal((await body(res)).error, "title is required");
  });

  await check(`${ep.name}: a whitespace-only title is a 400, not an entry named " "`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(post(ep.path, { title: "   \t\n ", ...ep.validExtra }));
    assert.equal(res.status, 400);
    assert.equal((await body(res)).error, "title is required");
  });

  await check(`${ep.name}: a title is trimmed before it is stored`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(post(ep.path, { title: "  Slow Horses  ", ...ep.validExtra }));
    assert.equal(res.status, 200);
    const list = (await body(res))[ep.listKey];
    assert.equal(list.length, 1);
    assert.equal(list[0].title, "Slow Horses", "the stored title kept its padding");
  });

  // The boundary, not just "long is rejected". An off-by-one here would either
  // reject a legal 200-character title or admit a 201-character one, and
  // neither would show up in a test that only tried something wildly too long.
  await check(`${ep.name}: a title of exactly 200 characters is accepted`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(post(ep.path, { title: "A".repeat(200), ...ep.validExtra }));
    assert.equal(res.status, 200, "the 200-character boundary was rejected");
  });

  await check(`${ep.name}: a title of 201 characters is a 400`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(post(ep.path, { title: "A".repeat(201), ...ep.validExtra }));
    assert.equal(res.status, 400);
    assert.match((await body(res)).error, /title must be 200 characters or fewer/);
  });

  await check(`${ep.name}: a section of exactly 200 characters is accepted`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(
      post(ep.path, { title: "Bounded", section: "S".repeat(200), ...ep.validExtra }),
    );
    assert.equal(res.status, 200, "the 200-character section boundary was rejected");
  });

  await check(`${ep.name}: a section of 201 characters is a 400`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(
      post(ep.path, { title: "Bounded", section: "S".repeat(201), ...ep.validExtra }),
    );
    assert.equal(res.status, 400);
    assert.match((await body(res)).error, /section must be 200 characters or fewer/);
  });

  await check(`${ep.name}: a blank section is stored as null, not ""`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(post(ep.path, { title: "Sectionless", section: "   ", ...ep.validExtra }));
    const list = (await body(res))[ep.listKey];
    assert.equal(list[0].section, null, "a whitespace section leaked through as a string");
  });

  await check(`${ep.name}: DELETE without a title param is a 400`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(del(ep.path));
    assert.equal(res.status, 400);
    assert.equal((await body(res)).error, "title query param is required");
  });

  await check(`${ep.name}: DELETE with a whitespace-only title is a 400`, async () => {
    resetStores();
    const handler = await load(ep.name);
    const res = await handler(del(ep.path + "?title=%20%20"));
    assert.equal(res.status, 400);
  });

  // A title arriving with stray padding must delete the entry stored under its
  // trimmed form, or an un-dismiss silently does nothing and the title stays
  // gone from the UI forever.
  await check(`${ep.name}: DELETE trims the title before looking it up`, async () => {
    resetStores();
    const handler = await load(ep.name);
    await handler(post(ep.path, { title: "The Diplomat", ...ep.validExtra }));
    settle();
    const res = await handler(del(ep.path + "?title=" + encodeURIComponent("  The Diplomat  ")));
    assert.equal(res.status, 200);
    settle();
    assert.equal((await body(res))[ep.listKey].length, 0, "the padded DELETE missed its entry");
  });

  // A store that cannot be read must fail loudly. Serving an empty list here is
  // how a dismissed title comes back from the dead, which both files' comments
  // call out as this project's recurring failure mode.
  await check(`${ep.name}: a failing store is a 503, never an empty list`, async () => {
    resetStores();
    const store = getStore(ep.store);
    const realGet = store.get.bind(store);
    store.get = async () => {
      throw new Error("blobs unavailable");
    };
    const handler = await load(ep.name);
    const res = await handler(new Request("https://streamingscout.org" + ep.path));
    assert.equal(res.status, 503);
    const payload = await body(res);
    assert.match(payload.error, /refusing to serve a partial list/);
    assert.equal(payload[ep.listKey], undefined, "a partial list was served alongside the error");
    store.get = realGet;
  });

  // The migration guard caches a promise at module scope. If a failure were
  // cached, the endpoint would stay dead for the life of the instance rather
  // than recovering when Blobs came back.
  await check(`${ep.name}: a store failure is not cached — the next request retries`, async () => {
    resetStores();
    const store = getStore(ep.store);
    const realGet = store.get.bind(store);
    let failNext = true;
    store.get = async (...args) => {
      if (failNext) {
        failNext = false;
        throw new Error("blobs unavailable");
      }
      return realGet(...args);
    };
    const handler = await load(ep.name);
    assert.equal((await handler(new Request("https://streamingscout.org" + ep.path))).status, 503);
    const res = await handler(new Request("https://streamingscout.org" + ep.path));
    assert.equal(res.status, 200, "the endpoint stayed dead after a transient store failure");
    store.get = realGet;
  });
}

console.log("=== Blob key encoding ===");

// Real titles from this project's own data carry colons, commas, apostrophes
// and non-ASCII. keyForTitle is not exported, so it is exercised through the
// handler and read back off the fake store's key space — which is the thing
// that actually has to be legal, rather than a copy of the function.
const AWKWARD_TITLES = [
  "Special Ops: Lioness, season 3",
  "Gardeners' World Winter Specials 2021",
  "Babylon Berlin",
  "Kübra",
  "9-1-1: Lone Star",
  'The "Burbs',
  "Cobra Kai / Karate Kid",
  "100% Wolf",
];

for (const ep of ENDPOINTS) {
  await check(`${ep.name}: awkward titles produce legal, unique blob keys`, async () => {
    resetStores();
    const handler = await load(ep.name);
    for (const title of AWKWARD_TITLES) {
      const res = await handler(post(ep.path, { title, ...ep.validExtra }));
      assert.equal(res.status, 200, `POST failed for ${JSON.stringify(title)}`);
    }
    const store = getStore(ep.store);
    const titleKeys = [...store.versions.keys()].filter((k) => k.startsWith("t_"));
    assert.equal(
      titleKeys.length,
      AWKWARD_TITLES.length,
      "two different titles collided onto one key",
    );
    for (const key of titleKeys) {
      assert.match(key, /^t_[A-Za-z0-9_-]+$/, `illegal blob key: ${key}`);
    }
  });

  await check(`${ep.name}: every awkward title reads back with its exact text`, async () => {
    resetStores();
    const handler = await load(ep.name);
    for (const title of AWKWARD_TITLES) {
      await handler(post(ep.path, { title, ...ep.validExtra }));
    }
    settle();
    const res = await handler(new Request("https://streamingscout.org" + ep.path));
    const stored = (await body(res))[ep.listKey].map((e) => e.title).sort();
    assert.deepEqual(stored, [...AWKWARD_TITLES].sort(), "a title was mangled by the key encoding");
  });
}

console.log("=== status.mjs only ===");

await check("status: a status outside the allow-list is a 400", async () => {
  resetStores();
  const handler = await load("status");
  const res = await handler(post("/api/status", { title: "Andor", status: "abandoned" }));
  assert.equal(res.status, 400);
  assert.match((await body(res)).error, /status must be one of: watching, watched/);
});

await check("status: a missing status is a 400", async () => {
  resetStores();
  const handler = await load("status");
  const res = await handler(post("/api/status", { title: "Andor" }));
  assert.equal(res.status, 400);
  assert.match((await body(res)).error, /status must be one of/);
});

await check("status: both allowed statuses are accepted", async () => {
  resetStores();
  const handler = await load("status");
  for (const status of ["watching", "watched"]) {
    const res = await handler(post("/api/status", { title: "Andor " + status, status }));
    assert.equal(res.status, 200, `${status} was rejected`);
  }
});

// meta is truncated where title and section are rejected. That asymmetry is
// deliberate in status.mjs (meta is generated copy, not user-typed, so
// clipping it is friendlier than failing the write) but it is invisible from
// the outside, so it gets pinned here rather than left to be "fixed" later by
// someone who reads the other two checks and assumes meta matches them.
await check("status: an over-long meta is truncated to 200, not rejected", async () => {
  resetStores();
  const handler = await load("status");
  const res = await handler(
    post("/api/status", { title: "Long meta", status: "watched", meta: "m".repeat(250) }),
  );
  assert.equal(res.status, 200, "meta was rejected — it is supposed to clip");
  const entry = (await body(res)).statuses.find((e) => e.title === "Long meta");
  assert.equal(entry.meta.length, 200, "meta was not clipped to the field bound");
});

await check("status: re-posting a title replaces its status in place", async () => {
  resetStores();
  const handler = await load("status");
  await handler(post("/api/status", { title: "Slow Horses", status: "watching" }));
  settle();
  const res = await handler(post("/api/status", { title: "Slow Horses", status: "watched" }));
  const list = (await body(res)).statuses.filter((e) => e.title === "Slow Horses");
  assert.equal(list.length, 1, "the same title was stored twice");
  assert.equal(list[0].status, "watched");
});

console.log("=== dismiss.mjs only ===");

// check-dismiss-drift.mjs reports the original dismissedAt date, so a repeat
// click must not bump it. dismiss.mjs's own comment says so; nothing enforced it.
//
// The wall clock has to be faked for this to mean anything. advance() moves the
// fake Blobs clock, not Date, and both POSTs otherwise land in the same
// millisecond of real time — so the timestamps match whether or not the entry
// was rewritten, and the assertion passes for the wrong reason. That was true
// of the first draft of this test: mutating dismiss.mjs to overwrite the entry
// unconditionally did not fail it. Pinning Date to two distinct instants is
// what makes the assertion able to fail.
const RealDate = Date;
function withClockAt(iso, fn) {
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [iso]));
    }
    static now() {
      return new RealDate(iso).getTime();
    }
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.Date = RealDate;
    });
}

await check("dismiss: a repeat dismissal keeps the original dismissedAt", async () => {
  resetStores();
  const handler = await load("dismiss");
  const T1 = "2026-08-01T10:00:00.000Z";
  const T2 = "2026-08-19T18:00:00.000Z";

  const first = await withClockAt(T1, () => handler(post("/api/dismiss", { title: "Reacher" })));
  const firstAt = (await body(first)).dismissed[0].dismissedAt;
  assert.equal(firstAt, T1, "the fake clock did not reach the handler");
  settle();

  const second = await withClockAt(T2, () => handler(post("/api/dismiss", { title: "Reacher" })));
  const entries = (await body(second)).dismissed.filter((e) => e.title === "Reacher");
  assert.equal(entries.length, 1, "the repeat click created a second entry");
  assert.equal(entries[0].dismissedAt, T1, "the repeat click bumped dismissedAt");
});

// The mirror of the test above: status.mjs is SUPPOSED to move updatedAt on
// every write, because a status change is the whole point. Asserting that
// keeps someone from "fixing" it into dismiss.mjs's no-op-on-repeat behaviour.
await check("status: a repeat post DOES move updatedAt", async () => {
  resetStores();
  const handler = await load("status");
  const T1 = "2026-08-01T10:00:00.000Z";
  const T2 = "2026-08-19T18:00:00.000Z";

  await withClockAt(T1, () => handler(post("/api/status", { title: "Andor", status: "watching" })));
  settle();
  const second = await withClockAt(T2, () =>
    handler(post("/api/status", { title: "Andor", status: "watched" })),
  );
  const entry = (await body(second)).statuses.find((e) => e.title === "Andor");
  assert.equal(entry.updatedAt, T2, "updatedAt did not follow the status change");
});

await check("dismiss: an entry survives a round trip with its section intact", async () => {
  resetStores();
  const handler = await load("dismiss");
  await handler(post("/api/dismiss", { title: "Paradise", section: "Coming Soon" }));
  settle();
  const res = await handler(new Request("https://streamingscout.org/api/dismiss"));
  const entry = (await body(res)).dismissed.find((e) => e.title === "Paradise");
  assert.equal(entry.section, "Coming Soon");
});

console.log(`\n${passed} passed`);
