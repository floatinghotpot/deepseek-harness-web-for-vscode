# DeepSeek Harness Web for VS Code

**English** | [中文](README.zh.md)

[![CI](https://github.com/floatinghotpot/deepseek-harness-web-for-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/floatinghotpot/deepseek-harness-web-for-vscode/actions)
[![Open VSX Version](https://img.shields.io/open-vsx/v/floatinghotpot/deepseek-harness-web-for-vscode)](https://open-vsx.org/extension/floatinghotpot/deepseek-harness-web-for-vscode)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/floatinghotpot/deepseek-harness-web-for-vscode)](https://open-vsx.org/extension/floatinghotpot/deepseek-harness-web-for-vscode)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-latest-blue)](https://marketplace.visualstudio.com/items?itemName=floatinghotpot.deepseek-harness-web-for-vscode)

Launch **DeepSeek Harness** and embed its full Web UI inside VS Code (and Antigravity, the VS Code fork) — so you can run DSH Agents and edit code in one window, sharing the same instance as your browser.

## Screenshot / 截图

![DeepSeek Harness embedded in Antigravity](media/antigravity.jpg)

## Features

- **Stay in your editor** — use DeepSeek Harness and write code in the same window, in **VS Code or Antigravity**; no more switching between the IDE and a browser tab to watch the Agent work.
- **One of your Agent stack** — VS Code / Antigravity let you install multiple coding-agent extensions, each powered by its own LLM (e.g. Claude Code, ChatGPT, …), and this extension is one of them: a DeepSeek Harness Agent that works side by side with the others. Run several Agents on the same task at the same time to cross-review answers and cover each model's blind spots.
- **One-click start / stop** — the extension manages a `dsh web` child process with an OS-assigned port. Entry points: activity-bar icon (sidebar launcher), status-bar button, or Command Palette.
- **Embedded Web UI in an editor tab** — the full DSH frontend (conversations, workspaces, settings, plugins, Goals, Workflows) renders as a regular editor tab, side by side with your files — it never overlaps the explorer tree.
- **Works with the browser instance** — uses your `~/.dsh` by default, so sessions and settings are shared with the browser UI.
- **Current folder as workspace** — the DSH default project directory is the folder you have open.
- **Workspace alignment** — the DSH workspace anchor follows your IDE workspace: switching folders closes stale panels and starts cold, reloading the same workspace auto-restarts the server and restores the panel, and the embedded UI always shows the *current* folder (not the most recently active one).
- **Auto-start from the icon** — clicking the activity-bar icon starts dsh for you when it is not running.
- **dsh version check + easy upgrade** — the launcher shows "Update available: x.y.z →" when a newer dsh exists; one click offers the right upgrade command for your install method (npx / npm global / nvm) prefilled into a terminal (24h check gate, offline-safe).
- **Clipboard works** — copy/paste in the embedded UI goes through a transport bridge (VS Code webviews block clipboard inside iframes; the bridge routes it via `vscode.env.clipboard`).
- **Theme follows VS Code** — the embedded UI follows your editor color theme (dark/light), live on switch (`deepseekHarness.themeSync`, default `follow`).
- **Cross-platform** — macOS, Linux and Windows, verified end-to-end by CI (unit tests + a real `dsh` spawn smoke test on all three).
- **Multilingual UI** — the extension chrome (launcher, overlay, status bar, commands) follows your VS Code language across 9 locales: English, 中文, 日本語, 한국어, Русский, Español, Português, Français, Deutsch.
- **Security first** — the server binds loopback only; the extension relays requests as plain Node requests, never weakening DSH's `/api` trust fence. (Note: the embedded page and its plugins are trusted — clipboard read/write is bridged to the system clipboard without a browser permission prompt, the same trust you grant the extension itself.)

## Requirements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) installed: `npm i -g @deepseek-ai/dsh`
- VS Code ≥ 1.90 (the extension also works in Antigravity via Open VSX)

## Install

- **VS Code**: [Visual Studio Marketplace](https://marketplace.visualstudio.com/) → search *DeepSeek Harness Web for VS Code*
- **Antigravity / Open VSX**: [Open VSX](https://open-vsx.org/) → same name

## Usage

1. Click the **DeepSeek Harness** icon in the activity bar → dsh starts automatically (if not running) and the launcher sidebar shows the server status, version and URL.
2. The DSH UI opens in an **editor tab** once the server is ready (`dsh web: http://127.0.0.1:<port>`).
3. When the server is ready, the launcher offers **Stop DeepSeek Harness** and **Open View** (full-width buttons); click **Update available: x.y.z →** to upgrade dsh.

To make DSH use your project as its default workspace, open that folder in the window first (the launcher footer shows the active workspace).

## Configuration

| Setting | Default | Description |
|---|---|---|
| `deepseekHarness.themeSync` | `follow` | Follow the VS Code color theme into the embedded DSH UI; `off` leaves DSH's own appearance untouched. |

## Development

```sh
npm install --cache .npm-cache
npm run compile     # tsc
npm test            # node:test unit tests
npm run package     # vsce package -> vsix
```

Press `F5` in VS Code to launch the Extension Development Host.

## Architecture

The extension spawns `dsh web --port 0`, serves the DSH frontend as same-origin webview resources, and relays `fetch` / WebSocket / clipboard through a `postMessage` bridge to the extension host, which performs the real calls as plain Node requests (passing DSH's `/api` trust fence). Design and verification notes:

- Architecture proposal: [`doc/architecture/proposal-by-deepseek.md`](doc/architecture/proposal-by-deepseek.md)
- Feature pipeline: [`doc/feature/00-dsh-vscode/`](doc/feature/00-dsh-vscode/)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 Liming Xie.
