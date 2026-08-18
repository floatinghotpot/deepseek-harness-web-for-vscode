// Parity test for the central multilingual string table (Appendix A):
// every key must carry a non-empty value for EVERY supported language, and
// interpolation must work.
"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { STRINGS, interpolate } = require("../out/i18nStrings.js");

const LANGS = ["en", "zh", "ja", "ko", "ru", "es", "pt", "fr", "de"];

test("every i18n key has non-empty values for all languages", () => {
  const keys = Object.keys(STRINGS);
  assert.ok(keys.length >= 20, `expected a substantial table, got ${keys.length}`);
  for (const key of keys) {
    for (const lang of LANGS) {
      const value = STRINGS[key][lang];
      assert.ok(
        typeof value === "string" && value.trim().length > 0,
        `${key}.${lang} is empty`
      );
    }
  }
});

test("interpolate replaces {placeholders}", () => {
  assert.equal(interpolate("Running {url}", { url: "http://127.0.0.1:1" }), "Running http://127.0.0.1:1");
  assert.equal(interpolate("Error: {message}", { message: "boom" }), "Error: boom");
  assert.equal(interpolate("No vars", {}), "No vars");
});
