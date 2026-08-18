# 工作区对齐（workspace-alignment）— 方案评审意见（review-by-gemini）

> 阶段：`feature / review` ｜ 日期：**2026-08-18** ｜ 状态：**二轮复审完成 · 正式批准（Fully Approved）**
> 评审对象：[`doc/feature/01-workspace-alignment/solution.md`](solution.md) 及关联文档 [`req.md`](req.md)、[`discussion.md`](discussion.md)

---

## 1. 总体评审结论（Verdict）

### 最终裁决：**完全批准（Fully Approved / Ready for Plan）**

在第二轮迭代中，`solution.md` 完整且准确地吸收了第一轮评审提出的全部 4 项核心风险与修订行动项（A-1 ~ A-5）。设计方案不仅修正了潜在缺陷，还通过引入 **`workspaceState` 自带的工程隔离特性**，优雅地省去了复杂的人工路径跟踪比对逻辑，代码复杂度大幅下降，架构鲁棒性显著提升。

---

## 2. 吸收修订对照与质量复查（Round 2 Verification）

| 评审关注项 | 原始方案缺陷 | 修订后方案（Refined Solution） | 验收判定 |
|---|---|---|---|
| **问题 1：多窗口状态竞态** | 使用跨窗口全局共享的 `globalState`，多工程同时打开时互相覆盖 `lastWorkspace`。 | 改用 **`context.workspaceState`**（T1/T3）。VS Code 天然按工作区隔离存储，多窗口互不干扰。同时无需再显式比对旧路径，逻辑显著精简。 | ✅ **彻底解决** |
| **问题 2：`deactivate()` 异步写入丢失** | `deactivate()` 中使用 `void update(...)` 浮动 Promise，进程强退或崩溃时落盘易丢失。 | 改在 **`manager.on("state")` 状态流转时即时同步** `dsh.wasRunning`（T3），`deactivate()` 仅负责清理停止（T4），消除时序依赖。 | ✅ **彻底解决** |
| **问题 3：跨平台路径归一化** | 直接字符串全等比对，易受 Windows 盘符大小写、斜杠方向影响。 | 新增 **`normalizePath(p, platform)`** 纯函数并支持平台注入测试（T1），覆盖 win32 大小写、尾斜杠与相对路径解析。 | ✅ **彻底解决** |
| **问题 4：多根工作区关闭粒度** | 监听 `onDidChangeWorkspaceFolders` 盲目触发 `panel.close()`，添加辅助文件夹时误关主会话。 | 增加 **`trackedRoot` 防抖比对**（T3），仅在主工作区根目录（`workspaceFolders[0]`）发生实质变化时才关闭面板。 | ✅ **彻底解决** |
| **测试设计（A-5）** | 单测用例覆盖不全。 | T6 补充了 `shouldAutoRestart` 三分支及 `normalizePath` 边界单测（win32 大小写、尾斜杠、空串解析）。 | ✅ **彻底解决** |

---

## 3. 实现阶段的微小最佳实践建议（Implementation Tips）

在后续编写 `plan.md` 和编码落地时，建议注意以下 1 个微小细节：
- **`onDidChangeWorkspaceFolders` 比对时复用 `normalizePath`**：
  在 `extension.ts` 中比较 `newRoot !== trackedRoot` 时，建议直接调用 `normalizePath(newRoot) !== normalizePath(trackedRoot)`，以确保跨平台极端路径格式变化时的一致性。

---

## 4. 结论与下一步

`doc/feature/01-workspace-alignment/solution.md` 已经过完整论证，技术可行性与边界约束清晰，**可立即推进至 `plan.md`（实施计划）编写及进入开发阶段**。

---
*归档：`doc/feature/01-workspace-alignment/review-by-gemini.md`*
