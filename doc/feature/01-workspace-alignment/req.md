# 工作区对齐（workspace-alignment）— 需求（req）

**日期**: 2026-08-18
**来源**: [discussion.md](discussion.md)、[roadmap.md](../roadmap.md) M1、[全局 TODO.md](../TODO.md) G-02、[product-strategy.md](../../marketing/product-strategy.md) §5
**状态**: ⏳ 待用户批准（批准后进入 solution.md + plan.md）

> 本文件只定义 **做什么（WHAT）** 与 **验收标准**，不含实现细节（HOW）；实现方式由 solution.md 决定。

---

## 1. 背景（一句话）

MVP 已把 DSH Web UI 内嵌进 IDE（单实例、单面板、`cwd`=当前工作区）；但**切换工作区 = dsh 被杀 + 面板关 + 重开 + 手动切 DSH 工作区**——本特性让 DSH 的 workspace 锚点**自动对齐** IDE 工作区，落实"桥"定位中**心智连续**价值。

## 2. 范围（做这 2 项主需求）

### R1 — 工作区切换联动（G-02）

- 监听 IDE 工作区切换（`onDidChangeWorkspaceFolders` + activate 时比对上次 workspace 路径）：
  - **关闭所有 dsh4vscode 面板**：旧面板承载的是**旧工作区的会话**，切换后一律关闭，不留旧工作区状态在界面上；
  - **不杀 dsh 进程**（会话级切换）：旧工作区会话组在 DSH 内**归档保留**（`~/.dsh` 持久，不删除、不迁移），切回旧工作区可恢复；
  - **工作区已变 → 不自动重启/不自动开面板**：新工作区由用户点 `＋新建会话` / `openPanel` 启动——无进程则起 dsh（`cwd`=新工作区）并建会话，有进程则直接开会话（绑定新工作区）；
  - **工作区未变（普通重载：改设置/装扩展/更新）→ 仍自动重启 dsh 并恢复面板**（A2 保留，不打断连续性）；区分依据 = 存储的上次 workspace 路径 vs 当前路径。
- **UI 示意（文本 demo）**：

  ```
  切换文件夹 A → B（窗口重载；dsh 随扩展宿主结束，面板全部关闭）

  之前（工作区 A）                之后（工作区 B，用户操作前）
  ┌───────────────────────┐      ┌───────────────────────┐
  │ ● dsh 运行中          │      │ ○ dsh 已停止          │ ← 不自动起
  │ 会话                   │      │ 会话                   │
  │  💬 deepseek-chat     │      │  （无面板，全部已关闭） │ ← 旧面板已清
  │  💬 deepseek-reasoner │      │  [ ＋ 新建会话 ]        │ ← 用户点这里
  │  （编辑器标签页 ×2）   │      │                       │
  └───────────────────────┘      │  ── 归档（DSH 内）──   │
                                 │  [A] 会话组（保留可恢复）│ ← 不删不迁
                                 └───────────────────────┘
  ```
- **验收**：
  - 切换工作区后：旧 dsh4vscode 面板全部关闭，无残留展示旧工作区会话的标签页；
  - 扩展不因切换主动杀 dsh（窗口重载导致的自然终止除外）；旧会话组在 DSH 内归档保留，切回旧工作区可恢复；
  - 新工作区点 `＋新建会话` / `openPanel`：无进程时起 dsh（`cwd`=新工作区）并建会话；有进程时直接开会话（绑定新工作区）；
  - 同工作区普通重载：自动重启 dsh 并恢复面板（A2 连续性）；
  - 全程无静默破坏：无会话被删除/迁移，`cwd` 绑定不被意外改动。

### R2 — UI 层工作区对齐（2026-08-18 补，Spike 已实证可行）

- 切换/启动 dsh 后，DSH 前端应显示 **IDE 当前工作区**，而非"最近活跃会话"的工作区（现状缺陷：前端初始工作区 = `recentWorkspace` 按 `session.updatedAt` 取最大，**不看进程 cwd**——用户实测确认）。
- **方案（Spike 实证，详见 discussion §2.4）**：扩展就绪后确保 IDE 工作区在 DSH 中存在 workspace + 会话（`workspace.create {path}` + `session.create {workspaceId}`），再于面板加载前注入 `localStorage["dsh.sessions.current"] = {sessionId}` → 前端 boot 即显示目标工作区。
- **验收**：
  - 全新工作区启动 dsh：面板显示**该工作区**（非其他最近工作区）；
  - 切换工作区后重新打开面板：显示新工作区；
  - 降级可接受：注入失效时退回"最近活跃"行为（不崩、不报错）；
  - `session.create` 须用 `workspaceId`（`cwd` 方式不挂 `workspace.sessionIds`——Spike 发现）。

### R3 — 多会话管理（推迟占位，不做）

- **明确不做**：会话管理器侧边栏、多面板绑定多会话（`＋新建会话` → `session.create` → 新面板）推迟为 **feature 03**（原 roadmap M2）；
- 已核实可行（前端"当前会话"是每页面 localStorage，`dsh.sessions.current`），仅因复杂度推迟——**不阻塞**本 req 验收。

## 3. 非目标（明确不做，不阻塞验收）

| # | 项 | 原因/后续 |
|---|---|---|
| N1 | 会话管理器侧边栏 / 多面板多会话 | **feature 03**（roadmap M2） |
| N2 | attach 探测（G-01/T13） | V-02 未验证；单独排期 |
| N3 | detached 常驻进程（A1） | A2（reload 自动重启）先行 |
| N4 | 多实例管理 / 多 IDE 窗口编排 | 单实例多会话已覆盖（架构定盘） |
| N5 | 会话搜索/过滤/排序 | 多会话 feature 02 范畴 |
| N6 | 工作区切换时迁移/复制旧会话内容 | 旧会话组**保留**即可（归档）；迁移复制后续 |
| N7 | 多根工作区的复杂锚点策略 | 用第 0 个文件夹（现 `workspaceRoot()` 行为），暂不弹提示 |

## 4. 约束（必须遵守）

- **C1 零改动 DSH**：不 fork、不修改 DSH 源码；只调用既有 `session.*` / `workspace.*` API。
- **C2 安全底线**：服务仅绑回环；不弱化 `/api` 信任围栏；webview 有严格 CSP。
- **C3 语言**：新增用户可见文案中英双语（9 语言 i18n 表补齐）；文档中文（仓库约定）。
- **C4 流程**：本 req 批准后，先写 solution.md + plan.md，再实现；实现中每 2–3 个任务对照本 req 自审。

## 5. 验收总则

- **完成 = R1 + R2 全部验收通过**；R3/N1–N7 不实现不阻塞。
- 单测重点：workspace 路径比对逻辑、面板关闭/归档触发、reload 自动重启路径、**workspace/session 查询 + 注入 payload 构造**；跨平台 CI（macOS/Linux/Windows）全绿。

---

*关联文档：discussion.md ｜ roadmap.md ｜ 全局 TODO.md ｜ product-strategy.md ｜ product-gap.md*
