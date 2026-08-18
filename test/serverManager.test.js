// Unit tests for src/serverManager.ts (compiled to out/serverManager.js).
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseUrlLine, resolveDshPath, DshServerManager } = require("../out/serverManager.js");

/** Write an executable fake dsh script into a temp dir. */
function fakeDsh(dir, opts = {}) {
  const body = opts.quiet
    ? `#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n`
    : `#!/usr/bin/env node\nprocess.stdout.write("dsh web: http://127.0.0.1:34567\\n");\nprocess.on("SIGTERM", () => process.exit(0));\nsetInterval(() => {}, 1000);\n`;
  const file = path.join(dir, "dsh");
  fs.writeFileSync(file, body);
  fs.chmodSync(file, 0o755);
  return file;
}

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-sm-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("parseUrlLine extracts the ready URL", () => {
  assert.equal(parseUrlLine("dsh web: http://127.0.0.1:62750"), "http://127.0.0.1:62750");
  assert.equal(parseUrlLine("some other line"), null);
  assert.equal(parseUrlLine(""), null);
  assert.equal(parseUrlLine("prefix dsh web: http://127.0.0.1:3080 suffix"), "http://127.0.0.1:3080");
});

test("resolveDshPath finds dsh in an injected home", (t) => {
  const home = tmpdir(t);

  // Case 1: npx cache glob.
  const npxDir = path.join(home, ".npm", "_npx", "abc123", "node_modules", ".bin");
  fs.mkdirSync(npxDir, { recursive: true });
  fs.writeFileSync(path.join(npxDir, "dsh"), "");
  assert.equal(resolveDshPath(home).path, path.join(npxDir, "dsh"));

  // Case 2: npm-global bin wins over npx cache (earlier in the order).
  const globalDir = path.join(home, ".npm-global", "bin");
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(path.join(globalDir, "dsh"), "");
  assert.equal(resolveDshPath(home).path, path.join(globalDir, "dsh"));

  // Case 3: nothing found → null; home-derived tried entries are "~"-redacted
  // (machine-level candidates like npm prefix -g stay absolute).
  const empty = tmpdir(t);
  const res = resolveDshPath(empty);
  assert.equal(res.path, null);
  assert.ok(res.tried.some((p) => p.startsWith("~")));
  assert.ok(res.tried.every((p) => !p.includes(empty)));
});

test("resolveDshPath handles Windows layout (npm-cache _npx, dsh.cmd)", (t) => {
  const home = tmpdir(t);
  // Windows npx cache: %LocalAppData%\npm-cache\_npx\<hash>\node_modules\.bin\dsh.cmd
  const npxDir = path.join(home, "AppData", "Local", "npm-cache", "_npx", "winhash", "node_modules", ".bin");
  fs.mkdirSync(npxDir, { recursive: true });
  fs.writeFileSync(path.join(npxDir, "dsh.cmd"), "");
  const res = resolveDshPath(home, "win32");
  assert.equal(res.path, path.join(npxDir, "dsh.cmd"));
  // Windows must NOT probe macOS-only paths (homebrew / usr-local).
  assert.ok(res.tried.every((p) => !p.includes("opt/homebrew")));
});

test("resolveDshPath finds either dsh or dsh.cmd on Windows when both exist", (t) => {
  const home = tmpdir(t);
  const npxDir = path.join(home, "AppData", "Local", "npm-cache", "_npx", "h2", "node_modules", ".bin");
  fs.mkdirSync(npxDir, { recursive: true });
  fs.writeFileSync(path.join(npxDir, "dsh"), "");
  fs.writeFileSync(path.join(npxDir, "dsh.cmd"), "");
  const res = resolveDshPath(home, "win32");
  assert.ok(res.path === path.join(npxDir, "dsh") || res.path === path.join(npxDir, "dsh.cmd"));
});

test("start() reaches ready via stdout URL and stop() exits cleanly", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir);
  const manager = new DshServerManager();

  const url = await manager.start({ dshBin: bin, cwd: dir });
  assert.equal(url, "http://127.0.0.1:34567");
  assert.equal(manager.state, "ready");
  assert.equal(manager.serverUrl, url);
  assert.equal(manager.isRunning, true);

  const exited = new Promise((resolve) => manager.once("exit", (e) => resolve(e)));
  manager.stop();
  const { code, signal } = await exited;
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.equal(manager.state, "stopped");
  assert.equal(manager.isRunning, false);
});

test("start() is idempotent when already ready", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir);
  const manager = new DshServerManager();
  const url = await manager.start({ dshBin: bin, cwd: dir });
  const again = await manager.start({ dshBin: bin, cwd: dir });
  assert.equal(again, url);
  manager.stop();
});

test("start() rejects on timeout when no URL line arrives", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir, { quiet: true });
  const manager = new DshServerManager();
  await assert.rejects(
    manager.start({ dshBin: bin, cwd: dir, readyTimeoutMs: 500 }),
    /did not become ready/
  );
  assert.equal(manager.state, "error");
});

test("start() rejects with a helpful message when the binary is missing", async (t) => {
  const manager = new DshServerManager();
  await assert.rejects(
    manager.start({ dshBin: "/nonexistent/dsh", cwd: os.tmpdir() }),
    /dsh not found/
  );
  assert.equal(manager.state, "error");
});
