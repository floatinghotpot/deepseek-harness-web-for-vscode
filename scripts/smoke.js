// Cross-platform smoke test: resolve dsh, spawn `dsh web --port 0`, verify the
// API answers host.describe. Used by CI on macOS/Linux/Windows.
"use strict";
const { DshServerManager } = require("../out/serverManager.js");
(async () => {
  const manager = new DshServerManager();
  const url = await manager.start({
    cwd: process.env.HOME || process.env.USERPROFILE,
    ...(process.env.DSH_HOME ? { dshHome: process.env.DSH_HOME } : {}),
  });
  const res = await fetch(url + "/api/host.describe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: "ci-smoke", method: "host.describe", payload: {} }),
  });
  if (!res.ok) throw new Error(`host.describe HTTP ${res.status}`);
  const body = await res.json();
  if (!body.result || !body.result.ok) throw new Error(`host.describe failed: ${JSON.stringify(body)}`);
  console.log(`smoke OK: ${url} cwd=${body.result.value.cwd}`);
  manager.stop();
  await new Promise((r) => manager.once("exit", r));
  process.exit(0);
})().catch((e) => {
  console.error("smoke FAIL:", e.message);
  process.exit(1);
});
