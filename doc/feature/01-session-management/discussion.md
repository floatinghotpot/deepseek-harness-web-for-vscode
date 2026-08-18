# 会话管理（session-management）— 讨论记录（discussion）

> 阶段：Feature Pipeline 第一份文档（原始记录，一旦 req.md 存在即只读）｜ 日期：2026-08-18
> 本文件记录动机、讨论、决策与已核实事实；新需求请直接写入 req.md。

---

## 1. 动机

- 来源：[roadmap.md](../roadmap.md) **M1 会话管理（v0.2.x）**——依赖链：架构（✅）→ M1 → M2 IDE 上下文 → M3 编排；
- 现状痛点（product-gap.md §2 差距）：
  - 单例面板 + 单实例，无法多会话对比、无法直观管理会话；
  - 切工作区 = dsh 被杀 + 面板关 + 要重开 + 手动切 DSH 工作区——"心智连续"价值最大破坏点；
  - dsh 二进制解析靠 npx 缓存 mtime 启发式（G4/verification.md），多版本环境可能取到旧版。

## 2. 关键决策记录

### 2.1 架构定盘（协议事实，2026-08-18 已定）

- **DSH 单实例即可多会话并行、各绑 cwd**：`session.create` 收 `workspaceId` 或 `cwd`（二选一）；`running` 是会话级；`agent-busy` 只拦**同一会话**的重复 prompt，不同会话互不影响 → 多工作区/多模型 = 多会话，**无需多实例管理**；
- **workspace 按路径组织**：`workspaceRegistry.resolveByPath(path)` 命中复用、未命中 `create(path)`；会话挂在 workspace 的 `sessionIds[]` 下 → **IDE 工作区路径 = DSH workspace = 会话组唯一锚点**；
- → "多实例管理"不是必需，本 feature 重点 = **会话级编排（G-12）+ 工作区锚点联动（G-02）**。

### 2.2 G-12 会话管理器侧边栏（重定位，2026-08-18 已定）

- 形态：侧边栏**会话管理器**（status + `＋新建会话` + 会话列表），与现有轻量启动器（launcherView）的关系待 solution 定（合并增强 vs 新视图）；
- 会话列表每行：`✕` **关编辑器标签页**（= R5 语义，**会话持久**，不删除会话）+ 显示**模型名**区分（建议，未最终确认）；
- **同工作区绑定**：会话默认 cwd = IDE 工作区根，列表不显示 cwd；
- `＋新建会话`：无进程则起、有则复用开会话；
- 关编辑器标签页 ↔ 列表同步消失（基于 `session.list` + host 事件流刷新）。

### 2.3 G-02 工作区切换联动（定盘，2026-08-18）

- **会话级切换，不杀进程**：`onDidChangeWorkspaceFolders` → 旧路径会话组**可选归档**，新路径 `resolveByPath/create` 自动起新会话组；
- 默认**自动跟随 + 可选确认**（具体默认值待 req 评审）；
- **A2 先行**：窗口 reload 杀 dsh（非 detached 子进程）→ 扩展 re-activate 时**自动重启 dsh**（冷启动可接受）；A1（detached 常驻）延后。

### 2.4 G-03 dsh 版本软校验

- spawn 后核对 `dsh --version`；低于目标版本（≥0.1.0-rc.6）→ **UI 警告**（状态栏/通知），不硬阻断；
- 版本获取方式：`spawnSync --version`（Windows 下 `shell: true`，见 fix/20260817-cross-platform/record.md）。

## 3. 已核实事实清单（供 req/solution 引用，均来自源码/实测，非臆测）

- **会话级 API**：`session.create {workspaceId|cwd}`（二选一，`sessionCreateRequestSchema`）；`running: boolean` 会话级（`summarize(session, running)`）；`agent-busy` 只拦同会话重复 prompt（apiproxy）
- **workspace 按路径唯一**：`resolveByPath(path)` 复用/创建；会话挂 `workspace.sessionIds[]`（apiproxy 2194/2026/3101）
- **cwd 锚点**：`host.describe.cwd` = 宿主进程 cwd；扩展 spawn 时 `cwd: workspaceFolder`（spike-notes S3）
- **当前代码现状**：
  - `extension.ts:15` 单一 `DshServerManager`；`dshPanel.ts:85` 单 `panel`，`open()` 只 reveal 不新建
  - `launcherView.ts:162` 已监听 `onDidChangeWorkspaceFolders`，但**只刷新页脚文字**，无迁移逻辑
  - `deactivate()` → `manager.stop()` 杀 dsh（非 detached，`serverManager.ts:201`）；面板标签页关闭不杀进程（`dshPanel.ts:142-144` 只 dispose bridge）
- **版本探测**：`spawnSync --version` 可用；Windows 需 `shell: true`（fix/20260817-cross-platform/record.md）

## 4. 开放问题（req 评审时确认）

1. **会话管理器与现有启动器的关系**：合并增强 launcherView vs 独立新视图（影响 UI 布局；solution 阶段定，req 需确认形态不冲突）；
2. **G-02 确认策略**：工作区切换默认"自动跟随"还是"弹确认"？（反模式要求不静默破坏会话与 cwd 绑定——"可选归档"已覆盖；确认粒度待定）
3. **会话列表显示模型名**：建议显示（多模型会话靠模型名区分），待确认；
4. **G-03 阈值**：`≥0.1.0-rc.6`（与 T16 一致），待确认；
5. **G-01 attach 探测**（T13）：V-02 `host.describe.cwd` 探测可靠性未验证 → **不在本 feature**，仍留 TODO（G-01 单独排期）。

*关联文档：roadmap.md ｜ 全局 TODO.md ｜ product-strategy.md ｜ product-gap.md ｜ 00-dsh-vscode/verification.md*
