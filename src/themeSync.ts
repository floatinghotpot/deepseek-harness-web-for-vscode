// Theme sync (R7/T12): mirror the VS Code color theme into the DSH host
// settings via the api (settings.update ns "ui-theme"), so the embedded UI
// never renders light-on-dark. Honored only while the `deepseekHarness
// .themeSync` setting is "follow" (default).
import * as vscode from "vscode";

const SETTINGS_NS = "ui-theme";

function preferenceFor(kind: vscode.ColorThemeKind): "dark" | "light" {
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
    ? "dark"
    : "light";
}

async function syncNow(getServerBase: () => string | undefined): Promise<void> {
  const base = getServerBase();
  if (!base) return;
  const cfg = vscode.workspace.getConfiguration("deepseekHarness");
  if (cfg.get<string>("themeSync") !== "follow") return;
  const preference = preferenceFor(vscode.window.activeColorTheme.kind);
  try {
    await fetch(base + "/api/settings.update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: "theme-sync-" + Date.now(),
        method: "settings.update",
        payload: { ns: SETTINGS_NS, patch: { preference } },
      }),
    });
  } catch (err) {
    console.log("[dsh] theme sync failed:", err);
  }
}

/** Register the theme-change listener; returns syncNow for start-time calls. */
export function registerThemeSync(
  context: vscode.ExtensionContext,
  getServerBase: () => string | undefined
): { syncNow: () => Promise<void> } {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      void syncNow(getServerBase);
    })
  );
  return { syncNow: () => syncNow(getServerBase) };
}
