// Command wiring for the extension lifecycle (T3).
import * as os from "node:os";
import * as vscode from "vscode";
import { DshServerManager } from "./serverManager.js";
import { t } from "./i18n.js";

/** The first workspace folder, or the OS home when no folder is open. */
export function workspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
}

export function registerCommands(
  context: vscode.ExtensionContext,
  manager: DshServerManager,
  revealPanel: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("deepseek-harness-for-vscode.start", async () => {
      try {
        const url = await manager.start({ cwd: workspaceRoot() });
        revealPanel();
        vscode.window.showInformationMessage(`DeepSeek Harness ready at ${url}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(t("command.startFailed", { message: msg }));
      }
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.stop", async () => {
      manager.stop();
      vscode.window.showInformationMessage("DeepSeek Harness stopped.");
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.openBrowser", async () => {
      // dsh 0.1.2+ needs the launch token in the URL for a real browser to
      // mint its session cookie; the bare server URL would 401.
      const url = manager.browserUrl ?? manager.serverUrl;
      if (!url) {
        vscode.window.showWarningMessage(t("command.notRunning"));
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.openPanel", () => {
      revealPanel();
    })
  );
}
