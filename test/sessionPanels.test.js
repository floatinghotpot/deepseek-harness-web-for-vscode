// Unit tests for src/sessionPanels.ts (02-session-management T4).
// The manager is vscode-free: panels come from an injected factory, so the
// mapping/ordering/restore/persist core is tested with fake panels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionPanelManager, VIEW_COLUMN_ACTIVE, VIEW_COLUMN_BESIDE } from "../out/sessionPanels.js";

/** Fake DshPanel recording interactions for assertions. */
function fakePanel() {
  return {
    opened: [],
    revealed: [],
    closed: false,
    titles: [],
    disposeCb: undefined,
    open(preset, col) {
      this.opened.push({ preset, col });
    },
    reveal(col) {
      this.revealed.push(col);
    },
    close() {
      this.closed = true;
      if (this.disposeCb) this.disposeCb();
    },
    updateTitle(title) {
      this.titles.push(title);
    },
    onDisposed(cb) {
      this.disposeCb = cb;
    },
  };
}

/** Build a manager whose factory returns fresh fake panels; records created. */
function makeManager() {
  const created = [];
  const persisted = [];
  const m = new SessionPanelManager(
    (ids) => persisted.push([...ids]),
    () => {
      const p = fakePanel();
      created.push(p);
      return p;
    }
  );
  return { m, created, persisted };
}

test("open(sessionId) creates a bound panel and persists it", () => {
  const { m, created, persisted } = makeManager();
  m.open("s1", "preset-1");
  assert.equal(created.length, 1);
  assert.deepEqual(m.getOpenSessionIds(), ["s1"]);
  assert.deepEqual(created[0].opened[0], { preset: "preset-1", col: VIEW_COLUMN_BESIDE });
  assert.deepEqual(persisted.at(-1), ["s1"]);
});

test("open(same sessionId) reveals instead of duplicating", () => {
  const { m, created } = makeManager();
  m.open("s1", "preset-1");
  m.open("s1", "preset-1");
  assert.equal(created.length, 1);
  assert.equal(created[0].revealed.length, 1);
  assert.deepEqual(m.getOpenSessionIds(), ["s1"]);
});

test("open without sessionId focuses the most recent panel", () => {
  const { m, created } = makeManager();
  m.open("s1");
  m.open("s2");
  m.open(); // no id → focus most recent (s2)
  assert.equal(created.length, 2);
  assert.equal(created[1].revealed.length, 1);
});

test("open without sessionId and no panels creates an unbound panel (not in map)", () => {
  const { m, created } = makeManager();
  m.open(undefined, "preset-x");
  assert.equal(created.length, 1);
  assert.deepEqual(m.getOpenSessionIds(), []); // unbound panels are not tracked
});

test("close(sessionId) disposes the panel and unpersists it (session kept)", () => {
  const { m, created, persisted } = makeManager();
  m.open("s1");
  m.open("s2");
  m.close("s1");
  assert.equal(created[0].closed, true);
  assert.deepEqual(m.getOpenSessionIds(), ["s2"]);
  assert.deepEqual(persisted.at(-1), ["s2"]);
  // The fake "session" object itself is untouched — only the panel closed.
});

test("user-closing the tab (onDisposed) removes the binding", () => {
  const { m, created, persisted } = makeManager();
  m.open("s1");
  m.open("s2");
  created[0].disposeCb(); // simulate the editor tab being closed by the user
  assert.deepEqual(m.getOpenSessionIds(), ["s2"]);
  assert.deepEqual(persisted.at(-1), ["s2"]);
});

test("closeAll() disposes every panel in open order", () => {
  const { m, created } = makeManager();
  m.open("s1");
  m.open("s2");
  m.closeAll();
  assert.equal(created[0].closed, true);
  assert.equal(created[1].closed, true);
  assert.deepEqual(m.getOpenSessionIds(), []);
});

test("restore(sessionIds) opens each panel with the Active column", () => {
  const { m, created } = makeManager();
  m.restore(["s1", "s2"], (id) => `preset-${id}`);
  assert.deepEqual(m.getOpenSessionIds(), ["s1", "s2"]);
  assert.equal(created[0].opened[0].col, VIEW_COLUMN_ACTIVE);
  assert.equal(created[1].opened[0].col, VIEW_COLUMN_ACTIVE);
  assert.equal(created[0].opened[0].preset, "preset-s1");
  assert.equal(created[1].opened[0].preset, "preset-s2");
});

test("restore after a partial existing set reveals those panels", () => {
  const { m, created } = makeManager();
  m.open("s1");
  m.restore(["s1", "s2"], () => "p");
  assert.equal(created.length, 2);
  assert.equal(created[0].revealed.length, 1);
  assert.deepEqual(m.getOpenSessionIds(), ["s1", "s2"]);
});

test("updateTitle forwards to the bound panel only", () => {
  const { m, created } = makeManager();
  m.open("s1");
  m.updateTitle("s1", "新标题");
  m.updateTitle("nope", "ignored");
  assert.deepEqual(created[0].titles, ["新标题"]);
});
