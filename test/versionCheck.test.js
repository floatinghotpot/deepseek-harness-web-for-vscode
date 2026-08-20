// Unit tests for src/versionCheck.ts (G-03). Covers semver-with-prerelease
// comparison, isUpdateAvailable edge cases, upgrade-command inference from
// the resolved binary path, and the 24h check gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareVersions,
  isUpdateAvailable,
  upgradeCommandFor,
  shouldPassNoOpen,
  shouldCheckVersion,
  shouldSkipVersionCheck,
} from "../out/versionCheck.js";

test("compareVersions: same version is equal", () => {
  assert.equal(compareVersions("0.1.0-rc.6", "0.1.0-rc.6"), 0);
});

test("compareVersions: rc prerelease ordering", () => {
  assert.ok(compareVersions("0.1.0-rc.6", "0.1.0-rc.7") < 0);
  assert.ok(compareVersions("0.1.0-rc.7", "0.1.0-rc.6") > 0);
});

test("compareVersions: release beats prerelease of same core", () => {
  assert.ok(compareVersions("0.1.0-rc.7", "0.1.0") < 0);
  assert.ok(compareVersions("0.1.0", "0.1.0-rc.7") > 0);
});

test("compareVersions: core version ordering", () => {
  assert.ok(compareVersions("0.0.1", "0.1.0") < 0);
  assert.ok(compareVersions("0.2.0", "0.1.0-rc.7") > 0);
  assert.ok(compareVersions("1.0.0", "0.9.9") > 0);
});

test("compareVersions: numeric pre id sorts before alphanumeric", () => {
  assert.ok(compareVersions("0.1.0-1", "0.1.0-a") < 0);
});

test("compareVersions: unparseable sorts older than parseable", () => {
  assert.ok(compareVersions("garbage", "0.1.0") < 0);
  assert.ok(compareVersions("0.1.0", "garbage") > 0);
  assert.equal(compareVersions("garbage", "junk"), 0);
});

test("isUpdateAvailable: only true when current is strictly older", () => {
  assert.equal(isUpdateAvailable("0.1.0-rc.6", "0.1.0-rc.7"), true);
  assert.equal(isUpdateAvailable("0.1.0-rc.7", "0.1.0-rc.7"), false);
  assert.equal(isUpdateAvailable("0.1.0-rc.7", "0.1.0-rc.6"), false);
  assert.equal(isUpdateAvailable(undefined, "0.1.0-rc.7"), false);
  assert.equal(isUpdateAvailable("0.1.0-rc.6", undefined), false);
  // Unparseable current → don't nag.
  assert.equal(isUpdateAvailable("dev-build", "0.1.0-rc.7"), false);
});

test("upgradeCommandFor: npx cache path", () => {
  const p = "/Users/me/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh";
  assert.equal(upgradeCommandFor(p), "npx -y @deepseek-ai/dsh@latest --version");
});

test("upgradeCommandFor: Windows paths (backslash separators)", () => {
  assert.equal(
    upgradeCommandFor("C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\abc\\node_modules\\.bin\\dsh.cmd"),
    "npx -y @deepseek-ai/dsh@latest --version"
  );
  assert.equal(
    upgradeCommandFor("C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js"),
    "npm i -g @deepseek-ai/dsh@latest"
  );
});

test("upgradeCommandFor: npm global paths", () => {
  assert.equal(
    upgradeCommandFor("/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js"),
    "npm i -g @deepseek-ai/dsh@latest"
  );
  assert.equal(
    upgradeCommandFor("/Users/me/.npm-global/bin/dsh"),
    "npm i -g @deepseek-ai/dsh@latest"
  );
  assert.equal(
    upgradeCommandFor("/Users/me/.nvm/versions/node/v24/bin/dsh"),
    "npm i -g @deepseek-ai/dsh@latest"
  );
});

test("upgradeCommandFor: unknown/custom path returns null", () => {
  assert.equal(upgradeCommandFor(undefined), null);
  assert.equal(upgradeCommandFor("/opt/custom/bin/dsh"), null);
});

test("shouldCheckVersion: 24h gate", () => {
  const now = 1_000_000;
  assert.equal(shouldCheckVersion(undefined, now), true);
  assert.equal(shouldCheckVersion(now - 25 * 60 * 60 * 1000, now), true);
  assert.equal(shouldCheckVersion(now - 1 * 60 * 60 * 1000, now), false);
});

test("shouldSkipVersionCheck: gate needs BOTH caches (next-channel backfill)", () => {
  const now = 1_000_000;
  const hourAgo = now - 60 * 60 * 1000;
  // Fresh install: nothing cached → never skip.
  assert.equal(shouldSkipVersionCheck(false, false, hourAgo, now), false);
  // Old install upgraded from <0.3.0: latest cached, next NOT (feature is new)
  // → must NOT skip, so the registry is re-checked and next gets populated.
  assert.equal(shouldSkipVersionCheck(true, false, hourAgo, now), false);
  // Both cached + recent check → skip (normal 24h gate).
  assert.equal(shouldSkipVersionCheck(true, true, hourAgo, now), true);
  // Both cached + stale check → re-check.
  assert.equal(shouldSkipVersionCheck(true, true, now - 25 * 60 * 60 * 1000, now), false);
});

test("shouldPassNoOpen: threshold matrix (--no-open exists since 0.1.0-rc.8)", () => {
  assert.equal(shouldPassNoOpen("0.1.0-rc.7"), false);
  assert.equal(shouldPassNoOpen("0.0.1-rc.5"), false);
  assert.equal(shouldPassNoOpen("0.1.0-rc.8"), true);
  assert.equal(shouldPassNoOpen("0.1.0-rc.9"), true);
  assert.equal(shouldPassNoOpen("0.1.0"), true);
  assert.equal(shouldPassNoOpen("0.2.0"), true);
  // Conservative: unknown / unparseable versions must never pass the flag.
  assert.equal(shouldPassNoOpen(undefined), false);
  assert.equal(shouldPassNoOpen(""), false);
  assert.equal(shouldPassNoOpen("garbage"), false);
  assert.equal(shouldPassNoOpen("dev-build"), false);
});

test("upgradeCommandFor: next channel uses @next spec", () => {
  const npx = "/Users/me/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh";
  assert.equal(upgradeCommandFor(npx, "next"), "npx -y @deepseek-ai/dsh@next --version");
  assert.equal(
    upgradeCommandFor("/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js", "next"),
    "npm i -g @deepseek-ai/dsh@next"
  );
  // Default channel stays "latest" (backward compatible).
  assert.equal(upgradeCommandFor(npx), upgradeCommandFor(npx, "latest"));
  assert.equal(upgradeCommandFor(undefined, "next"), null);
});
