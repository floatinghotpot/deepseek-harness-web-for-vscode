# Bugfix — 适配 dsh 0.1.1-rc.2：boot 注入形态变更导致插件加载失败（Failed to load plugins）

**日期**: 2026-08-20 ｜ **影响**: v0.3.1（dsh ≥ 0.1.1-rc.2 时内嵌面板插件全挂）
**环境**: 全局 `dsh@0.1.1-rc.2`（0.1.0-rc.7 升级而来）

## 现象（用户实测）

- dsh 升级到 0.1.1-rc.2 后，扩展能启动 dsh 进程，但内嵌 Web UI 无法渲染；
- 面板报：**"Failed to load plugins / failed to import loader entry ee7e3d25 (@deepseek-ai/dsh-typert-registry): client-modules: bundle script /plugins/@deepseek-ai/dsh-typert-registry/client.js?rev=... failed to load"**；
- 注意：此报错**不是** 0.3.1 修过的 "HTML did not preload"（preload 标签正常），而是**其他插件 bundle 加载失败**，且 URL 是相对路径。

## 根因（代码事实）

1. dsh **0.1.1-rc.2** 的 boot 注入形态变更（实测 `GET /` 的 HTML）：
   - rc.8 及以前：`<script>window.__DSH_BOOT__ = {…}</script>`
   - **0.1.1-rc.2**：`<script>globalThis["__DSH_BOOT__"] = {…}</script>`
2. `src/documentAssembly.ts` 的 `BOOT_RE` 只匹配旧形态：
   ```ts
   /window\.__DSH_BOOT__ = (\{.*?\})<\/script>/s
   ```
   → 对 0.1.1-rc.2 的 HTML **匹配失败** → `rewriteBootPluginUrls` 直接 `return html` 原样；
3. `__DSH_BOOT__` JSON 里所有 `entries[].url` 保持相对 `/plugins/<id>/client.js?rev=…`；
4. webview 文档按 `vscode-webview://` 源解析相对路径 → 404 → 模块系统加载每个插件 bundle 失败（首个失败的是 `@deepseek-ai/dsh-typert-registry`，故报错指向它）；
5. preload 标签（`<script src="/plugins/...">`，0.3.1 已修）不受影响——它们被 `PLUGIN_PRELOAD_RE` 单独绝对化，所以报错形态从 "did not preload" 变成了 "bundle script failed to load"。

## 修复

- **`src/documentAssembly.ts`**：`BOOT_RE` 兼容两种注入前缀，捕获到 `</script>` 结束：
  ```ts
  /(?:window\.__DSH_BOOT__|globalThis\["__DSH_BOOT__"\])\s*=\s*(\{.*?\})<\/script>/s
  ```
  JSON 解析与绝对化逻辑不变（F14 同款）；注入语句本身原样保留（`globalThis["__DSH_BOOT__"]` 不被改写）。

## 验证

- 真实 0.1.1-rc.2 服务器 `GET /` 的 HTML 走完整改写链：JSON entries 全部绝对化 ✅、无相对 `/plugins/` url 残留 ✅、
  preload 标签绝对化 ✅、`globalThis["__DSH_BOOT__"]` 注入语句保留 ✅；
- 向后兼容 rc.8 形态（`window.__DSH_BOOT__ =`）单测通过 ✅；
- 新增回归测试 `rewriteBootPluginUrls matches the 0.1.1-rc.2 globalThis boot shape` ✅；
- `npm run compile`（tsc strict）零 issue；`npm test` 81 项 80 过——唯一失败
  `resolveDshPath finds dsh in an injected home` 为**预先存在的环境相关失败**（机器有全局 dsh，
  与本次修复无关）；
- 用户 F5 实测：dsh 0.1.1-rc.2 面板正常渲染、插件加载、对话可用 ✅。

## 后续建议（防同类）

- 上游 rc 迭代快，boot 协议形态还会变：**升级 dsh 后必须回归内嵌面板**，且报错形态会随修复演进
  （"did not preload" → "bundle script failed to load" → …），排查时先核对 `curl /` 的 `<head>` 注入
  语句与 `BOOT_RE` 是否一致；
- 考虑把 `BOOT_RE` 改为更宽松的匹配（如 `/__DSH_BOOT__\]?\s*=\s*(\{.*?\})<\/script>/s`）以免疫前缀变化，
  但需谨慎——过宽可能误吞其他脚本；当前双前缀显式匹配已覆盖已知形态；
- **TODO T16（dsh 版本固化/校验）应优先**：上游 0.1.0-rc.6 → rc.7 → rc.8 → 0.1.1-rc.2 数天一变，
  每次都在改扩展依赖的协议面。

*关联文档：doc/fix/20260820-v031-fixes/record.md ｜ doc/feature/00-dsh-vscode/spike-notes.md（F14/S5）｜ CHANGELOG.md*
