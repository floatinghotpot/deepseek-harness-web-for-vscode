# Bugfix — vsix 未打包运行时依赖 `ws`（激活即崩，图标无限转圈）

**日期**: 2026-08-17 ｜ **影响**: v0.0.1（已发布到 Open VSX）

## 现象（用户实测，Antigravity 安装版）

- 从 Open VSX 安装 v0.0.1 后，点击活动栏 DSH 图标：侧边栏**一直加载**，图标上**常驻刷新标志**
- F5 开发宿主正常（本地有 node_modules），安装版必现

## 根因（代码事实）

1. `src/bridgeCore.ts:10` → `out/bridgeCore.js:10`：`require("ws")` —— 被 `extension.ts → dshPanel.ts → bridgeHost.ts → bridgeCore.ts` 的模块链**在 activate() 时加载**；
2. `package.json` 的 `files` 白名单**只含 out/media/README/LICENSE/nls/icon**，未含 `node_modules/`；
3. vsce 打包实测：`unzip -l 0.0.1.vsix | grep node_modules` → **0 个**；
4. 安装版 `require("ws")` → MODULE_NOT_FOUND → `activate()` 抛错 → `WebviewViewProvider` 未注册 → 视图永远处于加载态。

## 修复

- `package.json`：`files` 增加 `node_modules/ws/**`（ws@8 零运行时依赖，单目录约 100KB）；
- 版本 0.0.1 → **0.0.2**（覆盖已发布的坏版本）。

## 验证

- `npm test` 20/20 ✓
- `make package` → v0.0.2 vsix（52 文件，97KB）；`unzip -l | grep -c node_modules/ws` → **19** ✓
- 待用户：Antigravity 卸载 0.0.1 → 安装 0.0.2 → 点图标应显示启动器

## 后续建议（防同类）

- 发布前检查清单增加：`unzip -l <vsix> | grep node_modules` 非空（若声明了运行时依赖）；
- 可选：将 `ws` 改为扩展内 lazy-import，使激活不依赖任何第三方模块（降激活风险）。

*关联文档：doc/publishing.md ｜ verification.md*
