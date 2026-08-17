// tests/dismiss-drift.test.mjs
//
// Covers the matching in scripts/check-dismiss-drift.mjs, which had a real
// false-negative defect found on 2026-08-17.
//
// The check used to ask whether the lowercased whole file contained the title.
// data/EXCLUDED_TITLES.md opens with a data-loss notice that names real titles
// in passing, so "Prey", "Kleo" and "The Choral" each appear in prose as well
// as in their own entry. Any of them could have been genuinely missing from the
// list while the check reported everything accounted for. A drift check that
// silently under-reports is worse than no drift check, because the whole point
// is that a dismissed title stays dismissed through the next rebuild.
//
// Runs the real script against a temp copy of the file and a local synthetic
// server, same technique as tests/backup-guards.test.mjs. Offline.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(process.cwd(), "scripts/check-dismiss-drift.mjs");
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

// Async on purpose: a synchronous child would deadlock the server below, which
// runs in this same process. See the note in tests/backup-guards.test.mjs.
async function run(cwd, args) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.code ?? 1, output: (err.stdout || "") + (err.stderr || "") };
  }
}

// The shape that caused the bug: prose naming titles, then the real list.
const FILE_WITH_PROSE = `# Excluded Titles

Titles Susan has permanently dismissed. Never re-add anything listed here.

## 2026-07-21 data loss notice

The prior version of this file was lost. One entry below was recovered from the
live store. Titles such as Prey, Kleo and The Choral were discussed at the time
and may or may not have made it back into the list below.

## The list

- **Hamnet** - Top Picks - dismissed on-site 2026-07-26
- **Dark Winds** - Top Picks - dismissed on-site 2026-07-28
`;

let state = { dismissed: [] };
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ dismissed: state.dismissed }));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

function sandbox(contents = FILE_WITH_PROSE) {
  const dir = mkdtempSync(join(tmpdir(), "ss-drift-"));
  mkdirSync(join(dir, "data"));
  writeFileSync(join(dir, "data/EXCLUDED_TITLES.md"), contents);
  return dir;
}
const dis = (title) => ({ title, section: "Top Picks", dismissedAt: "2026-08-17T00:00:00.000Z" });

console.log("\ncheck-dismiss-drift.mjs");

await check("a title named only in the prose is still reported as missing", async () => {
  const dir = sandbox();
  state.dismissed = [dis("Prey"), dis("Kleo"), dis("The Choral")];
  const r = await run(dir, [BASE]);
  assert.equal(r.code, 1, "expected drift to be reported\n" + r.output);
  for (const t of ["Prey", "Kleo", "The Choral"]) {
    assert.ok(r.output.includes(t), `${t} should have been reported missing, output was:\n${r.output}`);
  }
  rmSync(dir, { recursive: true, force: true });
});

await check("a title that really is listed is not reported", async () => {
  const dir = sandbox();
  state.dismissed = [dis("Hamnet"), dis("Dark Winds")];
  const r = await run(dir, [BASE]);
  assert.equal(r.code, 0, r.output);
  assert.match(r.output, /accounted for/);
  rmSync(dir, { recursive: true, force: true });
});

await check("matching ignores case and surrounding whitespace", async () => {
  const dir = sandbox();
  state.dismissed = [{ title: "  hAmNeT  ", section: "Top Picks", dismissedAt: null }];
  const r = await run(dir, [BASE]);
  assert.equal(r.code, 0, r.output);
  rmSync(dir, { recursive: true, force: true });
});

await check("a title that is a substring of a listed one is still reported", async () => {
  // "Dark" must not be considered covered by "Dark Winds". The old whole-file
  // substring test would have passed it silently.
  const dir = sandbox();
  state.dismissed = [dis("Dark")];
  const r = await run(dir, [BASE]);
  assert.equal(r.code, 1, "a shorter, different title must not match a longer entry\n" + r.output);
  rmSync(dir, { recursive: true, force: true });
});

await check("--fix appends only the genuinely missing titles", async () => {
  const dir = sandbox();
  state.dismissed = [dis("Hamnet"), dis("Prey")];
  const r = await run(dir, [BASE, "--fix"]);
  assert.equal(r.code, 0, r.output);
  const after = readFileSync(join(dir, "data/EXCLUDED_TITLES.md"), "utf8");
  const entries = after.split("\n").filter((l) => /^\s*-\s*\*\*/.test(l));
  assert.equal(entries.filter((l) => l.includes("Prey")).length, 1, "Prey should be added exactly once");
  assert.equal(entries.filter((l) => l.includes("Hamnet")).length, 1, "Hamnet must not be duplicated");
  rmSync(dir, { recursive: true, force: true });
});

await check("running --fix twice does not duplicate anything", async () => {
  const dir = sandbox();
  state.dismissed = [dis("Prey")];
  await run(dir, [BASE, "--fix"]);
  const once = readFileSync(join(dir, "data/EXCLUDED_TITLES.md"), "utf8");
  await run(dir, [BASE, "--fix"]);
  const twice = readFileSync(join(dir, "data/EXCLUDED_TITLES.md"), "utf8");
  assert.equal(once, twice, "a second --fix run should be a no-op, or the weekly job proposes duplicates forever");
  rmSync(dir, { recursive: true, force: true });
});

server.close();

console.log(`\n${passed} dismiss-drift assertion group(s) passed.`);
if (process.exitCode) console.error("Dismiss-drift suite FAILED.");
else console.log("Dismiss-drift suite passed.");
