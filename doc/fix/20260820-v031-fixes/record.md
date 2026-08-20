# Bugfix — v0.3.1 修复批次：插件 preload、浏览器抑制门控、next 渠道补查、statusBar dispose

**日期**: 2026-08-20 ｜ **影响**: v0.3.0 内嵌 Web UI（webview 传输桥方案）
**环境**: 本机全局 `dsh@0.1.0-rc.7`，传递依赖解析 `dsh-web-app@0.1.0-rc.8`、`dsh-client-modules@0.1.0-rc.8`

## 现象（用户实测）

1. v0.3.0 打开 VS Code：面板报 **"Failed to load plugins / client-modules: HTML did not preload @deepseek-ai/dsh-client-modules/client.js"**；
2. 同时每次启动弹**外部 Chrome** 打开 DSH Web UI；
3. 侧边栏看不到 rc.8 的**升级提醒**（next 渠道）；
4. 关闭 VS Code / dev host 时控制台报 **"Trying to add a disposable to a DisposableStore that has already been disposed of"**（堆栈指向 `statusBar.js → DshServerManager.emit → stop → extension.js dispose`）。

## 根因（代码事实）

### Bug A — preload 标签未绝对化（"Failed to load plugins"）

1. `dsh-client-modules@0.1.0-rc.8`（2026-08-19 发布）的 `injectBootManifest` 在 `<head>` 注入三段：
   - 内联 `window.__ModuleLoader__`（mode:"queue"），`create()` 从 `pendingQueue` 找
     `@deepseek-ai/dsh-client-modules` 注册项，找不到即抛 `"HTML did not preload ..."`；
   - **阻塞式 preload `<script src="/plugins/...">`**：`@deepseek-ai/dsh-client-modules` 与
     `@deepseek-ai/dsh-client-runtime` 两个 bundle（`PARSER_PRELOAD_IDS`，**rc.8 新增**；rc.6/rc.7
     的 `injectBootManifest` 实测只有 `window.__DSH_BOOT__` JSON 注入，无 preload 标签）；
   - `<script>window.__DSH_BOOT__ = {…}</script>`。
2. `src/documentAssembly.ts` 的 `rewriteBootPluginUrls` **只重写 JSON 内** `entries[].url`（F14），
   不碰 preload 标签；`ASSET_REF_RE`/`SERVER_STATIC_RE` 只覆盖 `/assets/` 与 manifest/favicon。
3. 组装后的 webview 文档里 preload 标签仍是相对 `/plugins/...` → 按 `vscode-webview://` 源解析 404 →
   `pendingQueue` 收不到 client-modules 注册 → `create()` 抛错 → boot overlay 显示 "Failed to load plugins"。

### Bug B — `--no-open` 门控按 CLI 版本判断（弹浏览器）

4. `--no-open` 是 **dsh-web-app** 的 flag（rc.8 引入，`openBrowser: options.open` 默认 true → 自动开浏览器）；
5. remote v0.3.0 的 `shouldPassNoOpen(version)` 用 **CLI 版本字符串**判断（`dsh --version`）；
6. 本机 CLI=rc.7、web-app=rc.8（npm 传递依赖解析错配）→ 门控判 `rc.7 < rc.8` → **不传 `--no-open`** →
   rc.8 web-app 默认行为自动开浏览器。CLI 版本无法反映 npx 缓存解析出的 web-app 版本。

### Bug C — next 渠道 24h 门控吞掉补查（看不到 rc.8 提醒）

7. `NEXT_KEY`（`dsh.nextVersion`）是 v0.3.0 才引入；用户旧版缓存只有 `LATEST_KEY`；
8. `checkForUpdates` 门控只看 `LATEST_KEY`：`cached !== undefined && !shouldCheckVersion(...)` →
   24h 内直接 return，**永不重新查 registry** → `NEXT_KEY` 恒空 → `upgradeInfo` 认为 next 无更新 →
   侧边栏不显示 rc.8 按钮。

### Bug D — statusBar dispose 时序（DisposableStore 报错）

9. `statusBar.ts` 把 item 注册为 `context.subscriptions.push(item)`，但 **state 监听器从不解除**；
10. VS Code 关闭时按序 dispose subscriptions：先释放 statusBar item，再执行
    `{dispose: () => manager?.stop()}`（extension.ts）→ `stop()` → `setState("stopping")` → **emit "state"** →
    还挂着的 statusBar 监听器执行 `item.command = ...` → 操作已释放的 item →
    "add a disposable to a DisposableStore that has already been disposed of"。

## 修复

- **`src/documentAssembly.ts`**：新增 `PLUGIN_PRELOAD_RE`（`(src|href)="/plugins/..."`）与
  `rewriteBootPluginPreloads(html, serverBase)`，在 `assembleDocument` 中 `rewriteBootPluginUrls` 之后调用，
  preload 标签绝对化为 `http://127.0.0.1:<port>/plugins/...`（经典脚本跨源 OK，spike F2/F14；
  CSP `script-src` 已含 `http://127.0.0.1:*`）。
- **`src/serverManager.ts`**：新增 `probeNoOpenSupport(bin)`——spawnSync `dsh web --help`，看输出是否含
  `--no-open`（**探测实际生效的 web-app 能力**，对任意 CLI/web-app 组合权威）；`start()` 里 probe 优先，
  失败（null）回退 `shouldPassNoOpen(version)`；结果 per-binary 缓存。
- **`src/versionCheck.ts` / `src/versionCheckService.ts`**：新增纯函数
  `shouldSkipVersionCheck(hasLatest, hasNext, last, now)`——24h 门控**只在两个渠道都已缓存**时生效；
  `NEXT_KEY` 缺失（旧版升级）→ 不跳过 → 重新查 registry 补上 next。
- **`src/statusBar.ts`**：组合 disposable——dispose 时先 `disposed = true` + `manager.off("state", onState)`
  **再** `item.dispose()`；`render()` 入口加 `if (disposed) return` 双保险。
- **`src/launcherView.ts`**（顺带）：侧边栏标题下显示 `extension v0.3.1`（`context.extension.packageJSON.version`，
  复用已有 `.subtitle` 样式；不硬编码扩展 ID）。

## 验证

- 真实 rc.8 服务器 `GET /` 的 HTML 走完整改写链：preload 两标签绝对化 ✅、无残留相对 `src="/plugins/` ✅、
  JSON entries 绝对化 ✅、`__ModuleLoader__` 队列脚本原样保留 ✅；
- `probeNoOpenSupport`：隔离可写 home 下真实 `dsh web --help` 含 `--no-open` → true；rc.7 形态 fake →
  false；缺失二进制 → null（回退版本门控）✅；
- `shouldSkipVersionCheck` 单测覆盖"旧版升级必须补查 next" ✅；
- statusBar 语义复现：旧代码（监听器不解除）复现 DisposableStore 报错，新代码（先 off 再 dispose）不抛 ✅；
- `npm run compile`（tsc strict）零 issue；`npm test` 80 项 79 过——唯一失败
  `resolveDshPath finds dsh in an injected home` 为**预先存在的环境相关失败**（机器有全局 dsh，
  与本次修复无关）；
- 用户安装 v0.3.1 vsix 实测：插件加载正常、不再弹浏览器、侧边栏副标题显示、rc.8 升级提醒出现、
  **关闭 dev host 不再报 DisposableStore 错误** ✅。

## 后续建议（防同类）

- **上游 rc 迭代快**（rc.6 → rc.7 → rc.8 相隔数天），boot 协议/flag 常变：凡涉及 `__DSH_BOOT__`、
  `--no-open` 等上游形态的代码，升级 dsh 后对照**当前服务器实测**回归（`curl /` 核对 `<head>`、
  `dsh web --help` 核对 flag），并把 TODO T16（版本固化/校验）提前；
- **监听器生命周期纪律**：凡是 `manager.on("state")` 等 EventEmitter 监听，必须与所操作对象
  （item/view/panel）组成**同一个组合 disposable**（先 off 再 dispose），避免 VS Code 关闭时序窗口；
- **缓存与特性演进**：引入新缓存键（如 NEXT_KEY）时，旧缓存只有旧键会导致门控吞掉补查——门控条件要
  与"所需数据完整性"绑定，而非只看最老的那个键。

*关联文档：doc/feature/00-dsh-vscode/spike-notes.md（F2/F14/S5）｜ plan.md（T4）｜ CHANGELOG.md*
