// Status bar item (T9): one-click entry + server state. Planned in plan.md
// T9 but missing until the sidebar view was replaced by an editor tab.
import * as vscode from "vscode";
import { DshServerManager, type ServerState } from "./serverManager.js";

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
        item.text = "$(circle-outline) DeepSeek Harness: 启动";
        item.command = CMD_START;
        item.tooltip = "启动 DeepSeek Harness";
        break;
      case "starting":
        item.text = "$(sync~spin) DeepSeek Harness 启动中…";
        item.command = undefined;
        item.tooltip = "正在启动 DSH 服务";
        break;
      case "ready":
        item.text = `$(server) DSH ${url ?? ""}`;
        item.command = CMD_OPEN_PANEL;
        item.tooltip = "点击打开面板";
        break;
      case "error":
        item.text = "$(error) DSH 错误";
        item.command = CMD_START;
        item.tooltip = "启动失败，点击重试";
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
