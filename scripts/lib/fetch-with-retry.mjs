// scripts/lib/fetch-with-retry.mjs
//
// A timeout+retry wrapper around fetch(), used instead of a bare fetch()
// call by every script here that makes a live-network request.
//
// Added 2026-08-16 (as smoke.mjs's own fetchWithRetry), after CI run #23
// failed the whole `smoke` job - and opened a GitHub issue - on a single
// `fetch failed`, which is undici's raw network error, not an HTTP status.
// /api/status was verifiably healthy at the time, so that was a transient
// blip or a Netlify Function cold start, not a real outage. A check that
// cries wolf gets ignored, so: a hard per-attempt timeout plus two retries
// with backoff. A genuine outage still fails all three attempts and still
// reports; one dropped connection no longer does.
//
// Originally written twice - once in smoke.mjs, once in
// backup-live-records.mjs, identical apart from formatting. Extracted here
// 2026-08-28 when check-status-drift.mjs, check-watched-drift.mjs and
// check-dismiss-drift.mjs needed the exact same protection (they were still
// on bare fetch() and could fail, or open a spurious drift report, on the
// same kind of transient blip run #23 hit) and a third, fourth and fifth
// copy would have been worse than one shared import.
//
// Usage:  const res = await fetchWithRetry(url, init);   // init optional
// Node 18+ (global fetch, AbortSignal.timeout).

export const FETCH_RETRY_ATTEMPTS = 3;
export const FETCH_RETRY_TIMEOUT_MS = 10000;

export async function fetchWithRetry(url, init) {
  let lastErr;
  for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_RETRY_TIMEOUT_MS) });
    } catch (err) {
      lastErr = err;
      const why = err.name === "TimeoutError" ? `timed out after ${FETCH_RETRY_TIMEOUT_MS}ms` : err.message;
      if (attempt < FETCH_RETRY_ATTEMPTS) {
        console.log(`  ..   ${url} attempt ${attempt}/${FETCH_RETRY_ATTEMPTS} failed (${why}), retrying`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw new Error(`network error after ${FETCH_RETRY_ATTEMPTS} attempts: ${lastErr.message}`);
}
