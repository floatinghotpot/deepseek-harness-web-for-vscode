# 产品差距分析（Product Gap）—— 现状与目标对照

**日期**: 2026-08-18 ｜ **状态**: 待评审
**定位**: 策略的"现状→目标"差距依据；基于代码与 DSH 协议**事实**，非臆测。
**来源**: [product-strategy.md](product-strategy.md)（目标/价值）、v0.0.10 代码、@deepseek-ai/dsh 协议（host-apiproxy）

---

## 1. 当前能力事实（Facts，v0.0.10）

| 面 | 现状 |
|---|---|
| 命令 | 4 个：`start` / `stop` / `openBrowser` / `openPanel`（全进程/面板级，零 IDE 能力） |
| 传输桥 | fetch / WebSocket / 剪贴板全透传；DSH 全部 API 可达（`session.*`、`workspace.*`、`settings.*`、`host.*` 等） |
| UI | 单一编辑器标签页（`DshPanel` 单例，`open()` 只 reveal 不新建）+ 侧边栏启动器 + 状态栏；9 语言；主题跟随 |
| 平台 | macOS / Linux / Windows 三平台 CI 全绿 |
| 进程 | spawn（**非 detached**，依附扩展宿主，`stdio: ignore/pipe/pipe`，`serverManager.ts:201`）；SIGTERM 优雅退出（Windows 进程树 `taskkill /T /F`） |
| 生命周期钩子 | 三处主动 stop：`deactivate()`（窗口重载/关闭）、`dispose()`（`extension.ts:42-49`）、命令 stop（`commands.ts:29`）；**面板标签页关闭不杀进程**（R5 设计，`dshPanel.ts:142-144` 只 dispose bridge） |
| 单实例 | `extension.ts:15` 单一 `DshServerManager`；`dshPanel` 单 `panel`（`dshPanel.ts:85`），`open()` 只 reveal 不新建；启动器"启动/停止"单实例语义 |
| 多会话能力（DSH 协议层） | **一个 dsh 实例可并行跑多个会话，各自绑定 cwd/workspace**：`session.create` 收 `workspaceId` 或 `cwd`（二选一，`sessionCreateRequestSchema`）；`running: boolean` 是会话级（`summarize(session, running)`）；`agent-busy` 只拦**同一会话**的重复 prompt，不同会话互不影响 → 多工作区/多模型 = 多会话，**无需多实例** |
| workspace 按路径组织 | DSH `workspaceRegistry` **按路径唯一**：`resolveByPath(path)` 命中即复用、未命中 `create(path)`；会话挂在 workspace 的 `sessionIds[]` 下（`apiproxy 2194/2026/3101`）→ **IDE 工作区路径 = DSH workspace = 会话组唯一锚点**；会话默认 cwd = 宿主进程 cwd（扩展 spawn 时已设为 IDE 工作区） |
| 工作区切换断链 | 打开新文件夹 → VS Code 窗口重载 → `deactivate()` → `manager.stop()` 杀 dsh；扩展未监听 `onDidChangeWorkspaceFolders` 做迁移（仅 `launcherView.ts:162` 刷新页脚文字）→ 切项目 = dsh 冷启动 + 手动重切工作区 |

## 2. 差距（Gap）—— 按价值层对照

| 价值层 | 现状 | 差距 | 需要的桥能力 |
|---|---|---|---|
| **高效便捷** | 内嵌了，但仍要手动复制粘贴代码、手动描述报错、手动找文件、手动多起进程 | ① 无 IDE 上下文注入（选区/文件/诊断 → DSH）；② 无 attach（总起新进程）；③ 无路径点击跳转 | `ide-request-context` 协议、cwd-aware attach（T13/G-01）、`ide-open-file`（G-10） |
| **心智连续** | 单窗口内嵌，但"选代码→问→看→跳"全靠手动搬运；**切工作区 = dsh 被杀 + 面板关 + 要重开，且 DSH 内工作区不跟随** | ① 无选区右键快捷提问；② 聊天窗路径不可点；③ **工作区切换无生命周期联动**（扩展未监听 `onDidChangeWorkspaceFolders` 来迁移/重启 dsh，只刷新启动器页脚文案 `launcherView.ts:162`） | `session.prompt` 注入（G-11）+ 文档级点击拦截 + **工作区切换联动（G-02：dsh 跟随/自动切到新文件夹）** |
| **零成本接入** | 同一 `~/.dsh`、一键启动、跨平台 | **基本达成**，保持即可 | — |
| **生态放大** | 桥透传全部 API，但扩展**未暴露任何 IDE 侧能力**（4 个命令全是进程/面板级） | 缺多会话并排编排（当前单例面板，无法双会话对比） | 多面板实例 + 会话编排 |

## 3. 结论

- **差距的本质**：当前是"网页进 IDE"，尚未是"IDE 上下文进 DSH"——桥是通的（API 全可达），缺的是**把编辑器侧的能力接上桥**（注入/跳转/编排）；
- **生命周期缺口**：切工作区 = dsh 被杀 + 面板关 + 要重开 + 手动切 DSH 工作区——**这是"心智连续"价值的最大破坏点**，优先级应高于纯体验优化；
- **架构定盘（协议事实）**：DSH **单实例即可多会话并行、各绑 cwd**（workspace/模型是会话级属性）——"多实例管理"不是必需，重点转为 **G-02 工作区联动（会话级切换）+ 多会话面板编排**；
- 因此 v0.1.x 的 P0 全部是"桥侧接线"工作，不碰 DSH。

*关联文档：product-strategy.md ｜ roadmap.md ｜ TODO.md*
