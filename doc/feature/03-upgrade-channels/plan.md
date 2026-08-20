# 升级渠道与 rc.8 兼容（upgrade-channels）— 实施计划（plan）

**日期**: 2026-08-20
**来源**: [discussion.md](discussion.md) ｜ [req.md](req.md) ｜ [solution.md](solution.md)

## RTTM（req → 任务 → 验证）

| 需求 | 任务 | 验证方式 |
|---|---|---|
| R1 `--no-open` 版本门控 | T1, T2 | `shouldPassNoOpen` 单测阈值矩阵 + spawn args 单测 + tsc |
| R2 next 检测 + 双渠道缓存 | T3 | `checkForUpdates` 读双 tag 单测/代码审查 |
| R2 侧边栏双按钮 | T4 | launcherView 渲染/消息路由审查（webview 侧） |
| R2 QuickPick 渠道命令 | T3, T5 | `upgradeCommandFor` 双渠道单测 + 接线审查 |
| （贯穿）9 语言 i18n | T6 | i18n parity 单测自动覆盖 |
| （贯穿）质量门 | T7 | `npm test` 全绿 + `npm run compile` tsc strict 零 issue |

## 任务清单

### T1 — `src/versionCheck.ts`：`shouldPassNoOpen` + 渠道化 `upgradeCommandFor`
- 新增 `shouldPassNoOpen(version)`：可解析且 `>= 0.1.0-rc.8` → true；undefined/不可解析 → false；
- `upgradeCommandFor(dshPath, channel="latest")`：命令中的 `@latest` 改为 `@${channel}`；
- 依赖：`compareVersions`（已存在，F5）。
- **完成标准**：两函数 vscode-free；单测覆盖。

### T2 — `src/serverManager.ts`：spawn 追加 `--no-open`（门控）
- `start()` L245 处：
  ```ts
  const args = ["web", "--port", "0"];
  if (shouldPassNoOpen(version)) args.push("--no-open");
  args.push(...(opts.extraArgs ?? []));
  const child = spawn(bin, args, { … });
  ```
- import `shouldPassNoOpen` from `./versionCheck.js`。
- **完成标准**：rc.8 场景 args 含 `--no-open`；rc.7/undefined 不含；URL 解析不受影响。

### T3 — `src/versionCheckService.ts`：双渠道检测 + 渠道化 QuickPick
- `NEXT_KEY = "dsh.nextVersion"`；`checkForUpdates` 读 `dist-tags.latest` + `dist-tags.next`，分别缓存（fetch 一次，解析两次字段）；
- `cachedNext(context)`；
- `UpgradeInfo = { latest?; next?; commandFor(channel) }`；`upgradeInfo` 条件改为 `current < latest || current < next`；
- `showUpgradeOptions(context, current, path, channel)`：QuickPick 项命令 = `upgradeCommandFor(path, channel)`；保留"复制命令"。
- **完成标准**：装 rc.7 时 latest+next 双提示；next 命令含 `@next`。

### T4 — `src/launcherView.ts`：侧边栏双按钮
- `LauncherInit` 增 `nextVersion?`；HTML 增 `#upgradeLatest`/`#upgradeNext` 两个按钮（复用 `.upgrade` 样式）；
- `setUpgrade(latest, next, version)`：各自仅在"真更新"（version < 该渠道版本）时显示，文案用新 i18n 键；
- 点击 postMessage `{type:"upgrade", channel}`；路由改 `this.onUpgrade(channel)`；
- init（L448 附近）与 `postStatus`（L539-543）携带 `nextVersion`。
- **完成标准**：两个按钮独立显示/隐藏；消息带 channel。

### T5 — `src/extension.ts`：接线
- L162：`(channel) => void showUpgradeOptions(context, m.dshVersion, m.dshBinPath, channel)`。
- **完成标准**：类型通过 tsc strict。

### T6 — `src/i18nStrings.ts`：9 语言
- 新增 `upgrade.availableLatest` / `upgrade.availableNext`（9 语言）；删除 `upgrade.available`（D5）。
- **完成标准**：i18n parity 测试绿（无空键）。

### T7 — 测试与质量门
- `test/versionCheck.test.js` 新增：`shouldPassNoOpen` 矩阵（`rc.7`→false、`rc.8`→true、`0.1.0`→true、`undefined`→false、`garbage`→false）；`upgradeCommandFor` 渠道（npx/npm 路径 × latest/next）；
- `npm test` 全绿（当前 73/73 + 新增）；`npm run compile`（tsc strict）零 issue。
- **完成标准**：两命令零 issue，新增单测全绿。

## 依赖图

```
T1 ──▶ T2
T1 ──▶ T3 ──▶ T5
T3 ──▶ T4
T6（可与 T3/T4 并行）
T7（收口）
```

## 状态

| 任务 | 状态 |
|---|---|
| T1 | ✅ 2026-08-20：`shouldPassNoOpen` + 渠道化 `upgradeCommandFor` |
| T2 | ✅ 2026-08-20：spawn 门控 `--no-open`（tsc 零 issue） |
| T3 | ✅ 2026-08-20：双 dist-tag 检测 + 渠道化 QuickPick |
| T4 | ✅ 2026-08-20：侧边栏双按钮 + channel 消息路由 |
| T5 | ✅ 2026-08-20：extension 接线 `(channel)` |
| T6 | ✅ 2026-08-20：i18n 新键 × 9 语言 |
| T7 | ✅ 2026-08-20：单测 75/75 绿 + tsc strict 零 issue |

---

*关联文档：discussion.md ｜ req.md ｜ solution.md*
