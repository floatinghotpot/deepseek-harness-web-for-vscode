# Bugfix — 适配 dsh 0.1.2-rc.1：启动令牌认证 / Typert RPC / 新版 dist 布局

**日期**: 2026-09-07 ｜ **影响**: 扩展 v0.3.3（dsh 从 0.1.1-rc.7 升级到 0.1.2-rc.1 后，扩展无法正常启动内嵌 UI）
**环境**: 全局 `@deepseek-ai/dsh@0.1.2-rc.1`（实测复现于本机 `/usr/local/bin/dsh`）
**范围**: `src/serverManager.ts`、`src/documentAssembly.ts`、`src/bridgeCore.ts`、`src/bridgeHost.ts`、`src/dshPanel.ts`、`src/commands.ts` + 对应单测

## 现象（用户实测确认）

- 升级 dsh 到 **0.1.2-rc.1** 后，扩展能拉起 dsh（侧边栏显示已就绪），但**内嵌面板报错/空白**；
- 0.1.1-rc.7 一切正常。

## 根因（代码 + 实测事实）

0.1.2-rc.1 是一次 Monorepo 大重构（Typert Remote 协议、@deepseek-ai/* 拆包），相对扩展所适配的
0.1.1-rc.7 表面有三层破坏，扩展均未适配：

### A. 启动 URL 带令牌 + 浏览器会话 Cookie 认证（最先 401 的墙）

- 启动行从 `dsh web: http://127.0.0.1:<port>` 变为 `dsh web: http://127.0.0.1:<port>/?token=<launchToken>`；
- `@deepseek-ai/dsh-client-connection` 源码（`requestRejection`）：`/api` 与 `/` 现在要求
  **authority 绑定的签名 Cookie**（`GET /?token=` → 303 + `Set-Cookie`，cookie 名
  `dsh-auth-<sha256(authority)>`，30 天）；纯 Node 请求无 Cookie → **401**；
- 实测（curl + 源码双证）：
  | 请求 | 结果 |
  |---|---|
  | `GET /`（无 Cookie） | 401 |
  | `POST /api/workspace.list`（无 Cookie） | 401 |
  | WS 升级 `/api/remote.mux`（无 Cookie） | 401 |
  | `GET /?token=`（换发） | 303 + Set-Cookie |
- 扩展旧行为：`parseUrlLine` 截取 base URL、**丢弃 token**、从不换发 Cookie → 面板组装 `GET /` 即 401，
  桥转发的 `/api` 与 WS 升级全部 401。

### B. 0.1.2 dist 布局（相对引用 + batches）

- index.html 头部带 `<base href="/">`，资源引用改**相对**形态：`./assets/index-*.js`、
  `./manifest.webmanifest`、CSS `url(./fonts/…)`（旧版为绝对 `/assets/...`）；
- boot manifest 新增 `batches` 数组（`{phase, url: "/plugins/??…", …}`）；插件 preload 用
  `/plugins/??pkg/client.js,pkg2/client.js,…&rev=` mux 形态；
- 实测把现版 `assembleDocument` 跑在 0.1.2 真实 index 上：**下载队列为空**（正则只认绝对
  `/assets/`），`./assets/...` 引用原样残留 → 即使过了认证，面板也白屏；`batches[].url` 未绝对化。

### C. RPC 表面改 Typert（宿主 chrome 全挂）

- 点号方法 + 平铺 payload 废除：`/api/workspace.list` → **404**；
- 新形态：`POST /api/<namespace>/<method>`，信封 `method` 同名，payload 需
  `{args:{...}}`（参数按 wire 名包裹，如 `{args:{request:{…}}}` / `{args:{_request:{}}}`）；
- `workspace.list` 无 unary 替代 → `workspace/follow`（WS 流，空 args 的 baseline 帧 =
  `{items, archivedSessionIds}`，实测帧形态与旧 `workspace.list` 返回一致）；
- `session.list` 行的 `agentPreset` 从顶层挪进 `projections.values.agentPreset`；
- 其余逐个实测核对：`workspace/create {request:{path}}` → `{workspace,created}`；
  `session/create {request:{workspaceId}}`（0.1.2 起 workspaceId/cwd 互斥）→ `{sessionId}`；
  `session/rename {request:{sessionId,title}}` → `{title,seq}`；
  `workspace/archiveSession {request:{sessionId}}` → `{archivedSessionIds}`（归档后仍留在
  `workspace.sessionIds`，语义与旧版一致）。

## 修复设计

统一原则：**Cookie 由 `DshServerManager` 持有**（就绪前完成换发，杜绝竞态），所有外发路径注入。

1. **`src/serverManager.ts`**
   - `URL_LINE_RE` 捕获可选 `/ ?token=…`；新增导出 `parseReadyLine`（返回 `{url, authUrl?}`），
     `parseUrlLine` 退化为取 base（兼容既有调用/测试）；
   - 就绪前用 `node:http` 做 `GET /?token=` 换发（fetch `redirect:"manual"` 的响应是
     opaque-redirect、读不到 Set-Cookie，故不用 fetch），持有 `authCookie`（name=value），
     `state=ready` 仅在换发后发出；换发失败降级为无 Cookie（记日志）；
   - 新 getter `authCookieHeader` / `browserUrl`（浏览器打开用带 token 的 URL）；
   - **版本下限**：dsh < `0.1.2-rc.1` 直接以清晰错误拒绝启动（新 RPC/Cookie 均不兼容旧版，
     已确认只支持新版）；
   - `api(endpoint, args)`：POST `/api/<endpoint>`、信封 `method=endpoint`、
     payload `{args}`、附加 Cookie；错误仍携带 `code`；
   - 新增 `workspaceSnapshot()`（`workspace/follow` WS 基线，通过可注入 `wsCtor` 的
     `openStreamFirstFrame` 读取首帧）替代旧 `workspace.list`；
   - `ensureWorkspaceSession / listWorkspaceSessions / createSession / workspaceIdFor /
     renameSession / archiveSession` 全部迁到新端点 + args 形态；
     `listWorkspaceSessions` 从 `projections.values` 读 `agentPreset`。
2. **`src/documentAssembly.ts`**：`AssembleOptions.cookie`；资源引用同时认绝对与相对
   （`./assets/…`、`./manifest.webmanifest` 等）并归一化下载；CSS `url(./fonts/…)` 相对解析；
   boot `batches[].url` 绝对化；所有服务器抓取带 Cookie。
3. **`src/bridgeCore.ts` / `src/bridgeHost.ts`**：`relayHttp` 增可选 cookie；`WsRelay` 增
   `resolveCookie`，WS 升级携带 Cookie。
4. **`src/dshPanel.ts`**：桥与 `assembleDocument` 注入 `manager.authCookieHeader`。
5. **`src/commands.ts`**：“Open in Browser” 改用 `browserUrl`（带 token，否则浏览器 401）。

## 验证

- **单测**：更新/新增 16 项（token 解析、Cookie 换发、版本下限、Typert 信封断言、
  workspace/follow 基线流、0.1.2 相对 assets 组装 + batches、Cookie 透传）。
  `npm run compile`（tsc strict）零 issue；`npm test` 最终 **93 项 93 过**（期间
  `resolveDshPath finds dsh in an injected home` 一度环境性失败——本机已全局安装 dsh，
  非本次改动引入；当日已加固，见文末"追加"章节）；
- **E2E（真实 `dsh@0.1.2-rc.1`，隔离 `DSH_HOME`）**：
  - start → version=0.1.2-rc.1、Cookie 换发成功 ✅
  - `workspaceSnapshot` baseline、`ensureWorkspaceSession`（自动建 workspace+绑定会话）、
    `listWorkspaceSessions`（agentPreset 来自 projections）、rename、archive 全链路 ✅
  - 真实 dist `assembleDocument`：下载 6 个本地资源、module script 本地化、
    `batches[].url` 绝对化、无 `./assets` 残留 ✅
- **用户侧**：待 F5 / 打包后实测内嵌面板渲染与对话（本环境无法起 VS Code 宿主）。

## 后续建议

- 版本下限是硬门：README/CHANGELOG 需注明"扩展要求 dsh ≥ 0.1.2-rc.1"；
- 上游仍在快速迭代：`/` 认证、Typert 端点、dist 布局任一变动都可能再次破坏内嵌面板，
  升级 dsh 后应回归（`curl /` 核对 auth + `<head>` 引用形态 + boot `batches`）。

## 追加：resolveDshPath 单测加固（2026-09-07，同日）

- 问题：`resolveDshPath finds dsh in an injected home` 是环境相关失败——本机安装全局 dsh 后
  （`/usr/local/bin/dsh`），机器级探测位置（`npm prefix -g` bin、`/opt/homebrew/bin`、
  `/usr/local/bin`）排在注入 home 之前，直接命中真实 dsh，遮蔽该测试注入的 home 候选；
- 修复：`resolveDshPath(home, platform, opts?)` 新增可选 `opts.systemPaths`（默认 `true`，
  生产行为不变）；测试传 `{ systemPaths: false }` 实现纯 home 封闭解析，并把 Case 1 升级为
  "npx 缓存多版本按 mtime 取最新"，同时清空 `$DSH_BIN` 避免开发机环境干扰；
- 验证：`npm run compile` 零 issue；`npm test` **93 项 93 过**（此前 92/93）。
