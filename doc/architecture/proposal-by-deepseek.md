# DSH × VS Code 内嵌 Web UI —— 架构提案（proposal-by-deepseek）

> 阶段：`architecture`（提案）｜ 日期：2026-08-17 ｜ 状态：待评审
>
> 本提案回答一个问题：**在 VS Code 中开发一个扩展，负责启动 DeepSeek Harness（DSH）并把其 Web UI 内嵌进 VS Code，是否可行？若可行，按最佳实践应该怎么设计？**
>
> 结论先行：**完全可行，且生态中已有 5+ 个同类型扩展在 Marketplace 上运行**（见 §3.3）。DSH 本身为"本地 HTTP 服务 + 同源浏览器前端"的架构，天然具备被第三方壳层承载的条件；唯一真正的技术障碍是 DSH 的 `/api` 浏览器信任围栏（browser-trust fence）与缺失的 CORS 支持，本提案给出三种绕过/解决的路径并推荐其一。

---

## 1. 目标与范围

### 1.1 目标（What）

- 在 VS Code 中以**扩展**形式提供"一键启动 / 停止 / 内嵌" DeepSeek Harness 的能力：
  - 侧边栏视图或编辑器标签页内嵌 DSH Web UI（会话、工作区、设置、插件、Goal、Workflow 等完整功能）；
  - 扩展负责 DSH 服务进程的完整生命周期（启动、健康检查、崩溃重启、退出清理）；
  - 与浏览器打开的 Web UI **共享同一实例**（同一 `~/.dsh` 状态、同一会话），或按配置隔离；
  - 后续可叠加 VS Code 原生集成（把当前文件夹作为工作区、命令面板接入、主题同步等）。

### 1.2 非目标（Non-goals，本期不做）

- 不重写 DSH 前端（直接复用官方 `@deepseek-ai/dsh-web-frontend` 构建产物）；
- 不 fork DSH 源码（可选路径 C 中仅当需要长期优化时才向上游提 PR）；
- 不支持 vscode.dev / Web 版 VS Code（任何本地服务方案在远端扩展宿主下都不成立，见 §8 风险）。

### 1.3 交付物形态

本文档为**提案**，落盘于 `doc/architecture/proposal-by-deepseek.md`。评审通过后按仓库 Feature Pipeline 进入
`doc/feature/00-dsh-vscode/{discussion,req,solution,plan}.md` 继续。

---

## 2. 事实核查（Facts，全部来自对 DSH 安装包的源码阅读，非臆测）

> 核查基准：`@deepseek-ai/dsh@0.1.0-rc.6`（npx 缓存安装树，根目录
> `~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/`，下称 `$DSH`）。
> 工作区当前为空项目（仅 `CLAUDE.md`、`doc/`、`src/`），无既有代码约束。

### 2.1 启动方式与命令行

| 事实 | 证据 |
|---|---|
| `dsh web` ≡ `dsh --profile web`，启动 Web 服务 | `$DSH/dsh/lib/bin.js`（`web` 是 `--profile web` 的硬编码别名） |
| 参数：`--host`（默认 `127.0.0.1`）、`--port`（默认 `3080`，**传 `0` 由 OS 分配**）、`--trusted-host`（可重复，追加给 `/api` 围栏的受信 authority） | `$DSH/dsh-web-app/lib/startup.js` |
| **`--host 0.0.0.0` 被显式拒绝**（"would expose remote code execution"），服务只能绑回环 | `$DSH/dsh-web-app/lib/startup.js:39` |
| 绑定成功后向 **stdout** 打印 `dsh web: http://127.0.0.1:<port>`（`--port 0` 时打印 OS 分配的实际端口） | `$DSH/dsh-web-app/lib/index.js`（`printUrl`，`ctx.webServer.port`） |
| 首个 profile 自动初始化（`PROFILE_TEMPLATES` 含 `web`），通过 `healProfilesModuleFallback` 在 `$DSH_HOME/profiles/node_modules` 建符号链接，**纯启动无需 pnpm/网络** | `$DSH/dsh-app-boot/README.md` |
| `$DSH_HOME` 缺省为 `~/.dsh`（可被环境变量覆盖） | `$DSH/dsh-home-paths/lib/index.js` |
| 进程收到 SIGTERM/SIGINT 走**有界优雅退出**（5s 宽限后强杀） | `$DSH/dsh/lib/profile-boot-DG5t9aNs.js`（`createProcessShutdown`） |
| API 网关默认项目目录 = **宿主进程 `process.cwd()`** | `$DSH/dsh-host-apiproxy/lib/index.js:5627` |

### 2.2 Web 服务端拓扑（`dsh web` 实际挂载的东西）

```
dsh --profile web  （Cordis 插件树，见 $DSH/dsh-web-app/cordis.patch.yml）
├── webserver          node:http 服务（host/port 由 webStartup 提供）
│   ├── GET  /              → frontend-static 提供官方构建产物 dist（SPA fallback）
│   │                          index.html 经 index-tap 注入 window.__DSH_BOOT__
│   ├── GET  /plugins/<id>/client.js  → 各浏览器插件 bundle（经典 script，无 CORS 要求）
│   ├── POST /api/<method>  → JSON-RPC 信封桥（client-request / server-response）
│   ├── WS   /api/events.mux   → 会话事件下行流（ServerRequest 帧）
│   ├── WS   /api/events.host  → 宿主事件下行流
│   └── POST /api/respond     → 客户端应答上行（如回答 user-question）
└── 浏览器插件罗列（ui-conversation / ui-settings / ui-goal / ui-workflow-run / ui-permission …）
```

关键源码位置：

- 前端产物：`$DSH/dsh-web-frontend/dist/index.html` + `assets/`（共 **4.6MB**，易打包）；
- `__DSH_BOOT__` 注入：`$DSH/dsh-client-modules/lib/index.js`（`injectBootManifest`，图结构含 `{id,url,rev,inject,immediately}`）；
- 插件 bundle 加载：`$DSH/dsh-client-modules/lib/client.js` —— `defaultLoadBundle` 用 `<script src>` **经典脚本**加载（跨源**不需要** CORS）；shell bundle 则是 `<script type="module">`（跨源**需要** CORS，见 §4.2）；
- API 信封协议：`$DSH/dsh-host-apiproxy/lib/index.js`（`client-request`/`server-response`/`client-response`/`server-request` 四种全形 + 双段解析），**协议与传输解耦**（同一包同时提供 `InProcessApiClient` 同进程注入路径，证明协议可脱离 HTTP 承载）。

### 2.3 浏览器端传输（决定内嵌方式的关键事实）

浏览器客户端 = `WebApiClient`（`$DSH/dsh-client-connection/lib/client.js`）：

```js
resolveBase() {  // 来自 dsh-host-apiproxy 的 AbstractApiClient
  const loc = globalThis.location;
  return loc?.origin !== undefined && loc.origin !== "null" ? loc.origin : "http://dsh.internal";
}
// 一元调用：fetch POST new URL("/api/" + method, resolveBase())
// 事件流：  new WebSocket(ws://<resolveBase()>/api/events.mux | events.host)
```

即：**前端把所有请求解析到"页面自身的 origin"**。在浏览器里页面 origin = `http://127.0.0.1:<port>`，天然同源；一旦换宿主页面（如 webview），origin 就变了——这是"内嵌"要解决的第一性问题。

### 2.4 `/api` 浏览器信任围栏（内嵌要解决的第二性问题）

`$DSH/dsh-client-connection/lib/index.js` → `isTrustedApiRequest(request, trustedHosts)`：

1. **Host 头**必须是回环地址（`localhost`/`127/8`/`[::1]`）或在 `--trusted-host` 名单内；
2. `sec-fetch-site` 不得为 `cross-site`；
3. 若带 `Origin` 头，则 `new URL(origin).host` 必须**等于 Host 头的主机**（即同源）。

且：全仓 grep 无任何 `Access-Control-*` 响应头（`dsh-host-webserver` / `dsh-host-frontend-static` / `dsh-client-connection` 均无）。文档自述"this fence is not an auth layer"，围栏只防 DNS rebinding / 跨站请求。

**推论**：webview 页面（origin 为 `vscode-webview://…` 或 `https://<hash>.vscode-webview.net`）直接 `fetch(http://127.0.0.1:<port>/api/…)` 必然被围栏拒绝（`sec-fetch-site: cross-site`、Origin 主机不匹配），且即便围栏放行，响应也因无 CORS 头而无法被跨源 JS 读取。**webview 不能直连 DSH API，这是本次设计的分水岭。**

### 2.5 版本与运行时要求

- `@deepseek-ai/dsh` 依赖树 ≈ 27MB（`@deepseek-ai/*`）+ 前端 dist 4.6MB；
- 无 `engines` 字段，但代码使用 `AbortSignal.timeout`、`structuredClone`、惰性 `node:sqlite`（Node 22 才静默）→ **Node ≥ 18，建议 20+（LTS）**；扩展宿主 Electron 内嵌 Node 版本需满足。

---

## 3. 可行性结论与生态证据

### 3.1 结论

**可行，且分三层障碍逐一有解：**

| 障碍 | 性质 | 解决路径 |
|---|---|---|
| 1. 前端把 API 解析到"页面 origin" | 设计使然 | webview 文档自建 + 传输桥（推荐）；或 iframe 保持真实同源页面（最简） |
| 2. `/api` 信任围栏拒绝跨源浏览器请求 | 安全设计 | 扩展宿主（Node）代发请求（无浏览器头 → 围栏放行）；或向上游加 `--trusted-origin` |
| 3. 无 CORS 头 | 缺失能力 | 同上：Node 代发天然无 CORS；上游补 CORS 属可选优化 |

### 3.2 "能做什么 / 不能做什么"边界

- ✅ 内嵌完整 Web GUI（会话、工作区、设置、插件、Goal、Workflow、权限预设、user-question 弹窗等全部走 API 的能力）；
- ✅ "把当前文件夹作为工作区"：扩展宿主直接 `POST /api/workspace.create {path}`（Node 请求过围栏），UI 通过 host/workspace-changed 事件自动刷新；默认项目目录可通过 `spawn(…, { cwd: workspaceFolder })` 控制（§2.1 末行）；
- ✅ 目录选择、打开文件：DSH 走**服务端原生对话框/原生打开**（`host.pickDirectory` / `host.openPath`），不依赖 webview 文件权限——内嵌后仍是"桌面级"体验；
- ⚠️ 键盘快捷键冲突、剪贴板、下载（会话导出）在 webview 内属边缘体验问题，需 Spike 验证（§8）；
- ❌ vscode.dev / Web 版 VS Code：远端扩展宿主无法启动本地进程，本期不支持。

### 3.3 生态证据（同类扩展已在 Marketplace 运行）

| 扩展 | 安装量 | 描述要点 |
|---|---|---|
| [DSH（dsh-vscode-panel）](https://marketplace.visualstudio.com/items?itemName=Fengze233.dsh-vscode-panel) | ~150 | VS Code 侧边栏中使用 DSH 网页界面 |
| [Deepseek Harness (DSH) for VSCode](https://marketplace.visualstudio.com/items?itemName=liumin.deepseek-harness-for-vscode-plugin) | ~86 | 侧边栏内嵌 Web UI，并把当前文件夹作为其工作区 |
| [DeepSeek Harness UI (Unofficial)](https://marketplace.visualstudio.com/items?itemName=magicshawn.deepseek-harness-ui) | ~33 | 非官方视觉工作区 |
| [DSH Launcher](https://marketplace.visualstudio.com/items?itemName=young1839.dsh-launcher) | ~28 | 一键启停/更新 DSH，编辑器标签页内嵌完整 GUI |
| [Embedded Deepseek Harness for VS Code](https://marketplace.visualstudio.com/items?itemName=Skylake0216.embedded-deepseek-harness-for-vs-code) | ~20 | 完整 GUI，全部插件兼容，与浏览器 WebUI 共享同一实例 |

结论：**"启动真实 `dsh web` 进程 + webview 承载 UI"是该品类的通用路线**；本提案在此基础上给出更严谨的传输层设计（§5），并规划 VS Code 深度集成（§6）。

---

## 4. 候选架构对比

### A. iframe 承载（最简 Spike）

webview 只放一个 `<iframe src="http://127.0.0.1:<port>/">`，DSH 页面在其**真实 origin** 内运行：同源 API、同源 WS、无 CORS、无围栏问题，前端零改动。

- 优点：实现量最小（数天）；UI 行为 100% 原生正确。
- 缺点：
  - 无法从扩展侧注入任何东西（跨源 iframe 不可脚本化），VS Code 深度集成（命令、主题、状态同步）做不了；
  - 双滚动条、焦点/键盘、下载、`window.open` 弹窗等 iframe 边缘体验；
  - vscode.dev 上 iframe 有已知 CSP 问题（[microsoft/vscode#209543](https://github.com/microsoft/vscode/issues/209543)，桌面端需 Spike 验证 `frame-src http://127.0.0.1:*`）。
- 定位：**Phase 0 Spike**（验证子进程生命周期 + 端口 + 共享实例），不作为终态。

### B. 直接承载 + postMessage 传输桥（推荐终态）

webview 文档 = 扩展宿主**从服务器拉取并改写**的 DSH index.html；前端所有 HTTP/WS 流量经 `postMessage` 桥到扩展宿主，由扩展宿主（Node）代发到真实服务器。

- 优点：
  - DSH 服务器仍是资产与 API 的**唯一事实源**（无 dist 拷贝、无漂移，HMR/插件重载随刷新生效）；
  - 不弱化围栏、不碰 CORS：Node 代发请求无 Origin/`sec-fetch-site`，围栏按"非浏览器"放行（§2.4 第三条 `origin === undefined → true`）；
  - 扩展拥有文档控制权：CSP、加载态、错误覆盖层、主题注入、命令集成全部可做；
  - postMessage 通道天然成为未来 VS Code ↔ DSH 双向集成的接缝（§6）。
- 缺点：需自研传输桥（fetch 桥 + WebSocket 桥 + boot-manifest 改写，约 300–500 行），并随 DSH 协议演进维护。
- 定位：**推荐架构**，§5 详述。

### C. 直接承载 + 纯 URL 改写 shim（不建桥，上游补 CORS/围栏后可选）

webview 内覆写 `globalThis.fetch` / `WebSocket`，把 webview origin 上的 URL 改写为 `http://127.0.0.1:<port>/…` 后**由 webview 直连**。前提：DSH 上游支持 `--trusted-origin`（围栏放行指定 Origin）并返回 CORS 头（含 WS 握手）。插件 bundle 用经典 script 加载（无 CORS），但 shell module script 需内联或上游补 CORS。

- 优点：无 postMessage 中继延迟；上游 PR 很小（围栏加一个配置项 + 响应头）。
- 缺点：**依赖上游改动**；在合入前不可用；弱化围栏需谨慎（Origin 白名单而非全放）。
- 定位：**长期优化项 / 上游贡献**；MVP 不依赖它。

### D. 不内嵌（对照基线）

- 集成终端跑 `dsh --profile tui` / `headless`：可作补充功能，但不是"内嵌 Web UI"；
- 外部浏览器打开 + 扩展只做进程管理：功能退化，非本提案目标。

### 对比总表

| 维度 | A iframe | B 桥接（推荐） | C 上游补丁 |
|---|---|---|---|
| 实现量 | 最小 | 中 | 小（等上游） |
| DSH 改动 | 无 | 无 | 需上游合入 |
| 围栏/CORS 影响 | 无（同源） | 无（Node 代发） | 需新增白名单机制 |
| VS Code 深度集成 | ✗ | ✓ | ✓ |
| 长期维护面 | iframe 边缘体验 | 桥协议随 DSH 演进 | 上游依赖 |
| 风险等级 | 低（但能力上限低） | 中（可控） | 中（外部依赖） |

---

## 5. 推荐架构：B —— 托管子进程 + postMessage 传输桥

### 5.1 总体拓扑

```
┌────────────────────────────── VS Code ──────────────────────────────┐
│  Extension Host (Node)                                              │
│  ┌─────────────────────────────┐    spawn/SIGTERM    ┌────────────┐ │
│  │ DshServerManager            │◄────────────────────│ dsh web    │ │
│  │  · 二进制解析 / 端口分配      │    child process    │ (127.0.0.1 │ │
│  │  · 健康检查 / 崩溃重启(退避)  │                     │  :<port>)  │ │
│  │  · 共享实例探测 / 退出清理     │                     └─────┬──────┘ │
│  └───────────┬─────────────────┘                           │ GET /api/*
│              │ postMessage 桥                               │ (Node fetch，
│              ▼                                              │  无浏览器头→围栏放行)
│  ┌──────────────────────────────┐   fetch/WS 代发          │
│  │ Webview (真实 DSH 前端文档)    │──────────────────────────┘
│  │  · 改写后的 index.html        │   应答/帧回传（postMessage）
│  │  · 注入 __DSH_BOOT__          │
│  │  · transport-bridge.js        │
│  └──────────────────────────────┘
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 子进程生命周期（`DshServerManager`）

1. **二进制解析顺序**：① 设置指定的路径 → ② `PATH` 上的全局 `dsh`（`npm i -g @deepseek-ai/dsh`）→ ③ 扩展内置依赖 `@deepseek-ai/dsh`（随 vsix 打包，`node_modules` 直跑 `lib/bin.js`）→ ④ 引导安装提示。
2. **端口**：默认 `--port 0`（OS 分配），解析 stdout 的 `dsh web: http://127.0.0.1:<port>` 行获取实际端口（§2.1）；若设置指定固定端口则直接传参。
3. **工作目录**：`spawn(bin, ['web', …], { cwd: workspaceFolder ?? userHome })` —— 让 DSH 默认项目目录 = 用户打开的文件夹（§2.1 末行、§3.2）。
4. **环境**：透传 `PATH`/`HOME`；默认共享 `~/.dsh`（与浏览器实例共享会话/设置，对齐 Skylake0216 卖点）；提供"隔离模式"设置（自定义 `DSH_HOME`）。
5. **健康与重启**：URL 行出现 = 就绪；进程意外退出 → 指数退避重启（面板已关则停止）；`deactivate` → `SIGTERM`，5s 后 `SIGKILL`（对齐 DSH 自身的优雅退出宽限）。
6. **共享实例探测**：固定端口被占用时，先 `POST /api/host.describe`（Node 侧，围栏放行）探测是否为本机 DSH；是则直接"挂载"（不重复启动），否则提示端口冲突。

### 5.3 webview 文档组装（每次打开/刷新时执行）

1. 扩展宿主 `GET http://127.0.0.1:<port>/` → 得到**已注入 `__DSH_BOOT__`** 的 index.html（index-tap 在服务端完成，§2.2）；
2. 改写：
   - shell bundle `<script type="module" src="/assets/index-*.js">` → **内联为 `<script type="module">…</script>`**（规避 module 跨源 CORS）；
   - vendor CSS → 内联 `<style>`；manifest/favicon → 保留或丢弃；
   - `__DSH_BOOT__` 内各 `url: /plugins/<id>/client.js?rev=…` → 改为绝对 `http://127.0.0.1:<port>/plugins/…`（经典 script，无 CORS，§2.2/§2.5）；
3. 注入 `<script>` `transport-bridge.js`（置于 shell 之前）与严格 CSP（§5.5）；
4. `webview.html` 一次性写入；DSH 前端自身再以经典 script 加载插件 bundle、以桥发 API 请求。

### 5.4 传输桥协议（webview ↔ extension host）

**桥面（postMessage，双向）**：`{ type, id, … }`，`id` 关联请求/应答；扩展宿主侧用 `vscode.postMessage` 与 `onDidReceiveMessage`。

**fetch 桥**（覆盖 `globalThis.fetch`）：
- 仅拦截 origin 为 webview 自身、且路径命中 `/api/*`（或未来扩展的其他服务路径）的请求；其余请求（blob:、data:、vscode-webview-resource:）放行原逻辑；
- 请求 → `postMessage {type:'http', id, method, url(path+query), headers, body}` → 扩展宿主 `fetch('http://127.0.0.1:<port>' + path, …)`（Node 请求无浏览器头，围栏放行）→ 回传 `{status, headers, body}` → 桥构造 `new Response(body, {status, headers})` 返回；
- 需兼容 `AbortSignal`（扩展宿主转发 abort）与 30s 默认超时（对齐 `DEFAULT_TIMEOUT_MS`）。

**WebSocket 桥**（覆盖 `globalThis.WebSocket`）：
- 桥类实现 `onopen/onmessage/onclose/onerror/close()/send()/readyState/常量` + `addEventListener`（对齐 `WebApiClient.readWebSocket` 的全部用法，§2.3）；
- 收到 `ws://<webview>/api/events.mux|host` 连接请求 → 通知扩展宿主用 Node `ws` 客户端连真实路径 → 帧转发（`server-request` 全形原样透传，客户端 zod 解析不变）。

**协议稳定性**：桥只透传 DSH 官方信封格式（§2.2 协议表），不解析业务载荷；DSH 版本升级仅需重新内联 shell/改写 manifest，桥代码基本不动。

### 5.5 安全模型（webview CSP 与边界）

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               script-src 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:* http://localhost:*;
               style-src 'unsafe-inline';
               img-src 'self' http://127.0.0.1:* http://localhost:* data: blob:;
               connect-src http://127.0.0.1:* http://localhost:*;
               frame-src 'none'; worker-src 'none';">
```

- DSH 服务端：保持回环绑定（`0.0.0.0` 被官方拒绝，§2.1）；围栏原样运行，扩展侧只走"非浏览器"通道；
- 扩展宿主：只允许向 `127.0.0.1`/`localhost` 发请求（桥内硬编码白名单），杜绝 SSRF；
- webview：`enableScripts: true` + 上述 CSP；不引入任何远程第三方脚本；
- 凭据/密钥（`credentials.set` 等）仍走 DSH 服务端存储与围栏策略，扩展不接触明文。

### 5.6 VS Code 集成点（桥之外的扩展侧直连）

扩展宿主可**绕过 webview 直接调用 DSH API**（Node 代发，围栏放行），实现：

- `workspace.create {path: workspaceFolder}` → "把当前文件夹作为工作区"（UI 经 host 事件自动刷新）；
- `host.describe` → 面板加载态/版本展示；
- 命令面板注册：`DSH: 启动` / `DSH: 停止` / `DSH: 打开面板` / `DSH: 附加当前文件夹`；
- 主题同步：写入 `$DSH_HOME/cordis.patch.yml` 或经 `--patch` overlay 注入 `ui-theme` 配置（DSH 原生支持 patch 分层，§2.1）；
- 用 DSH 的 `--patch` 机制关闭 `printUrl`、固定 `trustedHosts` 等——**零源码修改的定制通道**。

---

## 6. 分阶段实施计划（建议）

| Phase | 内容 | 出口标准 |
|---|---|---|
| **0 — Spike** | 子进程启动/停止/端口解析/共享实例探测 + **iframe 方案**验证 UI 完整性（CSP `frame-src`、键盘、下载、主题） | 可行性跑通；产出一份实测笔记（补充本提案 §8 中"待验证"项） |
| **1 — MVP** | 架构 B 骨架：`DshServerManager` + 文档组装 + fetch/WS 桥 + 侧边栏/编辑器 Webview | 面板内完整对话、工作区切换、设置读写、Goal/Workflow 可见可操作 |
| **2 — 集成** | 附加当前文件夹、命令面板、启动/停止/重启、崩溃重启退避、共享实例探测 UI、隔离模式设置 | 集成命令全通；退出无残留进程 |
| **3 — 打磨/上游** | 主题同步、下载/剪贴板边缘体验、vsix 打包瘦身；评估向上游提交 `--trusted-origin` + CORS PR（架构 C） | 发布 Marketplace；上游 PR 可选 |

---

## 7. 风险与未决问题

| # | 风险/问题 | 等级 | 缓解 |
|---|---|---|---|
| 1 | webview 内 iframe/下载/剪贴板/快捷键行为未实测 | 中 | Phase 0 Spike 逐项验证；下载/剪贴板走扩展侧直连兜底 |
| 2 | 桥协议随 DSH 升级漂移（路径/信封/WS 帧） | 中 | 桥只透传官方信封；版本兼容测试；升级时重新内联 shell |
| 3 | 与用户自启的 `dsh web` 端口/实例冲突 | 中 | 共享实例探测 + 端口冲突提示（§5.2-6） |
| 4 | vsix 体积（内置 DSH 依赖 ≈ 27MB + dist 4.6MB） | 低 | 默认用全局 `dsh`，内置作兜底；打包排除 devDeps |
| 5 | 需要 Node ≥ 18（扩展宿主内嵌 Node 版本） | 低 | 启动前版本探测，不足则引导升级/用全局 Node |
| 6 | 上游若改传输（如弃用经典 script 加载 bundle） | 低 | 观察上游变更；架构 B 的桥面已隔离传输细节 |

## 8. 待验证清单（Spike 必做）

1. 桌面 VS Code webview 的 `frame-src http://127.0.0.1:*` 是否放行（若放行，iframe 可作为 Phase 1 的快速兜底）；
2. webview `fetch`/`WebSocket` 覆写对 DSH 前端的兼容性（`AbortSignal`、`Response`、WS 常量）；
3. DSH UI 内键盘快捷键与 VS Code 全局快捷键的冲突面；
4. 会话导出（下载）与剪贴板在 webview 内的表现；
5. 同一实例多面板（多 webview 共享一个子进程）的稳定性。

## 9. 参考资料

- DSH CLI / 运行时源码（`@deepseek-ai/dsh@0.1.0-rc.6`）：`dsh-web-app`（startup/index/patch）、`dsh-client-connection`（围栏/传输）、`dsh-host-apiproxy`（API 协议）、`dsh-client-modules`（boot manifest/插件加载）、`dsh-web-frontend/dist`（官方前端产物）
- 生态：[DSH (dsh-vscode-panel)](https://marketplace.visualstudio.com/items?itemName=Fengze233.dsh-vscode-panel) ｜ [DSH for VSCode](https://marketplace.visualstudio.com/items?itemName=liumin.deepseek-harness-for-vscode-plugin) ｜ [DSH Launcher](https://marketplace.visualstudio.com/items?itemName=young1839.dsh-launcher) ｜ [Embedded DSH for VS Code](https://marketplace.visualstudio.com/items?itemName=Skylake0216.embedded-deepseek-harness-for-vs-code) ｜ [DSH UI (Unofficial)](https://marketplace.visualstudio.com/items?itemName=magicshawn.deepseek-harness-ui)
- VS Code 侧：[Webview API 文档](https://code.visualstudio.com/api/extension-guides/webview) ｜ [webview iframe 在 vscode.dev 的已知问题 #209543](https://github.com/microsoft/vscode/issues/209543)
