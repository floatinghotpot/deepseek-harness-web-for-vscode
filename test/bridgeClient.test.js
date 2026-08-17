// Regression tests for media/bridge-client.js — the webview-side shim.
// Executes the real injected script under a minimal browser-stub harness so
// the fetch/WebSocket/clipboard relay logic is covered by node:test.
// Regression: fetch(URL-object) used to produce "/undefined" (URL has .href,
// not .url) and relay everything to HTTP 405.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

// Node's URL gives custom schemes (vscode-webview://) an opaque "null"
// origin, unlike Chromium; use an http origin so same-origin resolution
// behaves like the real webview.
const WEBVIEW_ORIGIN = "http://webview.local";
const SCRIPT = require("node:fs").readFileSync(
  path.join(__dirname, "..", "media", "bridge-client.js"),
  "utf8"
);

/** Install browser globals, run the bridge script, return a probe handle. */
function loadBridge(bridgeInit) {
  const posted = [];
  const nativeFetchCalls = [];
  const listeners = {};

  const window = {
    fetch: (input, init) => {
      nativeFetchCalls.push({ input, init });
      return Promise.resolve(new Response("native", { status: 200 }));
    },
    matchMedia: (query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    addEventListener: (type, fn) => {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    WebSocket: class {
      constructor(url) {
        this.url = url;
      }
    },
  };
  const acquireVsCodeApi = () => ({ postMessage: (msg) => posted.push(msg) });
  const location = { href: WEBVIEW_ORIGIN + "/", origin: WEBVIEW_ORIGIN };
  // Node ≥21 exposes a read-only global navigator; the bridge only adds a
  // `clipboard` property to it, which is allowed.
  const navigator = globalThis.navigator;

  globalThis.window = window;
  globalThis.location = location;
  globalThis.acquireVsCodeApi = acquireVsCodeApi;
  if (bridgeInit) window.__DSH_BRIDGE__ = bridgeInit;

  // Run the IIFE in this context.
  const run = new Function(
    "window",
    "location",
    "navigator",
    "acquireVsCodeApi",
    "URL",
    "Headers",
    "Response",
    "DOMException",
    SCRIPT
  );
  run(window, location, navigator, acquireVsCodeApi, URL, Headers, Response, DOMException);

  return { posted, nativeFetchCalls, window, listeners };
}

test("fetch with a URL object relays the correct path (regression: /undefined)", async () => {
  const h = loadBridge();
  const input = new URL(WEBVIEW_ORIGIN + "/api/host.pickDirectory", "http://x");
  const p = h.window.fetch(input, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(h.posted.length, 1);
  assert.deepEqual(h.posted[0], {
    type: "http",
    id: 1,
    method: "POST",
    url: "/api/host.pickDirectory",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(h.nativeFetchCalls.length, 0);
  // Resolve the relay: respond and check the Response status.
  const msg = h.listeners.message;
  h.listeners.message.forEach((fn) => fn({ data: { type: "http-res", id: 1, status: 200, statusText: "OK", headers: {}, body: "{}" } }));
  const res = await p;
  assert.equal(res.status, 200);
});

test("fetch with a string input relays too", () => {
  const h = loadBridge();
  h.window.fetch(WEBVIEW_ORIGIN + "/api/session.list", { method: "POST", body: "{}" });
  assert.equal(h.posted[0].url, "/api/session.list");
});

test("cross-origin fetches (blob/data) fall through to native fetch", async () => {
  const h = loadBridge();
  const res = await h.window.fetch("blob:http://x/abc", {});
  assert.equal(h.nativeFetchCalls.length, 1);
  assert.equal(h.posted.length, 0);
  assert.equal(res.status, 200);
});

test("WebSocket shim relays ws-open with the path", () => {
  const h = loadBridge();
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.mux");
  assert.equal(ws.readyState, h.window.WebSocket.CONNECTING);
  assert.equal(h.posted[0].type, "ws-open");
  assert.equal(h.posted[0].path, "/api/events.mux");
  // open-res flips readyState and fires open listeners.
  const opened = [];
  ws.addEventListener("open", () => opened.push(true));
  h.listeners.message.forEach((fn) => fn({ data: { type: "ws-open-res", id: h.posted[0].id, ok: true } }));
  assert.equal(ws.readyState, h.window.WebSocket.OPEN);
  assert.equal(opened.length, 1);
});

test("clipboard shim relays writeText and resolves clipboard-res", async () => {
  const h = loadBridge();
  const p = navigator.clipboard.writeText("hello");
  assert.equal(h.posted[0].type, "clipboard-write");
  assert.equal(h.posted[0].text, "hello");
  h.listeners.message.forEach((fn) => fn({ data: { type: "clipboard-res", id: h.posted[0].id, ok: true } }));
  await p; // resolves without rejection
});

test("matchMedia shim follows __DSH_BRIDGE__.dark and theme-preference messages", () => {
  // Pre-set __DSH_BRIDGE__ with dark:true before the script loads.
  const h = loadBridge({ serverBase: "http://x", dark: true });
  const darkMql = h.window.matchMedia("(prefers-color-scheme: dark)");
  assert.equal(darkMql.matches, true);
  // Other queries pass through to the real matchMedia.
  assert.equal(h.window.matchMedia("(max-width: 1px)").matches, false);

  // A theme-preference message flips the override and fires listeners.
  const seen = [];
  darkMql.addEventListener("change", (e) => seen.push(e.matches));
  h.listeners.message.forEach((fn) => fn({ data: { type: "theme-preference", dark: false } }));
  assert.equal(darkMql.matches, false);
  assert.deepEqual(seen, [false]);
});
