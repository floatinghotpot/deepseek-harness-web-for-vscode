# 会话管理（session-management）— 实施计划（plan）

**日期**: 2026-08-19
**来源**: [req.md](req.md)、[solution.md](solution.md)、[discussion.md](discussion.md)
**状态**: ⏳ 待用户批准

## RTTM（需求 → 任务 → 验证）

| 需求 | 任务 | 验证方式 |
|---|---|---|
| R1 会话列表（标题/✎/✕/归档/空态） | T1, T2, T5, T7 | 单测（sessionTitleOf/API 解析）+ 手工：列表显示标题与降级名、归档分区、空态 |
| R1 重命名（`session.rename` + inline 编辑） | T1, T5 | 单测（rename 请求/错误归一化）+ 手工：重命名后列表与 DSH UI 同步；空标题拒绝提示 |
| R2 多面板（＋新建/点列表/关面板不杀会话） | T3, T4, T5, T6 | 单测（映射/恢复逻辑）+ 手工：多面板并存、独立会话、关面板会话保留 |
| R2 重载恢复全部面板 | T4, T6 | 手工：Reload Window 后各面板绑定原会话恢复 |
| （贯穿）质量/i18n | T7, T8, T9 | `npm test` 全绿；`npm run compile` 零 issue；i18n 9 语言表完整 |

## 任务清单

### T1 — serverManager：抽 api helper + 会话 API
文件：`src/serverManager.ts`（`ensureWorkspaceSession` 内嵌 api 于 :312-323 抽出）
- [ ] 抽出私有 `private async api(method, payload): Promise<any>`（信封 :316 逻辑原样迁移，行为不变）
- [ ] `ensureWorkspaceSession` 改用 `this.api(...)`（公开契约 `(cwd) => Promise<string>` 不变）
- [ ] 新增 `listWorkspaceSessions(cwd): Promise<{items: SessionSummary[], archived: string[]}>`——**内部完成工作区过滤**（建议 1）：`workspace.list` 按 `normalizePath` 匹配 cwd → 取其 `sessionIds` 过滤 `session.list` items → 附 `archivedSessionIds`
- [ ] 新增 `createSession(workspaceId): Promise<string>`——`session.create` → `result.value.sessionId`
- [ ] 新增 `renameSession(sessionId, title): Promise<{title: string, seq: number}>`——`session.rename`；`title-invalid` 错误归一化为带 code 的 Error（`Error` 上挂 `code`）
- [ ] 导出类型 `SessionSummary`（sessionId/updatedAt/running/blank/agentPreset/projections.values.title）
- **完成标准**：`npm test`（serverManager 既有 6 项仍绿）；新增 API 单测（见 T8）；tsc 零 issue

### T2 — workspaceTracker：sessionTitleOf 纯函数
文件：`src/workspaceTracker.ts`（40 行，追加）
- [ ] `sessionTitleOf(summary: SessionSummary): string`——`projections.values.title` 非空 → 返回；否则 cwd 的 basename（`path.basename`，空则 sessionId 前缀）——对齐 DSH `displayTitleOf`（client.js:8828）
- [ ] 零 vscode import（保持可单测）
- **完成标准**：单测覆盖三分支（有标题 / 无标题有 cwd / 都空）

### T3 — dshPanel：sessionId 绑定 + tab 标题
文件：`src/dshPanel.ts`
- [ ] 构造第 3 参可选 `sessionId?: string`（默认 undefined，不破坏 `extension.ts:24` 现有调用）
- [ ] 暴露 getter `get sessionId(): string | undefined`
- [ ] 新增 `updateTitle(title: string)`（建议 3）：`this.panel.title = title ? \`DSH: ${title}\` : PANEL_TITLE`（空/undefined → 恢复默认）
- [ ] 不改 open/close/refresh 语义（`open(preset)` 注入机制保持）
- **完成标准**：现有单测/编译绿；`new DshPanel(context, manager)` 仍可用；updateTitle 生效

### T4 — 新建 sessionPanels.ts：SessionPanelManager
文件：`src/sessionPanels.ts`（新建）
- [ ] 状态：`Map<sessionId, DshPanel>`；构造注入 `context`/`manager`/持久化回调
- [ ] `open(sessionId?, preset?)`：无 sessionId → 聚焦最近面板（无则开当前工作区会话面板，保持 feature 01 默认行为）；有 → 命中 reveal / 未命中 `new DshPanel(context, manager, sessionId).open(preset)` 并登记
- [ ] `close(sessionId)`：dispose 对应面板（**不调 manager.stop()**），Map 移除
- [ ] `closeAll()`：全部面板 dispose（多根变化语义扩展）
- [ ] `getOpenSessionIds(): string[]`（按打开顺序；isOpen 数据源——建议 5）
- [ ] `restore(sessionIds: string[])`：逐个 `open(sessionId, preset)`；**统一 `ViewColumn.Active`**（建议 6：连续 Beside 横向切分 → 同列叠加成标签组）
- [ ] 面板 `onDidDispose`（用户手关标签页）→ Map/持久化同步移除（会话保留）
- [ ] `openPanel()` 兼容入口（现有命令/launcher 语义）
- **完成标准**：vscode-free 核心逻辑（映射/顺序/持久化序列化）可单测；手工：多面板并存 + 关面板会话保留

### T5 — launcherView：会话管理区
文件：`src/launcherView.ts`
- [ ] `launcherHtml` 增加会话管理区：`＋新建会话`（全宽次级按钮）+ 会话列表（**会话标题** + `✎` `✕`，未命名显示降级名）+ 归档分区 + 空态；按钮 aria-label 齐全
- [ ] webview 侧 JS：列表渲染（`sessions` 消息，含 `isOpen`——建议 5）、`✎` → inline 输入框（Enter 提交 / Esc 取消）、**`✕` 仅 `isOpen` 时显示**、点击项 → `open-session`、`＋新建` → `new-session`
- [ ] 消息路由扩展：`new-session` / `open-session` / `rename-session` / `close-session` / `refresh-sessions`（宿主侧处理，复用 `postStatus` 模式）
- [ ] 轮询（建议 4）：**仅 `manager.state === "ready"` 且 view 存活时** `setInterval` 5s 调 `postSessions()`（`listWorkspaceSessions(workspaceRoot())` → `sessionTitleOf` → `postMessage {type:"sessions", items, archived}`）；state 非 ready → 暂停并推送禁用/空态；`onDidDispose` 清除定时器；**`isPolling` 防重入**（上一轮未完成跳过本轮）；失败发 `sessions-error`（不崩）
- [ ] 重命名/新建/关闭成功后立即触发一轮刷新（不等下个 tick）
- **完成标准**：手工：列表实时反映会话增删/标题变更；重命名 inline 可用；空态/归档正确；✕ 仅对已打开面板显示；点图标自动启动回归不受影响

### T6 — extension.ts：接线
文件：`src/extension.ts`
- [ ] 单 `panel` 替换为 `SessionPanelManager`（`new DshPanel` 处 :24 → manager 持有）
- [ ] ready 处理器（:46-63）：`ensureWorkspaceSession` → preset → `panels.open(undefined, preset)`（保持默认打开当前工作区会话面板）
- [ ] `＋新建会话`：`manager.createSession(workspaceId)`（workspaceId 来自 `ensureWorkspaceSession` 的 workspace 解析或 `workspace.list` 匹配）→ `panels.open(sessionId, preset)`
- [ ] launcher 回调：`openPanel` → `panels.open()`；新增 newSession/openSession/renameSession/closeSession 回调接线
- [ ] **tab 标题联动**（建议 3）：重命名成功回调 → `panels` 对应面板 `updateTitle(新标题)`；轮询拿到的标题变化时同步（T5 数据流经 panels 查询）
- [ ] 持久化：`workspaceState["dsh.panels"]` 随 `panels` 变化更新（sessionId 顺序数组）；wasRunning 自动重启后（:69-73 路径）→ `panels.restore(持久化列表)`
- [ ] 多根主根变化（:78-87）：`panel.close()` → `panels.closeAll()`
- [ ] `registerCommands` 的 openPanel 回调（:89）指向 `panels.open()`
- **完成标准**：手工：Reload Window 恢复全部面板（同列标签组）；切换文件夹关全部面板不杀 dsh；新建/关闭/重命名/tab 标题联动全链路通

### T7 — i18n 新键（9 语言）
文件：`src/i18nStrings.ts`
- [ ] 新键：`sessions.new`（＋新建会话）/ `sessions.empty`（暂无会话）/ `sessions.archived`（归档）/ `sessions.rename`（重命名占位/aria）/ `sessions.title`（会话区标题）等（按实现需要，最小集）
- [ ] 每键 9 语言全填（en/zh/ja/ko/ru/es/pt/fr/de）
- **完成标准**：`test/i18n.test.js` 全绿（全列非空强制）

### T8 — 测试
文件：`test/serverManager.test.js`、`test/workspaceTracker.test.js`、`test/sessionPanels.test.js`（新建）
- [ ] serverManager：`listWorkspaceSessions` 解析 + **工作区过滤**（mock：多 workspace 多会话 → 只返回匹配 cwd 的 sessionIds + archived）、`renameSession` 请求构造 + `title-invalid` 归一化（mock fetch）
- [ ] workspaceTracker：`sessionTitleOf` 三分支（有标题/无标题有 cwd/都空）
- [ ] sessionPanels：映射增删、`getOpenSessionIds` 顺序、持久化列表序列化、restore 顺序（vscode-free 部分 mock `DshPanel`）
- [ ] 全量 `npm test` 绿 + `npm run compile` 零 issue
- **完成标准**：`npm test` 全绿（现有 49 + 新增）；tsc 零 issue

### T9 — 收口（verification/summary/TODO）
文件：`doc/feature/02-session-management/{verification,summary,TODO}.md`、`plan.md` 状态表
- [ ] 手工验收清单：req R1/R2 逐条打勾（含多面板、重命名、恢复、降级）
- [ ] verification.md（RTTM 复查 + 代码存在且被调用）
- [ ] summary.md + TODO.md（机械提取 ❌/⏭️）
- **完成标准**：管线文档齐备；R1/R2 验收通过

## 依赖图（ASCII）

```
T1（serverManager API）──┬── T5（launcher 会话区，依赖 T1/T2）──┐
T2（sessionTitleOf）──────┘                                    ├── T6（extension 接线，依赖 T4/T5）── T9（收口）
T3（DshPanel 绑定）── T4（SessionPanelManager，依赖 T3）────────┘
T7（i18n，可与 T5/T6 并行）── T8（测试，覆盖 T1/T2/T4）── T9
```

（T1/T2/T3 可并行；T4 依赖 T3；T5 依赖 T1/T2；T6 依赖 T4/T5；T7/T8 随时可做；T9 收尾）

## 任务状态

| 任务 | 状态 |
|---|---|
| T1 serverManager 会话 API（含工作区过滤） | ✅ |
| T2 sessionTitleOf | ✅ |
| T3 DshPanel 绑定 + tab 标题 | ✅ |
| T4 SessionPanelManager | ✅ |
| T5 launcher 会话区（isOpen/轮询健壮） | ✅ |
| T6 extension 接线（恢复/tab 联动） | ✅ |
| T7 i18n 新键 | ✅ |
| T8 测试 | ✅ |
| T9 收口 | ✅ |

> 实现记录：73/73 单测绿 + tsc 零 issue + 真实 dsh 集成验证 PASS（见 [verification.md](verification.md)）。实现期发现并修复：macOS realpath 匹配 bug（`sameFsPath`）、空白会话累积（复用 blank）、全局 button 样式污染（Gemini 定位，doc/fix/20260819-session-x-offset/）、restore 并发下载踩踏（dist 锁）。**用户 F5 多轮反馈（2026-08-19）**：新增 `✕` 归档（含关面板）、归档区可展开、全部会话列出（blank 显示 "New Session"）、打开/新建改堆叠（`ViewColumn.Active`）、默认面板绑定会话；**已知限制（用户决策不修）**：平铺布局 Reload 后 Antigravity 恢复空面板占位（堆叠布局无此问题）。

## 评审吸收（review-by-gemini，2026-08-19）

建议 1–6 已吸收进 T1–T6（详见 [solution.md](solution.md) §8）；建议 2（模型名）经查证 `agentPreset` 为字符串预设名、真模型名在 `session.models`（调用较贵）→ **用户决策：列表不显示模型名**（req R1 已修订）。

---

*关联文档：req.md ｜ solution.md ｜ discussion.md ｜ roadmap.md*
