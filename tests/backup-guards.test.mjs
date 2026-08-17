// tests/backup-guards.test.mjs
//
// Proves the two backup guards actually refuse the things they claim to
// refuse. Both are only worth having if they fire on the real failure
// shapes, so each case below is driven end to end through the real script,
// not through an extracted helper.
//
// scripts/check-data-integrity.mjs is run against a throwaway copy of data/
// in a temp directory, so the repo's real files are never touched.
//
// scripts/backup-live-records.mjs is run against a local synthetic HTTP
// server rather than the live site. Same technique the smoke-test retry
// logic and the status-drift check were both proven with, and the only one
// available here: this sandbox cannot reach streamingscout.org.
//
// Offline, no repo state mutated. Wired into `npm test`.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = process.cwd();
const INTEGRITY = resolve(REPO, "scripts/check-data-integrity.mjs");
const BACKUP = resolve(REPO, "scripts/backup-live-records.mjs");

let passed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + label);
  } catch (err) {
    console.error("  FAIL  " + label);
    console.error("        " + err.message);
    process.exitCode = 1;
  }
}

// Runs a script in `cwd` and reports exit code plus combined output, without
// throwing on a non-zero exit (a non-zero exit is the thing under test).
//
// Deliberately ASYNC. An earlier draft used execFileSync and deadlocked: the
// synthetic server below runs in this same process, so a synchronous child
// blocks the event loop that would have answered the child's own request, and
// every fetch timed out. Worth keeping as a note, since it looks like a bug
// in the script under test rather than in the harness.
const execFileAsync = promisify(execFile);
async function run(script, cwd, args = []) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
    });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.code ?? 1, output: (err.stdout || "") + (err.stderr || "") };
  }
}

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "ss-integrity-"));
  mkdirSync(join(dir, "data"));
  cpSync(join(REPO, "data"), join(dir, "data"), { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
console.log("\ncheck-data-integrity.mjs");
// ---------------------------------------------------------------------------

await check("passes against the real data/ as committed", async () => {
  const r = await run(INTEGRITY, REPO);
  assert.equal(r.code, 0, r.output);
  assert.match(r.output, /Data integrity check passed/);
});

await check("catches a blanked file, the 2026-07-21 failure shape", async () => {
  const dir = sandbox();
  writeFileSync(join(dir, "data/STREAMING_LOG.md"), "");
  const r = await run(INTEGRITY, dir);
  assert.equal(r.code, 1, "expected a non-zero exit");
  assert.match(r.output, /STREAMING_LOG\.md is EMPTY/);
  rmSync(dir, { recursive: true, force: true });
});

await check("catches a file reduced to a stub", async () => {
  const dir = sandbox();
  writeFileSync(join(dir, "data/STREAMING_LOG.md"), "# Streaming Log\n\nnothing here yet\n");
  const r = await run(INTEGRITY, dir);
  assert.equal(r.code, 1);
  assert.match(r.output, /below the 500-byte floor/);
  rmSync(dir, { recursive: true, force: true });
});

await check("catches a large truncation that is still a plausible-looking file", async () => {
  const dir = sandbox();
  const path = join(dir, "data/STREAMING_LOG.md");
  const lines = readFileSync(path, "utf8").split("\n");
  // Keep the heading and the first fifth of the file: well over every
  // absolute floor, and exactly what a half-finished rewrite looks like.
  writeFileSync(path, lines.slice(0, Math.floor(lines.length / 5)).join("\n"));
  const r = await run(INTEGRITY, dir);
  assert.equal(r.code, 1);
  assert.match(r.output, /shrank from/);
  assert.match(r.output, /lost records/);
  rmSync(dir, { recursive: true, force: true });
});

await check("catches a deleted file", async () => {
  const dir = sandbox();
  rmSync(join(dir, "data/EXCLUDED_TITLES.md"));
  const r = await run(INTEGRITY, dir);
  assert.equal(r.code, 1);
  assert.match(r.output, /EXCLUDED_TITLES\.md is MISSING entirely/);
  rmSync(dir, { recursive: true, force: true });
});

await check("catches a file that no longer opens with its own heading", async () => {
  const dir = sandbox();
  const path = join(dir, "data/TASTE_PROFILE.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("# Taste Profile", "# Something Else"));
  const r = await run(INTEGRITY, dir);
  assert.equal(r.code, 1);
  assert.match(r.output, /should open with "# Taste Profile"/);
  rmSync(dir, { recursive: true, force: true });
});

await check("catches a missing manifest rather than passing silently", async () => {
  const dir = sandbox();
  rmSync(join(dir, "data/INTEGRITY_MANIFEST.json"));
  const r = await run(INTEGRITY, dir);
  assert.equal(r.code, 1);
  assert.match(r.output, /INTEGRITY_MANIFEST\.json is missing/);
  rmSync(dir, { recursive: true, force: true });
});

await check("ordinary editing does not trip it", async () => {
  const dir = sandbox();
  const path = join(dir, "data/STREAMING_LOG.md");
  const text = readFileSync(path, "utf8");
  // A realistic week: a handful of entries added, a couple of lines removed.
  const lines = text.split("\n");
  lines.splice(60, 3);
  writeFileSync(path, lines.join("\n") + "\n- **A New Title (Season 1)** · Prime Video · in progress\n");
  const r = await run(INTEGRITY, dir);
  assert.equal(r.code, 0, r.output);
  rmSync(dir, { recursive: true, force: true });
});

await check("--update refuses to run while a data file is missing", async () => {
  const dir = sandbox();
  rmSync(join(dir, "data/STREAMING_LOG.md"));
  const r = await run(INTEGRITY, dir, ["--update"]);
  assert.equal(r.code, 1);
  assert.match(r.output, /Refusing to refresh the manifest/);
  rmSync(dir, { recursive: true, force: true });
});

await check("--update makes an intended shrink pass, and shows as a manifest diff", async () => {
  const dir = sandbox();
  const path = join(dir, "data/STREAMING_LOG.md");
  const lines = readFileSync(path, "utf8").split("\n");
  writeFileSync(path, lines.slice(0, Math.floor(lines.length / 5)).join("\n"));
  assert.equal((await run(INTEGRITY, dir)).code, 1, "should fail before the manifest is refreshed");
  const before = readFileSync(join(dir, "data/INTEGRITY_MANIFEST.json"), "utf8");
  assert.equal((await run(INTEGRITY, dir, ["--update"])).code, 0);
  const after = readFileSync(join(dir, "data/INTEGRITY_MANIFEST.json"), "utf8");
  assert.notEqual(before, after, "the manifest must actually change, so the drop is reviewable");
  assert.equal((await run(INTEGRITY, dir)).code, 0, "should pass once the shrink is recorded");
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
console.log("\nbackup-live-records.mjs");
// ---------------------------------------------------------------------------

// A synthetic stand-in for the live site. `state` is swapped between cases.
const state = { statuses: [], dismissed: [], statusCode: 200, malformed: false, hang: false };

const server = createServer(async (req, res) => {
  if (state.hang) return; // never responds, exercises the timeout path
  const send = (body) => {
    res.writeHead(state.statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.url.startsWith("/api/status")) {
    send(state.malformed ? { oops: true } : { statuses: state.statuses });
  } else if (req.url.startsWith("/api/dismiss")) {
    send(state.malformed ? { oops: true } : { dismissed: state.dismissed });
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

function backupSandbox() {
  return mkdtempSync(join(tmpdir(), "ss-backup-"));
}
const entry = (t) => ({ title: t, status: "watching", meta: "", section: "Top Picks", updatedAt: "2026-08-17T00:00:00.000Z" });
const dis = (t) => ({ title: t, section: "Top Picks", dismissedAt: "2026-08-17T00:00:00.000Z" });

await check("writes a first snapshot and a latest pointer", async () => {
  const dir = backupSandbox();
  state.statuses = [entry("Annika"), entry("Bookish")];
  state.dismissed = [dis("Kleo")];
  state.statusCode = 200;
  state.malformed = false;
  const r = await run(BACKUP, dir, [BASE]);
  assert.equal(r.code, 0, r.output);
  const latest = JSON.parse(readFileSync(join(dir, "backups/live-records/latest.json"), "utf8"));
  assert.equal(latest.statuses.length, 2);
  assert.equal(latest.dismissed.length, 1);
  assert.ok(latest.fetchedAt, "snapshot must record when it was taken");
  const dated = join(dir, "backups/live-records", latest.fetchedAt.slice(0, 10) + ".json");
  assert.ok(existsSync(dated), "a dated copy must be written alongside latest.json");
  rmSync(dir, { recursive: true, force: true });
});

await check("an unchanged week writes nothing, so no empty pull request", async () => {
  const dir = backupSandbox();
  state.statuses = [entry("Annika")];
  state.dismissed = [dis("Kleo")];
  await run(BACKUP, dir, [BASE]);
  const first = readFileSync(join(dir, "backups/live-records/latest.json"), "utf8");
  const r = await run(BACKUP, dir, [BASE]);
  assert.equal(r.code, 0, r.output);
  assert.match(r.output, /no change since/);
  assert.equal(readFileSync(join(dir, "backups/live-records/latest.json"), "utf8"), first);
  rmSync(dir, { recursive: true, force: true });
});

await check("a real addition is written", async () => {
  const dir = backupSandbox();
  state.statuses = [entry("Annika")];
  state.dismissed = [dis("Kleo")];
  await run(BACKUP, dir, [BASE]);
  state.statuses = [entry("Annika"), entry("Bookish")];
  const r = await run(BACKUP, dir, [BASE]);
  assert.equal(r.code, 0, r.output);
  const latest = JSON.parse(readFileSync(join(dir, "backups/live-records/latest.json"), "utf8"));
  assert.equal(latest.statuses.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

await check("REFUSES to overwrite a good snapshot with a smaller one", async () => {
  const dir = backupSandbox();
  state.statuses = [entry("Annika"), entry("Bookish"), entry("Lupin")];
  state.dismissed = [dis("Kleo"), dis("Prey")];
  await run(BACKUP, dir, [BASE]);
  const good = readFileSync(join(dir, "backups/live-records/latest.json"), "utf8");

  // The live store loses records.
  state.statuses = [entry("Annika")];
  const r = await run(BACKUP, dir, [BASE]);
  assert.equal(r.code, 1, "expected the shrink to abort the run");
  assert.match(r.output, /SMALLER than the last snapshot/);
  assert.equal(
    readFileSync(join(dir, "backups/live-records/latest.json"), "utf8"),
    good,
    "the good snapshot must survive untouched",
  );
  rmSync(dir, { recursive: true, force: true });
});

await check("REFUSES to overwrite a good snapshot with an empty one", async () => {
  const dir = backupSandbox();
  state.statuses = [entry("Annika"), entry("Bookish")];
  state.dismissed = [dis("Kleo")];
  await run(BACKUP, dir, [BASE]);
  const good = readFileSync(join(dir, "backups/live-records/latest.json"), "utf8");
  state.statuses = [];
  state.dismissed = [];
  const r = await run(BACKUP, dir, [BASE]);
  assert.equal(r.code, 1);
  assert.equal(readFileSync(join(dir, "backups/live-records/latest.json"), "utf8"), good);
  rmSync(dir, { recursive: true, force: true });
});

await check("--allow-shrink lets an intended removal through", async () => {
  const dir = backupSandbox();
  state.statuses = [entry("Annika"), entry("Bookish")];
  state.dismissed = [dis("Kleo")];
  await run(BACKUP, dir, [BASE]);
  state.statuses = [entry("Annika")];
  const r = await run(BACKUP, dir, [BASE, "--allow-shrink"]);
  assert.equal(r.code, 0, r.output);
  const latest = JSON.parse(readFileSync(join(dir, "backups/live-records/latest.json"), "utf8"));
  assert.equal(latest.statuses.length, 1);
  rmSync(dir, { recursive: true, force: true });
});

await check("a 500 from the site aborts and writes nothing", async () => {
  const dir = backupSandbox();
  state.statuses = [entry("Annika")];
  state.dismissed = [];
  state.statusCode = 500;
  const r = await run(BACKUP, dir, [BASE]);
  state.statusCode = 200;
  assert.equal(r.code, 1);
  assert.match(r.output, /returned 500/);
  assert.ok(!existsSync(join(dir, "backups/live-records/latest.json")), "nothing should have been written");
  rmSync(dir, { recursive: true, force: true });
});

await check("a malformed response aborts rather than snapshotting junk", async () => {
  const dir = backupSandbox();
  state.malformed = true;
  const r = await run(BACKUP, dir, [BASE]);
  state.malformed = false;
  assert.equal(r.code, 1);
  assert.match(r.output, /has no "statuses" array/);
  assert.ok(!existsSync(join(dir, "backups/live-records/latest.json")));
  rmSync(dir, { recursive: true, force: true });
});

await check("an unreachable site aborts and leaves the previous snapshot intact", async () => {
  const dir = backupSandbox();
  state.statuses = [entry("Annika")];
  state.dismissed = [dis("Kleo")];
  await run(BACKUP, dir, [BASE]);
  const good = readFileSync(join(dir, "backups/live-records/latest.json"), "utf8");
  // Nothing is listening on this port.
  const r = await run(BACKUP, dir, ["http://127.0.0.1:1"]);
  assert.equal(r.code, 1);
  assert.match(r.output, /network error after 3 attempts/);
  assert.equal(readFileSync(join(dir, "backups/live-records/latest.json"), "utf8"), good);
  rmSync(dir, { recursive: true, force: true });
});

await check("an unreadable existing snapshot aborts rather than being overwritten", async () => {
  const dir = backupSandbox();
  mkdirSync(join(dir, "backups/live-records"), { recursive: true });
  writeFileSync(join(dir, "backups/live-records/latest.json"), "{ this is not json");
  state.statuses = [entry("Annika")];
  state.dismissed = [];
  const r = await run(BACKUP, dir, [BASE]);
  assert.equal(r.code, 1);
  assert.match(r.output, /could not be parsed/);
  assert.equal(readFileSync(join(dir, "backups/live-records/latest.json"), "utf8"), "{ this is not json");
  rmSync(dir, { recursive: true, force: true });
});

server.close();

console.log(`\n${passed} backup-guard assertion group(s) passed.`);
if (process.exitCode) console.error("Backup-guard suite FAILED.");
else console.log("Backup-guard suite passed.");
