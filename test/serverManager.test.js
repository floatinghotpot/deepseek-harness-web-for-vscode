// Unit tests for src/serverManager.ts (compiled to out/serverManager.js).
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseUrlLine, resolveDshPath, probeNoOpenSupport, DshServerManager, sameFsPath } = require("../out/serverManager.js");

/**
 * Write an executable fake dsh into a temp dir (platform-aware shim).
 * opts.helpNoOpen: `web --help` advertises --no-open (rc.8+ web-app shape).
 * opts.recordArgs: file receiving the argv of every non-help invocation,
 * so tests can assert exactly what the manager spawns.
 */
function fakeDsh(dir, opts = {}) {
  const helpOut = opts.helpNoOpen ? `process.stdout.write("  --no-open  do not open the Web UI in the default browser\\n");\n` : "";
  const help = `if (process.argv.includes("--help")) { ${helpOut}process.exit(0); }\n`;
  const record = opts.recordArgs
    ? `if (!process.argv.includes("--help")) require("node:fs").writeFileSync(${JSON.stringify(opts.recordArgs)}, JSON.stringify(process.argv.slice(2)));\n`
    : "";
  const body = opts.quiet
    ? `${help}${record}setInterval(() => {}, 1000);\n`
    : `${help}${record}process.stdout.write("dsh web: http://127.0.0.1:34567\\n");\nprocess.on("SIGTERM", () => process.exit(0));\nsetInterval(() => {}, 1000);\n`;
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
  assert.equal(resolveDshPath(home, "linux").path, path.join(npxDir, "dsh"));

  // Case 2: npm-global bin wins over npx cache (earlier in the order).
  const globalDir = path.join(home, ".npm-global", "bin");
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(path.join(globalDir, "dsh"), "");
  assert.equal(resolveDshPath(home, "linux").path, path.join(globalDir, "dsh"));

  // Case 3: nothing found → null; home-derived tried entries are "~"-redacted
  // (machine-level candidates like npm prefix -g stay absolute).
  const empty = tmpdir(t);
  const res = resolveDshPath(empty, "linux");
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

test("probeNoOpenSupport reads the live web --help (rc.8 web-app shape)", (t) => {
  // web-app rc.7 shape: --help does not advertise --no-open → skip the flag.
  const oldBin = fakeDsh(tmpdir(t));
  assert.equal(probeNoOpenSupport(oldBin), false);
  // web-app rc.8 shape: --help advertises --no-open → pass the flag.
  const newBin = fakeDsh(tmpdir(t), { helpNoOpen: true });
  assert.equal(probeNoOpenSupport(newBin), true);
  // Missing binary → null (fall back to the CLI-version gate, never crash).
  assert.equal(probeNoOpenSupport("/nonexistent/dsh"), null);
});

test("start() passes --no-open when the live web --help supports it (rc mismatch)", async (t) => {
  // Regression: CLI rc.7 + web-app rc.8 (npx cache resolves a newer web-app
  // than the CLI version string says). The CLI-version gate alone would skip
  // --no-open and dsh would auto-open a browser; the live --help probe must
  // win. The fake dsh does NOT print a version, so shouldPassNoOpen("…") is
  // false — only the probe can flip the decision.
  const dir = tmpdir(t);
  const argsFile = path.join(dir, "args.json");
  const bin = fakeDsh(dir, { helpNoOpen: true, recordArgs: argsFile });
  const manager = new DshServerManager();
  const url = await manager.start({ dshBin: bin, cwd: dir });
  assert.equal(url, "http://127.0.0.1:34567");
  const spawned = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.ok(spawned.includes("--no-open"), `expected --no-open in spawn args, got ${JSON.stringify(spawned)}`);
  const exited = new Promise((r) => manager.once("exit", r));
  manager.stop();
  await exited;
});

test("start() omits --no-open when the live web --help does not support it", async (t) => {
  // web-app rc.6/rc.7 shape: commander would exit on the unknown option and
  // kill startup, so the flag must be omitted.
  const dir = tmpdir(t);
  const argsFile = path.join(dir, "args.json");
  const bin = fakeDsh(dir, { recordArgs: argsFile });
  const manager = new DshServerManager();
  const url = await manager.start({ dshBin: bin, cwd: dir });
  assert.equal(url, "http://127.0.0.1:34567");
  const spawned = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.ok(!spawned.includes("--no-open"), `no --no-open expected, got ${JSON.stringify(spawned)}`);
  const exited = new Promise((r) => manager.once("exit", r));
  manager.stop();
  await exited;
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

// --- session API (02-session-management T1) -------------------------------

/** Mock global.fetch to serve the client-request envelope; restore afterwards. */
function mockFetch(handler) {
  const real = global.fetch;
  global.fetch = async (_url, opts) => ({ json: async () => handler(JSON.parse(opts.body)) });
  return () => {
    global.fetch = real;
  };
}

/** A manager whose server URL is set so api() calls hit the mock fetch. */
function apiManager() {
  const manager = new DshServerManager();
  manager.url = "http://127.0.0.1:9999";
  return manager;
}

test("listWorkspaceSessions filters session.list to the cwd workspace", async () => {
  const manager = apiManager();
  const restore = mockFetch((req) => {
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1", "s2"] }],
            archivedSessionIds: ["sx"],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 1, running: true, blank: false, cwd: "/ws/a", projections: { values: { title: "Titled" } } },
              { sessionId: "s2", updatedAt: 2, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
              { sessionId: "s3", updatedAt: 3, running: false, blank: false, cwd: "/other", projections: { values: { title: "Other" } } },
            ],
          },
        },
      };
    }
    throw new Error("unexpected method " + req.method);
  });
  try {
    const { items, archivedItems } = await manager.listWorkspaceSessions("/ws/a");
    assert.deepEqual(items.map((s) => s.sessionId), ["s1", "s2"]);
    assert.equal(items[0].title, "Titled");
    assert.equal(items[1].title, null);
    // "sx" is archived globally but NOT bound to workspace w1 — the archived
    // section only lists sessions of THIS workspace, so it is empty here.
    assert.deepEqual(archivedItems, []);
  } finally {
    restore();
  }
});

test("listWorkspaceSessions hides archived sessions from the active list", async () => {
  const manager = apiManager();
  const restore = mockFetch((req) => {
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            // s2 is in the workspace's sessionIds but ALSO archived — DSH's
            // archive is append-only, so the active list must hide it.
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1", "s2"] }],
            archivedSessionIds: ["s2"],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 1, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
              { sessionId: "s2", updatedAt: 2, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
            ],
          },
        },
      };
    }
    throw new Error("unexpected method " + req.method);
  });
  try {
    const { items, archivedItems } = await manager.listWorkspaceSessions("/ws/a");
    assert.deepEqual(items.map((s) => s.sessionId), ["s1"]);
    assert.deepEqual(archivedItems.map((s) => s.sessionId), ["s2"]);
    assert.equal(archivedItems[0].title, null);
  } finally {
    restore();
  }
});

test("listWorkspaceSessions lists ALL active sessions including blank ones", async () => {
  const manager = apiManager();
  const restore = mockFetch((req) => {
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1", "s2", "s3"] }],
            archivedSessionIds: [],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 100, running: false, blank: true, cwd: "/ws/a", projections: { values: { title: null } } },
              { sessionId: "s2", updatedAt: 200, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: "Chatted" } } },
              { sessionId: "s3", updatedAt: 300, running: false, blank: true, cwd: "/ws/a", projections: { values: { title: null } } },
            ],
          },
        },
      };
    }
    throw new Error("unexpected method " + req.method);
  });
  try {
    const { items } = await manager.listWorkspaceSessions("/ws/a");
    // Every active session is listed, blank included (blank ones show as
    // "New Session" with their relative time on the UI side).
    assert.deepEqual(items.map((s) => s.sessionId), ["s1", "s2", "s3"]);
    assert.deepEqual(items.map((s) => s.blank), [true, false, true]);
  } finally {
    restore();
  }
});

test("listWorkspaceSessions returns empty when cwd has no workspace", async () => {
  const manager = apiManager();
  const restore = mockFetch(() => ({
    result: { ok: true, value: { items: [{ workspaceId: "w1", path: "/other", sessionIds: [] }], archivedSessionIds: [] } },
  }));
  try {
    const { items, archivedItems } = await manager.listWorkspaceSessions("/nowhere");
    assert.deepEqual(items, []);
    assert.deepEqual(archivedItems, []);
  } finally {
    restore();
  }
});

test("renameSession sends the envelope and returns the accepted title", async () => {
  const manager = apiManager();
  let sent;
  const restore = mockFetch((req) => {
    sent = req;
    return { result: { ok: true, value: { title: "新标题", seq: 3 } } };
  });
  try {
    const res = await manager.renameSession("s1", "新标题");
    assert.deepEqual(res, { title: "新标题", seq: 3 });
    assert.equal(sent.type, "client-request");
    assert.equal(sent.method, "session.rename");
    assert.equal(sent.payload.sessionId, "s1");
    assert.equal(sent.payload.title, "新标题");
  } finally {
    restore();
  }
});

test("renameSession surfaces the DSH error code (title-invalid)", async () => {
  const manager = apiManager();
  const restore = mockFetch(() => ({
    result: { ok: false, error: { code: "title-invalid", message: "title must be non-blank" } },
  }));
  try {
    await assert.rejects(manager.renameSession("s1", "   "), (err) => {
      assert.equal(err.code, "title-invalid");
      return true;
    });
  } finally {
    restore();
  }
});

test("archiveSession calls workspace.archiveSession and returns the archive set", async () => {
  const manager = apiManager();
  let sent;
  const restore = mockFetch((req) => {
    sent = req;
    return { result: { ok: true, value: { archivedSessionIds: ["s1", "s2"] } } };
  });
  try {
    const archived = await manager.archiveSession("s1");
    assert.deepEqual(archived, ["s1", "s2"]);
    assert.equal(sent.method, "workspace.archiveSession");
    assert.deepEqual(sent.payload, { sessionId: "s1" });
  } finally {
    restore();
  }
});

test("ensureWorkspaceSession reuses a blank bound session instead of creating", async () => {
  const manager = apiManager();
  const methods = [];
  const restore = mockFetch((req) => {
    methods.push(req.method);
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            // s1 is bound and blank (user never chatted) — must be reused.
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1"] }],
            archivedSessionIds: [],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 1, running: false, blank: true, cwd: "/ws/a", projections: { values: { title: null } } },
            ],
          },
        },
      };
    }
    return { result: { ok: true, value: { sessionId: "created" } } };
  });
  try {
    const id = await manager.ensureWorkspaceSession("/ws/a");
    assert.equal(id, "s1");
    assert.ok(!methods.includes("session.create"), "must NOT create a new session");
  } finally {
    restore();
  }
});

test("ensureWorkspaceSession skips archived sessions and creates a fresh one", async () => {
  const manager = apiManager();
  const methods = [];
  const restore = mockFetch((req) => {
    methods.push(req.method);
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            // s1 is bound but ARCHIVED — must not be reused as the default.
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1"] }],
            archivedSessionIds: ["s1"],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 1, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
            ],
          },
        },
      };
    }
    if (req.method === "session.create") {
      return { result: { ok: true, value: { sessionId: "s2" } } };
    }
    return { result: { ok: false, error: { message: "unexpected " + req.method } } };
  });
  try {
    const id = await manager.ensureWorkspaceSession("/ws/a");
    assert.equal(id, "s2");
    assert.ok(methods.includes("session.create"));
  } finally {
    restore();
  }
});

test("sameFsPath matches normalized and realpath forms", (t) => {
  assert.equal(sameFsPath("/a/b", "/a/b/"), true);
  assert.equal(sameFsPath("/a/b", "/a/c"), false);
  if (process.platform !== "win32") {
    // macOS /tmp → /private/tmp: a symlinked form matches the realpath.
    const dir = tmpdir(t);
    const real = path.join(dir, "real");
    fs.mkdirSync(real);
    const link = path.join(dir, "link");
    fs.symlinkSync(real, link);
    assert.equal(sameFsPath(link, real), true);
    assert.equal(sameFsPath(link + "/", real), true);
  }
});
