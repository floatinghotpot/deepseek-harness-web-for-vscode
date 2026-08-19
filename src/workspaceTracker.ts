// Workspace-alignment decisions (01-workspace-alignment T1/T7a). vscode-free
// pure functions: path normalization for cross-platform comparison, the
// "auto-restart on reload?" decision fed by workspaceState (review A-1/A-3),
// and the session-preset payload that drives the DSH frontend to show the
// IDE workspace (req R2, spike-verified: discussion.md §2.4).
import * as path from "node:path";

/**
 * Normalize a workspace path for comparison: resolve it (removes trailing
 * separators, `.`/`..`), and lower-case on win32 so drive-letter case
 * (`C:\a` vs `c:\a`) cannot flip a comparison. `platform` is injectable so
 * tests can exercise the win32 branch on any host.
 */
export function normalizePath(p: string, platform: NodeJS.Platform = process.platform): string {
  let normalized = path.resolve(p);
  if (platform === "win32") normalized = normalized.toLowerCase();
  return normalized;
}

/**
 * Should the extension auto-restart dsh on activation? Reads the
 * workspace-scoped "was running" flag: because `workspaceState` is keyed by
 * the current workspace, a reload of the SAME folder keeps the record
 * (→ restart), while opening a DIFFERENT folder has no record (→ cold start).
 */
export function shouldAutoRestart(wasRunning: boolean | undefined): boolean {
  return wasRunning === true;
}

/**
 * Build the localStorage value written into `dsh.sessions.current` before the
 * DSH frontend boots, so it selects the IDE workspace's session instead of the
 * "most recently active" one. Shape matches what the DSH client persists and
 * rehydrates (dsh-client-runtime/lib/client.js:8904 persist name, :9275 write
 * shape {sessionId, subagentAddress?}).
 */
export function buildSessionPresetPayload(sessionId: string): string {
  return JSON.stringify({ sessionId });
}

/**
 * Display title for one session row, mirroring the DSH frontend's
 * `displayTitleOf` precedence (durable title → cwd basename → session id,
 * dsh-client-runtime/lib/client.js:8828). `title` is the
 * `projections.values.title` cell (null when the session is unnamed).
 */
export function sessionTitleOf(
  title: string | null | undefined,
  cwd: string | undefined,
  sessionId: string
): string {
  if (typeof title === "string" && title.trim() !== "") return title;
  if (cwd) {
    const base = path.basename(cwd);
    if (base) return base;
  }
  return sessionId;
}

