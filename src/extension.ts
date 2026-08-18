// DeepSeek Harness for VS Code — extension entry.
// Wires the server manager, the editor-tab panel (bridge), commands, and
// theme sync (T3/T8/T9/T12). Workspace alignment (01-workspace-alignment
// T3/T4): workspaceState-driven auto-restart + multi-root panel close.
import * as vscode from "vscode";
import { DshServerManager } from "./serverManager.js";
import { registerCommands, workspaceRoot } from "./commands.js";
import { DshPanel } from "./dshPanel.js";
import { DshLauncherView } from "./launcherView.js";
import { registerThemeSync } from "./themeSync.js";
import { createDshStatusBar } from "./statusBar.js";
import { normalizePath, shouldAutoRestart, buildSessionPresetPayload } from "./workspaceTracker.js";
import { checkForUpdates, showUpgradeOptions } from "./versionCheckService.js";

const WAS_RUNNING_KEY = "dsh.wasRunning";

let manager: DshServerManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  manager = new DshServerManager();
  manager.on("log", (msg: string) => console.log("[dsh]", msg));
  manager.on("stderr", (msg: string) => console.log("[dsh]", msg));

  const panel = new DshPanel(context, manager);
  const theme = registerThemeSync(context, () => manager?.serverUrl);

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
  const m = manager;
  m.on("state", async (info) => {
    if (info.state === "ready") {
      await theme.syncNow();
      let preset: string | undefined;
      try {
        const sessionId = await m.ensureWorkspaceSession(workspaceRoot());
        preset = buildSessionPresetPayload(sessionId);
      } catch (err) {
        console.log("[dsh] workspace-session preset skipped:", err instanceof Error ? err.message : err);
      }
      panel.open(preset);
      // G-03: background version check (24h gate) — never blocks, offline-safe.
      // onResult refreshes the launcher once the fetch settles (it may finish
      // after the first render, so the upgrade hint needs a re-push).
      void checkForUpdates(context, m.dshBinPath, m.dshVersion, () => launcher?.refresh());
    }
  });

  // Normal reload of the same workspace (settings/extensions/update): the
  // workspaceState record survived → auto-restart dsh so the panel comes back
  // without manual action (A2 continuity). A different workspace has no
  // record → cold start, user opens explicitly.
  if (shouldAutoRestart(context.workspaceState.get<boolean>(WAS_RUNNING_KEY))) {
    manager.start({ cwd: workspaceRoot() }).catch(() => {
      /* state machine drives the UI */
    });
  }

  // Multi-root changes: close the panel only when the PRIMARY workspace root
  // (workspaceFolders[0]) actually changed — adding/removing an auxiliary
  // folder must not kill the active conversation (review A-4, Round-2 §3).
  let trackedRoot = workspaceRoot();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const newRoot = workspaceRoot();
      if (normalizePath(newRoot) !== normalizePath(trackedRoot)) {
        trackedRoot = newRoot;
        panel.close();
      }
    })
  );

  registerCommands(context, manager, () => panel.open());
  createDshStatusBar(context, manager);
  let launcher: DshLauncherView | undefined = new DshLauncherView(
    context,
    manager,
    () => panel.open(),
    () => void showUpgradeOptions(context, m.dshVersion, m.dshBinPath)
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
