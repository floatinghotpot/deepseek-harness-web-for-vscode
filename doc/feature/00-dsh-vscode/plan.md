# DeepSeek Harness for VS Code — 实施计划（MVP）

**日期**: 2026-08-17
**来源**: [req.md](req.md)、[solution.md](solution.md)、[spike-notes.md](spike-notes.md)
**状态**: ⏳ 待用户批准

## RTTM（需求 → 任务 → 验证）

| 需求 | 任务 | 验证方式 |
|---|---|---|
| R1 启动（≤10s、幂等） | T1, T2, T3 | 单测 + 手工：命令执行 ≤10s 就绪；重复触发幂等 |
| R2 内嵌（端到端对话、完整功能、剪贴板） | T4, T5, T6, T7, T8 | 手工：对话成功；复制/粘贴可用（V8 修复验证）；`/` 命令菜单可用 |
| R3 停止/清理/异常提示 | T3, T9 | 单测 + 手工：停止后无残留进程；异常退出面板提示 |
| R4 当前文件夹为工作区 | T2 | `host.describe.cwd` == workspace 根 |
| R5 共享实例（默认 ~/.dsh） | T2 | 与浏览器同 URL 会话互通 |
| R6 打包与元数据 | T10 | `vsce package` 成功；vsix 可安装激活；元数据完整 |
| R7 主题跟随 | T12 | 切换 VS Code 主题 → DSH 跟随；`themeSync: off` 不写入 |
| （贯穿）质量 | T11 | 单测通过；验收清单全勾 |

## 任务清单

### T1 — 工程脚手架 ✅
文件：`package.json`、`tsconfig.json`、`src/extension.ts`、`media/icon.svg`、`.vscode/{launch,tasks}.json`
- [x] package.json：`name: deepseek-harness-for-vscode`、`displayName: DeepSeek Harness for VS Code`、`publisher: floatinghotpot`、`engines.vscode: ^1.90.0`、`main: out/extension.js`、`viewsContainers.activitybar` + `views`（webview 侧边栏）、`commands`（start/stop/openBrowser）、`configuration`（`deepseekHarness.themeSync`，R7）、`categories`、`repository`
- [x] tsconfig：`strict`、`target ES2022`、`module Node16`、`outDir out`、`rootDir src`
- [x] npm scripts：`compile` / `watch` / `package`（vsce）/ `test`（tsc + node --test）
- [x] 依赖：typescript / @types/vscode ^1.90 / @types/node ^18 / @vscode/vsce（npm 缓存重定向 `.npm-cache`，沙箱内不写 `~/.npm`）
- **完成标准**：`npm run compile` 零错误 ✅；`vsce ls` 清单有效 ✅；F5 开发宿主可激活（T3 联调时确认）

### T2 — DshServerManager（自 spike 抽取）✅
文件：`src/serverManager.ts`、`test/serverManager.test.js`
- [x] 二进制解析：env `DSH_BIN` → `npm prefix -g` → 常见路径 → nvm → npx 缓存（含 glob 展开，S6）
- [x] `spawn(bin, ["web","--port","0"], { cwd })`（F1/F3）；`DSH_HOME` 可覆盖（隔离模式预留）
- [x] stdout 解析 `dsh web: http://127.0.0.1:<port>`；就绪超时（默认 10s）
- [x] 状态机 `stopped→starting→ready→stopping→stopped` + `error`（ENOENT/超时/异常退出带文案）
- [x] 停止：SIGTERM + 6s SIGKILL 兜底（F4）；幂等
- [x] 单测 6/6：parseUrlLine / resolveDshPath(fixture home) / ready+stop / 幂等 / 超时 / ENOENT
- [x] 集成验证（真实 dsh）：1.3s 就绪、`host.describe.cwd`==workspace、停止后 `stopped`
- **完成标准**：单测全绿 ✅；≤10s 就绪 ✅；cwd 正确 ✅（R1/R3/R4/R5 前提）

### T3 — 命令与生命周期集成 ✅
文件：`src/commands.ts`、`src/extension.ts`
- [ ] `dsh.start` / `dsh.stop` / `dsh.openBrowser` 命令
- [ ] `deactivate` 清理子进程；面板 dispose 联动提示（不杀服务，R5 共享实例保持）
- [ ] 子进程异常退出 → `server-status {state:'error'}` → 面板提示（R3）
- **完成标准**：命令面板全通；退出扩展无残留进程；崩溃提示可见

### T4 — 文档组装 ✅
文件：`src/documentAssembly.ts`、`test/documentAssembly.test.ts`
- [ ] `GET /` 取 index.html（含 `__DSH_BOOT__`）
- [ ] 拉取 `assets/` 整树 → `globalStorage/dsh-dist/`（带哈希，dist 变化时重拉，F9/F10）
- [ ] index.html 改写：`/assets/*` → `asWebviewUri`（F11 字体/模块同源）；`__DSH_BOOT__.entries[].url` → 绝对服务器 URL（F14）
- [ ] 注入 `__DSH_BRIDGE__`、`bridge-client.js`、CSP meta（F15）
- [ ] 单测：改写结果断言（URL 前缀、plugin URL 绝对化、无残留相对 `/assets`）
- **完成标准**：单测全绿；面板渲染无 404/无 CORS 报错（控制台核查）

### T5 — fetch 桥（含二进制）✅
文件：`media/bridge-client.js`、`src/bridgeHost.ts`
- [ ] bridge-client：拦截 webview-origin fetch → `http` 消息；`new Response(body,{status,headers})`；`blob:`/`data:`/`vscode-webview-resource:` 放行；AbortSignal 转发
- [ ] bridgeHost：Node fetch 代发（F2 放行）；AbortController；`arrayBuffer()` 全缓冲回传（下载 F12 可走）
- [ ] 超时对齐（30s，客户端 `postJson` 默认）
- **完成标准**：对话/工作区/设置等所有一元 API 可用；`session.export` 下载可触发（二进制链路通）

### T6 — WebSocket 桥 ✅
文件：`media/bridge-client.js`、`src/bridgeHost.ts`
- [ ] bridge-client `BridgeWebSocket`：`open/message/close` 事件、`readyState` 常量、`close()`（对齐 F13 用法）
- [ ] bridgeHost：Node `globalThis.WebSocket`（无则 `ws` 包）连 `/api/events.mux`、`/api/events.host`；帧原样透传（F12）
- [ ] 断线重连语义与客户端 `handleClose` 对齐
- **完成标准**：对话流式输出实时到达；host 事件（工作区变更/会话增删）面板即时反映

### T7 — 剪贴板 shim（V8 修复）✅
文件：`media/bridge-client.js`、`src/bridgeHost.ts`
- [ ] `Object.defineProperty(navigator, 'clipboard', …)`：`writeText/readText` → `clipboard-write/read` 消息
- [ ] bridgeHost → `vscode.env.clipboard.writeText/readText`
- **完成标准**：面板内复制按钮可复制到系统剪贴板；输入框可粘贴（V8 场景复测）

### T8 — 面板 Provider（2026-08-17 修订：侧边栏 → 编辑器标签页）✅
文件：`src/dshPanel.ts`（原 panelProvider.ts，WebviewView → WebviewPanel）
- [ ] `WebviewViewProvider`：`localResourceRoots` 含 `globalStorage/dsh-dist/`；`enableScripts`、`retainContextWhenHidden`
- [ ] 消息路由（协议表 solution §5.2）；`server-status` 透传渲染（starting/ready/error 覆盖层）
- [ ] 打开/刷新时重新组装文档（T4 幂等）
- **完成标准**：侧边栏视图出现；加载态/错误态正确；刷新后 UI 可用

### T9 — 崩溃提示与状态 UI ✅
文件：`src/dshPanel.ts`（原 panelProvider.ts，WebviewView → WebviewPanel）、`src/extension.ts`
- [ ] 子进程 exit（非 0 或异常）→ 面板"DSH 服务已停止，请重新启动"（R3）
- [ ] 状态栏项：启动中/就绪(URL)/已停止
- **完成标准**：kill 子进程后面板出现提示；状态栏正确

### T10 — 打包与元数据 ✅
文件：`package.json`、`README.md`、`CHANGELOG.md`（可选）
- [ ] 元数据齐全：icon、repository、engines、categories、description 含 "DeepSeek Harness / VS Code / Antigravity / 内嵌" 关键词（req R6）
- [ ] `vsce package` 通过；vsix 体积核验；`vsce ls` 无多余文件
- [ ] 双渠道发布说明（Microsoft Marketplace + Open VSX，Antigravity 兼容）
- **完成标准**：vsix 可安装到第二台 VS Code 并激活（R6）

### T11 — 测试与验收 ✅
文件：`test/*`、`doc/feature/00-dsh-vscode/verification.md`（后续自动产出）
- [ ] 单测：serverManager / documentAssembly / 桥协议（mock）
- [ ] 手工验收清单：对齐 req R1–R6 验收标准逐条打勾（含 V8 剪贴板复测）
- [ ] 自审：每 2–3 个任务对照 req.md 查缺
- **完成标准**：全部 R 项验收通过 → verification.md 收口

### T12 — 主题跟随（R7）✅
文件：`src/themeSync.ts`
- [ ] 设置项 `dshForVscode.themeSync`（默认 `follow`，`off` 不写入）
- [ ] 监听 `vscode.window.onDidChangeActiveColorTheme`；面板打开时同步一次
- [ ] Node 直连 `POST /api/settings.update {ns:'ui-theme', patch:{preference:'dark'\|'light'}}`（F2 放行、热生效）
- **完成标准**：VS Code 深色 ↔ DSH 深色即时跟随；`off` 时零写入（R7）

## 依赖图（ASCII）

```
T1 脚手架
 ├─ T2 serverManager ── T3 命令/生命周期 ── T12 主题跟随(依赖 T2)
 └─ T4 文档组装 ── T5 fetch桥 ── T6 WS桥 ── T7 剪贴板 ── T8 面板Provider ── T9 状态UI
                                                                           └─ T10 打包 ── T11 测试验收
```

（T4–T7 可并行开发；T8 依赖 T4–T7；T12 依赖 T2 可与 T3 并行；T10/T11 收尾）

## 任务状态

| 任务 | 状态 |
|---|---|
| T1 工程脚手架 | ✅ |
| T2 DshServerManager | ✅ |
| T3 命令与生命周期 | ✅ |
| T4 文档组装 | ✅ |
| T5 fetch 桥 | ✅ |
| T6 WebSocket 桥 | ✅ |
| T7 剪贴板 shim | ✅ |
| T8 面板 Provider | ✅ |
| T9 崩溃提示与状态 UI | ✅ |
| T10 打包与元数据 | ✅ |
| T11 测试与验收 | ✅ |
| T12 主题跟随 | ✅ |

## 延后项（⏭️，2026-08-17 verification 审计后登记）

| 任务 | 状态 | 决策原因 |
|---|---|---|
| T13 — 共享实例探测（attach 已运行 dsh，req N5） | ⏭️ | MVP 后；G1 |
| T14 — 中继 AbortController 真正传递（G2） | ⏭️ | MVP 后；客户端 30s 超时已兜底 |
| T15 — 下载流式转发（G3） | ⏭️ | MVP 后；全缓冲已可用 |
| T16 — dsh 版本固化/校验（G4） | ⏭️ | MVP 后；mtime 启发式已可用 |
| T17 — 嵌入式 settings 镜像 / 上游 isLoopback 声明（G5） | ⏭️ | 需上游配合或桥扩展；主题已由 matchMedia shim 覆盖 |
| T18 — 主题切换重载兜底（G7） | ⏭️ | 待确认 DSH live-apply 行为 |


*关联文档：req.md ｜ solution.md ｜ spike-notes.md ｜ 架构提案*
