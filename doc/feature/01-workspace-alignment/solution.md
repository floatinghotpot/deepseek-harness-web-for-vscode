# 工作区对齐（workspace-alignment）— 解决方案（solution）

**日期**: 2026-08-18
**来源**: [req.md](req.md)、[discussion.md](discussion.md)、[roadmap.md](../roadmap.md) M1
**状态**: ⏳ 待用户批准（批准后进入 plan.md）

---

## 1. Goal（目标行为）

DSH 的 workspace 锚点**自动对齐** IDE 工作区：

1. **切换文件夹（窗口重载）**：`deactivate()` 杀 dsh → 新窗口 activate 时，读 `workspaceState` 的 `dsh.wasRunning`（按工作区 key 隔离，天然区分"切换 vs 普通重载"）：
   - 路径**变**了 → 不自动重启 dsh、不自动开面板（用户点 `＋新建会话` / `openPanel`）；
   - 路径**没变**（普通重载：改设置/装扩展/更新）→ 自动重启 dsh 并恢复面板（A2 连续性）。
2. **同窗口多根变化**（`onDidChangeWorkspaceFolders`）：关闭 dsh4vscode 面板（旧工作区会话的视图），**不杀 dsh**。
3. **旧会话组归档保留**：DSH 内 `resolveByPath` 按路径组织，切走不删不迁，切回可恢复——本特性**不需要**显式归档代码，仅依赖 DSH 既有行为。

## 2. Facts（代码审计，均来自源码，非臆测）

### 2.1 当前代码现状

| 文件:行 | 现状 |
|---|---|
| `src/extension.ts:14-46` | `activate()`：单 `DshServerManager`；`manager.on("state")` → ready 时 `theme.syncNow()` + `panel.open()`；**不自动 start**（等用户命令）；注册 commands/statusBar/launcherView；`context.subscriptions.push({dispose: stop})` |
| `src/extension.ts:48-50` | `deactivate()`：`manager?.stop()` 杀 dsh（非 detached，`serverManager.ts:201`） |
| `src/dshPanel.ts:85-151` | `DshPanel`：私有 `panel`；`open()` 创建或 reveal；`onDidDispose` → bridge dispose；**无公开 `close()`** |
| `src/launcherView.ts:159-164` | 已监听 `onDidChangeWorkspaceFolders`，**只刷新页脚文字**（`postWorkspace()`），无面板/进程动作 |
| `src/commands.ts:8-10` | `workspaceRoot()` = `workspaceFolders[0].uri.fsPath` 或 `os.homedir()` |
| `src/serverManager.ts:179-250` | `start({cwd})` spawn `dsh web --port 0`；`isRunning` getter（`:168-170`）；`stop()` 优雅终止 |

### 2.2 DSH 协议事实（已核实）

- `workspaceRegistry.resolveByPath(path)`：命中复用、未命中 `create(path)`；会话挂 `workspace.sessionIds[]`（`dsh-host-apiproxy/lib/index.js:2194`）→ **旧会话组天然按路径保留**，无需显式归档
- `host.describe.cwd` = 宿主进程 cwd；扩展 spawn 时 `cwd: workspaceFolder`（spike-notes S3）
- `session.list` 每项独立 `running`（`summarize(session, running)`，apiproxy:1284）——本特性不调用，M2 用

### 2.3 VS Code 行为事实

- `File > Open Folder`（替换文件夹）→ **窗口重载**：扩展 deactivate → 重新 activate，`workspaceFolders` 已是新路径 → **主路径 = activate 时比对**，`onDidChangeWorkspaceFolders` 不适用于此场景
- `File > Add Folder to Workspace`（多根）→ **不重载**，`onDidChangeWorkspaceFolders` 触发（同进程）→ 副路径
- `context.workspaceState` 按当前工作区 key 隔离持久（存 `dsh.wasRunning`，多窗口互不干扰——review A-3）

## 3. Gap（Goal − Facts）

| Goal | 现状 | 差距 |
|---|---|---|
| activate 时区分"切换 vs 普通重载" | 无工作区级运行状态记录 | 需 `workspaceState` 存 `dsh.wasRunning`（按工作区 key 天然隔离，无需显式路径比对——吸收 review A-3） |
| 路径变了 → 不自动起 | 现状本来就不自动起 | **已满足**（新工作区无 `wasRunning` 记录 → 不触发 A2） |
| 路径没变 → 自动重启 dsh + 恢复面板 | 不自动 start | 需新增：activate 时读 `wasRunning` → `start()` |
| 运行状态持久化可靠 | 无记录 | 需 `manager.on("state")` 即时写入（避免 deactivate 浮动 Promise——review A-2） |
| 多根变化 → 关面板（仅主根变化时） | 只刷页脚 | 需 `DshPanel.close()` + 主根比对防抖（review A-4） |
| 路径比较跨平台可靠 | — | 需 `normalizePath`（win32 大小写/尾斜杠——review A-1） |
| 旧会话归档保留 | DSH 按路径天然保留 | **无需代码**（事实 2.2） |

## 4. Call-site Audit（契约变更检查）

本特性**不修改任何共享函数的既有契约**：

- `DshPanel` 仅**新增** `close()` 方法（`panel.dispose()` 语义，触发既有 `onDidDispose` 清理）——`open()`/`reveal()`/构造签名不变，无调用者受影响
- `extension.ts` / `launcherView.ts` 内部改动，无外部 API 变更
- `serverManager` / `bridgeCore` / `bridgeHost` **零改动**

无 conflict 调用点 → 无需重设计。

## 5. Tasks（具体实现）

### T1 — 新建 `src/workspaceTracker.ts`（vscode-free，可单测）

纯函数模块，集中"路径规范化 → 行为决策"逻辑（吸收 review-by-gemini 问题 1/3）：

```ts
import * as path from "node:path";

/** Normalize a workspace path for comparison: resolve, drop trailing slash,
 *  lower-case on win32 (drive-letter case). `platform` injectable for tests. */
export function normalizePath(p: string, platform: NodeJS.Platform = process.platform): string {
  let normalized = path.resolve(p);
  if (platform === "win32") normalized = normalized.toLowerCase();
  return normalized;
}

/**
 * Should the extension auto-restart dsh on activation?
 * Reads the workspace-scoped "was running" flag. Because `workspaceState`
 * is keyed by the current workspace folder, a reload of the SAME folder
 * keeps the record (→ restart), while opening a DIFFERENT folder has no
 * record (→ cold start). No explicit prev-path comparison needed.
 */
export function shouldAutoRestart(wasRunning: boolean | undefined): boolean {
  return wasRunning === true;
}
```

- **设计依据**：改用 `workspaceState` 后无需存储/比对上次路径（review-by-gemini A-3）——工作区 key 本身就编码了"是否切换"
- **完成标准**：`normalizePath` 三平台边界（win32 大小写/尾斜杠/空串→cwd）单测覆盖；`shouldAutoRestart` 三分支（true/false/undefined）

### T2 — `src/dshPanel.ts`：新增 `close()`

```ts
/** Close the editor tab (R5: the DSH session persists; the server is NOT stopped). */
close(): void {
  this.panel?.dispose(); // onDidDispose already clears panel/bridge
}
```

- 文件：`src/dshPanel.ts`，`open()`/`reveal()` 之后新增
- **完成标准**：`close()` 触发 `onDidDispose`（panel=undefined、bridge.dispose）；**不调用** `manager.stop()`

### T3 — `src/extension.ts`：activate 联动 + 状态即时持久化

```ts
// activate() 内，manager/panel 创建后：
const wasRunning = context.workspaceState.get<boolean>("dsh.wasRunning") ?? false;

// wasRunning 即时同步（吸收 review-by-gemini A-2：不依赖 deactivate 持久化）
manager.on("state", (info) => {
  const running = info.state === "ready";
  if (running !== context.workspaceState.get("dsh.wasRunning")) {
    void context.workspaceState.update("dsh.wasRunning", running);
  }
});

// 普通重载（同工作区，workspaceState 记录还在）→ 自动重启并恢复面板
if (shouldAutoRestart(wasRunning)) {
  manager.start({ cwd: workspaceRoot() }).catch(() => { /* state machine drives UI */ });
}

// 同窗口多根变化：仅当主工作区根（workspaceFolders[0]）变化才关面板
// （比对复用 normalizePath，跨平台路径格式一致——review 二轮 §3 建议）
let trackedRoot = workspaceRoot();
context.subscriptions.push(
  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const newRoot = workspaceRoot();
    if (normalizePath(newRoot) !== normalizePath(trackedRoot)) {
      trackedRoot = newRoot;
      panel.close(); // 关旧面板（不杀 dsh）；新工作区由用户主动开
    }
  })
);
```

- **注意**：`panel.open()` 已由 `manager.on("state" ready)` 触发（现状保留）——自动重启后 ready 即恢复面板
- **完成标准**：activate 后同工作区重载自动 start；切换文件夹不自动 start；多根仅主根变化关面板；`wasRunning` 随状态即时更新

### T4 — `src/extension.ts`：deactivate 收尾（不再承担持久化）

```ts
export function deactivate(): void {
  // wasRunning 已由 manager.on("state") 即时同步（T3），此处无需持久化
  manager?.stop();
}
```

- **完成标准**：deactivate 仅 stop；状态持久化不依赖本函数（吸收 review-by-gemini A-2 全部场景）

### T5 — i18n 文案

- R1 为**行为变更，无新用户可见文案**（不弹提示）→ **i18n 零新增**（避免 9 语言表膨胀）
- 若实现中发现需要提示（如自动重启失败），走 `vscode.window.showWarningMessage` 直接英文+`t()` 兜底，**本轮不新增键**

### T6 — 测试

- 新建 `test/workspaceTracker.test.js`（吸收 review A-5）：
  - `shouldAutoRestart`：true / false / undefined 三分支
  - `normalizePath` 边界：win32 盘符大小写（注入 `platform:"win32"`）、尾斜杠、空串（→ `path.resolve("")` = cwd，断言行为）、相对路径
- 全量 `npm test`（现有 25 个 + 新增）绿；`npm run compile`（tsc strict）零 issue

### T7 — UI 层工作区对齐（req R2，2026-08-18 补）

文件：`src/workspaceTracker.ts`（+2 纯函数）、`src/serverManager.ts`（+API 直连）、`src/extension.ts`（接线）、`media/bridge-client.js` 或 `documentAssembly.ts`（注入）

**背景**：DSH 前端初始工作区 = "最近活跃会话"所属工作区（`recentWorkspace` 按 `session.updatedAt`，`client.js:10083`），不看进程 cwd → 需在面板加载前预置 `localStorage["dsh.sessions.current"]`（Spike 实证可行，discussion §2.4）。

**子任务**：
- [ ] **T7a** `workspaceTracker.ts` 新增 `buildSessionPresetPayload(sessionId: string): string`——返回 `JSON.stringify({sessionId})`（对齐 `client.js:9275` 写入格式）；纯函数可单测
- [ ] **T7b** `serverManager.ts` 新增 `ensureWorkspaceSession(cwd: string): Promise<string>`——Node fetch 直连（无浏览器头过 `/api` 围栏）：
  1. `POST /api/workspace.list` → 找 `path === cwd`（注意 macOS realpath：`/tmp` vs `/private/tmp`，用 `normalizePath` 比较）的 workspace
  2. 无 → `POST /api/workspace.create {path: cwd}`（路径须真实存在）
  3. 取该 workspace 的一个会话 id：优先非 blank，否则 `POST /api/session.create {workspaceId}`（**必须用 workspaceId，cwd 方式不挂 `sessionIds`**——Spike 发现）
  4. 返回 sessionId
- [ ] **T7c** `extension.ts`：dsh ready 后（`manager.on("state" ready)` 内，`theme.syncNow()` 前）调用 `ensureWorkspaceSession(workspaceRoot())` → 把结果经 `panel` 传给 webview 注入
- [ ] **T7d** 注入点：在 `assembleDocument` 的 html 里、DSH module 脚本前插入 `<script>localStorage.setItem("dsh.sessions.current", <payload>)</script>`（复用既有 head 注入机制；module 脚本延迟执行，普通脚本先跑——时序可控）；payload 经 `panel` 传入
- [ ] **降级**：`ensureWorkspaceSession` 失败（网络/API 异常）→ 不注入，退回"最近活跃"行为（不崩不报错）

**完成标准**：
- 全新工作区启动 dsh → 面板显示该工作区（非其他最近工作区）；
- 切换工作区后重开面板 → 显示新工作区；
- `buildSessionPresetPayload` 单测覆盖（格式 + 特殊字符转义）；
- 降级路径：API 失败时不注入、不报错；
- 全量 `npm test` 绿 + tsc 零 issue

## 6. 验收对照（req R1 + R2）

| req 验收 | 任务 |
|---|---|
| R1 切换后旧面板全关、无残留 | T2/T3（重载天然清空 + 多根主根变化显式 close） |
| R1 扩展不因切换主动杀 dsh；旧会话归档保留 | 无 kill 代码（T3 只 close 面板）；DSH 按路径保留（事实） |
| R1 新工作区点 `＋新建会话`/openPanel 起 dsh（cwd=新工作区） | 现状命令已满足（`commands.ts:20` cwd=workspaceRoot） |
| R1 同工作区普通重载自动重启 + 恢复面板 | T3（workspaceState `wasRunning` → autoRestart + ready→open） |
| R1 无静默破坏 | 不删不迁（零 DSH 写入） |
| R2 全新工作区启动 → 面板显示该工作区 | T7（ensureWorkspaceSession + 注入预置） |
| R2 切换后重开面板 → 显示新工作区 | T7 |
| R2 降级可接受（注入失败 → 最近活跃，不崩） | T7 降级路径 |

## 7. 评审修订记录（review-by-gemini 吸收情况）

**二轮复审（2026-08-18）**：**完全批准（Fully Approved / Ready for Plan）**——4 项风险 + A-5 全部"彻底解决"判定。

| 评审项 | 修订 | 状态 |
|---|---|---|
| 问题 1（globalState 多窗口竞态） | 改用 `workspaceState`（A-3），并**简化**：无需显式上次路径比对 | ✅ 二轮确认彻底解决 |
| 问题 2（deactivate 浮动 Promise） | `wasRunning` 改由 `manager.on("state")` 即时写入（A-2） | ✅ 二轮确认彻底解决 |
| 问题 3（跨平台路径规范化） | `normalizePath` + platform 注入（A-1） | ✅ 二轮确认彻底解决 |
| 问题 4（多根关闭粒度） | 主根变化才 close（A-4） | ✅ 二轮确认彻底解决 |
| A-5（路径边界测试） | T6 补充 win32/尾斜杠/空串用例 | ✅ 二轮确认彻底解决 |
| 二轮 §3 实现期建议 | `onDidChangeWorkspaceFolders` 比对复用 `normalizePath` | ✅ 已吸收（T3） |
| 已知边缘（评审未列） | 单文件夹 ↔ `.code-workspace` 切换使 workspaceState key 变化 → 误判"切换"（保守不自动起） | 记录：可接受 |

*评审文档：review-by-gemini.md（二轮复审，状态：Fully Approved）*

---

*关联文档：req.md ｜ discussion.md ｜ roadmap.md ｜ product-strategy.md ｜ review-by-gemini.md*
