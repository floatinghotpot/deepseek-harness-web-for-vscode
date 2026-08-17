// Command wiring for the extension lifecycle (T3).
import * as os from "node:os";
import * as vscode from "vscode";
import { DshServerManager } from "./serverManager.js";

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
        vscode.window.showErrorMessage(`Failed to start DeepSeek Harness: ${msg}`);
      }
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.stop", async () => {
      manager.stop();
      vscode.window.showInformationMessage("DeepSeek Harness stopped.");
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.openBrowser", async () => {
      const url = manager.serverUrl;
      if (!url) {
        vscode.window.showWarningMessage("DeepSeek Harness is not running.");
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.openPanel", () => {
      revealPanel();
    })
  );
}
