# DeepSeek Harness for VS Code — 验证报告（verification）

**日期**: 2026-08-17 ｜ **阶段**: Feature Pipeline 收口审计（Auto）
**范围**: MVP（req R1–R7，plan T1–T12）｜ **验证方式**: 单测 20/20 + 真实 dsh 集成 + 用户 F5 手工验收

---

## 1. RTTM 覆盖复查（req → plan → 证据）

| 需求 | 任务 | 代码位置（存在且被调用 ✓） | 验证证据 |
|---|---|---|---|
| R1 启动（≤10s、幂等） | T1,T2,T3 | `src/serverManager.ts`（`DshServerManager.start`/`parseUrlLine`/`resolveDshPath`）→ 被 `commands.ts`、`dshPanel.ts`、`extension.ts` 调用 ✓ | 单测 6 项；真实 dsh 集成 1.3s 就绪；用户 F5 ✓ |
| R2 内嵌 Web UI（编辑器标签页） | T4–T9 | `src/documentAssembly.ts`（`assembleDocument` → `dshPanel.ts:168`）、`src/bridgeCore.ts`（`relayHttp`/`WsRelay` → `bridgeHost.ts`）、`media/bridge-client.js`（`dshPanel.ts:164` 读取注入）、`src/dshPanel.ts`（`BridgeHost` 创建）✓ | 单测 10 项（documentAssembly）+ 4 项（bridge）+ 6 项（bridge-client shim，含 `/undefined` 回归）；用户 F5：渲染、流式对话、剪贴板、添加工作区 ✓ |
| R3 停止/清理/异常提示 | T2,T3,T9 | `serverManager.stop()`（SIGTERM+6s SIGKILL）、exit→error 状态、`dshPanel` 覆盖层、`statusBar` 错误态 ✓ | 单测（stop 干净退出 code=0）；用户 F5：`server exited (code=0)` ✓ |
| R4 当前文件夹为工作区 | T2 | `commands.workspaceRoot()` + `start({cwd})`、`launcherView` 工作区页脚 ✓ | 集成：`host.describe.cwd`==workspace；用户确认 ✓ |
| R5 共享实例 | T2 | spawn 不设 `DSH_HOME`（默认 `~/.dsh`）✓ | 用户 F5：与浏览器 3080 会话互通 ✓ |
| R6 打包与元数据 | T10 | `package.json`（files 白名单/nls/publisher `floatinghotpot`/engines/icon）、`README.md`、`LICENSE` ✓ | `vsce package` → 25 文件 30.37KB vsix；`vsce ls` 干净 ✓ |
| R7 主题跟随 | T12 | `src/themeSync.ts`（settings.update）+ `media/bridge-client.js`（matchMedia shim）+ `dshPanel`（themeDark/theme-preference）✓ | 用户 F5：深色首载 + 实时切换 ✓ |

**非目标 N1–N7**：N1 已移入 R7（req 2026-08-17 修订）；N2–N7 按设计排除，见 §4 遗留项。

## 2. 单测与集成证据

- `npm test`：**20/20 通过**（serverManager 6 + documentAssembly 4 + bridgeHost 4 + bridgeClient 6）
- 真实 dsh 集成（沙箱）：spawn→就绪→`host.describe`→`relayHttp`（含 `host.pickDirectory` 200）→文档组装（真实 dist 下载 + 改写注入）→SIGTERM 干净退出
- 回归测试覆盖历史 bug：`/undefined` 405（URL 对象 `.href`）、glob 目录算错、bridge `var bridge` 丢失

## 3. 关键实现决策复核（对 solution.md 的偏离与原因）

| solution 原设计 | 实际实现 | 原因（有据） |
|---|---|---|
| 侧边栏 WebviewView 承载 DSH UI | **编辑器标签页（WebviewPanel）+ 侧边栏轻量启动器** | 用户 2026-08-17 需求变更（侧边栏与资源管理器树重叠）；req R2 已修订 |
| 主题：settings.update（ui-theme） | settings.update **保留** + **新增 matchMedia shim** | 查证发现：webview 页面 hostname 非回环 → `isLoopback=false` → settings scope 走 memory 模式（`client-connection/client.js:10167`、`dsh-client-ui-settings` load() no-op）→ 客户端读不到偏好；matchMedia shim 使 "system" 解析跟随 VS Code 主题（桥内实测链路） |
| 传输桥（fetch/WS/剪贴板） | 同设计，实现为 bridgeCore（纯）+ bridgeHost（vscode 接线） | 为单测拆分 vscode 依赖 |

## 4. 差距清单（Gap Log）

| # | 差距 | 严重度 | 建议动作 |
|---|---|---|---|
| G1 | **扩展总是另起 dsh 进程**，不挂接用户已运行的实例（如 3080）——req N5 未实现 | P2（体验） | 实现"共享实例探测"：固定端口探测 `host.describe`，命中则 attach 不 spawn；排入 TODO |
| G2 | 中继 `http-abort` 是 best-effort（宿主不真正 abort，靠客户端 30s 超时兜底） | P3（性能） | 桥协议加 AbortController 传递；TODO |
| G3 | 下载（session.export）全缓冲 ArrayBuffer 回传，大文件内存占用线性增长 | P3 | 后续改流式（分块 postMessage）；TODO |
| G4 | dsh 二进制解析依赖 npx 缓存 mtime 启发式，多版本环境仍可能取旧版 | P3 | 中长期改为扩展内置固定版本 dsh 或版本校验（spawn 后核对 `dsh --version`）；TODO |
| G5 | 嵌入式页面 settings scope 为 memory 模式（isLoopback 假），除主题外其他 host 设置（locale 等）不生效 | P2 | 上游 PR 候选：让 client-connection 支持显式 loopback 声明；或桥内补充 settings 镜像；TODO |
| G6 | vscode.dev / 远程开发不支持（req N6） | P2（已知边界） | 文档明示；不排期 |
| G7 | 主题切换时已打开页面依赖 DSH 自身 live-apply（未验证其存在）；`theme-preference` 消息仅驱动 matchMedia，settings 侧不推送 | P3 | 若发现 live-apply 缺失，重载面板兜底；TODO |

## 5. 结论

**MVP 验收通过**（R1–R7 全部达成，20/20 单测，用户 F5 手工验收覆盖渲染/对话/剪贴板/主题/共享实例/生命周期）。实现与 solution 的两处偏离（编辑器标签页形态、matchMedia 主题修复）均有需求变更或源码查证依据，已记录于 req/discussion/spike-notes。G1–G5、G7 流入 TODO.md（⏭️ 延后项）。

*关联文档：req.md ｜ solution.md ｜ plan.md ｜ spike-notes.md ｜ discussion.md*
