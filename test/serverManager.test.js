// Unit tests for src/serverManager.ts (compiled to out/serverManager.js).
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseUrlLine, resolveDshPath, DshServerManager } = require("../out/serverManager.js");

/** Write an executable fake dsh into a temp dir (platform-aware shim). */
function fakeDsh(dir, opts = {}) {
  const body = opts.quiet
    ? `setInterval(() => {}, 1000);\n`
    : `process.stdout.write("dsh web: http://127.0.0.1:34567\\n");\nprocess.on("SIGTERM", () => process.exit(0));\nsetInterval(() => {}, 1000);\n`;
  if (process.platform === "win32") {
    // Windows: cmd.exe cannot run unix-shebang scripts; ship a .cmd wrapper.
    const impl = path.join(dir, "dsh-impl.js");
    fs.writeFileSync(impl, body);
    const cmd = path.join(dir, "dsh.cmd");
    fs.writeFileSync(cmd, `@echo off\r\nnode "%~dp0dsh-impl.js" %*\r\n`);
    return cmd;
  }
  const file = path.join(dir, "dsh");
  fs.writeFileSync(file, `#!/usr/bin/env node\n${body}`);
  fs.chmodSync(file, 0o755);
  return file;
}

const IS_WIN = process.platform === "win32";

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-sm-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
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
  const exitInfo = await exited;
  // POSIX: graceful SIGTERM → exit code 0. Windows: cmd.exe wrapper is
  // force-terminated (TerminateProcess semantics), so only the state matters.
  if (!IS_WIN) {
    assert.equal(exitInfo.code, 0);
    assert.equal(exitInfo.signal, null);
  }
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
  const exited = new Promise((r) => manager.once("exit", r));
  manager.stop();
  await exited;
});

test("start() rejects on timeout when no URL line arrives", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir, { quiet: true });
  const manager = new DshServerManager();
  const exited = new Promise((r) => manager.once("exit", r));
  await assert.rejects(
    manager.start({ dshBin: bin, cwd: dir, readyTimeoutMs: 500 }),
    /did not become ready/
  );
  assert.equal(manager.state, "error");
  await exited;
});

test("start() rejects with a helpful message when the binary is missing", async (t) => {
  const manager = new DshServerManager();
  await assert.rejects(
    manager.start({ dshBin: "/nonexistent/dsh", cwd: os.tmpdir() }),
    IS_WIN ? /exited before ready/ : /dsh not found/
  );
  assert.equal(manager.state, "error");
});

test("stop() during the ready window settles the promise and stays stopped (no late error)", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir, { quiet: true }); // never prints the ready URL
  const manager = new DshServerManager();
  const exited = new Promise((r) => manager.once("exit", r));
  const startP = manager.start({ dshBin: bin, cwd: dir, readyTimeoutMs: 5000 });
  manager.stop(); // abort the pending start
  await assert.rejects(startP, /stopped before ready/);
  await exited; // wait for the process to actually terminate
  assert.equal(manager.state, "stopped");
  // Wait past the ready timeout to ensure it does NOT flip back to "error".
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(manager.state, "stopped");
});
