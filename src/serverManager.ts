// DshServerManager: spawn `dsh web --port 0`, parse the ready URL from
// stdout, and manage the child lifecycle (SIGTERM + SIGKILL fallback).
// Verified facts: doc/feature/00-dsh-vscode/spike-notes.md S1/S3/S4/S6.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EventEmitter } from "node:events";

export type ServerState = "stopped" | "starting" | "ready" | "stopping" | "error";

export interface ServerInfo {
  state: ServerState;
  url?: string;
  message?: string;
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

const URL_LINE_RE = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/;
const DEFAULT_READY_TIMEOUT_MS = 10_000;
const SIGKILL_GRACE_MS = 6_000;

/** Extract the ready URL from one dsh stdout line, or null. */
export function parseUrlLine(line: string): string | null {
  const m = line.match(URL_LINE_RE);
  return m ? m[1] : null;
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

/** Binary suffixes to probe, per platform (Windows npm shims are .cmd). */
function exeSuffixes(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? ["", ".cmd"] : [""];
}

/** Expand one base path into the platform's binary candidates (dsh / dsh.cmd). */
function exeCandidates(base: string, platform: NodeJS.Platform): string[] {
  return exeSuffixes(platform).map((s) => base + s).filter(Boolean);
}

/**
 * Resolve the dsh binary. Order: $DSH_BIN → npm global → common locations →
 * nvm → npx cache. Platform-aware (Windows npm shims live in %AppData%\npm
 * as `dsh.cmd` and the npx cache under %LocalAppData%\npm-cache). Returns
 * null when nothing is found; the caller then relies on PATH and reports
 * `tried` in the error message.
 * @param home - home directory to scan (injectable for tests).
 * @param platform - target platform (injectable for tests).
 */
export function resolveDshPath(
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform
): { path: string | null; tried: string[] } {
  const isWin = platform === "win32";
  const prefix = npmGlobalPrefix();
  const globalDir = isWin ? prefix : prefix ? path.join(prefix, "bin") : "";

  const candidates = [
    ...exeCandidates(process.env.DSH_BIN ?? "", platform),
    ...(globalDir ? exeCandidates(path.join(globalDir, "dsh"), platform) : []),
    ...(!isWin ? exeCandidates(path.join("/opt/homebrew/bin", "dsh"), platform) : []),
    ...(!isWin ? exeCandidates(path.join("/usr/local/bin", "dsh"), platform) : []),
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
  private killTimer?: NodeJS.Timeout;
  private readyTimer?: NodeJS.Timeout;
  private stdoutBuffer = "";
  private startSettled = false;
  private startResolve?: (url: string) => void;
  private startReject?: (err: Error) => void;

  get state(): ServerState {
    return this._state;
  }

  get serverUrl(): string | undefined {
    return this.url;
  }

  get isRunning(): boolean {
    return this._state === "ready" || this._state === "starting";
  }

  private setState(state: ServerState, info: Omit<ServerInfo, "state"> = {}): void {
    this._state = state;
    if (info.url) this.url = info.url;
    this.emit("state", { state, ...info });
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
    this.emit("log", `spawning ${bin} (version=${version ?? "?"}, cwd=${cwd}, tried=[${resolved.tried.join(", ")}])`);

    this.stdoutBuffer = "";
    this.url = undefined;
    this.startSettled = false;
    this.setState("starting");

    const env = { ...process.env };
    if (opts.dshHome) env.DSH_HOME = opts.dshHome;

    const child = spawn(bin, ["web", "--port", "0", ...(opts.extraArgs ?? [])], {
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
        const url = parseUrlLine(this.stdoutBuffer);
        if (url) this.settleReady(url);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        this.emit("stderr", chunk.toString());
      });
      child.on("error", (err: NodeJS.ErrnoException) => {
        const msg =
          err.code === "ENOENT"
            ? `dsh not found. Tried: ${["PATH", ...resolved.tried].join(", ")}. ` +
              `Install with: npm i -g @deepseek-ai/dsh`
            : err.message;
        this.settleError(new Error(msg));
      });
      child.on("exit", (code, signal) => {
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
    this.child.kill("SIGTERM");
    this.killTimer = setTimeout(() => {
      if (this.child && !this.child.killed) this.child.kill("SIGKILL");
    }, SIGKILL_GRACE_MS);
    this.killTimer.unref();
  }

  private killNow(): void {
    if (this.child && !this.child.killed) this.child.kill("SIGKILL");
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
