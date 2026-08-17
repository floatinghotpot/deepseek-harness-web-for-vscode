# DeepSeek Harness for VS Code — 实现方案（solution，MVP）

**日期**: 2026-08-17
**来源**: [req.md](req.md)、[spike-notes.md](spike-notes.md)、[架构提案](../../architecture/proposal-by-deepseek.md)
**状态**: ⏳ 待用户批准（批准后进入 plan.md + 实现）

---

## 1. Goal（目标架构）

VS Code 扩展 **"DeepSeek Harness for VS Code"**：扩展宿主 spawn `dsh web`（子进程，`--port 0`，cwd=当前工作区），侧边栏 Webview **直接承载 DSH 前端文档**（非 iframe），通过 **postMessage 传输桥**转发 API/WebSocket/剪贴板到扩展宿主，扩展宿主以 Node 身份代发到真实服务器（过 `/api` 围栏）。MVP 交付 R1–R6（req.md），剪贴板完整可用（修复 Spike V8 否决项）。

## 2. Facts（已核实，来源：spike-notes.md + 本次源码核查）

| # | 事实 | 证据 |
|---|---|---|
| F1 | `dsh web --port 0` stdout 打印 `dsh web: http://127.0.0.1:<port>`，OS 分配端口 | spike S1 |
| F2 | `/api` 围栏：Node 无头请求 200；`Origin: vscode-webview://…`+cross-site 403；静态 `/plugins/` 200 | spike S2 |
| F3 | API 默认项目目录 = 子进程 `cwd`（`host.describe` 验证） | spike S3 |
| F4 | SIGTERM → 优雅退出 code=0，端口释放无残留 | spike S4/S6 |
| F5 | `GET /` 返回 index.html，`<head>` 首行注入 `__DSH_BOOT__`（entries 含 `/plugins/<id>/client.js`） | spike S5 |
| F6 | `DSH_HOME` 覆盖生效；profile 自动初始化，无需 pnpm | spike S5 |
| F7 | GUI 启动的 VS Code 无 shell PATH；多级二进制探测已实现验证 | spike S6 |
| F8 | webview 内 iframe 剪贴板双废（按钮 API + 原生 Cmd+C/V），平台 open issue 无修复 | spike V8 |
| F9 | dist 结构：`index.html` + `assets/{index-*.js(442KB), vendor-*.js(745KB), *.css, fonts/KaTeX*.woff2, langs/*.js}`（共 4.6MB） | 本次核查 |
| F10 | **shell 用相对 import**：`import {…} from "./vendor-Cjbwl5VI.js"`；动态 `import("./langs/*.js")` → 内联方案会因相对路径解析到 webview origin 而失败；**必须整树作为同源资源加载** | 本次核查 |
| F11 | vendor CSS 内 `url(/assets/fonts/KaTeX_*.woff2)` → 跨源字体需 CORS（服务器无 CORS 头）→ 字体也必须同源 | 本次核查 |
| F12 | 协议面：一元 `POST /api/<method>`（JSON 信封）；应答 `POST /api/respond`；事件流浏览器侧走 **WS** `/api/events.mux`、`/api/events.host`（服务器同时提供 SSE 端点，浏览器不用）；下载 `GET /api/session.export?sessionId=`（zip 流） | 本次核查 |
| F13 | 浏览器客户端 `resolveBase()` = `location.origin`；`postJson` 用 `AbortSignal.timeout/any`；WS 客户端用 `addEventListener`/`readyState`/`close()` | 架构提案 §2.3 + 源码 |
| F14 | 前端插件 bundle 由 `<script src>` 经典脚本加载（跨源无 CORS），`__DSH_BOOT__.entries[].url` 可改写为绝对服务器 URL | 架构提案 §2.2 + F2 |
| F15 | 前端含 schemastery `new Function` 回调 → CSP 需 `'unsafe-eval'` | 前端 bundle 核查 |

## 3. Gap（现状 → 目标）

- Spike 的 iframe 方案：渲染/对话/生命周期 ✅，**剪贴板 ❌（F8）** → 改为"webview 文档直载 + 传输桥"；
- 直载的两个新约束（F10/F11）：**资产必须同源**（vscode-resource，从服务器整树拉取缓存）→ 解决模块相对 import 与字体 CORS；
- 需要新增三个 shim（fetch / WebSocket / clipboard）+ 文档组装 + 扩展宿主中继（均为新代码，无既有生产代码需要迁移——spike 的 `serverManager` 逻辑抽取复用）。

## 4. Call-site Audit

N/A —— 仓库无既有生产代码；spike（`spike/dsh-webview-spike/`）为一次性验证，其 `resolveDshPath`/spawn/端口解析逻辑按 F7/S1 结论抽取进 `src/serverManager.ts`（行为不变，无外部调用方）。

## 5. 架构设计

### 5.1 模块划分（文件清单）

```
src/
  extension.ts          # activate/deactivate；注册命令与 WebviewViewProvider
  serverManager.ts      # DshServerManager（自 spike 抽取）：二进制解析(F7)、spawn --port 0(F1)、
                        #   stdout 解析、SIGTERM+6s SIGKILL(F4)、状态事件、崩溃提示
  documentAssembly.ts   # 文档组装：拉取 dist(F9) → 缓存 globalStorage → index.html 改写为
                        #   asWebviewUri 同源资源(F10/F11) → __DSH_BOOT__ plugin URL 改绝对(F14)
                        #   → 注入 __DSH_BRIDGE__ 与 bridge-client.js → CSP(F15)
  bridgeHost.ts         # 扩展宿主中继：http(含 ArrayBuffer 二进制/AbortSignal) / ws / clipboard
  panelProvider.ts      # WebviewViewProvider：webview 配置(localResourceRoots)、消息路由、
                        #   server-status 透传
  commands.ts           # 启动/停止/在浏览器打开
  themeSync.ts          # R7 主题跟随：监听 onDidChangeActiveColorTheme → settings.update(ui-theme)
media/
  bridge-client.js      # 注入 webview 的脚本（独立 JS，不走 TS 编译）：fetch/WebSocket/clipboard shim
test/
  serverManager.test.ts
  documentAssembly.test.ts
package.json / tsconfig.json / README.md
```

### 5.2 数据契约（postMessage 协议，webview ↔ 扩展宿主）

webview → host：

| type | 载荷 | 说明 |
|---|---|---|
| `http` | `{id, method, url(path+query), headers?, body?}` | body 为 string 或 ArrayBuffer |
| `http-abort` | `{id}` | 转发 AbortSignal |
| `ws-open` | `{id, path}` | path ∈ `/api/events.mux` \| `/api/events.host` |
| `ws-send` | `{id, data}` | 预留（浏览器侧当前仅下行） |
| `ws-close` | `{id}` | |
| `clipboard-write` | `{id, text}` | 修复 F8 |
| `clipboard-read` | `{id}` | 修复 F8 |

host → webview：

| type | 载荷 |
|---|---|
| `http-res` | `{id, status, statusText?, headers?, body?}`（body string/ArrayBuffer/null） |
| `http-err` | `{id, message}` |
| `ws-open-res` | `{id, ok}` |
| `ws-frame` | `{id, data}`（原样透传 server-request 全形，客户端 zod 解析不变） |
| `ws-close` | `{id, code?, reason?}` |
| `clipboard-res` | `{id, ok, text?}` |
| `server-status` | `{state: starting\|ready\|stopped\|error, url?, message?}` |

桥只透传 DSH 官方信封（F12），不解析业务载荷——DSH 升级仅需重拉 dist，桥协议稳定。

### 5.3 文档组装流程（每次面板打开执行）

1. `GET http://127.0.0.1:<port>/` → 取 index.html（含 `__DSH_BOOT__`）；
2. 取 `assets/` 整树（index/vendor JS、CSS、fonts、langs）→ 写入 `globalStorage/dsh-dist/`（带版本哈希，服务器 dist 变化时重拉）；
3. index.html 改写：
   - `/assets/*` → `webview.asWebviewUri()`（vscode-resource，**同源** → F10/F11 解决）；
   - `__DSH_BOOT__.entries[].url` → 绝对 `http://127.0.0.1:<port>/plugins/…`（F14，经典脚本跨源 OK）；
4. `<head>` 注入：`__DSH_BRIDGE__ = {serverBase}` + `bridge-client.js`（置于 shell 之前）+ CSP meta；
5. `webview.html` 写入；`localResourceRoots` 含 `globalStorage/dsh-dist/`。

### 5.4 bridge-client.js（webview 侧 shim）

- `fetch`：拦截 origin == webview origin 的请求（DSH 前端 `resolveBase()` 的结果），改写 path 后走 `http` 消息；`blob:`/`data:`/`vscode-webview-resource:` 放行；用 `new Response(body, {status, headers})` 构造返回（F12/F13）；
- `WebSocket`：实现 `open/message/close` 事件、`readyState` 常量、`close()`（对齐 `readWebSocket` 用法 F13）；走 `ws-open/ws-frame/ws-close`；
- `navigator.clipboard`：`Object.defineProperty` 覆写 `writeText/readText` → `clipboard-write/read`（F8 修复）。

### 5.5 扩展宿主中继（bridgeHost.ts）

- http：`fetch(serverBase + path, …)`（Node，无浏览器头 → F2 放行）；`AbortController` 转发 abort；`arrayBuffer()` 全量缓冲后回传（MVP 接受，下载文件较大时后续改流式）；
- ws：Node `globalThis.WebSocket`（扩展宿主 Node ≥22）或回退 `ws` 包；帧透传；
- clipboard：`vscode.env.clipboard.writeText/readText`。

### 5.6 安全

- 服务器：回环绑定（官方拒绝 0.0.0.0）；围栏原样（F2）；扩展只向 `127.0.0.1`/`localhost` 代发；
- CSP（F15）：`default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${cspSource} http://127.0.0.1:* http://localhost:*; style-src 'unsafe-inline' ${cspSource}; img-src ${cspSource} data: http://127.0.0.1:*; font-src ${cspSource} data:; connect-src 'none'; frame-src 'none'; worker-src 'none'`（`cspSource` = `webview.cspSource`；connect-src 'none' 由桥全拦截兜底，若实现中发现直连需求再放开）。

## 6. 已知边界（MVP 接受）

- 下载（session.export）走全缓冲 ArrayBuffer 回传，大文件内存占用随文件增大（后续流式）；
- 服务器 SSE 端点存在但浏览器走 WS，桥不实现 SSE；
- `langs/` 语法高亮动态 import 依赖 dist 整树拷贝（F10）——已在组装流程覆盖；
- vscode.dev/远程开发不支持（req N6）。

## 7. 与 req.md 映射

| 需求 | 对应设计 |
|---|---|
| R1 启动（≤10s、幂等） | serverManager + commands |
| R2 内嵌（端到端对话、完整功能） | documentAssembly + bridge（fetch/WS）+ panelProvider |
| R3 停止/清理/异常提示 | serverManager（SIGTERM/KILL、exit 事件 → server-status） |
| R4 当前文件夹为工作区 | spawn `cwd`（F3） |
| R5 共享实例（默认 ~/.dsh） | spawn 不设 DSH_HOME（F6） |
| R6 打包与元数据 | package.json（displayName/ID/关键词/icon/engines/categories）+ vsce + 双渠道说明 |
| R7 主题跟随 | themeSync.ts：经 Node 直连 `POST /api/settings.update {ns:'ui-theme', patch:{preference}}`（复用 F2 放行路径，热生效）；`dshForVscode.themeSync` 设置默认 `follow`；主题切换事件驱动 |

*关联文档：req.md ｜ spike-notes.md ｜ 架构提案*
