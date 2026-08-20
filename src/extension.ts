// DeepSeek Harness for VS Code — extension entry.
// Wires the server manager, the editor-tab panel (bridge), commands, and
// theme sync (T3/T8/T9/T12). Workspace alignment (01-workspace-alignment
// T3/T4): workspaceState-driven auto-restart + multi-root panel close.
// Session management (02-session-management T6): multi-panel orchestration,
// session list + rename in the launcher, reload restore of open panels.
import * as vscode from "vscode";
import { DshServerManager } from "./serverManager.js";
import { registerCommands, workspaceRoot } from "./commands.js";
import { DshPanel } from "./dshPanel.js";
import { SessionPanelManager, VIEW_COLUMN_ACTIVE } from "./sessionPanels.js";
import { DshLauncherView } from "./launcherView.js";
import { registerThemeSync } from "./themeSync.js";
import { createDshStatusBar } from "./statusBar.js";
import { normalizePath, shouldAutoRestart, buildSessionPresetPayload } from "./workspaceTracker.js";
import { checkForUpdates, showUpgradeOptions, type UpgradeChannel } from "./versionCheckService.js";

const WAS_RUNNING_KEY = "dsh.wasRunning";
const PANELS_KEY = "dsh.panels";

let manager: DshServerManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  manager = new DshServerManager();
  manager.on("log", (msg: string) => console.log("[dsh]", msg));
  manager.on("stderr", (msg: string) => console.log("[dsh]", msg));

  const theme = registerThemeSync(context, () => manager?.serverUrl);
  // Persist the open-panel sessionId list (02 T6): survives window reload so
  // the auto-restart path can restore every panel bound to its session.
  const persistPanels = (ids: string[]): void => {
    void context.workspaceState.update(PANELS_KEY, ids);
  };
  const mgr = manager;
  const panels = new SessionPanelManager(persistPanels, (sessionId) =>
    sessionId ? new DshPanel(context, mgr, sessionId) : new DshPanel(context, mgr)
  );

  // Persist the "was running" flag on every state transition (not in
  // deactivate — a floating promise there can be lost on process exit;
  // review-by-gemini A-2). workspaceState is keyed by the current workspace,
  // so a reload of the SAME folder keeps the record while opening a DIFFERENT
  // folder has none (A-3).
  manager.on("state", (info) => {
    const running = info.state === "ready";
    if (running !== context.workspaceState.get<boolean>(WAS_RUNNING_KEY)) {
      void context.workspaceState.update(WAS_RUNNING_KEY, running);
    }
  });

  // Any start path (command / launcher / status bar / overlay) opens the
  // DSH UI in the editor tab once the server is ready — but only AFTER the
  // theme is synced, so the page loads with the VS Code color scheme (R7).
  // UI alignment (req R2 / T7): resolve a session bound to the IDE workspace
  // and preset it into the frontend before the panel loads, so DSH shows the
  // current workspace instead of the "most recently active" one. Failure to
  // resolve degrades silently to the default behavior.
  // Session management (02 T6): on an auto-restart (same-workspace reload)
  // restore every panel that was open before, each preset to its session;
  // otherwise open the IDE workspace session panel as before.
  const autoRestart = shouldAutoRestart(context.workspaceState.get<boolean>(WAS_RUNNING_KEY));
  let restoredPanels = false;
  const m = manager;
  m.on("state", async (info) => {
    if (info.state !== "ready") return;
    await theme.syncNow();
    let preset: string | undefined;
    let wsSessionId: string | undefined;
    try {
      wsSessionId = await m.ensureWorkspaceSession(workspaceRoot());
      preset = buildSessionPresetPayload(wsSessionId);
    } catch (err) {
      console.log("[dsh] workspace-session preset skipped:", err instanceof Error ? err.message : err);
    }
    if (autoRestart && !restoredPanels) {
      restoredPanels = true;
      const saved = context.workspaceState.get<string[]>(PANELS_KEY) ?? [];
      if (saved.length > 0) {
        panels.restore(saved, (sid) => buildSessionPresetPayload(sid));
      } else {
        // Bind the default panel to the IDE-workspace session (not unbound):
        // archiving that session from the sidebar must be able to close it.
        panels.open(wsSessionId, preset);
      }
    } else {
      panels.open(wsSessionId, preset);
    }
    // G-03: background version check (24h gate) — never blocks, offline-safe.
    // onResult refreshes the launcher once the fetch settles (it may finish
    // after the first render, so the upgrade hint needs a re-push).
    void checkForUpdates(context, m.dshBinPath, m.dshVersion, () => launcher?.refresh());
  });

  // Normal reload of the same workspace (settings/extensions/update): the
  // workspaceState record survived → auto-restart dsh so the panel comes back
  // without manual action (A2 continuity). A different workspace has no
  // record → cold start, user opens explicitly.
  if (autoRestart) {
    manager.start({ cwd: workspaceRoot() }).catch(() => {
      /* state machine drives the UI */
    });
  }

  // Multi-root changes: close the panel only when the PRIMARY workspace root
  // (workspaceFolders[0]) actually changed — adding/removing an auxiliary
  // folder must not kill the active conversation (review A-4, Round-2 §3).
  // 02 T6: all panels close (each bound to the old workspace's sessions).
  let trackedRoot = workspaceRoot();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const newRoot = workspaceRoot();
      if (normalizePath(newRoot) !== normalizePath(trackedRoot)) {
        trackedRoot = newRoot;
        panels.closeAll();
      }
    })
  );

  registerCommands(context, manager, () => panels.open());
  createDshStatusBar(context, manager);

  // Session handlers (02 T5/T6): new session opens a fresh panel; opening a
  // listed session reveals or creates its panel; rename syncs the editor tab
  // title; close only disposes the panel (the session stays in DSH).
  const onNewSession = async (): Promise<void> => {
    try {
      const workspaceId = await m.workspaceIdFor(workspaceRoot());
      const sessionId = await m.createSession(workspaceId);
      // Stack the new panel over the current tab group (Active), not tiled.
      panels.open(sessionId, buildSessionPresetPayload(sessionId), VIEW_COLUMN_ACTIVE);
      launcher?.refreshSessions();
    } catch (err) {
      void vscode.window.showWarningMessage(
        `DeepSeek Harness: failed to create session — ${err instanceof Error ? err.message : err}`
      );
    }
  };
  const onOpenSession = (sessionId: string): void => {
    // Stack over the current tab group (Active) instead of tiling the editor.
    panels.open(sessionId, buildSessionPresetPayload(sessionId), VIEW_COLUMN_ACTIVE);
  };
  const onRenameSession = async (sessionId: string, title: string): Promise<void> => {
    const res = await m.renameSession(sessionId, title);
    panels.updateTitle(sessionId, res.title);
    launcher?.refreshSessions();
  };
  const onArchiveSession = async (sessionId: string): Promise<void> => {
    try {
      await m.archiveSession(sessionId);
      panels.close(sessionId);
      launcher?.refreshSessions();
    } catch (err) {
      void vscode.window.showWarningMessage(
        `DeepSeek Harness: failed to archive session — ${err instanceof Error ? err.message : err}`
      );
    }
  };

  let launcher: DshLauncherView | undefined = new DshLauncherView(
    context,
    manager,
    (channel: UpgradeChannel) => void showUpgradeOptions(context, m.dshVersion, m.dshBinPath, channel),
    { newSession: () => void onNewSession(), openSession: onOpenSession, renameSession: onRenameSession, archiveSession: (sid) => void onArchiveSession(sid) }
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DshLauncherView.viewType, launcher)
  );

  context.subscriptions.push({
    dispose: () => {
      manager?.stop();
    },
  });
}

export function deactivate(): void {
  // No persistence here: `dsh.wasRunning` is synced on state transitions
  // during activate (T3). This function only stops the child.
  manager?.stop();
}
