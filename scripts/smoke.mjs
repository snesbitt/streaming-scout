#!/usr/bin/env node
// scripts/smoke.mjs — post-deploy health check for the LIVE site.
//
// Asserts the deployed site is actually healthy, not just that the build
// went green. Read-only on purpose: both API endpoints here (dismiss.mjs,
// status.mjs) are intentionally unauthenticated (open POST/DELETE, no edit
// key — see each file's own header for why), so a real write-round-trip
// check would insert real junk into Susan's live stores. Mirrors the same
// pattern and same non-goal already established in Vinyl Scout's own
// scripts/smoke.mjs.
//
// Usage:  npm run smoke                       (defaults to https://streamingscout.org)
//         node scripts/smoke.mjs <baseUrl>
//
// Exits 0 if every check passes, 1 otherwise. Node 18+ (global fetch).

const BASE = (process.argv[2] || 'https://streamingscout.org').replace(/\/$/, '');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ok   ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };

async function check(name, fn) {
  try { await fn(); }
  catch (err) { bad(name + ' — ' + err.message); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log('Streaming Scout smoke test → ' + BASE + '\n');

// 1. Home page loads and is the real app, not a Netlify error/placeholder page.
await check('home page', async () => {
  const res = await fetch(BASE + '/');
  assert(res.ok, 'GET / returned ' + res.status);
  assert((res.headers.get('content-type') || '').includes('text/html'), 'not text/html');
  const html = await res.text();
  assert(html.includes('Streaming Scout'), 'title text missing');
  ok('home page loads and contains expected title text');
});

// 2. Internal docs/data files stay blocked (netlify.toml's own redirect
// rules — CLAUDE.md, README.md, package.json, data/*.md should all 404 to
// index.html, not serve their real contents publicly).
await check('internal files blocked', async () => {
  const res = await fetch(BASE + '/CLAUDE.md');
  assert(res.status === 404, 'GET /CLAUDE.md returned ' + res.status + ' (expected 404)');
  ok('GET /CLAUDE.md → 404 (not publicly served)');
});

// 3. /api/dismiss is reachable and returns the expected shape.
await check('dismiss API', async () => {
  const res = await fetch(BASE + '/api/dismiss');
  assert(res.ok, 'GET /api/dismiss returned ' + res.status);
  const data = await res.json();
  assert(Array.isArray(data.dismissed), 'response.dismissed is not an array');
  ok('GET /api/dismiss → ' + data.dismissed.length + ' entries, shape valid');
});

// 4. /api/status is reachable and returns the expected shape.
await check('status API', async () => {
  const res = await fetch(BASE + '/api/status');
  assert(res.ok, 'GET /api/status returned ' + res.status);
  const data = await res.json();
  assert(Array.isArray(data.statuses), 'response.statuses is not an array');
  ok('GET /api/status → ' + data.statuses.length + ' entries, shape valid');
});

// 5. Malformed input is rejected with 400, not a 500 (endpoints are wired
// and validating, not just present).
await check('dismiss input validation', async () => {
  const res = await fetch(BASE + '/api/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // missing required "title"
  });
  assert(res.status === 400, 'POST /api/dismiss with no title returned ' + res.status + ' (expected 400)');
  ok('POST /api/dismiss (no title) → 400 (validated, no junk written)');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
