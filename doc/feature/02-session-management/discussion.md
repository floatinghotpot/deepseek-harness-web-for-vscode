# 会话管理（session-management）— 讨论记录（discussion）

> 阶段：Feature Pipeline 第一份文档（原始记录，一旦 req.md 存在即只读）｜ 日期：2026-08-19
> 本文件记录动机、讨论、决策与已核实事实；新需求请直接写入 req.md。

---

## 1. 动机

- 来源：[roadmap.md](../roadmap.md) **M2**、[全局 TODO.md](../TODO.md) **G-12**、[product-strategy.md](../../marketing/product-strategy.md) §5；
- **现状痛点**（product-gap.md §2）：当前扩展是**单面板单会话**——`DshPanel` 单例，`open()` 只 reveal 不新建（`src/dshPanel.ts:85,116-158`），一次只能看一个 DSH 会话；
- DSH 协议层早已支持**单实例多会话并行**（`session.create {workspaceId|cwd}`、`running` 会话级、`agent-busy` 只拦同会话），缺的是**壳层的会话编排 UI**：会话列表 + `＋新建会话` + 多面板各绑一个会话。

## 2. 关键决策记录

### 2.1 范围定盘（2026-08-19，与用户确认）

- 本 feature = **会话管理器侧边栏 + 多面板绑定多会话**（roadmap M2 / G-12）：
  - 顶部进程状态 + `＋新建会话` 按钮 + 会话列表（`✕` 关标签页、显示模型名、同工作区不显 cwd）；
  - `＋新建会话` → `session.create` → 新编辑器面板（localStorage 预置指向该会话）——**已核实可行**（feature 01 discussion §2.3）；
- **不做**：attach 探测（G-01/T13）、M3 IDE 上下文（G-10/G-11）——另行排期。

### 2.2 编号澄清（02 vs 03）

- roadmap M2 占位目录名 = **`02-session-management`**；
- feature 01 的 [req.md](../01-workspace-alignment/req.md) R3 写的是"推迟为 **feature 03**（原 roadmap M2）"——**编号不一致**；
- **决策**：以 roadmap 的 **02** 为准（本目录），feature 01 req 的 "03" 视为早期笔误，不回改（req 已批准，只读）。

## 3. 已核实事实清单（均来自源码/实测，非臆测）

### 3.1 DSH 协议事实（feature 01 discussion §3，apiproxy 源码）

| 事实 | 证据 |
|---|---|
| `session.create` 收 `workspaceId` 或 `cwd`（二选一，`sessionCreateRequestSchema`）；会话挂 workspace 的 `sessionIds[]` | dsh-host-apiproxy 2194/2026/3101 |
| `running: boolean` 是**会话级**（`summarize(session, running)`）；`agent-busy` 只拦**同一会话**的重复 prompt，不同会话互不影响 | apiproxy 1284/2863 |
| `workspaceRegistry.resolveByPath(path)` 命中复用、未命中 `create(path)`；`workspace.list → {items, archivedSessionIds}` | apiproxy |
| 会话默认 cwd = 宿主进程 cwd（扩展 spawn 时已设为 IDE 工作区） | spike-notes S3 |
| **`session.rename` API 存在**：`{sessionId, title}` → `{title, seq}`；错误码 `title-invalid`（sanitize 后为空）、`internal`（未挂载 session-title 服务） | dsh-host-apiproxy 466/2665/4633（0.1.0-rc.7） |
| **会话标题 = log-backed 投影**：title 存储在 session 日志的 `session/title` 事件；`session.list` 每项的 `projections.values.title` 可读（未命名时为 `null`） | dsh-session-title/lib/index.js:113-116；**实测 0.1.0-rc.7** |
| 前端显示标题优先级：durable title → cwd basename → id（`displayTitleOf`）；`sessions.rename(title)` 客户端方法 + `projections.apply("title", …)` 已实现 | dsh-client-runtime client.js:7346/8556/8828 |

### 3.2 前端会话选择机制（决定多面板实现方式）

- **每页面状态**：`createSnapshotStore({}, { persist: { name: "dsh.sessions.current" } })`（client.js:8904）→ 会话选择持久化在 **localStorage**，**每个 webview 面板独立**；
- boot 时 rehydrate（`attachPersistence`，client.js:5434）→ `SessionManager.selected = restoredSessionId`（:7860）→ `list.current = selected`（:8586）→ `startInitialSelection` 见 `current !== undefined` 跳过默认选择（:9900）→ **UI 显示目标会话**；
- `sessions.open(id)` → `manager.select(id)` 程序化切换（client.js:8972/7868）——**注入即选中**；
- **注入机制已实现**：feature 01 T7d 在 `assembleDocument` 于 DSH module 脚本前写 `localStorage.setItem("dsh.sessions.current", payload)`（`src/documentAssembly.ts`），`DshPanel.open(sessionPreset?)` 已支持 preset 透传（`src/dshPanel.ts:116`）。

### 3.3 当前代码现状（2026-08-19 审计，feature 01 之后）

| 文件:行 | 现状 |
|---|---|
| `src/extension.ts:24,46-63` | 单 `DshPanel`；`manager.on("state" ready)` → theme.syncNow → `ensureWorkspaceSession(workspaceRoot())` → preset → `panel.open(preset)`；**每次 ready 只开一个面板** |
| `src/dshPanel.ts:85,116-158` | `DshPanel` 单例：`private panel?`；`open(sessionPreset?)` 有面板则 reveal+refresh，无则 createWebviewPanel；`retainContextWhenHidden: true`；`close()`（:170）已存在 |
| `src/launcherView.ts:196-257` | 侧边栏启动器：状态/版本/URL/升级提示/工作区页脚；按钮 start/stop/openPanel/upgrade；点图标自动启动 |
| `src/serverManager.ts` | `ensureWorkspaceSession(cwd)` 已实现（feature 01 T7b）：workspace.list → create → session.create → 返回 sessionId |
| `src/workspaceTracker.ts` | `normalizePath` / `shouldAutoRestart` / `buildSessionPresetPayload(sessionId)` 纯函数 |
| `src/commands.ts` | start/stop/openBrowser/openPanel；`workspaceRoot()` |
| `src/i18n.ts` + `src/i18nStrings.ts` | 中央双语表（9 语言），新增文案需双表同步（Appendix A） |

### 3.4 已知限制（沿用，不根治）

- **多 IDE 同工作区写冲突**（feature 01 verification G-01）：两个 dsh 进程共享 `~/.dsh` 无锁，同工作区+同会话并发写会损坏会话日志——本 feature 的"同工作区多会话并行"在**单 IDE 内**安全（`agent-busy` 只拦同会话，不同会话并行 OK）；
- `dsh.sessions.current` 是 DSH 内部键（非公开 API），版本升级可能变更 → G-03 版本软校验兜底，失效降级"最近活跃"。

## 4. 开放问题（req 评审时确认）

1. **会话列表数据源**：轮询 `session.list`（扩展侧 Node 直连，复用 `ensureWorkspaceSession` 路径）还是经 WS `events.host` 推送？——轮询简单可靠（MVP 建议 5s 间隔），推送省流量但依赖事件帧格式；
2. **多面板状态归属**：扩展侧维护 `Map<panelId, sessionId>`？面板重建（关闭再开）如何恢复绑定——靠 preset 重注入还是靠 localStorage（面板 origin 是否随重建变化需 Spike 验证）；
3. **`✕` 关标签页语义**：仅关面板不杀会话（对齐 R5 不杀进程语义）？还是会话也结束（`session.delete`？需确认 DSH 有无该 API）；
4. **`＋新建会话` 的目标**：新建会话（`session.create {workspaceId}`）后**立即开新面板**，还是先选模型？——DSH 前端新建会话有模型选择交互，壳层是否需要绕过（建议：直接开面板，模型在 DSH UI 内选）；
5. **会话列表范围**：只列当前工作区的会话（对齐"同工作区不显 cwd"），还是全部会话？——req 建议：当前工作区 + 归档区分（对齐 `workspace.list.archivedSessionIds`）；
6. **面板上限**：多面板并排数量上限（VS Code 编辑器标签页布局限制）？建议无硬限，用户自行管理；
7. **（2026-08-19 新增）会话标题显示 + 重命名**：已实测可行（`session.rename` + `projections.values.title`）——列表项显示 title（null 时降级 cwd basename/模型名），笔图标 → 输入框 → rename → 刷新列表；输入方式（inline 编辑 vs QuickPick）待 req 定。

## 5. 风险与后续

- **前置 Spike 进度（2026-08-19）**：
  - ✅ **session-title 可行性已验证**（隔离 dsh 0.1.0-rc.7 实测）：`session.rename` 可用（中文标题正常）、`session.list` 的 `projections.values.title` 可读（未命名 null）；
  - ✅ **webview localStorage 隔离性已查证**：VS Code 1.73+ **同一 viewType 的 webview 共享一致 origin**（[release notes](https://github.com/microsoft/vscode-docs/blob/vnext/release-notes/v1_73.md)）→ **多面板共享同一 localStorage，非每面板隔离**。设计影响：
    - `dsh.sessions.current` 是共享键——**每次面板加载/刷新必须注入该面板绑定的 preset**（覆盖共享键），不能依赖天然隔离；
    - 扩展侧必须显式维护 `面板 ↔ sessionId` 映射（localStorage 不可作为绑定存储）；
    - 窗口重载恢复多面板：持久化 sessionId 列表（workspaceState），恢复时逐面板重建 + 注入；
  - ⏳ 待验证（实现期）：同一共享 localStorage 下，面板 A 用户在 DSH UI 内切换会话后，面板 B 刷新行为——靠"每次注入"兜底，实现时手工确认；
- **工作量估算**：~2-3 天（全局 TODO G-12）——会话列表 UI（含标题/重命名）+ 多面板实例 + preset 绑定 + i18n 9 语言。

*关联文档：roadmap.md ｜ 全局 TODO.md ｜ product-strategy.md ｜ 01-workspace-alignment/{discussion,req,verification}.md*
