# 工作区对齐（workspace-alignment）— 实施计划（plan）

**日期**: 2026-08-18
**来源**: [req.md](req.md)、[solution.md](solution.md)、[review-by-gemini.md](review-by-gemini.md)（二轮 Fully Approved）
**状态**: ⏳ 待用户批准

## RTTM（需求 → 任务 → 验证）

| 需求 | 任务 | 验证方式 |
|---|---|---|
| R1 工作区切换联动：切换→关面板不自动起 | T2, T3 | 单测（workspaceTracker）+ 手工：切换文件夹后无残留面板、dsh 不自动起 |
| R1 普通重载→自动重启 + 恢复面板 | T1, T3, T4 | 手工：同工作区重载后 dsh 自动重启、面板恢复；切换文件夹不触发 |
| R1 多根仅主根变化关面板 | T3 | 手工：Add Folder 辅助目录不关面板；替换主根关面板 |
| R1 无静默破坏（不删不迁） | T3（零 DSH 写入） | 代码审查：无 `session.*`/`workspace.*` 写调用 |
| R2 UI 层对齐：面板显示 IDE 工作区 | T7（T7a–T7d） | 单测（payload 构造）+ 手工：全新工作区启动显示该工作区；切换后重开显示新工作区 |
| R2 降级可接受 | T7 降级路径 | 手工：API 失败不注入、不崩 |
| （贯穿）质量 | T5, T6 | `npm test` 全绿（25 + 新增）；`npm run compile` 零 issue |

## 任务清单

### T1 — 新建 `src/workspaceTracker.ts`（vscode-free 纯函数）
文件：`src/workspaceTracker.ts`（新建）
- [ ] `normalizePath(p, platform = process.platform)`：`path.resolve` 归一化 + win32 小写化（盘符大小写），platform 可注入供测试
- [ ] `shouldAutoRestart(wasRunning: boolean | undefined)`：`=== true` 即自动重启（workspaceState 记录还在 = 同工作区重载）
- [ ] 模块零 vscode import（保持可单测）
- **完成标准**：两函数签名与 solution T1 一致；tsc strict 通过；单测见 T6

### T2 — `src/dshPanel.ts` 新增 `close()`
文件：`src/dshPanel.ts`（`open()`/`reveal()` 之后，~line 156）
- [ ] `close(): void { this.panel?.dispose(); }`——触发既有 `onDidDispose`（panel=undefined、bridge.dispose）
- [ ] **不调用** `manager.stop()`（R5：关标签页不杀服务）
- **完成标准**：`close()` 后 `open()` 可重建面板；dsh 进程仍在运行（手工验证）

### T3 — `src/extension.ts` activate 联动 + 状态即时持久化
文件：`src/extension.ts`（activate 内，manager/panel 创建后）
- [ ] 读 `context.workspaceState.get<boolean>("dsh.wasRunning") ?? false`
- [ ] `manager.on("state")` 即时同步 `dsh.wasRunning`（`ready`→true；`stopped`/`error`→false；仅值变化时 update）——review A-2
- [ ] `if (shouldAutoRestart(wasRunning)) manager.start({ cwd: workspaceRoot() })`（ready 后既有逻辑自动 open 面板）
- [ ] `onDidChangeWorkspaceFolders`：`normalizePath(newRoot) !== normalizePath(trackedRoot)` 才更新 trackedRoot + `panel.close()`——review A-4 + 二轮 §3
- [ ] 订阅 push 进 `context.subscriptions`
- **完成标准**：同工作区重载自动 start；切换文件夹不 start；多根仅主根变化关面板；`wasRunning` 随状态即时更新

### T4 — `src/extension.ts` deactivate 收尾
文件：`src/extension.ts`（`deactivate()`）
- [ ] 删除 T4 原先设想的持久化逻辑（已由 T3 即时同步覆盖）
- [ ] 保持 `deactivate(): void { manager?.stop(); }` 不变
- **完成标准**：deactivate 仅清理；不依赖其持久化（review A-2 判定彻底解决）

### T5 — i18n 确认（零新增）
文件：`src/i18nStrings.ts`（只审查，不改）
- [ ] 确认 R1 无新用户可见文案（不弹提示）→ 9 语言表零新增
- [ ] 若实现中发现必需提示（如自动重启失败），走 `showWarningMessage` 直英 + `t()` 兜底，**本轮不新增键**
- **完成标准**：`test/i18n.test.js` 全绿（表未膨胀）

### T6 — 单测
文件：`test/workspaceTracker.test.js`（新建）
- [ ] `shouldAutoRestart`：`true`→true / `false`→false / `undefined`→false
- [ ] `normalizePath` 边界（review A-5）：
  - win32 盘符大小写（注入 `platform:"win32"`）：`C:\a` vs `c:\a` → 相等
  - 尾斜杠：`/a/b` vs `/a/b/` → 相等
  - 空串：`normalizePath("")` = `path.resolve("")`（cwd）——断言不抛错
  - 相对路径：`a/b` vs `./a/b` → 相等
- [ ] 全量 `npm test`（现有 25 + 新增）绿
- **完成标准**：`npm test` 全绿；`npm run compile` 零 issue

### T7 — UI 层工作区对齐（req R2，2026-08-18 补）✅
文件：`src/workspaceTracker.ts`（T7a）、`src/serverManager.ts`（T7b）、`src/extension.ts`（T7c）、`documentAssembly.ts`/`dshPanel.ts`（T7d）
- [x] **T7a** `buildSessionPresetPayload(sessionId): string`——`JSON.stringify({sessionId})`，纯函数（对齐 `client.js:9275` 写入格式）
- [x] **T7b** `ensureWorkspaceSession(cwd): Promise<string>`——Node fetch 直连：`workspace.list` 找 path 匹配（`normalizePath` 比较，含 realpath）→ 无则 `workspace.create {path}` → 取会话或 `session.create {workspaceId}`（**必须 workspaceId**）→ 返回 sessionId
- [x] **T7c** `extension.ts`：dsh ready 时调 `ensureWorkspaceSession(workspaceRoot())` → payload 传 panel
- [x] **T7d** 注入：`assembleDocument` 在 DSH module 脚本前插 `<script>localStorage.setItem("dsh.sessions.current", payload)</script>`（复用 head 注入机制）
- [x] **降级**：`ensureWorkspaceSession` 失败 → 不注入、不报错（退回"最近活跃"）
- **完成标准**：全新工作区启动显示该工作区 ✅（手工）；切换后重开显示新工作区 ✅；payload 单测覆盖 ✅；降级不崩 ✅；全量测试绿（37/37）✅

### T8 — 点图标自动启动（UX 优化，2026-08-18）✅
文件：`src/launcherView.ts`（`resolveWebviewView`）
- [x] 视图打开时若 `!manager.isRunning && state !== "starting"` → `manager.start({cwd: workspaceRoot()})`
- [x] 幂等安全（`isRunning` 守护 + `start()` 幂等）；失败由状态机驱动 UI
- **完成标准**：点活动栏图标 → dsh 未启动则自动启动 ✅（手工）；已就绪不重复启动 ✅

### T9 — G-03 版本软校验 + 升级辅助（2026-08-18）✅
文件：`src/versionCheck.ts`（纯函数）、`src/versionCheckService.ts`（vscode 接线）、`src/serverManager.ts`（dshVersion/dshBinPath getter）、`src/launcherView.ts`（升级提示行）、`src/extension.ts`（接线）、`src/i18nStrings.ts`（upgrade.* 键）
- [x] `compareVersions`（semver + 预发布：rc.6 < rc.7 < 0.1.0）；`isUpdateAvailable`（双可解析才提示）
- [x] `upgradeCommandFor`（按 dshBinPath 推断：npx 缓存 / npm 全局 / nvm / npm-global）
- [x] `checkForUpdates`：后台查 npm registry（5s 超时，离线静默）；24h 门（无缓存结果时允许重试）；结果存 workspaceState
- [x] `showUpgradeOptions`：QuickPick（推荐 + npm 全局 + npx + 复制命令）→ 集成终端预填（`sendText(cmd, false)`，不自动执行）
- [x] launcherView：状态区下升级提示行（`Update available: x.y.z →`），点击触发；`upgradeInfo` 严格比较（相等不显示）
- [x] `dshVersion`/`dshBinPath` getter（start 时记录）
- **完成标准**：rc.6 显示升级提示 ✅；升级 rc.7 后提示消失 ✅（相等不显示）；点击 → QuickPick + 终端预填 ✅；单测 11 项（versionCheck.test.js）✅

### T10 — 侧边栏精炼（UX，2026-08-18）✅
文件：`src/launcherView.ts`、`src/i18nStrings.ts`
- [x] 按钮全宽（`display:block; width:100%`）、纵向排列：已就绪时 **Stop DeepSeek Harness（上）/ Open View（下）**
- [x] 状态两行：第一行 `dsh {version} running`（版本+状态），第二行 URL（小字灰色）
- [x] 移除副标题 "Launch and embed the DSH Web UI"（保留 logo + 标题）
- [x] 按钮文案 9 语言同步（start/stop/openPanel）
- **完成标准**：侧边栏按钮全宽、顺序正确 ✅（手工）；状态两行显示版本+URL ✅；9 语言 i18n 测试通过 ✅

## 依赖关系

```
T1（workspaceTracker 纯函数）
   ↓
T2（DshPanel.close） ──┐
T3（extension 联动，依赖 T1/T2）── T4（deactivate 收尾，依赖 T3）
T5（i18n 确认，可与 T3 并行）
T6（单测，依赖 T1/T3 完成后验证）
T7（UI 对齐，T7a 依赖 T1；T7b 依赖 serverManager；T7c/T7d 依赖 T3 就绪）
```

## 状态

- T1–T10 全部 ✅ 已实现（`npm test` 48/48 绿，tsc 零 issue）
- 手工验证：场景 1（普通重载自动重启）✅、场景 2（切换不自动起）✅、T7（UI 对齐）✅、T8（图标自动启动）✅、T9（G-03 升级提示 + 升级后消失）✅、T10（侧边栏精炼）✅
- **⏭️ 受限（2026-08-18）**：场景 3（多根）未单独验证——**双 IDE 同一 `~/.dsh` 且同工作区+同会话 → 无锁并发写 → 会话损坏**（`session-3a1a080e` seq gap）。用户实测确认：**不同工作区/不同会话不冲突**，仅"同工作区 + 同会话"冲突。**决策**：接受为已知限制（不根治共享 dsh，保持每 IDE 各管各的简单架构）；场景 3 回归后续评估。
- 多 IDE 同工作区写冲突：**已知限制**（决策接受，不根治）

---

*关联文档：req.md ｜ solution.md ｜ review-by-gemini.md ｜ discussion.md*
