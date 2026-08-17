// Status bar item (T9): one-click entry + server state. Planned in plan.md
// T9 but missing until the sidebar view was replaced by an editor tab.
import * as vscode from "vscode";
import { DshServerManager, type ServerState } from "./serverManager.js";
import { t } from "./i18n.js";

const CMD_START = "deepseek-harness-for-vscode.start";
const CMD_OPEN_PANEL = "deepseek-harness-for-vscode.openPanel";

export function createDshStatusBar(
  context: vscode.ExtensionContext,
  manager: DshServerManager
): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  const render = (state: ServerState, url?: string): void => {
    switch (state) {
      case "stopped":
        item.text = `$(circle-outline) ${t("statusbar.stopped")}`;
        item.command = CMD_START;
        item.tooltip = t("statusbar.tip.start");
        break;
      case "starting":
        item.text = `$(sync~spin) ${t("statusbar.starting")}`;
        item.command = undefined;
        item.tooltip = t("statusbar.tip.starting");
        break;
      case "ready":
        item.text = `$(server) ${t("statusbar.ready", { url: url ?? "" })}`;
        item.command = CMD_OPEN_PANEL;
        item.tooltip = t("statusbar.tip.openPanel");
        break;
      case "error":
        item.text = `$(error) ${t("statusbar.error")}`;
        item.command = CMD_START;
        item.tooltip = t("statusbar.tip.retry");
        break;
      default:
        break;
    }
  };

  manager.on("state", (info) => render(info.state, info.url));
  render(manager.state, manager.serverUrl);
  item.show();
  context.subscriptions.push(item);
}
