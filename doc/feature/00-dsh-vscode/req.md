# DeepSeek Harness for VS Code — 需求（MVP）

**日期**: 2026-08-17
**来源**: [discussion.md](discussion.md)、[架构提案](../../architecture/proposal-by-deepseek.md)、[市场分析](../../marketing/market-analysis.md)
**状态**: ⏳ 待用户批准（批准后进入 solution.md + Phase 0 Spike）

> 本文件只定义 **做什么（WHAT）** 与 **验收标准**，不含实现细节（HOW）。实现方式（webview 内嵌用 iframe 还是传输桥）由 Phase 0 Spike 结论决定，写入 solution.md。

---

## 1. 背景（一句话）

在 VS Code（及兼容 fork 的 Antigravity IDE）中一键启动 DeepSeek Harness 并内嵌其官方 Web UI，让 IDE 编辑与 DSH agent 工作流在同一窗口协同，且与浏览器打开的实例共享同一份状态。

## 2. MVP 范围（做这 6 项）

### R1 — 启动 DSH 服务
- 命令 `DeepSeek Harness: 启动`（及面板内启动按钮）→ 以子进程启动 `dsh web`，端口由 OS 分配（`--port 0`），从 stdout 解析实际 URL。
- **验收**：
  - 命令执行后 **≤10s** 内子进程就绪，日志出现 `dsh web: http://127.0.0.1:<port>`；
  - 重复触发幂等：已运行时不重复启动，界面显示"已连接"状态。

### R2 — 内嵌 Web UI
- 侧边栏 Webview 视图加载 DSH Web UI，功能完整可用（会话、工作区、设置、插件、Goal、Workflow）。
- **验收**：
  - 面板打开即渲染 DSH 界面，无白屏/无控制台致命错误；
  - 可完成一次端到端对话：发送消息 → agent 回复可见；
  - 工作区列表与模型选择可用（走 DSH 真实 API，非 mock）。
- **说明**：传输方式（iframe / 传输桥 / 其他）由 Spike 结论决定，本需求不限定。

### R3 — 停止与清理
- 命令 `DeepSeek Harness: 停止` 终止子进程；扩展停用（deactivate）时自动终止。
- **验收**：
  - 停止后系统无残留 `dsh` 进程（`ps` 验证）；
  - 子进程**异常退出**时，面板显示"DSH 服务已停止，请重新启动"提示，而非空白/死界面。

### R4 — 当前文件夹为默认工作区
- 子进程 `cwd` = 当前打开的 workspace 根目录；无 workspace 时用用户主目录。
- **验收**：`host.describe` 返回的 `cwd` == workspace 根目录（通过扩展侧直连 API 验证）。

### R5 — 与浏览器共享实例
- 默认使用用户 `~/.dsh`（`DSH_HOME` 缺省值），与浏览器打开的 Web UI 共享会话、设置、插件。
- **验收**：扩展内 UI 与浏览器 UI 同时在线时，任一端创建的会话/设置变更在另一端可见。

### R6 — 打包与元数据
- `vsce package` 打包成功；`package.json` 元数据完整：
  - `displayName`: **DeepSeek Harness for VS Code**
  - `description`: 含 "DeepSeek Harness / VS Code / Antigravity / 内嵌" 关键词
  - `publisher`: 评审时确认的账号；`name`: `deepseek-harness-for-vscode`
  - 含 icon、repository、engines、categories、activationEvents
- **验收**：vsix 可安装到第二台 VS Code 并正常激活；`vsce ls` 产物无多余文件（不含 node_modules 冗余）。

### R7 — 主题跟随（2026-08-17 新增）
- 扩展将 VS Code 主题同步到 DSH：VS Code 深色 → DSH 深色，浅色 → 浅色。
- 提供设置 `dshForVscode.themeSync`（默认 `follow` 跟随 VS Code；`off` 不写入）。
- **验收**：
  - VS Code 深色模式下启动 → DSH 界面为深色（非白底）；
  - 运行中切换 VS Code 主题 → DSH 即时跟随；
  - `themeSync: off` 时扩展不写入任何主题设置（尊重 DSH 自身外观选择）。

## 3. 非目标（MVP 明确不做，不阻塞验收）

| # | 项 | 原因/后续 |
|---|---|---|
| ~~N1~~ | ~~VS Code 主题 → DSH 主题同步~~ | **已纳入 R7（2026-08-17 修订）** |
| N2 | "附加当前文件夹" 主动命令（workspace.create 交互式） | R4 的 cwd 方案已覆盖默认场景；命令化交互后续 |
| N3 | 多实例管理 / 企业配置下发 | 后续 |
| N4 | 崩溃自动重启（指数退避） | 本次仅人工重启（R3 后 R1）；自动重启后续 |
| N5 | 端口冲突时的"挂载已有实例"探测 | 共享实例 R5 已默认覆盖 `~/.dsh`；端口冲突提示最小化即可（见 C2） |
| N6 | vscode.dev / 远程开发支持 | 明确不支持（本地进程方案前提） |
| N7 | Antigravity 专项适配与测试 | 仅保证 Open VSX 渠道可安装（架构同源）；专项验证后续 |

## 4. 约束（必须遵守）

- **C1 零改动 DSH**：不 fork、不修改 DSH 源码；不得依赖未发布的上游特性。
- **C2 安全底线**：服务仅绑回环（默认即如此）；不弱化 `/api` 信任围栏；webview 有严格 CSP。
- **C3 语言**：扩展内用户可见文案中英双语（默认跟随 VS Code 语言）；文档中文（仓库约定）。
- **C4 流程**：本 req 批准后，先写 solution.md + plan.md，再实现；实现中每 2–3 个任务对照本 req 自审。

## 5. 验收总则

- **MVP 完成 = R1–R6 全部验收通过**；N1–N7 不实现不阻塞。
- Phase 0 Spike 结论是 R2 实现方式的事实依据；若 Spike 证明内嵌无法以可接受质量达成，**降级方案**（自动打开系统浏览器 + 扩展仅做进程管理）将回填到本 req 修订后再评审，不默认生效。
- 单测/集成测：spike 与实现阶段补齐（重点：端口解析、子进程生命周期、桥协议若采用）。

---

*关联文档：discussion.md ｜ 架构提案 ｜ 市场分析*
