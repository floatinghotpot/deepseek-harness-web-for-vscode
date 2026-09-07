// Unit tests for src/serverManager.ts (compiled to out/serverManager.js).
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { parseReadyLine, parseUrlLine, resolveDshPath, probeNoOpenSupport, DshServerManager, sameFsPath } = require("../out/serverManager.js");

/**
 * Write an executable fake dsh into a temp dir (platform-aware shim).
 * opts.helpNoOpen: `web --help` advertises --no-open (rc.8+ web-app shape).
 * opts.urlLine: stdout ready line to print (default: the bare 0.1.1-era URL;
 * pass a `?token=...` URL to exercise the 0.1.2+ cookie exchange).
 * opts.version: output of `--version` (default: none — unknown version).
 * opts.recordArgs: file receiving the argv of every non-help invocation,
 * so tests can assert exactly what the manager spawns.
 */
function fakeDsh(dir, opts = {}) {
  const helpOut = opts.helpNoOpen ? `process.stdout.write("  --no-open  do not open the Web UI in the default browser\\n");\n` : "";
  const help = `if (process.argv.includes("--help")) { ${helpOut}process.exit(0); }\n`;
  const versionOut = `if (process.argv.includes("--version")) { ${opts.version ? `process.stdout.write(${JSON.stringify(String(opts.version) + "\n")});` : ""}process.exit(0); }\n`;
  const record = opts.recordArgs
    ? `if (!process.argv.includes("--help") && !process.argv.includes("--version")) require("node:fs").writeFileSync(${JSON.stringify(opts.recordArgs)}, JSON.stringify(process.argv.slice(2)));\n`
    : "";
  const urlLine = `${opts.urlLine ?? "dsh web: http://127.0.0.1:34567"}\n`;
  const body = opts.quiet
    ? `${help}${versionOut}${record}setInterval(() => {}, 1000);\n`
    : `${help}${versionOut}${record}process.stdout.write(${JSON.stringify(urlLine)});\nprocess.on("SIGTERM", () => process.exit(0));\nsetInterval(() => {}, 1000);\n`;
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

test("parseReadyLine keeps the token URL of the 0.1.2+ launch line", () => {
  // 0.1.1-rc.7 and older: bare URL, no authUrl.
  assert.deepEqual(parseReadyLine("dsh web: http://127.0.0.1:62750"), { url: "http://127.0.0.1:62750" });
  // 0.1.2-rc.1: token suffix is surfaced separately (base stays token-free).
  const line = "dsh web: http://127.0.0.1:49617/?token=g2v9gbhetT-vAVXCkAVjIdO_pdODGg7K7xi1svnTLNM";
  assert.deepEqual(parseReadyLine(line), {
    url: "http://127.0.0.1:49617",
    authUrl: "http://127.0.0.1:49617/?token=g2v9gbhetT-vAVXCkAVjIdO_pdODGg7K7xi1svnTLNM",
  });
  assert.equal(parseUrlLine(line), "http://127.0.0.1:49617", "legacy parse still returns the base");
  assert.equal(parseReadyLine("noise"), null);
});

test("resolveDshPath finds dsh in an injected home", (t) => {
  const home = tmpdir(t);
  // Hermetic resolution: skip system-level probe locations (npm prefix -g
  // bin, /opt/homebrew/bin, /usr/local/bin). A real global dsh on the
  // machine (e.g. `npm i -g @deepseek-ai/dsh`) would otherwise be probed
  // BEFORE the injected home and shadow every case below.
  const HOME_ONLY = { systemPaths: false };
  // A stray $DSH_BIN in the dev environment must not decide the outcome.
  const savedDshBin = process.env.DSH_BIN;
  process.env.DSH_BIN = "";
  t.after(() => {
    if (savedDshBin === undefined) delete process.env.DSH_BIN;
    else process.env.DSH_BIN = savedDshBin;
  });

  // Case 1: npx cache glob (multiple versions → the newest by mtime wins).
  const older = path.join(home, ".npm", "_npx", "aaa111", "node_modules", ".bin");
  const newer = path.join(home, ".npm", "_npx", "bbb222", "node_modules", ".bin");
  for (const dir of [older, newer]) fs.mkdirSync(dir, { recursive: true });
  const oldStamp = new Date(Date.now() - 60_000);
  const newStamp = new Date();
  fs.writeFileSync(path.join(older, "dsh"), "");
  fs.utimesSync(path.join(older, "dsh"), oldStamp, oldStamp);
  fs.writeFileSync(path.join(newer, "dsh"), "");
  fs.utimesSync(path.join(newer, "dsh"), newStamp, newStamp);
  assert.equal(resolveDshPath(home, "linux", HOME_ONLY).path, path.join(newer, "dsh"));

  // Case 2: npm-global bin wins over npx cache (earlier in the order).
  const globalDir = path.join(home, ".npm-global", "bin");
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(path.join(globalDir, "dsh"), "");
  assert.equal(resolveDshPath(home, "linux", HOME_ONLY).path, path.join(globalDir, "dsh"));

  // Case 3: nothing found → null; home-derived tried entries are "~"-redacted.
  const empty = tmpdir(t);
  const res = resolveDshPath(empty, "linux", HOME_ONLY);
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

// --- 0.1.2+ launch-token auth and version floor ----------------------------

test("start() rejects dsh below the 0.1.2-rc.1 floor with a clear message", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir, { version: "0.1.1-rc.7" });
  const manager = new DshServerManager();
  await assert.rejects(manager.start({ dshBin: bin, cwd: dir }), /0\.1\.2-rc\.1 or newer/);
  assert.equal(manager.state, "error");
});

test("start() accepts dsh 0.1.2-rc.1 and newer", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir, { version: "0.1.2-rc.1" });
  const manager = new DshServerManager();
  const url = await manager.start({ dshBin: bin, cwd: dir });
  assert.equal(url, "http://127.0.0.1:34567");
  const exited = new Promise((r) => manager.once("exit", r));
  manager.stop();
  await exited;
});

test("start() mints the browser-session cookie from the ?token= launch URL", async (t) => {
  // The fake dsh prints a 0.1.2+ launch line pointing at a fixture HTTP
  // server that answers GET /?token=... with 303 + Set-Cookie (the mint).
  const seen = [];
  const mint = http.createServer((req, res) => {
    seen.push(req.url);
    res.writeHead(303, { location: "/", "set-cookie": "dsh-auth-test=v1.sig; Path=/; HttpOnly" });
    res.end();
  });
  await new Promise((r) => mint.listen(0, "127.0.0.1", r));
  t.after(() => mint.close());
  const { port } = mint.address();

  const dir = tmpdir(t);
  const bin = fakeDsh(dir, { urlLine: `dsh web: http://127.0.0.1:${port}/?token=abc123` });
  const manager = new DshServerManager();
  const exited = new Promise((r) => manager.once("exit", r));
  try {
    const url = await manager.start({ dshBin: bin, cwd: dir });
    // Base URL stays token-free; the cookie was exchanged from the token URL.
    assert.equal(url, `http://127.0.0.1:${port}`);
    assert.equal(manager.authCookieHeader, "dsh-auth-test=v1.sig");
    assert.equal(manager.browserUrl, `http://127.0.0.1:${port}/?token=abc123`);
    assert.deepEqual(seen, ["/?token=abc123"]);
  } finally {
    manager.stop();
  }
  await exited;
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
  // 0.1.2 replaced the unary workspace.list with the workspace/follow stream
  // baseline; tests stub the snapshot method directly (its own unit is the
  // openStreamFirstFrame/wsCtor seam covered by the stream tests below).
  return manager;
}

/** The workspace/follow baseline shape a live server returns first. */
const SNAP = (items, archivedSessionIds) => ({ items, archivedSessionIds });

test("listWorkspaceSessions filters session.list to the cwd workspace", async () => {
  const manager = apiManager();
  manager.workspaceSnapshot = async () =>
    SNAP([{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1", "s2"] }], ["sx"]);
  const restore = mockFetch((req) => {
    if (req.method === "session/list") {
      assert.deepEqual(req.payload.args, { _request: {} });
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
  manager.workspaceSnapshot = async () =>
    SNAP([{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1", "s2"] }], ["s2"]);
  const restore = mockFetch(() => ({
    result: {
      ok: true,
      value: {
        items: [
          { sessionId: "s1", updatedAt: 1, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
          { sessionId: "s2", updatedAt: 2, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
        ],
      },
    },
  }));
  try {
    const { items, archivedItems } = await manager.listWorkspaceSessions("/ws/a");
    assert.deepEqual(items.map((s) => s.sessionId), ["s1"]);
    assert.deepEqual(archivedItems.map((s) => s.sessionId), ["s2"]);
    assert.equal(archivedItems[0].title, null);
  } finally {
    restore();
  }
});

test("listWorkspaceSessions reads agentPreset from projections.values (0.1.2 rows)", async () => {
  const manager = apiManager();
  manager.workspaceSnapshot = async () => SNAP([{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1"] }], []);
  const restore = mockFetch(() => ({
    result: {
      ok: true,
      value: {
        items: [
          // 0.1.2 session.list rows carry agentPreset nested in projections.
          { sessionId: "s1", updatedAt: 1, running: false, blank: true, cwd: "/ws/a", projections: { values: { title: null, agentPreset: "standard" } } },
        ],
      },
    },
  }));
  try {
    const { items } = await manager.listWorkspaceSessions("/ws/a");
    assert.equal(items[0].agentPreset, "standard");
  } finally {
    restore();
  }
});

test("listWorkspaceSessions lists ALL active sessions including blank ones", async () => {
  const manager = apiManager();
  manager.workspaceSnapshot = async () =>
    SNAP([{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1", "s2", "s3"] }], []);
  const restore = mockFetch(() => ({
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
  }));
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
  manager.workspaceSnapshot = async () => SNAP([{ workspaceId: "w1", path: "/other", sessionIds: [] }], []);
  const restore = mockFetch(() => ({
    result: { ok: true, value: { items: [] } },
  }));
  try {
    const { items, archivedItems } = await manager.listWorkspaceSessions("/nowhere");
    assert.deepEqual(items, []);
    assert.deepEqual(archivedItems, []);
  } finally {
    restore();
  }
});

test("renameSession sends the 0.1.2 envelope and returns the accepted title", async () => {
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
    assert.equal(sent.method, "session/rename");
    assert.deepEqual(sent.payload, { args: { request: { sessionId: "s1", title: "新标题" } } });
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

test("archiveSession calls workspace/archiveSession and returns the archive set", async () => {
  const manager = apiManager();
  let sent;
  const restore = mockFetch((req) => {
    sent = req;
    return { result: { ok: true, value: { archivedSessionIds: ["s1", "s2"] } } };
  });
  try {
    const archived = await manager.archiveSession("s1");
    assert.deepEqual(archived, ["s1", "s2"]);
    assert.equal(sent.method, "workspace/archiveSession");
    assert.deepEqual(sent.payload, { args: { request: { sessionId: "s1" } } });
  } finally {
    restore();
  }
});

test("createSession sends workspace-bound session/create (0.1.2 wire)", async () => {
  const manager = apiManager();
  let sent;
  const restore = mockFetch((req) => {
    sent = req;
    return { result: { ok: true, value: { sessionId: "fresh", agentPreset: "standard" } } };
  });
  try {
    const id = await manager.createSession("w1");
    assert.equal(id, "fresh");
    assert.equal(sent.method, "session/create");
    assert.deepEqual(sent.payload, { args: { request: { workspaceId: "w1" } } });
  } finally {
    restore();
  }
});

test("ensureWorkspaceSession reuses a blank bound session instead of creating", async () => {
  const manager = apiManager();
  manager.workspaceSnapshot = async () =>
    SNAP([{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1"] }], []);
  const methods = [];
  const restore = mockFetch((req) => {
    methods.push(req.method);
    if (req.method === "session/list") {
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
    assert.ok(!methods.includes("session/create"), "must NOT create a new session");
  } finally {
    restore();
  }
});

test("ensureWorkspaceSession skips archived sessions and creates a fresh one", async () => {
  const manager = apiManager();
  manager.workspaceSnapshot = async () =>
    SNAP([{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1"] }], ["s1"]);
  const methods = [];
  const restore = mockFetch((req) => {
    methods.push(req.method);
    if (req.method === "session/list") {
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
    if (req.method === "session/create") {
      return { result: { ok: true, value: { sessionId: "s2" } } };
    }
    return { result: { ok: false, error: { message: "unexpected " + req.method } } };
  });
  try {
    const id = await manager.ensureWorkspaceSession("/ws/a");
    assert.equal(id, "s2");
    assert.ok(methods.includes("session/create"));
  } finally {
    restore();
  }
});

test("ensureWorkspaceSession creates the workspace and a bound session when none exists", async () => {
  const manager = apiManager();
  manager.workspaceSnapshot = async () => SNAP([], []);
  const calls = [];
  const restore = mockFetch((req) => {
    calls.push({ method: req.method, args: req.payload.args });
    if (req.method === "workspace/create") {
      return { result: { ok: true, value: { workspace: { workspaceId: "w-new", path: "/nowhere", sessionIds: [] }, created: true } } };
    }
    if (req.method === "session/create") {
      return { result: { ok: true, value: { sessionId: "s-new" } } };
    }
    if (req.method === "session/list") {
      return { result: { ok: true, value: { items: [] } } };
    }
    return { result: { ok: false, error: { message: "unexpected " + req.method } } };
  });
  try {
    const id = await manager.ensureWorkspaceSession("/nowhere");
    assert.equal(id, "s-new");
    assert.deepEqual(calls.map((c) => c.method), ["workspace/create", "session/list", "session/create"]);
    assert.deepEqual(calls[0].args, { request: { path: "/nowhere" } });
    assert.deepEqual(calls[2].args, { request: { workspaceId: "w-new" } });
  } finally {
    restore();
  }
});

test("openStreamFirstFrame resolves the first item frame (workspace/follow baseline)", async () => {
  const { openStreamFirstFrame } = require("../out/serverManager.js");
  const instance = { sent: [], listeners: {} };
  const FakeWS = function (url, opts) {
    assert.equal(url, "http://127.0.0.1:9/api/remote.mux");
    assert.equal(opts.headers.cookie, "dsh-auth-x=y", "cookie must ride the upgrade");
  };
  FakeWS.prototype = {
    on(event, cb) {
      (instance.listeners[event] = instance.listeners[event] || []).push(cb);
      return this;
    },
    send(data) {
      instance.sent.push(JSON.parse(data));
    },
    terminate() {},
  };
  const frameP = openStreamFirstFrame(FakeWS, "http://127.0.0.1:9/api/remote.mux", "dsh-auth-x=y", "workspace/follow", {});
  // The helper only sends its `open` frame once the socket reports open; then
  // the fake mux answers with the baseline item.
  setImmediate(() => {
    assert.equal(instance.sent.length, 0, "no open frame before the socket opens");
    instance.listeners.open.forEach((cb) => cb());
  });
  setImmediate(() => {
    assert.equal(instance.sent[0].type, "open");
    assert.equal(instance.sent[0].endpoint, "workspace/follow");
    assert.deepEqual(instance.sent[0].payload, { args: {} });
    instance.listeners.message.forEach((cb) =>
      cb(JSON.stringify({ type: "item", streamId: instance.sent[0].streamId, value: { type: "baseline", value: { items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1"] }], archivedSessionIds: [] } } }))
    );
  });
  const frame = await frameP;
  assert.deepEqual(frame.value, { items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1"] }], archivedSessionIds: [] });
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
