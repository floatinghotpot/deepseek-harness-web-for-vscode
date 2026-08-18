# 工作区对齐（workspace-alignment）— 验证报告（verification）

**日期**: 2026-08-18 ｜ **阶段**: Feature Pipeline 收口审计（Auto）
**范围**: req R1（工作区切换联动）+ R2（UI 层对齐）+ 点图标自动启动（UX 优化）
**验证方式**: 单测 37/37 + tsc strict 零 issue + 用户手工验收（dev host）

---

## 1. RTTM 覆盖复查（req → plan → 证据）

| 需求 | 任务 | 证据 |
|---|---|---|
| R1 切换→关面板、不自动起 | T2/T3 | `dshPanel.close()`（`dshPanel.ts`）+ activate 联动（`extension.ts`）✓；手工：切换文件夹后无面板、dsh 不自动起 ✓ |
| R1 普通重载→自动重启 + 恢复面板 | T1/T3/T4 | `workspaceState.dsh.wasRunning` 即时同步 + `shouldAutoRestart`；手工：Reload Window 后自动重启、面板恢复 ✓ |
| R1 多根仅主根变化关面板 | T3 | `onDidChangeWorkspaceFolders` + `normalizePath` 主根比对 ✓ |
| R1 无静默破坏 | T3 | 零 DSH 写调用（仅 `workspaceState` 本地）；代码审查 ✓ |
| R2 UI 层对齐（面板显示 IDE 工作区） | T7a–T7d | `ensureWorkspaceSession`（serverManager）+ `buildSessionPresetPayload` + 注入脚本；手工：全新工作区启动 → UI 自动切到该工作区 ✓ |
| R2 降级可接受 | T7 降级 | API 失败不注入、不报错（`extension.ts` try/catch）✓ |
| （附加）点图标自动启动 | launcherView | `resolveWebviewView` 若未运行则 `start()`；手工：点图标 → dsh 自动启动 ✓ |
| G-03 版本软校验 + 升级辅助 | versionCheck + service | 手工：rc.6 显示 "Update available: rc.7 →"；升级到 rc.7 后提示消失（相等不显示）；点击 → QuickPick + 终端预填 ✓ |
| （附加）侧边栏精炼 | launcherView + i18n | 全宽按钮（Stop 在上 / Open View 在下）+ 状态两行（版本 + URL）+ 移除副标题 ✓ |

## 2. 逐项确认代码存在且被调用（非死代码）

| 代码 | 位置 | 调用链 |
|---|---|---|
| `normalizePath` | `src/workspaceTracker.ts` | `serverManager.ensureWorkspaceSession` + `extension.ts` 多根比对（均有调用）✓ |
| `shouldAutoRestart` | `src/workspaceTracker.ts` | `extension.ts` activate 自动重启 ✓ |
| `buildSessionPresetPayload` | `src/workspaceTracker.ts` | `extension.ts` ready 处理器 ✓ |
| `ensureWorkspaceSession` | `src/serverManager.ts` | `extension.ts` ready 处理器（try/catch 降级）✓ |
| `DshPanel.close()` | `src/dshPanel.ts` | `extension.ts` 多根变化 ✓ |
| `DshPanel.open(preset?)` | `src/dshPanel.ts` | `extension.ts` ready → panel.open(preset) ✓ |
| sessionPreset 注入 | `src/documentAssembly.ts` | `dshPanel.refresh()` 传参 ✓ |
| 图标自动启动 | `src/launcherView.ts` | `resolveWebviewView` ✓ |
| `compareVersions` / `isUpdateAvailable` | `src/versionCheck.ts` | `versionCheckService.upgradeInfo` → launcherView postStatus ✓ |
| `upgradeCommandFor` | `src/versionCheck.ts` | `versionCheckService.showUpgradeOptions` ✓ |
| `checkForUpdates` / `cachedLatest` | `src/versionCheckService.ts` | `extension.ts` ready → onResult → launcher.refresh ✓ |
| `showUpgradeOptions` | `src/versionCheckService.ts` | `extension.ts` launcherView onUpgrade 回调 ✓ |

## 3. 测试与质量

- `npm test` **48/48 全绿**（37 + versionCheck 11）
- `npm run compile`（tsc strict）零 issue
- 新增单测覆盖：`shouldAutoRestart` 三分支、`normalizePath` 四边界、`buildSessionPresetPayload` 序列化/转义、注入时序（localStorage 写在 module 脚本前）、`compareVersions` 预发布排序、`upgradeCommandFor` 路径推断、`shouldCheckVersion` 24h 门

## 4. 用户手工验收记录

| 场景 | 结果 |
|---|---|
| 场景 1：同工作区 Reload Window → 自动重启 + 面板恢复 | ✅ 通过 |
| 场景 2：切换文件夹 → 不自动起、无面板 | ✅ 通过 |
| T7：全新工作区启动 dsh → UI 自动切到该工作区 | ✅ 通过 |
| 点活动栏图标 → dsh 自动启动 | ✅ 通过 |
| G-03：rc.6 显示升级提示；升级到 rc.7 后提示消失 | ✅ 通过 |
| G-03：点升级 → QuickPick 选方式 → 终端预填 | ✅ 通过 |
| 场景 3：多根变化 | ⚠️ **受限**（见 §5） |

## 5. 发现的差距（Gap）与处置

| # | 差距 | 严重度 | 处置 |
|---|---|---|---|
| G-01 | **已知限制：多 IDE 同一 `~/.dsh` 写冲突**——两个 dsh 进程共享 `~/.dsh` 无锁，若**同一工作区 + 选中同一会话** → 并发写同一文件 → 会话日志损坏（实证：`session-3a1a080e` seq gap）。用户实测确认：**不同工作区/不同会话不冲突**，仅"同工作区 + 同会话"冲突 | **P1** | 作为**已知限制**记录（用户确认可接受：每 IDE 各管各的 dsh，多 IDE 同工作区非目标场景）；场景 3 回归待后续评估 |
| G-02 | 场景 3（多根）验证被上述冲突阻塞 | P2 | 已知限制场景；后续评估是否需要补验 |
| G-03 | `dsh.sessions.current` 是 DSH 内部键（非公开 API），版本升级可能变更 | P3 | **已由 G-03 版本软校验兜底**（旧版提示升级）；失效降级为"最近活跃"（不崩） |
| G-04 | "点图标自动启动"未入 plan（UX 优化补充） | P3 | 记入 summary；后续 plan 修订可纳入 |

> **已知限制（用户可感知）**：**不要用两个 IDE（如 Antigravity + VS Code）的 dsh4vscode 同时打开同一个工作区并操作同一会话**——两个 dsh 进程共享 `~/.dsh` 且无写锁，会造成会话日志损坏。单 IDE、或双 IDE 但不同工作区/不同会话，均无此问题。**决策（2026-08-18）**：不投入根治（共享 dsh 服务会增加复杂度），保持"每 IDE 各管各的 dsh"简单架构，此限制作为已知限制接受。

## 6. 结论

- **feature 01（工作区对齐）达成**：R1 + R2 验收通过，适配绝大多数场景（单 IDE + 不同工作区/不同会话）；
- **已知限制**：双 IDE 同工作区共享 `~/.dsh` 会写冲突——**决策接受为已知限制**（不根治，保持每 IDE 各管各的 dsh 简单架构）；
- 单测/编译全绿，代码路径全部激活。

---

*关联文档：req.md ｜ solution.md ｜ plan.md ｜ review-by-gemini.md ｜ discussion.md*
