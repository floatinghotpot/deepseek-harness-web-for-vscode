// DeepSeek Harness for VS Code — extension entry.
// Wires the server manager, the editor-tab panel (bridge), commands, and
// theme sync (T3/T8/T9/T12).
import * as vscode from "vscode";
import { DshServerManager } from "./serverManager.js";
import { registerCommands } from "./commands.js";
import { DshPanel } from "./dshPanel.js";
import { DshLauncherView } from "./launcherView.js";
import { registerThemeSync } from "./themeSync.js";
import { createDshStatusBar } from "./statusBar.js";

let manager: DshServerManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  manager = new DshServerManager();
  manager.on("log", (msg: string) => console.log("[dsh]", msg));
  manager.on("stderr", (msg: string) => console.log("[dsh]", msg));

  const panel = new DshPanel(context, manager);
  const theme = registerThemeSync(context, () => manager?.serverUrl);

  // Any start path (command / launcher / status bar / overlay) opens the
  // DSH UI in the editor tab once the server is ready — but only AFTER the
  // theme is synced, so the page loads with the VS Code color scheme (R7).
  manager.on("state", async (info) => {
    if (info.state === "ready") {
      await theme.syncNow();
      panel.open();
    }
  });

  registerCommands(context, manager, () => panel.open());
  createDshStatusBar(context, manager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DshLauncherView.viewType,
      new DshLauncherView(context, manager, () => panel.open())
    )
  );

  context.subscriptions.push({
    dispose: () => {
      manager?.stop();
    },
  });
}

export function deactivate(): void {
  manager?.stop();
}
