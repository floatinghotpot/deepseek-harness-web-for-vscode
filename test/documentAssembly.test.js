// Unit tests for src/documentAssembly.ts using a fixture HTTP server.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { assembleDocument, extractRev, rewriteBootPluginUrls, rewriteBootPluginPreloads } = require("../out/documentAssembly.js");

/** Serve a small fake DSH dist; returns { url, stop, requestCount }. */
function serveDist(t) {
  const files = new Map([
    ["/", `<!doctype html><html lang="zh-CN"><head><script>(()=>{window.__ModuleLoader__={mode:"queue",pendingQueue:[],load(){},create(){}}})()</script><script src="/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=m1"></script><script src="/plugins/@deepseek-ai/dsh-client-runtime/client.js?rev=r1"></script><script>window.__DSH_BOOT__ = {"rev":"rev123","entries":[{"id":"p1","url":"/plugins/p1/client.js?rev=1"}]}</script><script type="module" crossorigin src="/assets/index-a1b2.js"></script><link rel="modulepreload" crossorigin href="/assets/vendor-c3d4.js"><link rel="stylesheet" crossorigin href="/assets/app-e5f6.css"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="/favicon.svg"></head><body><div id="root"></div></body></html>`],
    ["/assets/index-a1b2.js", `import{c}from"./vendor-c3d4.js";import("./langs/ts.js");`],
    ["/assets/vendor-c3d4.js", "vendor-content"],
    ["/assets/app-e5f6.css", `@font-face{font-family:KaTeX;src:url(/assets/fonts/ka.woff2) format("woff2")}`],
    ["/assets/fonts/ka.woff2", Buffer.from([0, 1, 2, 3])],
    ["/assets/langs/ts.js", "lang-content"],
    ["/manifest.webmanifest", `{"name":"x"}`],
    ["/favicon.svg", "<svg/>"],
  ]);
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount++;
    const body = files.get(req.url);
    if (body === undefined) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      t.after(() => server.close());
      resolve({
        url: `http://127.0.0.1:${port}`,
        stop: () => server.close(),
        get requestCount() {
          return requestCount;
        },
      });
    });
  });
}

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-da-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** asWebviewUri stub: vscode-webview-resource://test/<absPath>. */
const asWebviewUri = (p) => `vscode-webview-resource://test${p}`;

test("extractRev reads the boot rev", () => {
  assert.equal(extractRev(`{"rev":"abc"}`), "abc");
  assert.equal(extractRev("no rev here"), "");
});

test("rewriteBootPluginUrls makes plugin urls absolute", () => {
  const html = `<script>window.__DSH_BOOT__ = {"rev":"r","entries":[{"id":"p","url":"/plugins/p/client.js?rev=1"}]}</script>`;
  const out = rewriteBootPluginUrls(html, "http://127.0.0.1:9999");
  assert.ok(out.includes('"url":"http://127.0.0.1:9999/plugins/p/client.js?rev=1"'));
});

test("rewriteBootPluginUrls matches the 0.1.1-rc.2 globalThis boot shape", () => {
  // 0.1.1-rc.2 changed the injection from `window.__DSH_BOOT__ =` to
  // `globalThis["__DSH_BOOT__"] =`; the JSON entries must still be absolutized
  // or the webview resolves /plugins/ against its own origin and the plugin
  // bundles fail to load ("failed to import loader entry ... bundle script
  // /plugins/... failed to load").
  const html = `<script>globalThis["__DSH_BOOT__"] = {"rev":"r","entries":[{"id":"p","url":"/plugins/p/client.js?rev=1"}]}</script>`;
  const out = rewriteBootPluginUrls(html, "http://127.0.0.1:9999");
  assert.ok(out.includes('"url":"http://127.0.0.1:9999/plugins/p/client.js?rev=1"'));
  assert.ok(out.includes('globalThis["__DSH_BOOT__"]'), "injection statement preserved");
});

test("rewriteBootPluginPreloads makes preload script src absolute (rc.8 boot manifest)", () => {
  const html = `<head><script>(()=>{window.__ModuleLoader__={mode:"queue"}})()</script><script src="/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=m1"></script><script src="/plugins/@deepseek-ai/dsh-client-runtime/client.js?rev=r1"></script><script>window.__DSH_BOOT__ = {"entries":[{"id":"p","url":"/plugins/p/client.js?rev=1"}]}</script></head>`;
  const out = rewriteBootPluginPreloads(html, "http://127.0.0.1:9999");
  assert.ok(out.includes('src="http://127.0.0.1:9999/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=m1"'), "client-modules preload not absolutized");
  assert.ok(out.includes('src="http://127.0.0.1:9999/plugins/@deepseek-ai/dsh-client-runtime/client.js?rev=r1"'), "client-runtime preload not absolutized");
  // The JSON boot graph is untouched by the preload pass (its own pass handles it).
  assert.ok(out.includes('"url":"/plugins/p/client.js?rev=1"'));
});

test("assembleDocument downloads the tree and rewrites the document", async (t) => {
  const server = await serveDist(t);
  const dist = tmpdir(t);

  const { html, distRev, downloaded } = await assembleDocument({
    serverBase: server.url,
    distRootPath: dist,
    asWebviewUri,
    bridgeClientJs: "console.log('bridge');",
    cspSource: "https://*.vscode-webview.net",
    log: () => {},
  });

  // 1. All assets landed in the cache, including fonts and langs.
  for (const f of [
    "assets/index-a1b2.js",
    "assets/vendor-c3d4.js",
    "assets/app-e5f6.css",
    "assets/fonts/ka.woff2",
    "assets/langs/ts.js",
  ]) {
    assert.ok(fs.existsSync(path.join(dist, f)), `missing ${f}`);
  }
  assert.equal(fs.readFileSync(path.join(dist, "rev.txt"), "utf8"), "rev123");
  assert.equal(downloaded, true);
  assert.equal(distRev, "rev123");

  // 2. /assets refs rewritten to local webview URIs (src and href, module script).
  assert.ok(html.includes('src="vscode-webview-resource://test' + path.join(dist, "assets", "index-a1b2.js") + '"'));
  assert.ok(html.includes('href="vscode-webview-resource://test' + path.join(dist, "assets", "vendor-c3d4.js") + '"'));
  assert.ok(html.includes('href="vscode-webview-resource://test' + path.join(dist, "assets", "app-e5f6.css") + '"'));

  // 3. plugin bundle url is absolute against the server.
  assert.ok(html.includes(`"url":"${server.url}/plugins/p1/client.js?rev=1"`));

  // 3.5. boot-manifest preload script tags are absolute too (rc.8+ boot protocol).
  assert.ok(html.includes(`src="${server.url}/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=m1"`));
  assert.ok(html.includes(`src="${server.url}/plugins/@deepseek-ai/dsh-client-runtime/client.js?rev=r1"`));
  assert.ok(!html.includes('src="/plugins/'), "no relative /plugins/ src may remain");

  // 4. server statics (manifest/favicon) point at the server.
  assert.ok(html.includes(`href="${server.url}/manifest.webmanifest"`));
  assert.ok(html.includes(`href="${server.url}/favicon.svg"`));

  // 5. bridge + CSP injected.
  assert.ok(html.includes("__DSH_BRIDGE__"));
  assert.ok(html.includes("console.log('bridge');"));
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(html.includes("connect-src 'none'"));

  // 6. CSS was rewritten to reference the local font.
  const css = fs.readFileSync(path.join(dist, "assets/app-e5f6.css"), "utf8");
  assert.ok(css.includes(`url(vscode-webview-resource://test${path.join(dist, "assets", "fonts", "ka.woff2")})`));
});

test("assembleDocument reuses the cache when the rev is unchanged", async (t) => {
  const server = await serveDist(t);
  const dist = tmpdir(t);

  const first = await assembleDocument({
    serverBase: server.url,
    distRootPath: dist,
    asWebviewUri,
    bridgeClientJs: "",
    cspSource: "x",
    log: () => {},
  });
  const countAfterFirst = server.requestCount;
  const second = await assembleDocument({
    serverBase: server.url,
    distRootPath: dist,
    asWebviewUri,
    bridgeClientJs: "",
    cspSource: "x",
    log: () => {},
  });
  assert.equal(first.downloaded, true);
  assert.equal(second.downloaded, false);
  // Second pass only fetched the index page, not the asset tree.
  assert.ok(server.requestCount - countAfterFirst <= 2, `requestCount grew by ${server.requestCount - countAfterFirst}`);
});

test("assembleDocument injects the session preset before the module script (req R2/T7d)", async (t) => {
  const server = await serveDist(t);
  const dist = tmpdir(t);
  const preset = JSON.stringify({ sessionId: "session-xyz" });

  const { html } = await assembleDocument({
    serverBase: server.url,
    distRootPath: dist,
    asWebviewUri,
    bridgeClientJs: "console.log('bridge');",
    cspSource: "x",
    sessionPreset: preset,
    log: () => {},
  });

  // The localStorage write must appear BEFORE the DSH module script tag.
  const injectPos = html.indexOf('localStorage.setItem("dsh.sessions.current"');
  const modulePos = html.indexOf('type="module"');
  assert.ok(injectPos !== -1, "session preset script missing");
  assert.ok(modulePos !== -1, "module script missing");
  assert.ok(injectPos < modulePos, `preset (${injectPos}) must precede module script (${modulePos})`);
  // Payload is JSON-embedded exactly.
  assert.ok(html.includes(`localStorage.setItem("dsh.sessions.current", ${JSON.stringify(preset)})`));
});

test("assembleDocument omits the preset script when none is provided", async (t) => {
  const server = await serveDist(t);
  const dist = tmpdir(t);
  const { html } = await assembleDocument({
    serverBase: server.url,
    distRootPath: dist,
    asWebviewUri,
    bridgeClientJs: "",
    cspSource: "x",
    log: () => {},
  });
  assert.ok(!html.includes('dsh.sessions.current'));
});

// --- dsh 0.1.2-rc.1 dist layout ------------------------------------------
// The 0.1.2 index carries <base href="/"> and references its assets
// RELATIVELY ("./assets/...", "./manifest.webmanifest"), the boot manifest
// gains a `batches` array of /plugins/?? mux urls, and plugin preloads use
// the "/plugins/??pkg/client.js,...&rev=" mux form.

/** Serve a fake 0.1.2-rc.1-shaped dist (relative ./assets refs + batches). */
function serveDist012(t, { requireCookie } = {}) {
  const files = new Map([
    ["/", `<!doctype html><html lang="en"><head><base href="/"><script>(()=>{window.__ModuleLoader__={mode:"queue",pendingQueue:[],load(){},create(){}}})()</script><link rel="preload" as="script" href="/plugins/??@deepseek-ai/dsh-client-modules/client.js&amp;rev=cddf5581d5d5"><script src="/plugins/??@deepseek-ai/dsh-client-modules/client.js&amp;rev=cddf5581d5d5"></script><script>globalThis["__DSH_BOOT__"] = {"rev":"revAbc","entries":[{"id":"p","url":"/plugins/??@deepseek-ai/dsh-api-gateway/client.js&amp;rev=1"}],"batches":[{"phase":"bootstrap","url":"/plugins/??@deepseek-ai/dsh-client-modules/client.js&amp;rev=2","entries":["@deepseek-ai/dsh-client-modules"]}]}</script><link rel="manifest" href="./manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="./favicon.svg"><script type="module" crossorigin src="./assets/index-Df65b.js"></script><link rel="modulepreload" crossorigin href="./assets/vendor-CJJK.js"><link rel="stylesheet" crossorigin href="./assets/vendor-BN.css"><link rel="stylesheet" crossorigin href="./assets/index-bk.css"></head><body><div id="root"></div></body></html>`],
    ["/assets/index-Df65b.js", `import{c}from"./vendor-CJJK.js";import("./langs/ts-DIP.js");`],
    ["/assets/vendor-CJJK.js", "vendor-content"],
    ["/assets/vendor-BN.css", `@font-face{font-family:KaTeX;src:url(./fonts/ka.woff2) format("woff2")}`],
    ["/assets/index-bk.css", "body{color:red}"],
    ["/assets/fonts/ka.woff2", Buffer.from([0, 0x66, 0x6f, 0x6e])],
    ["/assets/langs/ts-DIP.js", "lang-content"],
    ["/manifest.webmanifest", `{"name":"x"}`],
    ["/favicon.svg", "<svg/>"],
  ]);
  const cookieSeen = [];
  const server = http.createServer((req, res) => {
    cookieSeen.push({ url: req.url, cookie: req.headers.cookie });
    if (requireCookie && !req.headers.cookie) {
      res.writeHead(401);
      res.end("unauthorized");
      return;
    }
    const body = files.get(req.url);
    if (body === undefined) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      t.after(() => server.close());
      resolve({
        url: `http://127.0.0.1:${port}`,
        get cookieSeen() {
          return cookieSeen;
        },
      });
    });
  });
}

test("assembleDocument handles the 0.1.2 relative ./assets layout + batches", async (t) => {
  const server = await serveDist012(t);
  const dist = tmpdir(t);

  const { html, distRev } = await assembleDocument({
    serverBase: server.url,
    distRootPath: dist,
    asWebviewUri,
    bridgeClientJs: "/*bridge*/",
    cspSource: "https://*.vscode-webview.net",
    log: () => {},
  });
  assert.equal(distRev, "revAbc");

  // 1. Relative ./assets refs landed in the cache (fonts via relative CSS url).
  for (const f of [
    "assets/index-Df65b.js",
    "assets/vendor-CJJK.js",
    "assets/vendor-BN.css",
    "assets/index-bk.css",
    "assets/fonts/ka.woff2",
    "assets/langs/ts-DIP.js",
  ]) {
    assert.ok(fs.existsSync(path.join(dist, f)), `missing ${f}`);
  }

  // 2. Module script + preloads rewritten to local webview URIs.
  assert.ok(html.includes('src="vscode-webview-resource://test' + path.join(dist, "assets", "index-Df65b.js") + '"'), "module script not rewritten");
  assert.ok(html.includes('href="vscode-webview-resource://test' + path.join(dist, "assets", "vendor-CJJK.js") + '"'), "modulepreload not rewritten");
  assert.ok(html.includes('href="vscode-webview-resource://test' + path.join(dist, "assets", "vendor-BN.css") + '"'), "css link not rewritten");

  // 3. Boot entries AND the 0.1.2 batches[].url are absolutized.
  assert.ok(html.includes(`"url":"${server.url}/plugins/??@deepseek-ai/dsh-api-gateway/client.js&amp;rev=1"`), "entry url not absolutized");
  assert.ok(html.includes(`"url":"${server.url}/plugins/??@deepseek-ai/dsh-client-modules/client.js&amp;rev=2"`), "batch url not absolutized");

  // 4. Plugin preloads (incl. the "/plugins/??" mux form) are absolute.
  assert.ok(html.includes(`src="${server.url}/plugins/??@deepseek-ai/dsh-client-modules/client.js&amp;rev=cddf5581d5d5"`), "mux preload not absolutized");
  assert.ok(!html.includes('src="/plugins/'), "no relative /plugins/ src may remain");

  // 5. ./manifest.webmanifest and ./favicon.svg point at the server.
  assert.ok(html.includes(`href="${server.url}/manifest.webmanifest"`));
  assert.ok(html.includes(`href="${server.url}/favicon.svg"`));

  // 6. CSS url(./fonts/...) was rewritten to the local font (relative ref).
  const css = fs.readFileSync(path.join(dist, "assets/vendor-BN.css"), "utf8");
  assert.ok(css.includes(`url(vscode-webview-resource://test${path.join(dist, "assets", "fonts", "ka.woff2")})`));
});

test("assembleDocument sends the browser-session cookie on every server fetch", async (t) => {
  const server = await serveDist012(t, { requireCookie: true });
  const dist = tmpdir(t);

  const { downloaded } = await assembleDocument({
    serverBase: server.url,
    distRootPath: dist,
    asWebviewUri,
    bridgeClientJs: "",
    cspSource: "x",
    cookie: "dsh-auth-test=v1.sig",
    log: () => {},
  });
  assert.equal(downloaded, true);
  const seen = server.cookieSeen;
  assert.ok(seen.length >= 2, `expected index + asset fetches, saw ${seen.length}`);
  for (const req of seen) {
    assert.ok(req.url === "/" || req.url.startsWith("/assets/"), `unexpected fetch ${req.url}`);
    assert.equal(req.cookie, "dsh-auth-test=v1.sig", `cookie missing on ${req.url}`);
  }
});
