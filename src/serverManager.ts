// DshServerManager: spawn `dsh web --port 0`, parse the ready URL from
// stdout, and manage the child lifecycle (SIGTERM + SIGKILL fallback).
// Verified facts: doc/feature/00-dsh-vscode/spike-notes.md S1/S3/S4/S6.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { normalizePath } from "./workspaceTracker.js";
import { compareVersions, shouldPassNoOpen } from "./versionCheck.js";

/**
 * Compare two filesystem paths for workspace matching. Normalized comparison
 * first; when that fails, resolve symlinks (macOS /tmp → /private/tmp) and
 * re-compare — DSH stores workspace paths as realpaths, while the extension
 * may hold the symlinked form (feature 01 T7b note, hit in practice).
 */
export function sameFsPath(a: string, b: string): boolean {
  if (normalizePath(a) === normalizePath(b)) return true;
  try {
    return normalizePath(fs.realpathSync(a)) === normalizePath(fs.realpathSync(b));
  } catch {
    return false;
  }
}

export type ServerState = "stopped" | "starting" | "ready" | "stopping" | "error";

export interface ServerInfo {
  state: ServerState;
  url?: string;
  message?: string;
  /** dsh CLI version (resolved at start via `dsh --version`; undefined when unknown). */
  version?: string;
}

export interface StartOptions {
  /** Working directory for the child (defaults to the OS home). */
  cwd?: string;
  /** Override for $DSH_HOME (isolation mode; MVP shares ~/.dsh by default). */
  dshHome?: string;
  /** Ready timeout in ms (default 10s). */
  readyTimeoutMs?: number;
  /** Explicit binary path, bypasses resolution. */
  dshBin?: string;
  /** Extra args appended after `web --port 0`. */
  extraArgs?: string[];
}

/** One session row for the sidebar list (02-session-management T1). */
export interface SessionSummary {
  sessionId: string;
  updatedAt: number;
  running: boolean;
  blank: boolean;
  cwd?: string;
  agentPreset?: string;
  /** `projections.values.title` cell — null when the session is unnamed. */
  title: string | null;
}

// dsh 0.1.2-rc.1 launch line: `dsh web: http://127.0.0.1:<port>/?token=<launchToken>`
// (0.1.1-rc.7 and older print the bare URL). The optional `?token=...` suffix is
// the process launch token that mints the browser-session cookie (`GET /?token=`
// -> 303 + Set-Cookie); the manager must keep it for the exchange, while the
// exposed base URL stays token-free.
const URL_LINE_RE = /dsh web: (http:\/\/127\.0\.0\.1:\d+)(\/\?[^\s]+)?/;
const DEFAULT_READY_TIMEOUT_MS = 10_000;
const SIGKILL_GRACE_MS = 6_000;
// dsh < 0.1.2-rc.1 speaks the pre-Typert RPC surface (dot methods, no browser
// cookie auth); 0.1.2-rc.1 reworked both, so older CLIs are unsupported.
const MIN_DSH_VERSION = "0.1.2-rc.1";
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export interface WorkspaceEntry {
  workspaceId: string;
  path: string;
  sessionIds: string[];
}

export interface WorkspaceSnapshot {
  items: WorkspaceEntry[];
  archivedSessionIds: string[];
}

/**
 * Parse one dsh stdout line into the ready URL. Returns the base URL and,
 * when the 0.1.2+ launch line carries one, the token-bearing authenticated
 * URL used to mint the browser-session cookie. null when the line is not the
 * ready line.
 */
export function parseReadyLine(line: string): { url: string; authUrl?: string } | null {
  const m = line.match(URL_LINE_RE);
  if (!m) return null;
  const url = m[1];
  const authUrl = m[2] ? url + m[2] : undefined;
  return authUrl ? { url, authUrl } : { url };
}

/** Extract the ready URL from one dsh stdout line, or null (legacy accessor). */
export function parseUrlLine(line: string): string | null {
  return parseReadyLine(line)?.url ?? null;
}

/** Minimal WebSocket surface the Typert stream opener needs (ws-compatible). */
export interface StreamWebSocket {
  on(event: string, listener: (...args: any[]) => void): unknown;
  send(data: string): unknown;
  terminate(): void;
}

export type StreamWebSocketCtor = new (url: string, opts?: { headers?: Record<string, string> }) => StreamWebSocket;

/**
 * Open one Typert Remote STREAM over the /api/remote.mux WebSocket and resolve
 * with its first item frame (or reject on stream error). Used for
 * `workspace/follow`, whose baseline frame carries what pre-0.1.2 `workspace.list`
 * returned ({items, archivedSessionIds}) — 0.1.2 has no unary workspace list.
 * @param wsCtor - WebSocket implementation (injectable for tests).
 * @param cookie - browser-session cookie (name=value) minted at start.
 */
export function openStreamFirstFrame(
  wsCtor: StreamWebSocketCtor,
  url: string,
  cookie: string | undefined,
  endpoint: string,
  args: Record<string, unknown>,
  timeoutMs = 8000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let ws: StreamWebSocket | undefined;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws?.terminate();
      reject(new Error(`dsh stream ${endpoint} timed out`));
    }, timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      try {
        ws?.terminate();
      } catch {
        /* ignore */
      }
    };
    try {
      ws = new wsCtor(url, cookie ? { headers: { cookie } } : undefined);
    } catch (err) {
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    ws.on("open", () => {
      ws?.send(JSON.stringify({ type: "open", streamId: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, endpoint, payload: { args } }));
    });
    ws.on("message", (raw: unknown) => {
      if (settled) return;
      let msg: { type?: string; value?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(String(raw));
      } catch (err) {
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      if (msg.type === "item") {
        settled = true;
        cleanup();
        resolve(msg.value);
      } else if (msg.type === "error") {
        settled = true;
        cleanup();
        reject(new Error(msg.error?.message ?? `dsh stream ${endpoint} failed`));
      }
      // "end" before any item: the stream carried nothing.
      if (msg.type === "end") {
        settled = true;
        cleanup();
        reject(new Error(`dsh stream ${endpoint} ended without a frame`));
      }
    });
    ws.on("error", (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(`dsh stream ${endpoint} failed: ${String(err)}`));
    });
    ws.on("close", () => {
      if (settled) return;
      settled = true;
      reject(new Error(`dsh stream ${endpoint} closed before a frame`));
    });
  });
}

/** First existing file among candidates; a `*` segment expands to ALL
 *  matches and the NEWEST (by mtime) wins — npx caches hold several dsh
 *  versions under different hash dirs, and the newest is the sane pick. */
function firstExisting(patterns: string[]): string | undefined {
  for (const p of patterns) {
    if (!p) continue;
    if (p.includes("*")) {
      const starIdx = p.indexOf("*");
      const dir = p.slice(0, starIdx).replace(/\/+$/, "");
      const suffix = p.slice(starIdx + 1);
      const matches: string[] = [];
      try {
        for (const name of fs.readdirSync(dir)) {
          const candidate = path.join(dir, name) + suffix;
          if (fs.existsSync(candidate)) matches.push(candidate);
        }
      } catch {
        /* keep looking */
      }
      if (matches.length > 0) {
        matches.sort((a, b) => (fs.statSync(b).mtimeMs ?? 0) - (fs.statSync(a).mtimeMs ?? 0));
        return matches[0];
      }
    } else if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

/** npm global prefix (no `bin` suffix — added per platform by callers). */
function npmGlobalPrefix(): string {
  try {
    const res = spawnSync("npm", ["prefix", "-g"], { encoding: "utf8" });
    if (res.status === 0 && res.stdout) return res.stdout.trim();
  } catch {
    /* ignore */
  }
  return "";
}

/** `dsh --version` via the resolved binary, or null when it fails. */
export function resolveDshVersion(bin: string): string | null {
  const isWin = process.platform === "win32";
  try {
    const res = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 5000, shell: isWin });
    if (res.status === 0 && res.stdout) return res.stdout.trim().split("\n")[0];
  } catch {
    /* ignore */
  }
  return null;
}

const noOpenProbeCache = new Map<string, boolean | null>();

/**
 * Probe whether the installed `dsh web` accepts `--no-open` by reading its own
 * `--help` output. The flag belongs to dsh-web-app (introduced rc.8), NOT the
 * dsh CLI — the CLI version cannot tell which web-app rc an npx cache
 * resolved ("CLI rc.7 + web-app rc.8" mixes exist and would wrongly skip the
 * flag → dsh auto-opens a browser), and passing the unknown option on old
 * web-apps makes commander exit and kills startup. The live `--help` text is
 * authoritative regardless of the CLI/web-app pairing. Returns null when the
 * probe itself fails (missing binary, timeout) — callers fall back to the
 * CLI-version gate.
 */
export function probeNoOpenSupport(bin: string): boolean | null {
  if (noOpenProbeCache.has(bin)) return noOpenProbeCache.get(bin)!;
  let result: boolean | null = null;
  try {
    const res = spawnSync(bin, ["web", "--help"], { encoding: "utf8", timeout: 5000, shell: process.platform === "win32" });
    // status === 0 means the probe ran (empty help output is still a valid
    // "no --no-open" answer); only a failed/never-started probe yields null.
    if (res.status === 0) result = /--no-open/.test(res.stdout ?? "");
  } catch {
    /* keep null */
  }
  noOpenProbeCache.set(bin, result);
  return result;
}

/** Binary suffixes to probe, per platform (Windows npm shims are .cmd). */
function exeSuffixes(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? ["", ".cmd"] : [""];
}

/** Expand one base path into the platform's binary candidates (dsh / dsh.cmd). */
function exeCandidates(base: string, platform: NodeJS.Platform): string[] {
  return exeSuffixes(platform).map((s) => base + s).filter(Boolean);
}

/**
 * Options controlling which install locations resolveDshPath probes.
 */
export interface ResolveDshPathOptions {
  /**
   * Probe system-level install locations too: the live `npm prefix -g` bin
   * and the well-known /opt/homebrew/bin and /usr/local/bin (default true).
   * Pass false to resolve purely under `home` — needed by unit tests, which
   * inject a temp home but cannot remove a real global dsh from the machine
   * (it would otherwise shadow every home-scoped candidate).
   */
  systemPaths?: boolean;
}

/**
 * Resolve the dsh binary. Order: $DSH_BIN → npm global → common locations →
 * nvm → npx cache. Platform-aware (Windows npm shims live in %AppData%\npm
 * as `dsh.cmd` and the npx cache under %LocalAppData%\npm-cache). Returns
 * null when nothing is found; the caller then relies on PATH and reports
 * `tried` in the error message.
 * @param home - home directory to scan (injectable for tests).
 * @param platform - target platform (injectable for tests).
 * @param opts - resolution options (injectable for tests).
 */
export function resolveDshPath(
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
  opts: ResolveDshPathOptions = {}
): { path: string | null; tried: string[] } {
  const isWin = platform === "win32";
  const includeSystem = opts.systemPaths !== false;
  const prefix = includeSystem ? npmGlobalPrefix() : "";
  const globalDir = isWin ? prefix : prefix ? path.join(prefix, "bin") : "";

  const candidates = [
    ...exeCandidates(process.env.DSH_BIN ?? "", platform),
    ...(includeSystem && globalDir ? exeCandidates(path.join(globalDir, "dsh"), platform) : []),
    ...(includeSystem && !isWin ? exeCandidates(path.join("/opt/homebrew/bin", "dsh"), platform) : []),
    ...(includeSystem && !isWin ? exeCandidates(path.join("/usr/local/bin", "dsh"), platform) : []),
    ...exeCandidates(path.join(home, ".npm-global/bin", "dsh"), platform),
    ...(!isWin ? exeCandidates(path.join(home, ".nvm/versions/node/*/bin/dsh"), platform) : []),
    ...exeCandidates(
      isWin
        ? path.join(home, "AppData", "Local", "npm-cache", "_npx", "*", "node_modules", ".bin", "dsh")
        : path.join(home, ".npm", "_npx", "*", "node_modules", ".bin", "dsh"),
      platform
    ),
  ].filter(Boolean);
  const found = firstExisting(candidates);
  return {
    path: found ?? null,
    tried: candidates.map((c) => c.replace(home, "~")),
  };
}

/**
 * Owns one `dsh web` child process. Emits:
 *  - "state" ({state, url?, message?}) on every transition
 *  - "stderr" (string) forwarded diagnostics
 *  - "exit" ({code, signal})
 */
export class DshServerManager extends EventEmitter {
  private child?: ChildProcess;
  private _state: ServerState = "stopped";
  private url?: string;
  private _version?: string;
  private _binPath?: string;
  private killTimer?: NodeJS.Timeout;
  private readyTimer?: NodeJS.Timeout;
  private stdoutBuffer = "";
  private startSettled = false;
  private startResolve?: (url: string) => void;
  private startReject?: (err: Error) => void;
  /** Full launch line URL including ?token= (0.1.2+); undefined on older dsh. */
  private authUrl?: string;
  /** Browser-session cookie (name=value) minted from the launch token. */
  private authCookie?: string;
  /** WebSocket implementation for Typert stream opens (injectable for tests). */
  private wsCtor: StreamWebSocketCtor = WebSocket as unknown as StreamWebSocketCtor;

  get state(): ServerState {
    return this._state;
  }

  get serverUrl(): string | undefined {
    return this.url;
  }

  /** Browser-session cookie (name=value) minted at start (0.1.2+ auth), or undefined. */
  get authCookieHeader(): string | undefined {
    return this.authCookie;
  }

  /**
   * URL for a REAL browser tab ("Open View"): carries the launch token so the
   * browser can mint its own cookie. The base serverUrl alone would 401.
   */
  get browserUrl(): string | undefined {
    return this.authUrl ?? this.url;
  }

  /** dsh CLI version resolved at start (undefined until a start ran / on failure). */
  get dshVersion(): string | undefined {
    return this._version;
  }

  /** Resolved dsh binary path used for the last start (undefined before start). */
  get dshBinPath(): string | undefined {
    return this._binPath;
  }

  get isRunning(): boolean {
    return this._state === "ready" || this._state === "starting";
  }

  private setState(state: ServerState, info: Omit<ServerInfo, "state"> = {}): void {
    const prev = this._state;
    this._state = state;
    if (info.url) this.url = info.url;
    // Sleep/wake diagnostics (2026-08-21): log every state transition with the
    // child pid, so a laptop-sleep repro shows exactly when/why the manager
    // left "ready" (ext-host restart vs child exit vs stop()).
    console.log(`[dsh] state ${prev} -> ${state}${info.url ? ` url=${info.url}` : ""}${info.message ? ` msg=${info.message}` : ""} pid=${this.child?.pid ?? "-"}`);
    this.emit("state", { state, ...info, ...(this._version ? { version: this._version } : {}) });
  }

  /** Start `dsh web --port 0`; resolves with the ready URL, rejects on failure/timeout. */
  start(opts: StartOptions = {}): Promise<string> {
    if (this.child && !this.child.killed) {
      if (this.url) return Promise.resolve(this.url);
      return Promise.reject(new Error("dsh is already starting"));
    }
    const resolved = resolveDshPath();
    const bin = opts.dshBin ?? resolved.path ?? "dsh";
    const cwd = opts.cwd ?? os.homedir();
    const readyTimeoutMs = opts.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;

    // Launch diagnostic: which binary, which version.
    const version = resolveDshVersion(bin);
    this._version = version ?? undefined;
    this._binPath = bin;
    // Sleep/wake diagnostics: log every start() entry with the current state
    // so we can tell a fresh instance's start from a same-instance restart.
    console.log(`[dsh] start() called: bin=${bin} prevState=${this._state} cwd=${cwd}`);
    this.emit("log", `spawning ${bin} (version=${version ?? "?"}, cwd=${cwd}, tried=[${resolved.tried.join(", ")}])`);

    // Version floor: dsh 0.1.2-rc.1 reworked the Web surface (launch-token
    // cookie auth, Typert namespace/method RPC, new dist layout). Older CLIs
    // speak the pre-0.1.2 surface the extension no longer supports — fail
    // loudly instead of booting into a half-broken state.
    if (version && VERSION_RE.test(version.trim()) && compareVersions(version, MIN_DSH_VERSION) < 0) {
      const msg = `dsh ${version} is not supported — DeepSeek Harness for VS Code requires dsh ${MIN_DSH_VERSION} or newer. Upgrade with: npm i -g @deepseek-ai/dsh@latest`;
      console.log(`[dsh] ${msg}`);
      this.emit("log", msg);
      this.setState("error", { message: msg });
      return Promise.reject(new Error(msg));
    }

    this.stdoutBuffer = "";
    this.url = undefined;
    this.authUrl = undefined;
    this.authCookie = undefined;
    this.startSettled = false;
    this.setState("starting");

    const env = { ...process.env };
    if (opts.dshHome) env.DSH_HOME = opts.dshHome;

    const args = ["web", "--port", "0"];
    // rc.8+ auto-opens the default browser (openBrowser default true); the
    // embedded-UI use case must suppress it. The --no-open flag is owned by
    // dsh-web-app, not the CLI, so decide by probing the live `web --help`
    // (authoritative even under a CLI/web-app rc mismatch); when the probe
    // itself fails, fall back to the CLI-version gate (03-upgrade-channels R1).
    const noOpenProbe = probeNoOpenSupport(bin);
    const passNoOpen = noOpenProbe ?? shouldPassNoOpen(version ?? undefined);
    if (passNoOpen) args.push("--no-open");
    args.push(...(opts.extraArgs ?? []));

    const child = spawn(bin, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      // Windows npm shims are .cmd/.bat — Node needs a shell to run them.
      shell: process.platform === "win32",
    });
    this.child = child;

    return new Promise<string>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;

      child.stdout?.on("data", (chunk: Buffer) => {
        this.stdoutBuffer += chunk.toString();
        const parsed = parseReadyLine(this.stdoutBuffer);
        if (parsed) this.onReadyLine(parsed);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        this.emit("stderr", chunk.toString());
      });
      child.on("error", (err: NodeJS.ErrnoException) => {
        // Sleep/wake diagnostics: an "error" event without exit is a signal
        // hiccup (e.g. EINTR after SIGSTOP/CONT during laptop sleep).
        console.log(`[dsh] child error pid=${child.pid} code=${err.code} msg=${err.message}`);
        const msg =
          err.code === "ENOENT"
            ? `dsh not found. Tried: ${["PATH", ...resolved.tried].join(", ")}. ` +
              `Install with: npm i -g @deepseek-ai/dsh`
            : err.message;
        this.settleError(new Error(msg));
      });
      child.on("exit", (code, signal) => {
        // Sleep/wake diagnostics: exit during sleep is the prime suspect — log
        // the previous state so we can see whether "ready" was lost.
        console.log(`[dsh] child exit pid=${child.pid} code=${code} signal=${signal} prevState=${this._state}`);
        this.clearKillTimer();
        const prev = this._state;
        if (prev === "ready") {
          this.setState("error", { message: `dsh exited unexpectedly (code=${code}, signal=${signal})` });
        } else if (prev === "starting") {
          this.settleError(new Error(`dsh exited before ready (code=${code}, signal=${signal})`));
        } else if (prev === "stopping") {
          this.setState("stopped");
        }
        this.child = undefined;
        this.url = undefined; // never expose a dead server URL
        this.emit("exit", { code, signal });
      });

      this.readyTimer = setTimeout(() => {
        this.settleError(new Error(`dsh did not become ready within ${readyTimeoutMs}ms`));
        this.killNow();
      }, readyTimeoutMs);
    });
  }

  /**
   * A ready line arrived. When the 0.1.2+ launch line carries ?token=, mint
   * the browser-session cookie BEFORE declaring ready, so every consumer
   * (panel assembly, bridge relay, host RPC) already holds it. A failed
   * exchange does not block readiness — the manager degrades to cookie-less
   * mode and the caller surfaces the resulting 401s.
   */
  private onReadyLine(parsed: { url: string; authUrl?: string }): void {
    if (this.startSettled) return;
    if (parsed.authUrl) {
      this.authUrl = parsed.authUrl;
      void this.completeStartWithAuth(parsed.url);
    } else {
      this.settleReady(parsed.url);
    }
  }

  private async completeStartWithAuth(base: string): Promise<void> {
    const authUrl = this.authUrl;
    if (!authUrl) {
      this.settleReady(base);
      return;
    }
    await this.exchangeCookie(authUrl);
    this.settleReady(base);
  }

  /**
   * Exchange the launch token for the authority-bound browser-session cookie:
   * `GET /?token=<launchToken>` responds 303 with Set-Cookie (mint). Uses
   * node:http (not fetch) because fetch's redirect:"manual" returns an
   * opaque-redirect response whose headers are unreadable. Best-effort — a
   * failure only logs and leaves the manager cookie-less.
   */
  private exchangeCookie(authUrl: string): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      let req: http.ClientRequest;
      try {
        const u = new URL(authUrl);
        req = http.get(
          { hostname: u.hostname, port: u.port, path: `${u.pathname}${u.search}`, headers: { "user-agent": "dsh-vscode-extension" } },
          (res) => {
            res.resume(); // drain; we only need the Set-Cookie header
            const setCookies = res.headers["set-cookie"];
            const first = Array.isArray(setCookies) ? setCookies[0] : setCookies;
            if (typeof first === "string" && first.includes("=")) {
              this.authCookie = first.split(";", 1)[0];
              console.log(`[dsh] browser-session cookie minted (authority=${u.host})`);
            } else {
              console.log(`[dsh] cookie exchange: no set-cookie on ${res.statusCode} (auth url malformed?)`);
            }
            done();
          }
        );
        req.setTimeout(5000, () => {
          req.destroy();
          done();
        });
        req.on("error", (err) => {
          console.log(`[dsh] cookie exchange failed: ${err.message}`);
          done();
        });
      } catch (err) {
        console.log(`[dsh] cookie exchange failed: ${err instanceof Error ? err.message : String(err)}`);
        done();
      }
    });
  }

  private settleReady(url: string): void {
    if (this.startSettled) return;
    this.startSettled = true;
    this.clearReadyTimer();
    this.setState("ready", { url });
    this.startResolve?.(url);
  }

  private settleError(err: Error): void {
    if (this.startSettled) return;
    this.startSettled = true;
    this.clearReadyTimer();
    this.setState("error", { message: err.message });
    this.startReject?.(err);
  }

  /** Settle a pending start() without emitting an "error" state transition. */
  private abortStart(err: Error): void {
    if (this.startSettled) return;
    this.startSettled = true;
    this.clearReadyTimer();
    this.startReject?.(err);
  }

  /**
   * One Typert unary RPC call: POST /api/<namespace>/<method> with the
   * client-request envelope whose payload wraps the named call arguments as
   * { args } (0.1.2+ wire shape; pre-0.1.2 sent the args flat under a dot
   * method and is no longer supported). Attaches the browser-session cookie
   * minted at start. Throws with the DSH error `code` attached when the
   * result is not ok.
   */
  private async api(endpoint: string, args: Record<string, unknown>): Promise<any> {
    const base = this.url;
    if (!base) throw new Error("dsh is not ready");
    const res = await fetch(`${base}/api/${endpoint}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.authCookie ? { cookie: this.authCookie } : {}),
      },
      body: JSON.stringify({
        type: "client-request",
        rpcId: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        method: endpoint,
        payload: { args },
      }),
    });
    const body: any = await res.json();
    if (!body?.result?.ok) {
      const err: Error & { code?: string } = new Error(
        `${endpoint} failed: ${body?.result?.error?.message ?? "unknown"}`
      );
      err.code = body?.result?.error?.code ?? undefined;
      throw err;
    }
    return body.result.value;
  }

  /**
   * Snapshot every DSH workspace + archived session ids. 0.1.2 has no unary
   * "workspace.list": the live `workspace/follow` stream's first frame is a
   * baseline {items, archivedSessionIds} (the pre-0.1.2 workspace.list shape).
   * Test seam: override workspaceSnapshot in unit tests (JS).
   */
  async workspaceSnapshot(): Promise<WorkspaceSnapshot> {
    const base = this.url;
    if (!base) throw new Error("dsh is not ready");
    const frame = await openStreamFirstFrame(this.wsCtor, `${base}/api/remote.mux`, this.authCookie, "workspace/follow", {});
    const baseline = (frame as { type?: string; value?: WorkspaceSnapshot } | undefined)?.value;
    if (!baseline) throw new Error("workspace/follow baseline missing");
    return baseline;
  }

  /** session.list rows (0.1.2: empty `_request` object, rows carry projections). */
  private async listSessions(): Promise<any[]> {
    const value = await this.api("session/list", { _request: {} });
    return (value?.items ?? []) as any[];
  }

  /**
   * Ensure the IDE workspace exists as a DSH workspace with at least one
   * session, and return a sessionId bound to it. Used by the UI-alignment
   * path (req R2 / T7b): the DSH frontend picks its initial workspace from the
   * "most recently active" session unless we preset `dsh.sessions.current`,
   * so we must first guarantee a session exists FOR THIS workspace.
   *
   * NOTE: session.create MUST use workspaceId — the {cwd} form creates a
   * session whose cwd is right but does NOT attach it to workspace.sessionIds
   * (spike finding, discussion.md §2.4).
   */
  async ensureWorkspaceSession(cwd: string): Promise<string> {
    // 1. Find an existing workspace whose path matches (realpath-normalized).
    const snap = await this.workspaceSnapshot();
    const target = snap.items.find((w) => sameFsPath(w.path, cwd));
    const workspace = target ?? (await this.api("workspace/create", { request: { path: cwd } })).workspace;
    // Reuse ANY bound, non-archived session (blank included): previously we
    // skipped blank sessions, so every ready cycle created a new one when the
    // user had never chatted — accumulating a pile of same-titled sessions
    // (F5 finding, 2026-08-19). New sessions are created explicitly via the
    // sidebar's ＋New session button.
    const archivedSet = new Set<string>(snap.archivedSessionIds ?? []);
    const sessions = await this.listSessions();
    const bound = sessions.find(
      (s: any) => workspace.sessionIds.includes(s.sessionId) && !archivedSet.has(s.sessionId)
    );
    if (bound) return bound.sessionId;
    // 2. No usable session yet — create one bound to this workspace.
    return (await this.api("session/create", { request: { workspaceId: workspace.workspaceId } })).sessionId;
  }

  /**
   * Sessions belonging to the workspace at `cwd` (matched by normalized path),
   * plus full summaries of the workspace's ARCHIVED sessions (so the sidebar
   * can expand an "Archived" section with titles, not just ids). Filtering
   * here keeps the list scoped to the IDE workspace (req R1).
   */
  async listWorkspaceSessions(
    cwd: string
  ): Promise<{ items: SessionSummary[]; archivedItems: SessionSummary[] }> {
    const snap = await this.workspaceSnapshot();
    const target = snap.items.find((w) => sameFsPath(w.path, cwd));
    if (!target) return { items: [], archivedItems: [] };
    const ids = new Set<string>(target.sessionIds ?? []);
    // DSH's archive is append-only (archivedSessionIds) and does NOT remove
    // the session from workspace.sessionIds — hide archived ones from the
    // active list ourselves so the sidebar's recycle bin behaves as expected.
    const archivedSet = new Set<string>(snap.archivedSessionIds ?? []);
    const list = await this.listSessions();
    const toSummary = (s: any): SessionSummary => ({
      sessionId: s.sessionId,
      updatedAt: s.updatedAt,
      running: s.running,
      blank: s.blank,
      cwd: s.cwd,
      // 0.1.2 moved agentPreset into projections.values (create returns it
      // top-level, list rows do not) — read either home defensively.
      agentPreset: s.projections?.values?.agentPreset ?? s.agentPreset,
      title: s.projections?.values?.title ?? null,
    });
    const items: SessionSummary[] = list
      // Every ACTIVE session of this workspace, blank or not — blank ones are
      // labelled "New Session" (with the row's relative time to tell them
      // apart) on the UI side, so nothing is hidden (user preference).
      .filter((s: any) => ids.has(s.sessionId) && !archivedSet.has(s.sessionId))
      .map(toSummary);
    const archivedItems: SessionSummary[] = list
      .filter((s: any) => ids.has(s.sessionId) && archivedSet.has(s.sessionId))
      .map(toSummary);
    return { items, archivedItems };
  }

  /** Create a session bound to a workspace; returns the new sessionId. */
  async createSession(workspaceId: string): Promise<string> {
    const value = await this.api("session/create", { request: { workspaceId } });
    return value.sessionId;
  }

  /** Workspace id for `cwd`, creating the workspace when missing. */
  async workspaceIdFor(cwd: string): Promise<string> {
    const snap = await this.workspaceSnapshot();
    const target = snap.items.find((w) => sameFsPath(w.path, cwd));
    if (target) return target.workspaceId;
    const created = await this.api("workspace/create", { request: { path: cwd } });
    return created.workspace.workspaceId;
  }

  /** Rename a session (session/rename); throws with code "title-invalid" on rejection. */
  async renameSession(sessionId: string, title: string): Promise<{ title: string; seq: number }> {
    const value = await this.api("session/rename", { request: { sessionId, title } });
    return { title: value.title, seq: value.seq };
  }

  /**
   * Archive a session (workspace/archiveSession): it leaves the workspace's
   * active list and joins archivedSessionIds. Returns the full archive set.
   */
  async archiveSession(sessionId: string): Promise<string[]> {
    const value = await this.api("workspace/archiveSession", { request: { sessionId } });
    return value.archivedSessionIds ?? [];
  }

  /** SIGTERM, escalate to SIGKILL after a grace period. */
  stop(): void {
    // If a start() is still pending (e.g. stopped during the ready window),
    // settle it now so its ready timeout cannot later flip "stopped" to "error".
    this.abortStart(new Error("dsh stopped before ready"));
    if (!this.child || this.child.killed) {
      if (this._state !== "stopped") this.setState("stopped");
      return;
    }
    this.setState("stopping");
    this.terminateChild(this.child);
    this.killTimer = setTimeout(() => {
      if (this.child && !this.child.killed) this.terminateChild(this.child);
    }, SIGKILL_GRACE_MS);
    this.killTimer.unref();
  }

  private killNow(): void {
    if (this.child && !this.child.killed) this.terminateChild(this.child);
  }

  /**
   * Terminate the child. POSIX: SIGTERM (dsh handles it gracefully). Windows:
   * `shell: true` wraps dsh in cmd.exe, which does not forward signals — kill
   * the whole tree with taskkill /T /F so no orphaned node process leaks and
   * holds file handles.
   */
  private terminateChild(child: ChildProcess): void {
    if (process.platform === "win32" && child.pid) {
      try {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        child.kill();
      }
    } else {
      child.kill("SIGTERM");
    }
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = undefined;
  }

  private clearKillTimer(): void {
    if (this.killTimer) clearTimeout(this.killTimer);
    this.killTimer = undefined;
  }
}
