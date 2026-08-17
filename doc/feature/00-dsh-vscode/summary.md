# DeepSeek Harness for VS Code — 总结（summary）

**日期**: 2026-08-17 ｜ **阶段**: Feature Pipeline 收口

## 做了什么

从零开发了 **DeepSeek Harness for VS Code** 扩展（publisher `floatinghotpot`）：一键启动 DSH 并把其 Web UI 内嵌进 VS Code/Antigravity，与浏览器共享同一实例。

- **架构**：扩展宿主 spawn `dsh web --port 0`（cwd=当前工作区）→ 传输桥（webview 文档直载 DSH 前端 + fetch/WS/剪贴板三个 shim，postMessage → Node 代发，过 `/api` 围栏）→ 编辑器标签页承载 UI + 侧边栏启动器 + 状态栏
- **关键查证**：iframe 方案被剪贴板平台限制否决（microsoft/vscode#182642）；webview 页面 hostname 非回环导致 DSH settings scope 走 memory 模式 → matchMedia shim 修复主题跟随（R7）
- **质量**：20/20 单测（含回归：`/undefined` 405、glob、bridge var）、真实 dsh 集成验证、用户 F5 手工验收全过（渲染/流式对话/剪贴板/主题/共享实例/生命周期）
- **打包**：vsix 25 文件 30.37KB；双渠道发布说明（Microsoft Marketplace + Open VSX）

## 文档产物

`doc/architecture/proposal-by-deepseek.md`、`doc/marketing/market-analysis.md`、`doc/feature/00-dsh-vscode/`（discussion/req/solution/plan/spike-notes/verification/TODO）、`doc/daily/` 未建（用户未要求）。

## 变更轨迹（git）

- `e9246a6` 项目基线（文档）
- MVP 实现待提交（桥修复、编辑器标签页、启动器、状态栏、主题修复、测试、文档）

## 遗留

见 [TODO.md](TODO.md)（T13–T18，⏭️ 延后）：共享实例探测、Abort 传递、下载流式、版本固化、settings 镜像/上游、主题重载兜底。

## 下一步建议

1. 提交 MVP 代码（待用户批准 Batch Plan）
2. 发布准备：Marketplace + Open VSX（需 vsce 登录与 Azure PAT / Eclipse 账号）
3. 首个延后项排期：T13 共享实例探测（与用户"我已跑着 3080"场景最相关）

*关联文档：verification.md ｜ TODO.md ｜ plan.md*
