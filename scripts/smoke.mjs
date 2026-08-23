#!/usr/bin/env node
// scripts/smoke.mjs, post-deploy health check for the LIVE site.
//
// Asserts the deployed site is actually healthy, not just that the build
// went green. Read-only on purpose: both API endpoints here (dismiss.mjs,
// status.mjs) are intentionally unauthenticated (open POST/DELETE, no edit
// key, see each file's own header for why), so a real write-round-trip
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
  catch (err) { bad(name + ', ' + err.message); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// 2026-08-16: every network call goes through this instead of bare fetch().
// Run #23 failed the whole job (and opened a GitHub issue) on a single
// `fetch failed`, which is undici's raw network error, not an HTTP status.
// /api/status was verifiably healthy at the time, so that was a transient
// blip or a Netlify Function cold start, not a real outage. A smoke check
// that cries wolf gets ignored, so: a hard per-attempt timeout plus two
// retries with backoff. A genuine outage still fails all three attempts and
// still reports; one dropped connection no longer does.
const ATTEMPTS = 3;
const TIMEOUT_MS = 10000;

async function fetchWithRetry(url, init) {
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      lastErr = err;
      const why = err.name === 'TimeoutError' ? 'timed out after ' + TIMEOUT_MS + 'ms' : err.message;
      if (attempt < ATTEMPTS) {
        console.log('  ..   ' + url + ' attempt ' + attempt + '/' + ATTEMPTS + ' failed (' + why + '), retrying');
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw new Error('network error after ' + ATTEMPTS + ' attempts: ' + lastErr.message);
}

console.log('Streaming Scout smoke test → ' + BASE + '\n');

// 1. Home page loads and is the real app, not a Netlify error/placeholder page.
let homeHtml = '';
await check('home page', async () => {
  const res = await fetchWithRetry(BASE + '/');
  assert(res.ok, 'GET / returned ' + res.status);
  assert((res.headers.get('content-type') || '').includes('text/html'), 'not text/html');
  homeHtml = await res.text();
  assert(homeHtml.includes('Streaming Scout'), 'title text missing');
  ok('home page loads and contains expected title text');
});

// 1b. Every static Currently Watching row has real poster art wired in, not
// just the monogram fallback. Added 2026-08-16, targeting the exact bug
// class CLAUDE.md documents on 2026-08-05 (poster art lost on reload) and
// 2026-08-10/08-11 (a watching title with no static markup at all never
// gets a real fix). This only proves the <img> element exists in the served
// markup, not that its src actually resolves to a loading image (that
// would need fetching every poster URL, out of scope for a fast smoke
// check; see the periodic artwork sweep for that). Static rows are the
// permanent-record path this project's own history shows is the one that
// actually survives a reload/rebuild, so this is a meaningful, cheap proxy.
await check('currently watching poster coverage', async () => {
  assert(homeHtml, 'home page HTML not loaded (check 1 must run first)');
  // Rows are siblings, not nested in each other, so splitting on the literal
  // opening-tag marker is more robust than a regex trying to match a whole
  // block through arbitrarily-nested inner divs (button/span markup varies
  // row to row). Each chunk after the split holds exactly one row's own
  // content up to (not including) the next row's opening tag.
  const marker = '<div class="watching-row"';
  const chunks = homeHtml.split(marker).slice(1);
  assert(chunks.length > 0, 'no .watching-row blocks found in the static markup at all');
  const monogramOnly = chunks
    .map((chunk) => {
      const m = /data-title="([^"]*)"/.exec(chunk);
      return { title: m ? m[1] : '(untitled row)', hasImg: /<img\b/.test(chunk) };
    })
    .filter((r) => !r.hasImg)
    .map((r) => r.title);
  assert(monogramOnly.length === 0, `${monogramOnly.length} Currently Watching row(s) have no <img> at all (monogram-only): ${monogramOnly.join(', ')}`);
  ok(`all ${chunks.length} Currently Watching row(s) have a real <img> element wired in`);
});

// 2. Internal docs/data files stay blocked (netlify.toml's own redirect
// rules, CLAUDE.md, README.md, package.json, data/*.md should all 404 to
// index.html, not serve their real contents publicly).
await check('internal files blocked', async () => {
  const res = await fetchWithRetry(BASE + '/CLAUDE.md');
  assert(res.status === 404, 'GET /CLAUDE.md returned ' + res.status + ' (expected 404)');
  ok('GET /CLAUDE.md → 404 (not publicly served)');
});

// 3. /api/dismiss is reachable and returns the expected shape.
await check('dismiss API', async () => {
  const res = await fetchWithRetry(BASE + '/api/dismiss');
  assert(res.ok, 'GET /api/dismiss returned ' + res.status);
  const data = await res.json();
  assert(Array.isArray(data.dismissed), 'response.dismissed is not an array');
  ok('GET /api/dismiss → ' + data.dismissed.length + ' entries, shape valid');
});

// 4. /api/status is reachable and returns the expected shape.
await check('status API', async () => {
  const res = await fetchWithRetry(BASE + '/api/status');
  assert(res.ok, 'GET /api/status returned ' + res.status);
  const data = await res.json();
  assert(Array.isArray(data.statuses), 'response.statuses is not an array');
  ok('GET /api/status → ' + data.statuses.length + ' entries, shape valid');
});

// 5. An unauthenticated write is rejected at the gate.
//
// This assertion checked for 400 (missing "title") until Phase 7 (2026-08-23).
// Writes now require the edit key, so an unauthenticated POST is refused before
// validation ever runs, 401, not 400. That makes this the live proof the gate
// is actually on in production, which is worth more than re-proving validation
// that tests/request-contract.test.mjs already covers offline.
//
// A 400 here would mean the gate is NOT active: either EDIT_SECRET is unset in
// Netlify (the Functions fail closed, so that would 401 too) or an ungated
// build is deployed. Either way, investigate rather than relaxing this.
await check('unauthenticated writes are rejected', async () => {
  const res = await fetchWithRetry(BASE + '/api/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // no key, and no "title" either
  });
  assert(res.status === 401, 'POST /api/dismiss with no edit key returned ' + res.status + ' (expected 401)');
  ok('POST /api/dismiss (no edit key) → 401 (writes are gated in production)');
});

// 5b. Reading is still open to anyone: no key, no account, no prompt.
await check('reads stay open', async () => {
  const res = await fetchWithRetry(BASE + '/api/dismiss');
  assert(res.status === 200, 'GET /api/dismiss returned ' + res.status + ' (expected 200)');
  ok('GET /api/dismiss → 200 (browsing needs nothing)');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
