# 会话管理（session-management）— 解决方案（solution）

**日期**: 2026-08-19
**来源**: [req.md](req.md)、[discussion.md](discussion.md)、[roadmap.md](../roadmap.md) M2
**状态**: ⏳ 待用户批准（批准后进入 plan.md）

---

## 1. Goal（目标行为）

1. **侧边栏会话管理区**：launcher 内增加会话列表（标题 + `✎` 重命名 + `✕` 关面板 + 归档分区 + 空态）与 `＋新建会话`；
2. **多面板绑定多会话**：`＋新建会话` / 点列表项 → 打开**新编辑器面板**并注入 preset 指向目标会话；多面板并存互不影响；关面板不杀会话；
3. **窗口重载恢复**：同工作区普通重载自动重启 dsh 后，**恢复全部已开面板**（各自绑定原会话）。

## 2. Facts（已核实，2026-08-19 代码审计 + DSH 0.1.0-rc.7 实测）

### 2.1 当前代码现状

| 文件:行 | 现状 |
|---|---|
| `src/serverManager.ts:309-335` | `ensureWorkspaceSession(cwd)`：HTTP 信封 `POST /api/<method>`，body `{type:"client-request", rpcId, method, payload}`（:316），应答取 `result.value`（:322）；链路 workspace.list → create → session.list → session.create |
| `src/dshPanel.ts:85-87` | `DshPanel` 单例：私有 `panel`/`bridge`/`pendingPreset` |
| `src/dshPanel.ts:116-158` | `open(sessionPreset?)`：已有面板则 reveal+refresh，无则 createWebviewPanel + 新 BridgeHost |
| `src/dshPanel.ts:170-172` | `close()`：`panel?.dispose()`（不杀服务） |
| `src/dshPanel.ts:178-203` | `refresh()`：`assembleDocument({…, sessionPreset: this.pendingPreset, …})`（:194）——注入机制已就绪 |
| `src/extension.ts:46-63` | ready → `ensureWorkspaceSession` → `buildSessionPresetPayload` → `panel.open(preset)`（:57） |
| `src/extension.ts:69-73` | wasRunning → `manager.start`（自动重启） |
| `src/extension.ts:78-87` | 多根主根变化 → `panel.close()`（单面板） |
| `src/launcherView.ts:214-257` | `resolveWebviewView`：消息路由 start/stop/openPanel/upgrade（:217-230）；点图标自动启动（:252-256） |
| `src/launcherView.ts:261-283` | `refresh()`/`postWorkspace()`/`postStatus()` 推送 |
| `src/workspaceTracker.ts` | `normalizePath` / `shouldAutoRestart` / `buildSessionPresetPayload(sessionId)`（纯函数） |
| `src/i18nStrings.ts` + `src/i18n.ts` | 中央字符串表（9 语言列，`t()`/`langCode()`）；`test/i18n.test.js` 强制全列非空 |

### 2.2 DSH 协议事实（隔离实例实测，0.1.0-rc.7）

- `session.list` → `items[]`：`{sessionId, updatedAt, running, blank, parentSessionId?, origin?, cwd?, agentPreset?, projections:{asOfSeq, values:{title\|null, …}}}`——**标题 = `projections.values.title`**（未命名 null）；
- `session.rename {sessionId, title}` → `{title, seq}`；空/非法标题 → 错误码 `title-invalid`（sanitize 后为空才拒）；未挂载服务 → `internal`（"renaming is unavailable"）；
- `workspace.list` → `{items: [workspaceView], archivedSessionIds}`；
- `session.create {workspaceId}` → `{sessionId, agentPreset}`（必须 workspaceId，cwd 形式不挂 `workspace.sessionIds`——spike 发现）；
- 模型信息：`session.models {sessionId}` → `current`（每次调用**全量构建模型目录，较贵**）——**列表不显示模型名**（req 决策 2026-08-19），面板内 DSH UI 自显；
- 前端标题降级：`displayTitleOf(title, cwd, id)` = durable title → cwd basename → id（`dsh-client-runtime/lib/client.js:8828`）。

### 2.3 VS Code 行为事实

- **同 viewType 的 webview 共享一致 origin → 共享 localStorage**（VS Code 1.73+ release notes）→ `dsh.sessions.current` 是**多面板共享键**：每次面板加载/刷新必须注入该面板绑定的 preset，不能依赖天然隔离；
- `retainContextWhenHidden: true` 已开（`dshPanel.ts:129`）——面板隐藏不丢上下文，但**销毁重建**后 localStorage 状态需靠注入恢复；
- `context.workspaceState` 按工作区隔离持久（feature 01 已用 `dsh.wasRunning`）——可扩展存面板列表。

## 3. Gap（Goal − Facts）

| Goal | 现状 | 差距 |
|---|---|---|
| 会话列表（标题/✎/✕/归档/空态） | launcher 无会话区 | 需新增列表 UI + 数据源（`session.list`/`workspace.list` 轮询）+ 重命名交互 |
| 多面板绑定多会话 | 单 `DshPanel` 单例 | 需面板管理器：`Map<sessionId, DshPanel>` + 新建/聚焦/关闭/恢复 |
| 重命名 | 无 | 需 `session.rename` 调用 + inline 编辑 UI + 错误处理 |
| reload 恢复多面板 | 只恢复单面板 | 需持久化 sessionId 列表 + 恢复逻辑 |
| i18n | 现有键不含会话区 | 需新键 9 语言 |

## 4. Call-site Audit（契约变更检查）

| 变更点 | 调用方 | 分类 |
|---|---|---|
| `serverManager.ensureWorkspaceSession` **内部**重构（抽出私有 `api(method,payload)` helper，公开签名 `(cwd) => Promise<string>` 不变） | `extension.ts:52`、`test/serverManager.test.js` | **compatible**（行为不变） |
| `serverManager` **新增** `listSessions` / `listArchived` / `createSession` / `renameSession` | 新调用方（launcherView/extension） | 纯新增，无既有调用方 |
| `DshPanel` **新增可选** `sessionId` 绑定（构造第 3 参可选或 setter，默认 undefined） | `extension.ts:24` `new DshPanel(context, manager)` | **compatible**（可选参数不破坏） |
| `extension.ts` 单 `panel` 使用点（:57/:84/:89）→ 改 `SessionPanelManager` | 内部接线 | 无外部契约 |
| `DshLauncherView` 构造签名不变；消息路由**扩展** | `extension.ts:91-96` | **compatible**（仅新增消息类型） |
| `workspaceTracker` **新增** `sessionTitleOf` 纯函数 | 新调用方 | 纯新增 |

无 conflict 调用点 → 无需重设计。

## 5. 架构设计

### 5.1 模块划分（文件清单）

```
src/
  serverManager.ts        # 重构：抽 api() helper；新增 listWorkspaceSessions(cwd)（内部
                          #   工作区过滤 + archived 归类，建议 1）/createSession/
                          #   renameSession（title-invalid 归一化）
  workspaceTracker.ts     # 新增 sessionTitleOf(summary) 纯函数（title→basename→id 降级）
  dshPanel.ts             # DshPanel 支持 sessionId 绑定（可选）；新增 updateTitle(title)
                          #   （建议 3：tab 标题反映会话名）；restore 用 ViewColumn.Active
  sessionPanels.ts        # 新建：SessionPanelManager——多面板编排（open/close/closeAll/
                          #   restore/getOpenSessionIds；Map<sessionId, DshPanel>）
  launcherView.ts         # 会话管理区 UI（列表/重命名/新建/归档/空态/isOpen ✕）+ 消息
                          #   路由 + 5s 轮询（state 感知 + 防重入，建议 4）
  extension.ts            # 接线：ready/新建/打开/重命名/关闭/恢复/多根/tab 标题联动
  i18nStrings.ts          # 会话区新键（9 语言）
media/
  （无改动——会话列表渲染在 launcher webview 内，不走传输桥）
test/
  serverManager.test.js   # 新增 listWorkspaceSessions/renameSession 用例（mock fetch）
  workspaceTracker.test.js# 新增 sessionTitleOf 用例
  sessionPanels.test.js   # 新建：映射/恢复逻辑（vscode-free 部分）
  i18n.test.js            # 自动覆盖新键
```

### 5.2 数据契约（launcher webview ↔ extension host）

webview → host（新增消息）：

| type | 载荷 | 说明 |
|---|---|---|
| `new-session` | — | `session.create {workspaceId}` → 新面板 |
| `open-session` | `{sessionId}` | 已有面板 reveal；无则新建（注入 preset） |
| `rename-session` | `{sessionId, title}` | → `session.rename` → 列表刷新 |
| `archive-session` | `{sessionId}` | → `workspace.archiveSession`（归档）→ 关面板 + 列表刷新 |
| `refresh-sessions` | — | 手动刷新列表 |

host → webview（新增消息）：

| type | 载荷 |
|---|---|
| `sessions` | `{items: [{sessionId, title, running, updatedAt}], archived: string[]}`（标题已降级处理；`updatedAt` 供相对活跃时间显示，来自 `session.list` 既有字段，零额外调用） |
| `sessions-error` | `{message}`（列表加载失败提示） |

### 5.3 会话列表数据流

1. `DshLauncherView` 持有轮询定时器（**5s，仅 `manager.state === "ready"` 且 view 存活时**；state 非 ready → 暂停轮询并推送禁用/空态；`onDidDispose` 清除——建议 4）；
2. 每轮（**防重入**：`isPolling` 标记，上一轮未完成则跳过本轮，慢网络不堆积——建议 4）：
   `manager.listWorkspaceSessions(cwd)`（内部：`workspace.list` 按 `normalizePath` 匹配当前 cwd → 取其 `sessionIds` 过滤 `session.list` items → 附 `archivedSessionIds`——**建议 1**）→ `sessionTitleOf` 降级 → `postSessions({items, archived})`；
3. 失败：`postSessions` 空 + `sessions-error` 提示（不崩）；
4. 重命名/新建/关闭成功后立即触发一轮刷新（不等下个 tick）。

### 5.4 多面板编排（SessionPanelManager）

- 状态：`Map<sessionId, DshPanel>` + `workspaceState["dsh.panels"]: string[]`（sessionId 顺序 = 面板打开顺序，持久化）；
- `open(sessionId?, preset?)`：
  - 无 sessionId（openPanel 命令/ready 默认）→ **聚焦最近打开的面板**，无则开当前工作区会话面板（保持 feature 01 行为）；
  - 有 sessionId → Map 命中则 reveal；未命中则 `new DshPanel(context, manager, sessionId)` + `open(preset)`；
- `close(sessionId)`：对应面板 `dispose()`（onDidDispose 清理 Map 条目），**不调 manager.stop()**；更新持久化列表；
- `closeAll()`：多根主根变化时（feature 01 语义扩展为全部面板）；
- `restore(sessionIds[])`：wasRunning 自动重启后逐 sessionId 重建面板（各自 preset 注入）；**全部使用同一 `ViewColumn.Active`**——连续 `Beside` 会横向切分窗口（`dshPanel.ts:119,126` 现状），同列叠加成标签组更自然（**建议 6**）；
- **tab 标题联动**（**建议 3**）：`DshPanel` 新增 `updateTitle(title: string)`——`this.panel.title = title ? \`DSH: ${title}\` : PANEL_TITLE`；重命名成功与轮询拿到新标题时调用，多面板标签页可区分；
- `onDidDispose`（用户手关标签页）：从 Map/持久化移除，**会话保留**（对齐 R5）。

### 5.5 重命名与归档交互

**重命名（D7）**：列表项 `✎` 点击 → 该行切换为 inline 输入框（prefilled 当前标题，aria-label 齐全）；Enter → `postMessage {type:"rename-session", sessionId, title}` → 宿主 `manager.renameSession` → 成功刷新列表；`title-invalid` → 行内错误提示（不崩）；Esc → 取消恢复原样。

**归档（2026-08-19 用户验收反馈新增）**：列表项 `🗑` → `postMessage {type:"archive-session", sessionId}` → 宿主 `manager.archiveSession`（`workspace.archiveSession`，实测 0.1.0-rc.7 可用）→ 成功后关闭对应面板 + 刷新列表；DSH 归档为 **append-only**（只追加 `archivedSessionIds`，不移除 `workspace.sessionIds`）→ 扩展侧 `listWorkspaceSessions` 过滤活跃列表（已归档会话从活跃区消失、进入归档分区）；失败（`session-not-found`）→ warning 提示不崩；**会话不删除**（归档可恢复）。

### 5.6 安全

- 会话区全部走扩展侧 Node 直连（复用 `ensureWorkspaceSession` 信封路径，过 `/api` 围栏），**不经 webview 桥**——launcher webview 不获得服务器直连能力；
- 无新增服务器暴露面；CSP 不变；新增按钮均有 aria-label/键盘可达（Appendix B）。

## 6. 已知边界（MVP 接受）

- 列表轮询 5s（非事件推送）——会话增删最多 5s 延迟可见；手动刷新按钮兜底；
- 共享 localStorage 下，面板 A 内切换会话不影响面板 B 内存状态；面板 B 下次刷新按自身 preset 注入（已在 5.4 兜底）；
- 归档分区仅文字展示（不展开操作）；
- 会话删除（`session.delete`）不在本期（req N4，待上游 API 确认）。

## 7. 与 req.md 映射

| 需求 | 对应设计 |
|---|---|
| R1 会话管理器侧边栏（标题/✎/✕/归档/空态） | 5.2/5.3（launcher 会话区 + 轮询 + 工作区过滤）+ 5.5（重命名） |
| R1 重命名（`session.rename`） | serverManager.renameSession + 5.5 + tab 标题联动（5.4） |
| R2 多面板绑定多会话（＋新建/点列表/关面板不杀会话） | 5.4 SessionPanelManager |
| R2 重载恢复全部面板 | 5.4 restore（ViewColumn.Active）+ workspaceState["dsh.panels"] |
| R2 降级可接受（preset 失效 → 最近活跃） | 沿用 feature 01 注入机制（T7d），失败不注入不报错 |
| （贯穿）i18n/测试 | T7/T8 |

## 8. 评审修订记录（review-by-gemini 吸收情况）

**评审结论**：✅ 通过（建议采纳 6 项细节优化后批准进入 Plan 实施）——2026-08-19。

| 评审项 | 修订 | 状态 |
|---|---|---|
| 建议 1（会话列表按当前工作区过滤） | 数据链路改 `listWorkspaceSessions(cwd)`：`workspace.list` 匹配 cwd → `sessionIds` 过滤 → 附 `archivedSessionIds` | ✅ 已吸收（§5.3） |
| 建议 2（模型名提取） | **部分吸收**：查证发现 `agentPreset` 是字符串预设名（非对象），真模型名在 `session.models` API（每次全量构建目录，较贵）→ **用户决策：列表不显示模型名**（req 2026-08-19 修订），面板内 DSH UI 自显 | ✅ 已吸收（§2.2 + req R1） |
| 建议 3（tab 标题反映会话名） | `DshPanel.updateTitle(title)`；重命名成功 + 轮询新标题联动 | ✅ 已吸收（§5.4） |
| 建议 4（轮询 state 感知 + 防重入） | 仅 `ready` 且 view 存活时轮询；`isPolling` 防重入 | ✅ 已吸收（§5.3） |
| 建议 5（isOpen + ✕ 条件显示） | `sessions.items[].isOpen`；✕ 仅对已打开面板显示 | ✅ 已吸收（§5.2） |
| 建议 6（restore ViewColumn 策略） | restore 统一 `ViewColumn.Active`（连续 Beside 会横向切分） | ✅ 已吸收（§5.4） |

*关联文档：req.md ｜ discussion.md ｜ roadmap.md ｜ 全局 TODO.md ｜ review-by-gemini.md*
