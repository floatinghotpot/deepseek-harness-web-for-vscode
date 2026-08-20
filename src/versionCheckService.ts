// dsh version soft-check service (G-03). VS Code wiring: background registry
// check gated to once per 24h (update-notifier pattern), cached latest version,
// and the upgrade interaction (QuickPick → integrated terminal prefilled, never
// auto-run). Pure logic lives in versionCheck.ts (unit-tested).
import * as vscode from "vscode";
import { isUpdateAvailable, shouldCheckVersion, upgradeCommandFor } from "./versionCheck.js";
import { t } from "./i18n.js";

const LAST_CHECK_KEY = "dsh.lastVersionCheck";
const LATEST_KEY = "dsh.latestVersion";
const NEXT_KEY = "dsh.nextVersion";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REGISTRY_URL = "https://registry.npmjs.org/@deepseek-ai/dsh";
const FETCH_TIMEOUT_MS = 5000;

export type UpgradeChannel = "latest" | "next";

export interface UpgradeInfo {
  /** Latest stable version known from the registry (undefined when not checked). */
  latest?: string;
  /** Latest prerelease version from the `next` dist-tag (undefined when absent). */
  next?: string;
  /** Recommended upgrade command for the current install method + channel. */
  commandFor: (channel: UpgradeChannel) => string | null;
}

/**
 * Check the npm registry for the latest dsh version, honoring the 24h gate.
 * Never throws: network/parse failures silently skip (offline = no nagging).
 * Persists lastCheck + latest in workspaceState so the gate survives reloads.
 */
export async function checkForUpdates(
  context: vscode.ExtensionContext,
  dshPath: string | undefined,
  currentVersion: string | undefined,
  onResult?: () => void
): Promise<void> {
  const now = Date.now();
  const last = context.workspaceState.get<number>(LAST_CHECK_KEY);
  const cached = context.workspaceState.get<string>(LATEST_KEY);
  // Skip when checked recently AND we already know a latest version. If the
  // last check never produced a result (fetch failed / no current version),
  // re-check despite the gate so the hint can appear on the next start.
  if (cached !== undefined && !shouldCheckVersion(last, now, CHECK_INTERVAL_MS)) return;

  // Mark the check as done FIRST so a slow/failed fetch cannot re-trigger
  // on every activation within the interval.
  void context.workspaceState.update(LAST_CHECK_KEY, now);

  if (!currentVersion) {
    console.log("[dsh] version check skipped: no current version");
    return;
  }
  console.log(`[dsh] checking latest dsh (current=${currentVersion})`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(REGISTRY_URL, { signal: controller.signal });
      if (!res.ok) {
        console.log(`[dsh] version check: registry HTTP ${res.status}`);
        return;
      }
      const pkg = (await res.json()) as { "dist-tags"?: { latest?: string; next?: string } };
      const latest = pkg["dist-tags"]?.latest;
      const next = pkg["dist-tags"]?.next;
      if (latest) {
        void context.workspaceState.update(LATEST_KEY, latest);
        console.log(`[dsh] latest dsh = ${latest}`);
      }
      if (next) {
        void context.workspaceState.update(NEXT_KEY, next);
        console.log(`[dsh] next dsh = ${next}`);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.log("[dsh] version check failed (silent):", err instanceof Error ? err.message : err);
  } finally {
    // Notify the caller (launcher refresh) once the check settles, so the
    // upgrade hint appears even though the fetch finished after first render.
    onResult?.();
  }
}

/** Read the cached latest version (what the last successful check found). */
export function cachedLatest(context: vscode.ExtensionContext): string | undefined {
  return context.workspaceState.get<string>(LATEST_KEY);
}

/** Read the cached `next` (prerelease) version, if the last check saw one. */
export function cachedNext(context: vscode.ExtensionContext): string | undefined {
  return context.workspaceState.get<string>(NEXT_KEY);
}

/** Build the sidebar upgrade hint + interaction. */
export function upgradeInfo(
  context: vscode.ExtensionContext,
  currentVersion: string | undefined,
  dshPath: string | undefined
): UpgradeInfo | undefined {
  const latest = cachedLatest(context);
  const next = cachedNext(context);
  const newer = (c: string | undefined) =>
    c !== undefined && isUpdateAvailable(currentVersion, c);
  if (!newer(latest) && !newer(next)) return undefined;
  return { latest, next, commandFor: (c) => upgradeCommandFor(dshPath, c) };
}

/**
 * Show the upgrade options for one npm channel (latest stable / next
 * prerelease) and prefill a terminal with the chosen command. NEVER executes
 * the command automatically.
 */
export async function showUpgradeOptions(
  context: vscode.ExtensionContext,
  currentVersion: string | undefined,
  dshPath: string | undefined,
  channel: UpgradeChannel = "latest"
): Promise<void> {
  const info = upgradeInfo(context, currentVersion, dshPath);
  const target = channel === "latest" ? info?.latest : info?.next;
  if (!info || !target) return;
  // Stale click: the channel is not actually newer than the running version.
  if (!isUpdateAvailable(currentVersion, target)) return;

  const spec = `@deepseek-ai/dsh@${channel}`;
  const recommended = info.commandFor(channel)
    ? { label: t("upgrade.recommended"), detail: info.commandFor(channel)!, command: info.commandFor(channel)! }
    : undefined;
  const npmGlobal = { label: "npm global", detail: `npm i -g ${spec}`, command: `npm i -g ${spec}` };
  const npx = { label: "npx (cache)", detail: `npx -y ${spec} --version`, command: `npx -y ${spec} --version` };
  const items = [recommended, npmGlobal, npx].filter(
    (x): x is { label: string; detail: string; command: string } => !!x
  );
  items.push({
    label: t("upgrade.copyCommand"),
    detail: t("upgrade.copyCommandDetail"),
    command: "",
  });

  const channelText =
    channel === "latest"
      ? t("upgrade.availableLatest", { latest: target })
      : t("upgrade.availableNext", { next: target });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${channelText} (${t("upgrade.current", { version: currentVersion ?? "?" })})`,
    ignoreFocusOut: true,
  });
  if (!picked) return;

  if (picked.command === "") {
    const cmd = recommended?.command ?? npmGlobal.command;
    await vscode.env.clipboard.writeText(cmd);
    vscode.window.showInformationMessage(t("upgrade.commandCopied"));
    return;
  }

  const terminal = vscode.window.createTerminal("DeepSeek Harness upgrade");
  terminal.show();
  terminal.sendText(picked.command, false); // prefill only — user presses Enter
  vscode.window.showInformationMessage(t("upgrade.prefilled", { command: picked.command }));
}
