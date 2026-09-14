# Bugfix — 内嵌 UI 设置不可用：loopback 门禁 + themeSync 旧接口（v0.3.4，dsh 0.1.5-rc.2）

**日期**: 2026-09-15 ｜ **影响**: 扩展 v0.3.4（dsh ≥ 0.1.2-rc.1，所有平台）
**环境**: 全局 `dsh@0.1.5-rc.2`（macOS，VS Code 内嵌面板）
**来源**: 用户报告"内嵌 dsh web UI 的设置 → Models 不对"；参照姊妹项目 `remote-dsh` 的同类修复
（`~/workspace/remote-dsh/doc/fix/20260914-remote-webui-settings/`）定位根因。

## 现象

- 内嵌面板 **设置 → Models** 不可用（DSH 侧报 `settings are unavailable in this browser`），无法在 UI 里配置 API key；
- 所有设置项都不落盘（每次重载回到默认）；
- **顺带发现**：`themeSync`（跟随 VS Code 主题写 DSH 设置）自 0.1.2-rc.1 起一直静默失败，
  只是被页面内 `matchMedia` shim 掩盖，主题"看起来"仍正确。

## 根因（两条，均在设置子系统）

### RC1 — DSH 的 loopback 门禁（主因）

| # | 事实 | 证据 |
|---|---|---|
| F1 | 设置文档控制器**只在 loopback 页面创建**，否则 `documentController` 为 undefined，Models 报错 | `dsh-client-ui-settings-general/lib/client.js:540` |
| F2 | `isLoopback = transport?.ownsHost === true \|\| pageLocation === void 0 \|\| isLoopbackHostname(pageLocation.hostname)` | `dsh-client-connection/lib/client.js:6344` |
| F3 | `pageLocation` 就是真实 `location`；`isLoopbackHostname` 只认 `localhost` / `[::1]` / `127.x.x.x` | 同文件 `:6305`、`:6273` |
| F4 | **设置持久化模式由同一标志决定**：`persistence = isLoopback ? "host" : "memory"` | `dsh-client-ui-settings/lib/client.js:1345` |
| F5 | 我们的内嵌页面源是 `vscode-webview://…` ⇒ 永远不是 loopback ⇒ F1 与 F4 同时命中 | `src/documentAssembly.ts`（页面以 webview 资源组装） |
| F6 | `isLoopback` 的全部消费点只有 3 处（另 1 处为 `dsh-api-gateway/lib/client.js:1457` 传入 host facts） | 全仓 grep |

### RC2 — `themeSync` 使用已被移除的 RPC

| # | 事实 | 证据 |
|---|---|---|
| F7 | 旧实现 POST `/api/settings.update`（点号方法 + 平铺 payload、**无 Cookie**）⇒ 0.1.2-rc.1 起 401/404，静默失败 | 修复前 `src/themeSync.ts:22-31` |
| F8 | 0.1.5 的对应端点为 `settings/update`，参数仍是 `ns`/`patch`（`expectedRevision` 可选） | `dsh-api-settings-controller/lib/typert.remote-client.js` |
| F9 | 实测（扩展宿主代发 + 会话 Cookie）：`settings/describe` 与 `settings/update` 均 200/ok，且落盘 `$DSH_HOME/settings.yaml` → `ui-theme: preference: dark` | 本地探针（隔离 DSH_HOME） |

## 修复（与 remote-dsh 方案的差异）

remote-dsh 是"**在转发的 JS 字节里把 `isLoopbackHostname(pageLocation.hostname)` 替换成 `true`**"，
并为此付出 gzip 编码感知、缓存头改写等代价（其记录 F27/F28/F29）。

本项目采用 DSH 预留的 `globalThis.__DSH_TRANSPORT__` 接缝（比 remote-dsh 的字节补丁更省）：

```js
// dsh-client-connection/lib/client.js:6307/6309/6344
const transport = globalThis.__DSH_TRANSPORT__;
const rpc = fixtureRpc ?? createWebConnectionRpc(transport?.fetch, transport?.openStream);
isLoopback: transport?.ownsHost === true || pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname)
```

- `__DSH_TRANSPORT__` 在 DSH 里**只读不写**（全树无一处赋值），是纯外部注入点；
- 只设 `{ ownsHost: true }`，`fetch`/`openStream` 保持 undefined：`createWebConnectionRpc` 的 `send` 回退到
  `globalThis.fetch`（我们的 shim）、`rpc.open` 缺失走 WebSocket 流回退——即正常的浏览器路径，RPC 与未设时完全一致；
- 唯一生效的是 `ownsHost === true` → `isLoopback === true`（`transport` 保持最小对象，不动传输语义）。

### 最终改动

| # | 文件 | 改动 |
|---|---|---|
| 1 | `media/bridge-client.js` | DSH 代码运行前 `if (!window.__DSH_TRANSPORT__) window.__DSH_TRANSPORT__ = { ownsHost: true }`（宿主已提供则不覆盖） |
| 2 | `src/serverManager.ts` | 新增 public `updateSettings(ns, patch)` → `settings/update` + 会话 Cookie |
| 3 | `src/themeSync.ts` | 改调 `manager.updateSettings("ui-theme", { preference })`，保留开关与失败日志 |
| 4 | `src/extension.ts` | `registerThemeSync(context, manager)` |
| 5 | `src/launcherView.ts` | 侧边栏副标题 `extension v…` → `dsh4vscode v…` |

## 验证

- **单测**：`npm test` **98 项 98 过**；`tsc -p ./`（strict）零 issue；`node --check media/bridge-client.js` 通过。
- **宿主机路径实测**：`settings/update` 200/ok 并写盘 `settings.yaml → ui-theme: preference: dark`（RC2 路径可用）。
- **真实 dist 实测**：组装页含 bridge 且先于插件 preload；11 MB combo bundle 含 `__DSH_TRANSPORT__`/`ownsHost`/`isLoopbackHostname`。
- **用户 VS Code 实测（F5，2026-09-15）**：设置 → Models 显示内容 ✅ 且**输入框正常发送** ✅（双通过，验收达成）。

### 过程中的一次误判（记录在案）

第一次验证只做了"装 vsix → 输入框无反应"，据此把 seam 当副作用回退。随后控制变量 F5 复测：
**输入框 + 设置页同时正常**。结论——"输入框失效"是**装 vsix 复用旧窗口/旧 dsh 的环境差异**，
不是 seam 的问题；seam 方案成立，字节补丁方案未启用。

## 风险与备选

- `__DSH_TRANSPORT__` 是上游内部接缝（未见于文档/类型），当前 0.1.5-rc.2 只读 `ownsHost` 一处。
  若上游移除或改读取更多字段，本方案失效——**备选方案即 remote-dsh 的字节级 JS 补丁**
  （在 `documentAssembly` 把 `/plugins/…` 的 client-connection combo bundle 本地化后，把
  `isLoopbackHostname(pageLocation.hostname)` 替换为 `true`）。
- 该 seam 只影响 `isLoopback` 的三个消费点，不触碰认证/信任围栏；扩展仍以纯 Node 请求（带会话 Cookie）
  代发，未弱化 DSH 的 `/api` 围栏。
- **落地**：随 **0.3.5** 发布（双语 CHANGELOG + README 兼容表 + vsix + Open VSX + GitHub Release）。

## 关联

- 姊妹项目同类修复: `~/workspace/remote-dsh/doc/fix/20260914-remote-webui-settings/`（其方案为 JS 字节补丁）
- 本项目 0.1.2-rc.1 适配记录: [20260907-dsh-0.1.2-rc1-auth](../20260907-dsh-0.1.2-rc1-auth/record.md)
