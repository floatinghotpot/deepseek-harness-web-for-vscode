// Unit tests for src/workspaceTracker.ts (01-workspace-alignment T6/T7a).
// Covers shouldAutoRestart branches, normalizePath cross-platform
// boundaries (review-by-gemini A-5): win32 drive-letter case, trailing
// separators, empty string, relative paths; and the session-preset payload
// shape (req R2, spike-verified against dsh.sessions.current).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { normalizePath, shouldAutoRestart, buildSessionPresetPayload } from "../out/workspaceTracker.js";

test("shouldAutoRestart: true when the workspace record says it was running", () => {
  assert.equal(shouldAutoRestart(true), true);
});

test("shouldAutoRestart: false when it was not running", () => {
  assert.equal(shouldAutoRestart(false), false);
});

test("shouldAutoRestart: false when no record exists (different workspace)", () => {
  assert.equal(shouldAutoRestart(undefined), false);
});

test("normalizePath: resolves and drops trailing separators", () => {
  const base = path.resolve("/a/b");
  assert.equal(normalizePath("/a/b"), base);
  assert.equal(normalizePath("/a/b/"), base);
  assert.equal(normalizePath("/a/b//"), base);
});

test("normalizePath: resolves relative paths to the same absolute form", () => {
  const cwd = process.cwd();
  assert.equal(normalizePath("a/b"), path.resolve(cwd, "a/b"));
  assert.equal(normalizePath("./a/b"), path.resolve(cwd, "a/b"));
});

test("normalizePath: empty string resolves to cwd without throwing", () => {
  assert.equal(normalizePath(""), path.resolve(""));
});

test("normalizePath: win32 lower-cases for drive-letter case (injected platform)", () => {
  // path.resolve runs on the real host, so only the case-normalization branch
  // is exercised here (drive-letter case); separator parsing is host-bound.
  assert.equal(normalizePath("/Repo/A", "win32"), normalizePath("/repo/a", "win32"));
});

test("normalizePath: posix case is preserved (case-sensitive)", () => {
  assert.notEqual(normalizePath("/A/b", "linux"), normalizePath("/a/b", "linux"));
});

test("buildSessionPresetPayload: serializes {sessionId} for dsh.sessions.current", () => {
  const payload = buildSessionPresetPayload("session-abc-123");
  assert.equal(payload, JSON.stringify({ sessionId: "session-abc-123" }));
  // Must round-trip through JSON.parse exactly as the DSH client rehydrates
  // (attachPersistence: JSON.parse(localStorage.getItem(name))).
  assert.deepEqual(JSON.parse(payload), { sessionId: "session-abc-123" });
});

test("buildSessionPresetPayload: escapes special characters safely", () => {
  const payload = buildSessionPresetPayload('session-"quoted"\\<script>');
  assert.deepEqual(JSON.parse(payload), { sessionId: 'session-"quoted"\\<script>' });
});
