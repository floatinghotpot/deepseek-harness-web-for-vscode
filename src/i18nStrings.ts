// Central bilingual string table (CLAUDE.md Appendix A). Pure module — no
// vscode import, so it stays unit-testable. `t()` in i18n.ts resolves the
// row by VS Code language. Every key MUST carry non-empty en + zh (the
// parity is enforced by test/i18n.test.js).

export const STRINGS = {
  // launcher sidebar
  "launcher.subtitle": { en: "Launch and embed the DSH Web UI", zh: "启动并内嵌 DSH Web UI" },
  "launcher.stopped": { en: "Not started", zh: "未启动" },
  "launcher.starting": { en: "Starting…", zh: "启动中…" },
  "launcher.stopping": { en: "Stopping…", zh: "停止中…" },
  "launcher.ready": { en: "Running {url}", zh: "运行中 {url}" },
  "launcher.error": { en: "Error: {message}", zh: "错误：{message}" },
  "button.start": { en: "Start DeepSeek Harness", zh: "启动 DeepSeek Harness" },
  "button.openPanel": { en: "Open Panel", zh: "打开面板" },
  "button.stop": { en: "Stop", zh: "停止" },
  "launcher.workspace": { en: "Workspace: {name}", zh: "工作区: {name}" },
  "launcher.noWorkspace": {
    en: "No folder open — DSH will use the home directory",
    zh: "未打开文件夹 — DSH 将使用主目录",
  },
  // editor-panel overlay
  "overlay.stopped": { en: "DSH server is not running", zh: "DSH 服务未启动" },
  "overlay.starting": { en: "DeepSeek Harness starting…", zh: "DeepSeek Harness 启动中…" },
  "overlay.error": { en: "DSH error: {message}", zh: "DSH 错误：{message}" },
  // status bar
  "statusbar.stopped": { en: "DeepSeek Harness: Start", zh: "DeepSeek Harness: 启动" },
  "statusbar.starting": { en: "DeepSeek Harness starting…", zh: "DeepSeek Harness 启动中…" },
  "statusbar.ready": { en: "DSH {url}", zh: "DSH {url}" },
  "statusbar.error": { en: "DSH error", zh: "DSH 错误" },
  "statusbar.tip.start": { en: "Start DeepSeek Harness", zh: "启动 DeepSeek Harness" },
  "statusbar.tip.starting": { en: "Starting the DSH server", zh: "正在启动 DSH 服务" },
  "statusbar.tip.openPanel": { en: "Open the panel", zh: "点击打开面板" },
  "statusbar.tip.retry": { en: "Start failed — click to retry", zh: "启动失败，点击重试" },
  // commands
  "command.startFailed": {
    en: "Failed to start DeepSeek Harness: {message}",
    zh: "启动 DeepSeek Harness 失败：{message}",
  },
  "command.notRunning": { en: "DeepSeek Harness is not running.", zh: "DeepSeek Harness 未在运行。" },
} as const;

export type I18nKey = keyof typeof STRINGS;

/** Replace {name} placeholders in a template string. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
