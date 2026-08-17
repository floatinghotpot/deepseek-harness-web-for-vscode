// Transport bridge core — vscode-free relay parts (T5/T6), unit-testable with
// plain node:test. BridgeHost (vscode wiring) lives in bridgeHost.ts.
import WebSocket from "ws";

export interface HttpRequestMsg {
  type: "http";
  id: number;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
}

export interface HttpResponseMsg {
  type: "http-res";
  id: number;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer;
}

/** Relay one http request to the server; returns the response payload. */
export async function relayHttp(
  serverBase: string,
  msg: HttpRequestMsg,
  fetchImpl: typeof fetch = fetch
): Promise<HttpResponseMsg> {
  const res = await fetchImpl(serverBase + msg.url, {
    method: msg.method,
    headers: msg.headers,
    body: msg.body as never, // bridge boundary: string | ArrayBuffer
  });
  const buf = await res.arrayBuffer();
  return {
    type: "http-res",
    id: msg.id,
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
    body: buf,
  };
}

/**
 * Relay WebSocket event streams between the webview and the server.
 * Socket ids are the webview-assigned ids (the webview matches responses by
 * the id it minted in `ws-open`).
 */
export class WsRelay {
  private sockets = new Map<number, WebSocket>();

  constructor(
    private post: (msg: unknown) => void,
    private resolveBase: () => string
  ) {}

  open(id: number, path: string): void {
    if (this.sockets.has(id)) return;
    const ws = new WebSocket(this.resolveBase() + path);
    this.sockets.set(id, ws);
    ws.on("open", () => this.post({ type: "ws-open-res", id, ok: true }));
    ws.on("message", (data) => this.post({ type: "ws-frame", id, data: data.toString() }));
    ws.on("close", (code, reason) => {
      this.sockets.delete(id);
      this.post({ type: "ws-close", id, code, reason: reason.toString() });
    });
    ws.on("error", () => {
      if (ws.readyState === WebSocket.OPEN) this.post({ type: "ws-close", id });
      else this.post({ type: "ws-open-res", id, ok: false });
    });
  }

  send(id: number, data: string): void {
    this.sockets.get(id)?.send(data);
  }

  close(id: number): void {
    this.sockets.get(id)?.close();
  }

  dispose(): void {
    for (const ws of this.sockets.values()) ws.close();
    this.sockets.clear();
  }
}
