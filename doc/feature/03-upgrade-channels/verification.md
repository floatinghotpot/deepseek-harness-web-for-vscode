# 升级渠道与 rc.8 兼容（upgrade-channels）— 验证报告（verification）

**日期**: 2026-08-20 ｜ **阶段**: Feature Pipeline 收口审计（Auto）
**范围**: req R1（`--no-open` 版本门控）+ R2（next 渠道检测 + 侧边栏双升级选项）
**验证方式**: 单测 75/75 + tsc strict 零 issue + 代码事实复核（npm registry / dsh rc.8 源码）

---

## 1. RTTM 覆盖复查（req → plan → 证据）

| 需求 | 任务 | 代码位置（存在且被调用 ✓） | 验证证据 |
|---|---|---|---|
| R1 `--no-open` 门控 | T1,T2 | `versionCheck.shouldPassNoOpen`（新增，L91-99）→ `serverManager.start()` L250（`shouldPassNoOpen(version ?? undefined)` 门控 push `--no-open`）✓ | 单测阈值矩阵（rc.7→false / rc.8→true / undefined→false）10 例全过；tsc strict 零 issue |
| R2 next 检测 | T3 | `versionCheckService.checkForUpdates` 读 `dist-tags.latest` + `dist-tags.next`（L64-70），分别缓存 `LATEST_KEY`/`NEXT_KEY`（新增 `dsh.nextVersion`）✓；`cachedNext` ✓ | npm registry 实测 `{next:"0.1.0-rc.8", latest:"0.1.0-rc.7"}`；代码审查：fetch 一次解析两字段 |
| R2 侧边栏双按钮 | T4 | `launcherHtml` 两个按钮 `#upgradeLatest`/`#upgradeNext`（L154-155）；`setUpgrade(latest, next)` 各自独立显隐（L349-360）；init（L452-458）与 `postStatus`（L559-565）按 `isUpdateAvailable` 过滤后传 `latestVersion`/`nextVersion` ✓ | 渲染/消息路由代码审查；按钮 onclick 分别发 `{channel:"latest"}`/`{channel:"next"}` |
| R2 QuickPick 渠道命令 | T3,T5 | `showUpgradeOptions(context, current, path, channel)`：`spec = @deepseek-ai/dsh@${channel}`（L119）；`upgradeCommandFor(path, channel)` 推荐；extension.ts L162 `(channel) => ...` 接线 ✓ | `upgradeCommandFor` 双渠道单测（@latest/@next）；tsc 类型通过 |
| （贯穿）9 语言 i18n | T6 | `upgrade.availableLatest`/`upgrade.availableNext` × 9 语言（i18nStrings.ts）；`upgrade.available` 已移除无死键 | i18n parity 单测自动覆盖（全键 × 9 语言非空）|
| （贯穿）质量门 | T7 | — | `npm test` **75/75 通过**；`npm run compile` tsc strict **零 issue** |

## 2. 关键实现决策复核（对 solution.md 的偏离与原因）

| solution 设计 | 实际实现 | 原因（有据） |
|---|---|---|
| 侧边栏按钮显示判断 | 扩展侧 `isUpdateAvailable` 过滤后再传 webview，webview 内不做版本比较 | 保持内嵌 JS 零逻辑、版本比较集中 TS 侧（避免 JS 字符串比较 `"0.10.0"<"0.9.0"` 陷阱） |
| `upgradeInfo` 返回 `commandFor` 函数 | 保持；QuickPick 内 `info.commandFor(channel)!` 非空断言 | 推荐项仅在命令存在时展示（`recommended` 为 undefined 时过滤） |

## 3. 单测与质量证据

- `npm test`：**75/75 通过**（新增 `shouldPassNoOpen` 阈值矩阵 10 例 + `upgradeCommandFor` next 渠道 4 例；既有 compareVersions/isUpdateAvailable/24h 门回归全过；i18n 新键自动覆盖）；
- `npm run compile`（tsc strict）零 issue；
- 旧行为回归：`upgradeCommandFor(path)` 默认 latest 与既有 6 条测试断言一致（向后兼容）；24h 门、离线静默、终端预填不执行逻辑未动。

## 4. 差距清单（Gap Log）

| # | 差距 | 严重度 | 处置 |
|---|---|---|---|
| G1 | **rc.8 真机 spawn 验证未做**：本机未安装 dsh，无法实测 rc.8 下 `--no-open` 生效与 URL 解析 | P3 | 依据 rc.8 源码（`openBrowser` 默认 true + `--no-open` 选项 + URL 行前缀不变）代码级确认；待用户升级 rc.8 后真机复核（预期：不再弹浏览器，面板正常显示） |
| G2 | `upgrade-info` 消息处理器无对应发送方（pre-existing，非本特性引入） | P3 | 既有死代码，未动；后续清理 |
| G3 | 版本未知（`resolveDshVersion` 失败）时 rc.8 仍会弹浏览器（不传 `--no-open`） | P3（保守设计） | req D2 用户已批准：宁弹浏览器不启动失败 |

## 5. 结论

**feature 03（升级渠道与 rc.8 兼容）达成**：R1（`--no-open` 版本门控，≥ rc.8 才传，旧版本/未知版本安全跳过）+ R2（`latest`/`next` 双 dist-tag 检测、侧边栏双升级按钮、QuickPick 按渠道给 `@latest`/`@next` 命令、只预填不执行）全部实现；75/75 单测 + tsc strict 零 issue。已知边界：G1 真机 rc.8 验证待用户侧执行（代码级依据充分），G2 既有死代码未动，G3 保守设计获用户批准。

---

*关联文档：req.md ｜ solution.md ｜ plan.md ｜ discussion.md ｜ src/versionCheck.ts ｜ src/versionCheckService.ts ｜ src/serverManager.ts ｜ src/launcherView.ts ｜ src/extension.ts ｜ src/i18nStrings.ts*
