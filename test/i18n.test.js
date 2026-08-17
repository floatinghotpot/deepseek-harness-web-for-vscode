// Parity test for the central bilingual string table (Appendix A):
// every key must carry non-empty en + zh, and interpolation must work.
"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { STRINGS, interpolate } = require("../out/i18nStrings.js");

test("every i18n key has non-empty en and zh", () => {
  const keys = Object.keys(STRINGS);
  assert.ok(keys.length >= 20, `expected a substantial table, got ${keys.length}`);
  for (const key of keys) {
    const row = STRINGS[key];
    assert.ok(row.en.trim().length > 0, `${key}.en is empty`);
    assert.ok(row.zh.trim().length > 0, `${key}.zh is empty`);
  }
});

test("interpolate replaces {placeholders}", () => {
  assert.equal(interpolate("Running {url}", { url: "http://127.0.0.1:1" }), "Running http://127.0.0.1:1");
  assert.equal(interpolate("Error: {message}", { message: "boom" }), "Error: boom");
  assert.equal(interpolate("No vars", {}), "No vars");
});
