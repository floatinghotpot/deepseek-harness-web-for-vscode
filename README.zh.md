# DeepSeek Harness Web for VS Code

[English](README.md) | **中文**

[![CI](https://github.com/floatinghotpot/deepseek-harness-web-for-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/floatinghotpot/deepseek-harness-web-for-vscode/actions)
[![Open VSX Version](https://img.shields.io/open-vsx/v/floatinghotpot/deepseek-harness-web-for-vscode)](https://open-vsx.org/extension/floatinghotpot/deepseek-harness-web-for-vscode)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/floatinghotpot/deepseek-harness-web-for-vscode)](https://open-vsx.org/extension/floatinghotpot/deepseek-harness-web-for-vscode)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-latest-blue)](https://marketplace.visualstudio.com/items?itemName=floatinghotpot.deepseek-harness-web-for-vscode)

一键启动 **DeepSeek Harness**，把它的完整 Web UI 内嵌进 VS Code（及兼容 fork 的 Antigravity IDE）——在同一个窗口里跑 DSH Agent、写代码，与浏览器打开的实例**共享同一份状态**。

## Screenshot / 截图

![DeepSeek Harness embedded in Antigravity](media/antigravity.jpg)

## 功能

- **在编辑器里完成一切**：在 **VS Code 或 Antigravity** 中边写代码边用 DeepSeek Harness，无需在 IDE 与浏览器标签页之间来回切换就能看到 Agent 工作。
- **Agent 生态中的一员**：VS Code / Antigravity 可安装多个 coding agent 扩展，各自由不同 LLM 驱动（如 Claude Code、ChatGPT…）；本扩展就是其中之一——**DeepSeek Harness Agent**，与其它 Agent 在同一 IDE 里并存，可让多个 Agent 同时跑同一任务、**交叉评审，规避单一 LLM 的短板**。
- **一键启动 / 停止**：扩展托管 `dsh web` 子进程（端口自动分配）。入口：活动栏 DSH 图标（侧边栏启动器）、状态栏按钮、命令面板。
- **编辑器标签页内嵌 Web UI**：完整 DSH 前端（会话、工作区、设置、插件、Goal、Workflow）以常规编辑器标签页呈现，与文件编辑并存——**永不遮挡资源管理器树**。
- **与浏览器共享实例**：默认使用你的 `~/.dsh`，会话与设置和浏览器 UI 互通。
- **当前文件夹即工作区**：DSH 默认项目目录 = 你打开的文件夹。
- **工作区对齐**：DSH 的 workspace 锚点跟随 IDE 工作区——切换文件夹关闭旧面板、冷启动；重载同一工作区自动重启服务并恢复面板；内嵌 UI 始终显示**当前文件夹**（而非最近活跃的那个）。
- **点图标自动启动**：点击活动栏图标，dsh 未运行时自动启动。
- **dsh 版本检查 + 一键升级**：启动器显示 "有新版本：x.y.z →"（有新版时，文案随界面语言本地化）；点击后按你的安装方式（npx / npm 全局 / nvm）给出对应升级命令，预填进终端（24 小时检查门、离线静默）。
- **剪贴板可用**：内嵌 UI 的复制/粘贴走传输桥（VS Code webview 会屏蔽 iframe 内的剪贴板；桥通过 `vscode.env.clipboard` 转发）。
- **主题跟随 VS Code**：内嵌 UI 跟随编辑器颜色主题（深/浅），切换即时生效（`deepseekHarness.themeSync`，默认 `follow`）。
- **跨平台**：macOS / Linux / Windows 三平台，由 CI 端到端验证（单测 + 真实 `dsh` 冒烟）。
- **多语言界面**：扩展壳层（启动器、覆盖层、状态栏、命令提示）跟随 VS Code 显示语言，共 9 种：English、中文、日本語、한국어、Русский、Español、Português、Français、Deutsch。
- **安全优先**：服务仅绑定回环；扩展以纯 Node 请求代发，不弱化 DSH 的 `/api` 信任围栏。（注：内嵌页面及其插件视为受信——剪贴板读写桥接到系统剪贴板，无浏览器授权弹窗，与扩展本身的信任等级一致。）

## 环境要求

- 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：`npm i -g @deepseek-ai/dsh`
- VS Code ≥ 1.90（通过 Open VSX 亦可用于 Antigravity）

## 安装

- **VS Code**：[Visual Studio Marketplace](https://marketplace.visualstudio.com/) 搜索 *DeepSeek Harness Web for VS Code*
- **Antigravity / Open VSX**：[Open VSX](https://open-vsx.org/) 同名

## 使用

1. 点击活动栏 **DeepSeek Harness** 图标 → dsh 自动启动（若未运行），侧边栏显示服务状态、版本与 URL。
2. 服务就绪后（`dsh web: http://127.0.0.1:<端口>`），DSH UI 在**编辑器标签页**打开。
3. 就绪后启动器提供 **Stop DeepSeek Harness** 与 **Open View**（全宽按钮）；点 **有新版本：x.y.z →**（随界面语言本地化）可升级 dsh。

想让 DSH 以你的项目为默认工作区，先在窗口里打开该文件夹（启动器底部会显示当前工作区）。

## 配置

| 设置项 | 默认 | 说明 |
|---|---|---|
| `deepseekHarness.themeSync` | `follow` | 将 VS Code 颜色主题同步到内嵌 DSH 界面；`off` 尊重 DSH 自身外观设置。 |

## 开发

```sh
npm install --cache .npm-cache
npm run compile     # tsc
npm test            # node:test 单元测试
npm run package     # vsce package -> vsix
```

在 VS Code 中按 `F5` 启动扩展开发宿主。

## 架构

扩展 spawn `dsh web --port 0`，将 DSH 前端作为同源 webview 资源加载，并通过 `postMessage` 桥把 `fetch` / WebSocket / 剪贴板转发到扩展宿主，由宿主以纯 Node 请求执行真实调用（通过 DSH 的 `/api` 信任围栏）。设计与验证记录：

- 架构提案：[`doc/architecture/proposal-by-deepseek.md`](doc/architecture/proposal-by-deepseek.md)
- 特性流程：[`doc/feature/00-dsh-vscode/`](doc/feature/00-dsh-vscode/)

## 变更日志

见 [CHANGELOG.md](CHANGELOG.md)。
## License

MIT — 见 [LICENSE](LICENSE)。Copyright © 2026 Liming Xie。
