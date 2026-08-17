// DeepSeek Harness editor panel (T8, revised 2026-08-17: sidebar -> editor
// tab, display style aligned with Claude Code) + server-status overlay (T9).
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DshServerManager, type ServerInfo } from "./serverManager.js";
import { assembleDocument } from "./documentAssembly.js";
import { BridgeHost } from "./bridgeHost.js";
import { workspaceRoot } from "./commands.js";
import { t } from "./i18n.js";

const DIST_DIR_NAME = "dsh-dist";
const PANEL_TITLE = "DeepSeek Harness";

function isDarkTheme(): boolean {
  const k = vscode.window.activeColorTheme.kind;
  return k === vscode.ColorThemeKind.Dark || k === vscode.ColorThemeKind.HighContrast;
}

/** Minimal shell shown before the server is ready (never a blank panel). */
function placeholderHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>html,body{height:100%;margin:0;background:var(--vscode-editor-background)}</style>
</head>
<body>${statusChromeHtml()}
<script>
(function(){
  var overlay = document.getElementById("dsh-overlay");
  var msg = document.getElementById("dsh-msg");
  var btn = document.getElementById("dsh-start");
  overlay.hidden = false;
  msg.textContent = ${JSON.stringify(t("overlay.stopped"))};
  btn.style.display = "inline-block";
})();
</script>
</body>
</html>`;
}

/** Overlay + status listener injected into the assembled document (T9). */
function statusChromeHtml(): string {
  return `
<style>
#dsh-overlay{position:fixed;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;
background:var(--vscode-editor-background);color:var(--vscode-foreground);
font-family:var(--vscode-font-family);font-size:13px;text-align:center;padding:24px;z-index:9999}
#dsh-overlay[hidden]{display:none}
#dsh-start{background:var(--vscode-button-background);color:var(--vscode-button-foreground);
border:none;border-radius:3px;padding:6px 16px;font-family:var(--vscode-font-family);font-size:13px;cursor:pointer}
#dsh-start:hover{background:var(--vscode-button-hoverBackground)}
</style>
<div id="dsh-overlay" hidden>
  <div id="dsh-msg">DeepSeek Harness</div>
  <button id="dsh-start" style="display:none">${t("button.start")}</button>
</div>
<script>
(function(){
  var overlay = document.getElementById("dsh-overlay");
  var msg = document.getElementById("dsh-msg");
  var btn = document.getElementById("dsh-start");
  var vscode = acquireVsCodeApi();
  btn.onclick = function () { vscode.postMessage({ type: "start" }); };
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.type !== "server-status") return;
    if (m.state === "ready") { overlay.hidden = true; return; }
    overlay.hidden = false;
    btn.style.display = m.state === "stopped" || m.state === "error" ? "inline-block" : "none";
    if (m.state === "starting") msg.textContent = ${JSON.stringify(t("overlay.starting"))};
    else if (m.state === "stopped") msg.textContent = ${JSON.stringify(t("overlay.stopped"))};
    else if (m.state === "error") msg.textContent = ${JSON.stringify(t("overlay.error", { message: "{message}" }))}.replace("{message}", m.message || "unknown");
  });
})();
</script>`;
}

/** One editor-tab WebviewPanel hosting the DSH UI over the transport bridge. */
export class DshPanel {
  public static readonly viewType = "deepseek-harness.panel";

  private panel?: vscode.WebviewPanel;
  private bridge?: BridgeHost;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DshServerManager
  ) {
    // Only mirror state into the overlay/placeholder; the extension drives
    // panel (re)assembly AFTER theme sync so the page loads with the right
    // color scheme (R7 ordering fix, 2026-08-17).
    manager.on("state", (info: ServerInfo) => {
      this.postStatus(info);
    });
    // Live theme switch: the embedded client resolves "system" via the
    // matchMedia shim, so push the VS Code theme without a page reload.
    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme((e) => {
        const dark =
          e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast;
        this.panel?.webview.postMessage({ type: "theme-preference", dark });
      })
    );
  }

  /** Create the editor tab, or reveal the existing one (re-assembling when ready). */
  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      if (this.manager.state === "ready") void this.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      DshPanel.viewType,
      PANEL_TITLE,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(this.distRootPath())],
      }
    );
    // Tab icon: WebviewPanel.iconPath is a settable property (unlike options).
    panel.iconPath = vscode.Uri.file(path.join(this.context.extensionUri.fsPath, "media", "icon.png"));
    this.panel = panel;
    this.bridge = new BridgeHost(panel.webview, () => this.manager.serverUrl ?? "");

    // View-level commands from the placeholder/overlay chrome.
    panel.webview.onDidReceiveMessage((msg) => {
      const m = msg as { type?: string };
      if (m.type === "start") {
        void this.manager.start({ cwd: workspaceRoot() }).catch(() => {
          /* state machine drives the overlay */
        });
      } else if (m.type === "stop") {
        this.manager.stop();
      }
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.bridge?.dispose();
      this.bridge = undefined;
    });

    panel.webview.html = placeholderHtml();
    this.postStatus({ state: this.manager.state, url: this.manager.serverUrl });
    if (this.manager.state === "ready") void this.refresh();
  }

  /** Reveal the panel if it exists (used by the start command). */
  reveal(): void {
    this.open();
  }

  private distRootPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, DIST_DIR_NAME);
  }

  private async refresh(): Promise<void> {
    const url = this.manager.serverUrl;
    if (!url || !this.panel) return;
    try {
      const bridgeJs = fs.readFileSync(
        path.join(this.context.extensionUri.fsPath, "media", "bridge-client.js"),
        "utf8"
      );
      const webview = this.panel.webview;
      const { html } = await assembleDocument({
        serverBase: url,
        distRootPath: this.distRootPath(),
        asWebviewUri: (p) => webview.asWebviewUri(vscode.Uri.file(p)).toString(),
        bridgeClientJs: bridgeJs,
        cspSource: webview.cspSource,
        themeDark: isDarkTheme(),
        chromeHtml: statusChromeHtml(),
        log: (m) => console.log("[dsh] " + m),
      });
      this.panel.webview.html = html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postStatus({ state: "error", message: msg });
    }
  }

  private postStatus(info: ServerInfo): void {
    this.panel?.webview.postMessage({ type: "server-status", ...info });
  }
}
