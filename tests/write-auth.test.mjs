// tests/write-auth.test.mjs
//
// Covers roadmap Phase 7, "Protect saved changes" (2026-08-23): POST and DELETE
// on netlify/functions/dismiss.mjs and status.mjs require the edit key; GET does
// not.
//
// The header comment in tests/request-contract.test.mjs says both endpoints are
// "unauthenticated by design". That stopped being true with this phase, and its
// validation-bound tests still pass unchanged only because they now run WITH a
// key set. That is worth knowing when reading the two files together.
//
// Same harness as the concurrency and contract suites: the real @netlify/blobs
// import is redirected by tests/register-blobs-mock.mjs, so the Functions run
// exactly as written with no test-only branches. No network, no deploy.
//
// Run: node --import ./tests/register-blobs-mock.mjs tests/write-auth.test.mjs

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resetStores } from "./fake-blobs.mjs";

let passed = 0;
function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log("  ok  " + label); })
    .catch((err) => {
      console.error("  FAIL  " + label);
      console.error("        " + err.message);
      process.exitCode = 1;
    });
}

const KEY = "test-edit-key-not-a-real-secret";
const req = (url, method, { key, body } = {}) => {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (key !== undefined) headers.set("x-edit-key", key);
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

const load = async (name) => (await import(`../netlify/functions/${name}.mjs?t=${Date.now()}`)).default;

const CASES = [
  { name: "dismiss", url: "https://x/api/dismiss", post: { title: "A Title" }, del: "https://x/api/dismiss?title=A%20Title" },
  { name: "status", url: "https://x/api/status", post: { title: "A Title", status: "watched" }, del: "https://x/api/status?title=A%20Title" },
];

for (const c of CASES) {
  const handler = await load(c.name);

  await check(`${c.name}: GET stays open with no key (browsing needs nothing)`, async () => {
    resetStores();
    process.env.EDIT_SECRET = KEY;
    const res = await handler(req(c.url, "GET"));
    assert.equal(res.status, 200, `GET returned ${res.status}`);
  });

  await check(`${c.name}: POST with no key is rejected 401`, async () => {
    resetStores();
    process.env.EDIT_SECRET = KEY;
    const res = await handler(req(c.url, "POST", { body: c.post }));
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
  });

  await check(`${c.name}: POST with the WRONG key is rejected 401`, async () => {
    resetStores();
    process.env.EDIT_SECRET = KEY;
    const res = await handler(req(c.url, "POST", { key: "wrong", body: c.post }));
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
  });

  await check(`${c.name}: POST with the right key is accepted`, async () => {
    resetStores();
    process.env.EDIT_SECRET = KEY;
    const res = await handler(req(c.url, "POST", { key: KEY, body: c.post }));
    assert.ok(res.status >= 200 && res.status < 300, `expected 2xx, got ${res.status}`);
  });

  await check(`${c.name}: DELETE with no key is rejected 401`, async () => {
    resetStores();
    process.env.EDIT_SECRET = KEY;
    const res = await handler(req(c.del, "DELETE"));
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
  });

  await check(`${c.name}: fails CLOSED when EDIT_SECRET is unset, as a distinct 500`, async () => {
    resetStores();
    delete process.env.EDIT_SECRET;
    // An unset secret is a misconfiguration, not permission, and as of
    // 2026-08-28 is reported as one: a 500, not the 401 a caller presenting
    // a wrong or missing key gets. The two used to be indistinguishable from
    // outside. Even a caller presenting a key must still be rejected, and a
    // caller presenting the empty string must not match the empty
    // expectation — both land on the same 500, not a 401.
    const withKey = await handler(req(c.url, "POST", { key: KEY, body: c.post }));
    assert.equal(withKey.status, 500, "key presented");
    const withKeyBody = await withKey.json();
    assert.equal(withKeyBody.error, "server misconfigured: EDIT_SECRET not set");

    const emptyKey = await handler(req(c.url, "POST", { key: "", body: c.post }));
    assert.equal(emptyKey.status, 500, "empty key vs empty secret");

    process.env.EDIT_SECRET = KEY;
  });

  await check(`${c.name}: auth is checked BEFORE the store is touched (source order)`, async () => {
    // Vinyl Scout's Phase 8 review caught the opposite order: an unauthorized
    // request in an environment where Blobs cannot initialise returned 500
    // instead of 401, leaking infrastructure state to an unauthenticated
    // caller.
    //
    // Asserted against the SOURCE rather than by making the store throw,
    // because ES module exports are read-only and cannot be monkeypatched , 
    // and a source-order assertion is the stronger check anyway: it cannot be
    // satisfied by a try/catch that happens to return 401 for the wrong
    // reason. The gate must literally precede getStore() in the handler.
    const src = await readFile(
      new URL(`../netlify/functions/${c.name}.mjs`, import.meta.url),
      "utf8",
    );
    const handlerAt = src.indexOf("export default async (req)");
    assert.ok(handlerAt > -1, "handler not found");
    const body = src.slice(handlerAt);
    const gateAt = body.indexOf("checkWriteAuth(req)");
    const storeAt = body.indexOf("getStore(");
    assert.ok(gateAt > -1, "no checkWriteAuth call inside the handler");
    assert.ok(storeAt > -1, "no getStore call inside the handler");
    assert.ok(
      gateAt < storeAt,
      `getStore() runs before the auth gate (gate at ${gateAt}, store at ${storeAt})`,
    );
  });

}

console.log(`\n${passed} passed`);
