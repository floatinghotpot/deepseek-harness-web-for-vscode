# 工作区对齐（workspace-alignment）— 总结（summary）

**日期**: 2026-08-18 ｜ **阶段**: Feature Pipeline 收口完成

## 做了什么

实现了 DSH workspace 锚点与 IDE 工作区**自动对齐**（G-02 + UI 层对齐 + 图标自动启动 + G-03 版本软校验），落实"桥"定位中**心智连续**价值。

### 核心能力

1. **工作区切换联动（R1/G-02）**：
   - 切换文件夹 → 关面板、不自动起（冷启动，用户主动开）；
   - 同工作区普通重载（改设置/装扩展/更新）→ **自动重启 dsh + 恢复面板**（A2 连续性）；
   - 多根仅主根变化关面板（辅助目录变化不打断对话）；
   - 不杀进程、旧会话归档保留（零 DSH 写调用）。
2. **UI 层工作区对齐（R2）**：全新工作区启动 dsh → 前端自动显示该工作区（经 `dsh.sessions.current` 预置注入，Spike 实证）。
3. **点图标自动启动（UX）**：点活动栏图标 → dsh 未启动则自动启动。
4. **G-03 版本软校验 + 升级辅助**：旧版 dsh 时侧边栏提示 "Update available: x.y.z →"；点击 → QuickPick 按安装方式推荐升级命令（npx/npm 全局/nvm）；24h 门防打扰、集成终端预填不自动执行；升级后提示自动消失（严格版本比较）。

### 关键设计（含评审吸收）

- `workspaceState`（按工作区隔离）驱动 `wasRunning` → 天然区分"切换 vs 普通重载"，**无需显式路径比对**（review-by-gemini A-3 简化）；
- `wasRunning` 由 `manager.on("state")` **即时同步**，不依赖 `deactivate()` 浮动 Promise（A-2）；
- `normalizePath`（win32 大小写/尾斜杠，platform 可注入）跨平台可靠（A-1）；
- `ensureWorkspaceSession`：`workspace.create {path}` + `session.create {workspaceId}`（**必须 workspaceId**——`cwd` 方式不挂 `sessionIds`，Spike 发现）；
- 版本比较支持 semver 预发布（`rc.6 < rc.7 < 0.1.0`）；升级命令按 `resolveDshPath` 命中路径推断；
- 评审：review-by-gemini 二轮 **Fully Approved**。

### 代码变更

- 新增：`src/workspaceTracker.ts`（normalizePath / shouldAutoRestart / buildSessionPresetPayload，纯函数）、`test/workspaceTracker.test.js`、`src/versionCheck.ts`（compareVersions / isUpdateAvailable / upgradeCommandFor / shouldCheckVersion）、`src/versionCheckService.ts`（checkForUpdates / cachedLatest / upgradeInfo / showUpgradeOptions）、`test/versionCheck.test.js`
- 修改：`src/extension.ts`（activate 联动 + wasRunning 即时同步 + 多根比对 + ready 预置 + checkForUpdates 接线）、`src/serverManager.ts`（`ensureWorkspaceSession` + `dshVersion`/`dshBinPath` getter）、`src/dshPanel.ts`（`close()` + `open(preset?)`）、`src/documentAssembly.ts`（sessionPreset 注入）、`src/launcherView.ts`（图标自动启动 + 状态两行显示版本/URL + 升级提示行 + 全宽按钮布局）、`src/i18nStrings.ts`（按钮文案精炼 + upgrade.* 键 + readyVersion）
- 测试：`test/documentAssembly.test.js`（注入断言 + 时序）
- **单测 48/48 绿，tsc strict 零 issue**

## 文档产物

`doc/feature/01-workspace-alignment/`：discussion（含方向调整 + Spike 结论）/ req（R1–R3）/ solution（T1–T7 + 评审记录）/ plan（T1–T8）/ verification / review-by-gemini（二轮批准）。

## 已知限制（Known Limitation）

- **多 IDE 同工作区会写冲突**：**不要用两个 IDE（如 Antigravity + VS Code）的 dsh4vscode 同时打开同一个工作区并操作同一会话**——两个 dsh 进程共享 `~/.dsh` 且无写锁，会造成会话日志损坏（实证：`session-3a1a080e` seq gap）。单 IDE、或双 IDE 但不同工作区/不同会话，均无此问题。**决策（2026-08-18）**：接受为已知限制，不投入根治（共享 dsh 服务增加复杂度），保持"每 IDE 各管各的 dsh"简单架构。
- `dsh.sessions.current` 是 DSH 内部键，版本升级可能变更 → 版本软校验（G-03）兜底。

*关联文档：verification.md ｜ TODO.md ｜ plan.md*
