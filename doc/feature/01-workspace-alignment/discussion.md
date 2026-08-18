# 工作区对齐（workspace-alignment）— 讨论记录（discussion）

> 阶段：Feature Pipeline 第一份文档（原始记录，一旦 req.md 存在即只读）｜ 日期：2026-08-18
> 本文件记录动机、讨论、决策与已核实事实；新需求请直接写入 req.md。

---

## 1. 动机

- 来源：[roadmap.md](../roadmap.md) **M1**——依赖链：架构（✅）→ M1 → M2 → M3；
- **方向调整（2026-08-18）**：原规划第一个特性为"会话管理（多会话/多面板）"，评审后判定**过于复杂**（每个面板 = 一份完整 DSH UI 实例 + localStorage 时序），推迟为 **feature 02**；
- **新定盘：第一特性 = 工作区对齐**——让 dsh 的 workspace 锚点与 VS Code / Antigravity 的工作区对齐：
  - 现状痛点（product-gap.md §2）：**切工作区 = dsh 被杀 + 面板关 + 要重开 + 手动切 DSH 工作区**——"心智连续"价值的最大破坏点；
  - 对齐后：用户切文件夹，DSH 自动跟随当前工作区，无需手动同步。

## 2. 关键决策记录

### 2.1 架构定盘（协议事实，2026-08-18 已定）

- **DSH 单实例即可多会话并行、各绑 cwd**：`session.create` 收 `workspaceId` 或 `cwd`（二选一）；`running` 是会话级；`agent-busy` 只拦**同一会话**的重复 prompt，不同会话互不影响 → 多工作区 = 多会话，**无需多实例管理**；
- **workspace 按路径组织**：`workspaceRegistry.resolveByPath(path)` 命中复用、未命中 `create(path)`；会话挂在 workspace 的 `sessionIds[]` 下 → **IDE 工作区路径 = DSH workspace = 会话组唯一锚点**；
- **cwd 锚点**：`host.describe.cwd` = 宿主进程 cwd；扩展 spawn 时 `cwd: workspaceFolder` 即实现"当前文件夹为默认工作区"（spike-notes S3）。

### 2.2 工作区切换联动（定盘，2026-08-18）

- **会话级切换，不杀进程**：`onDidChangeWorkspaceFolders` → 旧路径会话组**保留**（DSH 内归档，不删不迁），新路径 `resolveByPath/create` 自动起新会话组；
- **关闭所有 dsh4vscode 面板**：旧面板承载的是**旧工作区的会话**，切换后一律关闭，不留旧工作区状态在界面上；
- **默认自动跟随**：切换后用户点 `＋新建会话` / `openPanel` 为新工作区开会话（无需确认——关闭面板 + 归档保留均非破坏性）；
- **区分"切换"与"普通重载"**：VS Code 里改设置/装扩展/更新也会触发窗口重载，不能一律冷启动——依据 = **存储的上次 workspace 路径 vs 当前路径**：
  - 路径**变**了（真切换）→ 关面板、不自动起、用户主动开；
  - 路径**没变**（普通重载）→ **自动重启 dsh** 并恢复面板（A2 保留，不打断连续性）。

### 2.3 多会话管理（推迟为 feature 02，2026-08-18）

- 原 G-12 会话管理器侧边栏 + **多面板绑定多会话**（`＋新建会话` → `session.create` → 新面板，经注入脚本在 DSH boot 前写 `localStorage["dsh.sessions.current"]` 指向该会话）；
- 已核实可行（前端"当前会话"是每页面 localStorage，`dsh.sessions.current`），但**成本高**：每面板一份完整 DSH UI 实例 + 共享 origin 时序——**推迟**，roadmap M2。

### 2.4 UI 对齐缺口 + Spike 结论（2026-08-18，feature 01 补丁）

- **缺口（用户实测发现）**：feature 01 只对齐了**进程层**（`spawn cwd=workspaceRoot`），**UI 层没对齐**——DSH 前端初始工作区 = "最近活跃会话"所属工作区（`recentWorkspace` 按 `session.updatedAt` 取最大，`dsh-client-runtime/lib/client.js:10083`），**不看进程 cwd** → 切到新工作区后前端仍显示旧工作区；
- **Spike 实证（真实 dsh，隔离 DSH_HOME）**：
  - API 链路：`workspace.create {path}`（路径须真实存在，macOS realpath）→ `session.create {workspaceId}` → `session.list` 返回真实 sessionId；**注意 `session.create {cwd}` 不挂 `workspace.sessionIds`，必须用 `{workspaceId}`**；
  - 预置链路：注入脚本在 DSH module 脚本前写 `localStorage["dsh.sessions.current"] = {sessionId}` → `attachPersistence` boot 时 rehydrate（`client.js:5434`）→ `SessionManager.selected = restoredSessionId`（`:7860`）→ `list.current = selected`（`:8586`）→ `startInitialSelection` 见 `current !== undefined` 跳过默认选择（`:9900`）→ **UI 显示目标工作区**；
  - **结论：UI 对齐可行**，方案 = 扩展就绪后确保 IDE 工作区有 workspace+会话（`workspace.create` + `session.create {workspaceId}`）→ 面板加载前注入 `dsh.sessions.current`；
  - **风险**：`dsh.sessions.current` 是 DSH 内部持久化键（非公开 API），版本升级可能变更（G-05 类，版本软校验兜底）；失效时降级为"最近活跃"行为（不崩）。

## 3. 已核实事实清单（供 req/solution 引用，均来自源码/实测，非臆测）

- **会话级 API**：`session.create {workspaceId|cwd}`（二选一，`sessionCreateRequestSchema`）；`running: boolean` 会话级（`summarize(session, running)`）；`agent-busy` 只拦同会话重复 prompt（`dsh-host-apiproxy/lib/index.js:2863`）
- **workspace 按路径唯一**：`resolveByPath(path)` 复用/创建；会话挂 `workspace.sessionIds[]`（apiproxy 2194/2026/3101）；`workspace.list` → `{items: [workspaceView], archivedSessionIds}`
- **cwd 锚点**：`host.describe.cwd` = 宿主进程 cwd；扩展 spawn 时 `cwd: workspaceFolder`（spike-notes S3）
- **前端会话选择是每页面状态**：`createSnapshotStore({}, { persist: { name: "dsh.sessions.current" } })`（`dsh-client-runtime/lib/client.js:8904`）→ localStorage 按页面 origin 持久化，**每个 webview 面板独立**；`sessions.open(id)` → `manager.select(id)` 程序化切换（`client.js:8972/7868`）；boot 时 rehydrate（`attachPersistence`，`client.js:5434`）
- **当前代码现状**：
  - `extension.ts:15` 单一 `DshServerManager`；`dshPanel.ts:85` 单 `panel`，`open()` 只 reveal 不新建
  - `launcherView.ts:162` 已监听 `onDidChangeWorkspaceFolders`，但**只刷新页脚文字**，无迁移逻辑
  - `deactivate()` → `manager.stop()` 杀 dsh（非 detached，`serverManager.ts:201`）；面板标签页关闭不杀进程（`dshPanel.ts:142-144` 只 dispose bridge）

## 4. 开放问题（req 评审时确认）

1. **自动重启范围**：普通重载（路径未变）自动重启 dsh——是否也要自动 `openPanel`？（建议：是，恢复现场）
2. **无工作区时**：未打开文件夹（`workspaceFolders` 空）→ 锚点用主目录（现 `workspaceRoot()` 行为），切换回来是否弹提示？（建议：不弹，静默）
3. **多根工作区**：`workspaceFolders` 多根时锚点用第 0 个（现行为）——是否需要 UI 提示？（建议：暂不，保持现状）
4. **G-01 attach 探测**（T13）：V-02 `host.describe.cwd` 探测可靠性未验证 → **不在本 feature**，留 TODO 单独排期。

*关联文档：roadmap.md ｜ 全局 TODO.md ｜ product-strategy.md ｜ product-gap.md ｜ 00-dsh-vscode/verification.md*
