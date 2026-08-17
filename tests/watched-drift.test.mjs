// tests/watched-drift.test.mjs
//
// Drives scripts/check-watched-drift.mjs end to end against a local synthetic
// /api/status server and throwaway copies of the two files it edits. Offline.
//
// The behaviour worth protecting here is not "it appends a line". It is:
//
//   - a later season of a ticked show is NOT treated as already recorded
//     (Reacher season 4 after seasons 1 to 3 is a new thing),
//   - the date written is the CLEAR date and the entry says the watch date is
//     unknown (Susan confirmed 2026-08-17 that the tick means "seen it, take
//     it away"; recording a tick date as a watch date would inflate recency
//     for exactly the titles she rejects),
//   - Top Picks and Coming Soon rows go, Currently Watching and In Theaters
//     rows stay,
//   - a second run is a no-op, or the weekly job proposes the same pull
//     request forever,
//   - an unreachable or malformed endpoint aborts rather than being read as
//     "nothing to sync", which would silently do nothing week after week.
//
// Async execFile on purpose: a synchronous child would deadlock against the
// server running in this same process. See tests/backup-guards.test.mjs.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(process.cwd(), "scripts/check-watched-drift.mjs");
const LIB = resolve(process.cwd(), "scripts/lib/titles.mjs");
const execFileAsync = promisify(execFile);

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

async function run(cwd, args) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.code ?? 1, output: (err.stdout || "") + (err.stderr || "") };
  }
}

const LOG = `# Streaming Log

## Entry format (backfill)

**Title** · Service · plays · first watched → last watched

## 2026

- **Reacher (Seasons 1-3)** · Prime · 12 plays · 2022-01-01 → 2025-01-01
- **Bookish (Season 1)** · PBS Masterpiece · 1 play · 2026-01-01
`;

const HTML = `<section>
  <div class="pick-list">
    <div class="pick-row" data-title="Hamnet">
      <div class="pick-body"><p>keep me</p></div>
    </div>

    <div class="pick-row" data-title="Kleo">
      <div class="pick-body"><p>remove me</p></div>
    </div>
  </div>
  <div class="soon-list">
    <!-- no-art: nothing in circulation yet -->
    <div class="soon-row" data-title="Prey">
      <div class="soon-body"><p>remove me too</p></div>
    </div>
  </div>
  <div class="watching-list">
    <div class="watching-row" data-title="Kleo">
      <div class="watching-info"><p>leave me alone</p></div>
    </div>
    <div class="theater-row" data-title="Prey">
      <div class="theater-body"><p>leave me alone</p></div>
    </div>
  </div>
</section>
`;

let mode = "ok";
let statuses = [];
const server = createServer((req, res) => {
  if (mode === "500") {
    res.writeHead(500, { "Content-Type": "text/plain" });
    return res.end("boom");
  }
  if (mode === "junk") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ unexpected: true }));
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ statuses }));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "ss-watched-"));
  mkdirSync(join(dir, "data"));
  mkdirSync(join(dir, "scripts/lib"), { recursive: true });
  cpSync(LIB, join(dir, "scripts/lib/titles.mjs"));
  writeFileSync(join(dir, "data/STREAMING_LOG.md"), LOG);
  writeFileSync(join(dir, "index.html"), HTML);
  return dir;
}
const w = (title, extra = {}) => ({ title, status: "watched", meta: "88% · Netflix", section: "Top Picks", updatedAt: "2026-08-17T01:13:52.361Z", ...extra });

console.log("\ncheck-watched-drift.mjs");

await check("a ticked title missing from the log is reported", async () => {
  const dir = sandbox();
  mode = "ok";
  statuses = [w("Kleo")];
  const r = await run(dir, [BASE]);
  assert.equal(r.code, 1, "expected drift\n" + r.output);
  assert.ok(r.output.includes("Kleo"), r.output);
  rmSync(dir, { recursive: true, force: true });
});

await check("a ticked title already in the log is not reported", async () => {
  const dir = sandbox();
  statuses = [w("Bookish, season 1")];
  const r = await run(dir, [BASE]);
  assert.equal(r.code, 0, r.output);
  rmSync(dir, { recursive: true, force: true });
});

await check("titles marked watching are ignored entirely", async () => {
  const dir = sandbox();
  statuses = [{ ...w("Kleo"), status: "watching" }];
  const r = await run(dir, [BASE]);
  assert.equal(r.code, 0, "a 'watching' flag is not a clear\n" + r.output);
  rmSync(dir, { recursive: true, force: true });
});

await check("a LATER season of a logged show counts as missing", async () => {
  const dir = sandbox();
  statuses = [w("Reacher, season 4")];
  const r = await run(dir, [BASE]);
  assert.equal(r.code, 1, "seasons 1-3 in the log must not cover season 4\n" + r.output);
  rmSync(dir, { recursive: true, force: true });
});

await check("an EARLIER season inside a logged range counts as covered", async () => {
  const dir = sandbox();
  statuses = [w("Reacher, season 2")];
  const r = await run(dir, [BASE]);
  assert.equal(r.code, 0, "season 2 is inside the logged 1-3 range\n" + r.output);
  rmSync(dir, { recursive: true, force: true });
});

await check("--fix records the clear date and says the watch date is unknown", async () => {
  const dir = sandbox();
  statuses = [w("Kleo")];
  const r = await run(dir, [BASE, "--fix"]);
  assert.equal(r.code, 0, r.output);
  const after = readFileSync(join(dir, "data/STREAMING_LOG.md"), "utf8");
  const line = after.split("\n").find((l) => l.includes("**Kleo**"));
  assert.ok(line, "no entry written\n" + after);
  assert.ok(line.includes("cleared via the on-site tick button, 2026-08-17"), line);
  assert.ok(line.includes("watch date unknown"), line);
  assert.ok(line.includes("Netflix"), "service should come from the live meta: " + line);
  assert.ok(!/already seen\.\s*$/.test(line), line);
  rmSync(dir, { recursive: true, force: true });
});

await check("--fix removes the Top Picks and Coming Soon rows, and only those", async () => {
  const dir = sandbox();
  statuses = [w("Kleo"), w("Prey")];
  const r = await run(dir, [BASE, "--fix"]);
  assert.equal(r.code, 0, r.output);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  assert.ok(!/<div class="pick-row" data-title="Kleo"/.test(html), "pick-row should be gone");
  assert.ok(!/<div class="soon-row" data-title="Prey"/.test(html), "soon-row should be gone");
  assert.ok(/<div class="watching-row" data-title="Kleo"/.test(html), "watching-row must be left alone");
  assert.ok(/<div class="theater-row" data-title="Prey"/.test(html), "theater-row must be left alone");
  assert.ok(/data-title="Hamnet"/.test(html), "an unrelated pick must survive");
  assert.ok(!html.includes("no-art: nothing in circulation"), "the row's marker comment should go with it");
  rmSync(dir, { recursive: true, force: true });
});

await check("--fix leaves index.html parseable and balanced", async () => {
  const dir = sandbox();
  statuses = [w("Kleo"), w("Prey")];
  await run(dir, [BASE, "--fix"]);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const open = (html.match(/<div\b/g) || []).length;
  const close = (html.match(/<\/div>/g) || []).length;
  assert.equal(open, close, `div balance broken: ${open} open, ${close} close\n${html}`);
  rmSync(dir, { recursive: true, force: true });
});

await check("running --fix twice changes nothing the second time", async () => {
  const dir = sandbox();
  statuses = [w("Kleo")];
  await run(dir, [BASE, "--fix"]);
  const log1 = readFileSync(join(dir, "data/STREAMING_LOG.md"), "utf8");
  const html1 = readFileSync(join(dir, "index.html"), "utf8");
  const r2 = await run(dir, [BASE, "--fix"]);
  assert.equal(r2.code, 0, r2.output);
  assert.equal(readFileSync(join(dir, "data/STREAMING_LOG.md"), "utf8"), log1, "second run must not append again");
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), html1, "second run must not touch the html again");
  rmSync(dir, { recursive: true, force: true });
});

await check("a meta with only a score records no service rather than inventing one", async () => {
  const dir = sandbox();
  statuses = [w("Kleo", { meta: "88%" })];
  await run(dir, [BASE, "--fix"]);
  const line = readFileSync(join(dir, "data/STREAMING_LOG.md"), "utf8").split("\n").find((l) => l.includes("**Kleo**"));
  assert.ok(line.includes("service not recorded"), line);
  rmSync(dir, { recursive: true, force: true });
});

await check("a 500 aborts rather than reading as nothing to sync", async () => {
  const dir = sandbox();
  mode = "500";
  statuses = [w("Kleo")];
  const r = await run(dir, [BASE, "--fix"]);
  assert.equal(r.code, 1, r.output);
  assert.equal(readFileSync(join(dir, "data/STREAMING_LOG.md"), "utf8"), LOG, "nothing should have been written");
  mode = "ok";
  rmSync(dir, { recursive: true, force: true });
});

await check("a malformed response aborts", async () => {
  const dir = sandbox();
  mode = "junk";
  const r = await run(dir, [BASE, "--fix"]);
  assert.equal(r.code, 1, r.output);
  assert.equal(readFileSync(join(dir, "data/STREAMING_LOG.md"), "utf8"), LOG);
  mode = "ok";
  rmSync(dir, { recursive: true, force: true });
});

await check("an unreachable endpoint aborts", async () => {
  const dir = sandbox();
  const r = await run(dir, ["http://127.0.0.1:1", "--fix"]);
  assert.equal(r.code, 1, r.output);
  assert.equal(readFileSync(join(dir, "data/STREAMING_LOG.md"), "utf8"), LOG);
  rmSync(dir, { recursive: true, force: true });
});

await check("an empty log aborts rather than re-adding everything", async () => {
  const dir = sandbox();
  writeFileSync(join(dir, "data/STREAMING_LOG.md"), "# Streaming Log\n\nnothing here yet\n");
  statuses = [w("Kleo")];
  const r = await run(dir, [BASE, "--fix"]);
  assert.equal(r.code, 1, "a log with no parseable entries means the format changed\n" + r.output);
  rmSync(dir, { recursive: true, force: true });
});

server.close();

console.log(`\n${passed} watched-drift assertion group(s) passed.`);
if (process.exitCode) console.error("Watched-drift suite FAILED.");
else console.log("Watched-drift suite passed.");
