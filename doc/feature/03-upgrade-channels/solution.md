# 升级渠道与 rc.8 兼容（upgrade-channels）— 方案（solution）

**日期**: 2026-08-20 ｜ **依据**: [req.md](req.md)（用户已批准）+ 代码事实审计（逐文件实读）

## 1. Goal

1. **R1**：扩展 spawn `dsh web` 时按版本门控追加 `--no-open`（≥ 0.1.0-rc.8），rc.8 下不再弹外部浏览器，旧版本行为不变。
2. **R2**：版本检测同时跟踪 `latest` + `next` 两个 dist-tag；侧边栏按渠道显示两个升级按钮，用户自选渠道，QuickPick 按渠道给命令（只预填不执行）。

## 2. Facts（代码事实审计，2026-08-20 实读）

| # | 文件:行 | 事实 |
|---|---|---|
| F1 | `src/serverManager.ts:245` | spawn 参数硬编码 `["web", "--port", "0", ...(opts.extraArgs ?? [])]`，无 `--no-open` |
| F2 | `src/serverManager.ts:232` | `resolveDshVersion(bin)` 启动时解析 dsh 版本 → `this._version`（可为 undefined） |
| F3 | `src/serverManager.ts:62` | `URL_LINE_RE = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/`，rc.8 的 URL 行前缀不变，不受"opening the default browser"附加输出影响 |
| F4 | `src/serverManager.ts:46-47` | `extraArgs?: string[]` 选项存在但**无调用方**（grep 全 src 仅定义+使用两处） |
| F5 | `src/versionCheck.ts:11-49` | `compareVersions` 支持 `-rc.N` 比较（rc.6 < rc.7 < 0.1.0），已有单测 |
| F6 | `src/versionCheck.ts:73-86` | `upgradeCommandFor(dshPath)` 按路径推断命令，全部硬编码 `@latest`（L78-84） |
| F7 | `src/versionCheckService.ts:10` | `LATEST_KEY = "dsh.latestVersion"` 唯一缓存键 |
| F8 | `src/versionCheckService.ts:59-60` | `checkForUpdates` 只读 `pkg["dist-tags"]?.latest` |
| F9 | `src/versionCheckService.ts:83-91` | `upgradeInfo` 返回 `{ latest?, command }`，仅当 `isUpdateAvailable(current, latest)` |
| F10 | `src/versionCheckService.ts:97-136` | `showUpgradeOptions` QuickPick 项 L108-109 硬编码 `@latest` 命令 |
| F11 | `src/launcherView.ts:30` | `LauncherInit.latestVersion?: string`（仅 latest） |
| F12 | `src/launcherView.ts:50-53,152,338-342` | 单个 upgrade 按钮：`upgradeText` + `setUpgrade(latest, version)` |
| F13 | `src/launcherView.ts:184,421-422` | 按钮点击 → `{type:"upgrade"}` → `this.onUpgrade()`（无渠道） |
| F14 | `src/launcherView.ts:448,535-543` | init 与 server-status 消息只携带 `latestVersion` |
| F15 | `src/extension.ts:162` | `showUpgradeOptions(context, m.dshVersion, m.dshBinPath)` 单渠道调用 |
| F16 | `src/i18nStrings.ts:120-141` | `upgrade.available`/`upgrade.current` 等键，9 语言齐全；i18n.test.js 强制全键 × 9 语言非空 |
| F17 | `test/versionCheck.test.js`（94 行） | compareVersions/isUpdateAvailable/upgradeCommandFor 既有测试 |
| F18 | npm registry（2026-08-20 实测） | `dist-tags = {next:"0.1.0-rc.8", latest:"0.1.0-rc.7"}` |
| F19 | `@deepseek-ai/dsh-web-app@0.1.0-rc.8` 源码（tarball 实拉） | `openBrowser` 默认 true；`--no-open` 存在；rc.7 无此功能（详见 discussion F3） |

## 3. Gap（Goal − Facts）

1. **R1 缺口**：spawn 无条件不传 `--no-open`（F1/F4）→ rc.8 下每次启动弹浏览器；且不能无条件传（F19 未知选项崩溃）→ 需要版本门控（F5 的 `compareVersions` 可复用，F2 提供版本）。
2. **R2 缺口**：只跟踪 latest（F7/F8），侧边栏单按钮单渠道（F11-F13），命令硬编码 @latest（F6/F10），消息不携带 next（F14/F15）。

## 4. Call-site Audit（契约变更审计）

| 变更函数 | 新契约 | 全部调用点 | 分类 |
|---|---|---|---|
| `upgradeCommandFor(dshPath, channel="latest")` | 第二参可选，默认 latest，向后兼容 | `versionCheckService.ts:106`（唯一调用）→ 改传 channel | **compatible**（我们同步改） |
| `upgradeInfo(...)` 返回 `{latest?, next?, commandFor}` | `.latest` 仍存在 | `launcherView.ts:448,538` 取 `.latest` → 兼容；`versionCheckService.ts:102-103` 内部重写 | **compatible** |
| `showUpgradeOptions(context, current, path, channel)` | 新增第 4 参 | `extension.ts:162` 唯一调用 → 同步改 | **compatible** |
| `LauncherInit` / `setUpgrade` / `upgrade-info` / `server-status` 消息 | 增加 `nextVersion`/`channel` 字段 | 全部为 launcherView.ts 内部 + extension.ts:162 路由，同步改 | **compatible** |

**结论**：无冲突调用点；全部调用方在本特性内同步更新，无需重设计。

## 5. Tasks

### T1 — `src/versionCheck.ts`：门控 + 渠道命令
- 新增 `shouldPassNoOpen(version: string | undefined): boolean`：`version` 可解析且 `compareVersions(version, "0.1.0-rc.8") >= 0` → true；不可解析/undefined → false（保守，D2）。
- `upgradeCommandFor(dshPath, channel: "latest" | "next" = "latest")`：把 L78-84 的 `@latest` 改为 `@${channel}`。
- 保持 vscode-free。

### T2 — `src/serverManager.ts`：spawn 门控
- 引入 `shouldPassNoOpen`；`start()` 中构造 args：
  ```ts
  const args = ["web", "--port", "0"];
  if (shouldPassNoOpen(version)) args.push("--no-open");
  args.push(...(opts.extraArgs ?? []));
  spawn(bin, args, …)
  ```

### T3 — `src/versionCheckService.ts`：双渠道检测
- 新增 `NEXT_KEY = "dsh.nextVersion"`；`checkForUpdates` 同时读 `dist-tags.latest`/`dist-tags.next`，分别缓存；
- 新增 `cachedNext(context)`；
- `UpgradeInfo` 改为 `{ latest?: string; next?: string; commandFor: (c: Channel) => string | null }`；`upgradeInfo` 在 `current < latest || current < next` 时返回；
- `showUpgradeOptions(context, current, path, channel)`：QuickPick 项按渠道生成命令（`upgradeCommandFor(path, channel)`），保留"复制命令"项；placeHolder 用渠道版本号。

### T4 — `src/launcherView.ts`：侧边栏双按钮
- `LauncherInit` 增 `nextVersion?`；
- HTML 增两个按钮 `#upgradeLatest` / `#upgradeNext`（复用 `.upgrade` 样式）；
- `setUpgrade(latest, next, version)`：latest 按钮仅在 `latest && version && latest > version` 显示；next 同理（`compareVersions` 判断，webview 侧用扩展传入的 `latestVersion`/`nextVersion` 与 `version` 对比——保持与现状一致的"只显示真更新"语义）；
- 点击 → `{type:"upgrade", channel:"latest"|"next"}`；路由 `this.onUpgrade(channel)`；
- init 与 server-status 消息携带 `nextVersion`。

### T5 — `src/extension.ts`：接线
- L162 改为 `(channel: "latest" | "next") => void showUpgradeOptions(context, m.dshVersion, m.dshBinPath, channel)`。

### T6 — `src/i18nStrings.ts`：9 语言文案
- 新增 `upgrade.availableLatest`（"Update available (latest): {latest}"）与 `upgrade.availableNext`（"Update available (next): {next}"）各 9 语言；
- 移除 `upgrade.available`（D5，无死键）。

### T7 — 测试与验证
- `test/versionCheck.test.js`：`shouldPassNoOpen` 阈值矩阵（rc.7→false、rc.8→true、0.1.0→true、undefined/garbage→false）；`upgradeCommandFor` 双渠道（npx/npm 路径 × latest/next）；
- 全量 `npm test` 绿 + `npm run compile`（tsc strict）零 issue；
- i18n parity 自动覆盖新键（F16）。

*关联文档：discussion.md ｜ req.md ｜ plan.md*
