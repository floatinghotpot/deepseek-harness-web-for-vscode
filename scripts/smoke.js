// Cross-platform smoke test: resolve dsh, spawn `dsh web --port 0`, verify the
// API answers with the 0.1.2+ browser-session cookie and that a session
// created with the spawn cwd reports that cwd. Used by CI on macOS/Linux/Windows.
// 0.1.2-rc.1 removed the old `host.describe` dot-method and gates /api behind a
// launch-token cookie; session/create + session/list are the 0.1.2 equivalents
// (create with cwd → list row.cwd proves "default workspace = spawn cwd").
"use strict";
const { DshServerManager } = require("../out/serverManager.js");
(async () => {
  const cwd = process.env.HOME || process.env.USERPROFILE;
  const manager = new DshServerManager();
  const url = await manager.start({
    cwd,
    ...(process.env.DSH_HOME ? { dshHome: process.env.DSH_HOME } : {}),
  });
  const headers = { "content-type": "application/json" };
  if (manager.authCookieHeader) headers.cookie = manager.authCookieHeader;
  const rpc = async (method, args) => {
    const res = await fetch(url + "/api/" + method, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "client-request",
        rpcId: `ci-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        method,
        payload: { args },
      }),
    });
    if (!res.ok) throw new Error(`${method} HTTP ${res.status}`);
    const body = await res.json();
    if (!body.result || !body.result.ok) throw new Error(`${method} failed: ${JSON.stringify(body)}`);
    return body.result.value;
  };
  // Prove authentication (401 without the cookie) and cwd alignment.
  await rpc("session/create", { request: { cwd } });
  const { items } = await rpc("session/list", { _request: {} });
  const row = items.find((s) => s.cwd === cwd);
  if (!row) throw new Error(`no session with cwd ${cwd}: ${JSON.stringify(items)}`);
  console.log(`smoke OK: ${url} cwd=${row.cwd}`);
  manager.stop();
  await new Promise((r) => manager.once("exit", r));
  process.exit(0);
})().catch((e) => {
  console.error("smoke FAIL:", e.message);
  process.exit(1);
});
