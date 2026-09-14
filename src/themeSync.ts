// Theme sync (R7/T12): mirror the VS Code color theme into the DSH host
// settings (settings/update, namespace "ui-theme"), so the embedded UI never
// renders light-on-dark. Honored only while the `deepseekHarness.themeSync`
// setting is "follow" (default).
//
// Since 0.1.2-rc.1 the RPC surface is namespace/method and `/api` requires the
// browser-session cookie, so the write goes through DshServerManager (which
// owns both) instead of a hand-rolled `settings.update` request — that legacy
// call silently failed (401/404) while the in-page matchMedia shim kept the
// theme looking right.
import * as vscode from "vscode";
import type { DshServerManager } from "./serverManager.js";

const SETTINGS_NS = "ui-theme";

function preferenceFor(kind: vscode.ColorThemeKind): "dark" | "light" {
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
    ? "dark"
    : "light";
}

async function syncNow(manager: DshServerManager): Promise<void> {
  if (!manager.serverUrl) return;
  const cfg = vscode.workspace.getConfiguration("deepseekHarness");
  if (cfg.get<string>("themeSync") !== "follow") return;
  const preference = preferenceFor(vscode.window.activeColorTheme.kind);
  try {
    await manager.updateSettings(SETTINGS_NS, { preference });
  } catch (err) {
    console.log("[dsh] theme sync failed:", err);
  }
}

/** Register the theme-change listener; returns syncNow for start-time calls. */
export function registerThemeSync(
  context: vscode.ExtensionContext,
  manager: DshServerManager
): { syncNow: () => Promise<void> } {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      void syncNow(manager);
    })
  );
  return { syncNow: () => syncNow(manager) };
}
