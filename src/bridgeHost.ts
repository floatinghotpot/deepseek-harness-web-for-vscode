// Transport bridge — extension host wiring (T5/T6/T7).
// Receives webview postMessages, relays them to the local dsh server as Node
// requests (no browser headers -> the /api trust fence lets them through,
// spike-notes S2), and posts responses back. Pure relay parts live in
// bridgeCore.ts (vscode-free, unit-tested).
import * as vscode from "vscode";
import { relayHttp, WsRelay, type HttpRequestMsg } from "./bridgeCore.js";

/**
 * Wires one webview to the DSH server: forwards http / ws / clipboard
 * messages. `resolveBase` returns the current server base (it may change
 * when the server restarts on a new port).
 */
export class BridgeHost {
  private wsRelay: WsRelay;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private webview: vscode.Webview,
    private resolveBase: () => string,
    private fetchImpl: typeof fetch = fetch
  ) {
    this.wsRelay = new WsRelay((msg) => this.webview.postMessage(msg), resolveBase);
    this.disposables.push(
      webview.onDidReceiveMessage((msg) => {
        void this.handle(msg);
      })
    );
  }

  private async handle(msg: unknown): Promise<void> {
    if (!msg || typeof msg !== "object") return;
    const m = msg as Record<string, unknown>;
    try {
      switch (m.type) {
        case "http": {
          const req = m as unknown as HttpRequestMsg;
          const res = await relayHttp(this.resolveBase(), req, this.fetchImpl);
          if (res.status >= 400) {
            console.log(`[dsh] relay ${req.method} ${req.url} -> HTTP ${res.status}`);
          }
          this.webview.postMessage(res);
          break;
        }
        case "http-abort":
          // Best-effort: the relay fetch is bounded by the client's 30s
          // timeout; a late response is simply ignored by the webview.
          break;
        case "ws-open":
          this.wsRelay.open(Number(m.id), String(m.path));
          break;
        case "ws-send":
          this.wsRelay.send(Number(m.id), String(m.data));
          break;
        case "ws-close":
          this.wsRelay.close(Number(m.id));
          break;
        case "clipboard-write":
          try {
            await vscode.env.clipboard.writeText(String(m.text));
            this.webview.postMessage({ type: "clipboard-res", id: m.id, ok: true });
          } catch (err) {
            this.webview.postMessage({ type: "clipboard-res", id: m.id, ok: false, message: String(err) });
          }
          break;
        case "clipboard-read":
          try {
            const text = await vscode.env.clipboard.readText();
            this.webview.postMessage({ type: "clipboard-res", id: m.id, ok: true, text });
          } catch (err) {
            this.webview.postMessage({ type: "clipboard-res", id: m.id, ok: false, message: String(err) });
          }
          break;
        default:
          break;
      }
    } catch (err) {
      this.webview.postMessage({
        type: "http-err",
        id: (m.id as number | undefined) ?? -1,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  dispose(): void {
    this.wsRelay.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
