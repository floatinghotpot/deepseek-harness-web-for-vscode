# Bugfix — 适配 dsh 0.1.7-rc.1：插件 URL 改为 `<base>` 相对形式导致 "HTML did not preload"

**日期**: 2026-09-24 ｜ **影响**: 扩展 v0.3.5（dsh ≥ 0.1.7-rc.1 时内嵌面板插件全挂）
**环境**: 全局 `dsh@0.1.7-rc.1`（0.1.5-rc.2 升级而来）
**来源**: 用户报告面板显示 `HARNESS / Failed to load plugins / client-modules: HTML did not preload @deepseek-ai/dsh-client-modules/client.js`

## 现象

- dsh 升到 0.1.7-rc.1 后，扩展**能启动** dsh（就绪、认证正常），但内嵌面板报:
  `Failed to load plugins — client-modules: HTML did not preload @deepseek-ai/dsh-client-modules/client.js`
- 即模块加载器的**引导脚本本身没加载成功**，后续插件队列为空。

## 根因（实测 0.1.7-rc.1 的 index.html）

与 0.1.5-rc.2 对比，`<head>` 形态有三处变化：

| 项 | 0.1.5-rc.2 | **0.1.7-rc.1** |
|---|---|---|
| `<base>` | `href="/"` | **`href="./"`** |
| 插件 preload (`<link rel=preload as=script>` / `<script src>`) | `/plugins/??…`（绝对） | **`plugins/??…`（相对，无前导斜杠）** |
| boot manifest `entries[].url` / `batches[].url` | `/plugins/…` | **`plugins/…`（相对）** |
| favicon | `favicon.svg` | `favicon.svg` + **`favicon-dark.svg`** |
| application 批次 | 1 个 | **2 个** |

而 `src/documentAssembly.ts` 的旧匹配只认绝对形式：

```ts
const PLUGIN_PRELOAD_RE = /(src|href)="(\/plugins\/[^"]+)"/g;   // 只匹配 "/plugins/"
if (entry.url?.startsWith("/")) entry.url = serverBase + entry.url;  // 只处理绝对
```

⇒ 相对 `plugins/…` **全部漏改**，webview 按自身源 `vscode-webview://<uuid>/plugins/…` 解析 → 404
→ 引导脚本未加载 → *"HTML did not preload @deepseek-ai/dsh-client-modules/client.js"*。

> 注：这与 v0.3.1 修过的同类问题（rc.8 的 preload 绝对化）是同一根因的不同形态——
> **上游每换一次 `<base>` 策略，插件 URL 的形态就会变**。

## 修复（`src/documentAssembly.ts`）

1. 新增归一化函数 `serverPluginUrl(ref, serverBase)`：把 `plugins/…`、`./plugins/…`、`/plugins/…`
   统一成 `${serverBase}/plugins/…`；非插件引用返回 `null`（保持原文不动）。
2. `PLUGIN_PRELOAD_RE` → `PLUGIN_REF_RE = /(src|href)="((?:\.\/)?\/?plugins\/[^"]+)"/g`，
   改写时走 `serverPluginUrl`，命中不了就原样保留。
3. `rewriteBootPluginUrls`：`entries[].url` 与 `batches[].url` 改走 `serverPluginUrl`
   （不再用 `startsWith("/")` 判定），同时天然支持 0.1.7 的**多个 application 批次**。
4. `SERVER_STATIC_RE` 扩展为 `favicon(?:-[a-z]+)?\.svg`，覆盖新增的 `favicon-dark.svg`。

## 验证

- **真实 dist 组装（dsh 0.1.7-rc.1）**：
  - 残留相对 `plugins/` 引用 = **0**；boot JSON 相对插件 URL = **0**；残留相对 `assets/` = **0**；
  - 3 处插件引用均已绝对化（2 个 preload `<link>` + 1 个引导 `<script>`）；
  - `favicon-dark.svg` 已重写为服务器地址；引导 `client-modules` 脚本为绝对地址。
- **单测**：新增 `assembleDocument handles the 0.1.7 <base>-relative plugins/ layout`
  （fixture 含 `<base href="./">`、相对 `plugins/`、2 个 application 批次、`favicon-dark.svg`）；
  `npm test` **99 项 99 过**；`tsc -p ./`（strict）零 issue。
- **全链路探测（真实 0.1.7-rc.1，隔离 DSH_HOME）**：**8/8 通过** —— 启动+版本、启动令牌 Cookie、
  `workspace/follow` 基线、`ensureWorkspaceSession`、`session/list`、`session/rename`、
  `workspace/archiveSession`、组装无相对插件残留。⇒ 0.1.7 未改认证/RPC，仅 dist 形态变化。

## 风险与后续

- 这是**纯前端 dist 组装**问题，不触碰认证/信任围栏与 DSH 源码。
- 上游 `<base>` 策略仍在变：下次 dsh 升级应首先核对 `GET /` 的 `<head>`（`<base>`、插件引用前缀、
  boot `batches` 数量），这是本项目历史故障率最高的一处（rc.8 / 0.1.1-rc.2 / 0.1.2-rc.1 / 0.1.7-rc.1 均在此）。

## 关联

- 同类历史修复: [20260820-v032-dsh-v011-rc2](../20260820-v032-dsh-v011-rc2/record.md)（boot 注入形态）、
  [20260907-dsh-0.1.2-rc1-auth](../20260907-dsh-0.1.2-rc1-auth/record.md)（0.1.2 相对 assets 布局）
