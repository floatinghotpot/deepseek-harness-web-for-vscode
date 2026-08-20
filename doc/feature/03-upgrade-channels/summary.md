# 升级渠道与 rc.8 兼容（upgrade-channels）— 总结（summary）

**日期**: 2026-08-20 ｜ **阶段**: Feature Pipeline 收口完成（用户 2026-08-20 口头需求，快速通道）

## 背景

dsh `0.1.0-rc.8` 发布在 npm `next` 渠道（`latest` 仍是 rc.7），且新增"启动自动打开默认浏览器"行为（`dsh-web-app` `openBrowser` 默认 true，`--no-open` 可关闭）。扩展若不跟进：rc 用户看不到 rc.8 提示，升上去后每次在 VS Code 里启动都会弹外部浏览器（与嵌入式 UI 定位冲突）。

## 做了什么

### R1 — `--no-open` 版本门控（rc.8 兼容，硬需求）
- `versionCheck.ts` 新增 `shouldPassNoOpen(version)`：可解析且 `>= 0.1.0-rc.8` → true；未知/不可解析 → false（保守，不传）；
- `serverManager.start()` 在 spawn 时按门控追加 `--no-open`——rc.8 及更新版本不再弹浏览器；rc.7 及更早（commander 不认此 flag 会启动失败）安全跳过。

### R2 — next 渠道检测 + 侧边栏双升级选项
- `versionCheckService` 同时读取并缓存 npm `dist-tags.latest` 与 `dist-tags.next`（新键 `dsh.nextVersion`）；
- 侧边栏在 ready 时按渠道各显示一个升级按钮（`最新版更新：{latest}` / `预览版更新（next）：{next}`），仅当该渠道版本确实高于当前版本时出现；
- 点击按钮 → QuickPick 按渠道给命令（推荐 + npm global + npx + 复制），命令用 `@latest`/`@next`，**只预填终端不自动执行**；
- `upgradeCommandFor(path, channel="latest")` 渠道化，默认 latest 向后兼容。

## 代码变更

- `src/versionCheck.ts`（+`shouldPassNoOpen`、`upgradeCommandFor` 渠道化）
- `src/serverManager.ts`（spawn `--no-open` 门控，import `shouldPassNoOpen`）
- `src/versionCheckService.ts`（`NEXT_KEY`、双 tag 读取/缓存、`UpgradeInfo{latest,next,commandFor}`、`showUpgradeOptions(channel)`）
- `src/launcherView.ts`（`nextVersion`、双按钮、`setUpgrade(latest,next)`、channel 消息路由、过滤后传值）
- `src/extension.ts`（`onUpgrade(channel)` 接线）
- `src/i18nStrings.ts`（`upgrade.availableLatest/availableNext` × 9 语言，移除 `upgrade.available`）
- 测试：`test/versionCheck.test.js`（+14 断言：门控阈值矩阵 + next 渠道命令）

## 质量

- 单测 **75/75 绿**（新增 14 断言），`npm run compile`（tsc strict）零 issue；
- 旧行为回归：24h 门、离线静默、QuickPick 预填不执行、`upgradeCommandFor` 默认 latest 全部保持。

## 已知边界

- **rc.8 真机 spawn 验证待做**（本机未装 dsh）：依据 rc.8 源码代码级确认 `--no-open` 有效 + URL 行前缀不变，用户升级 rc.8 后复核（预期：不再弹浏览器）；
- 版本未知时保守不传 `--no-open`（rc.8 边缘场景仍可能弹浏览器，用户批准的设计决策 D2）。

## 文档产物

`doc/feature/03-upgrade-channels/`：discussion / req（用户批准）/ solution / plan（T1–T7 全 ✅）/ verification / TODO（空）。

## 下一步建议

1. 用户侧：`npm i -g @deepseek-ai/dsh@next` 升 rc.8，真机复核"不再弹浏览器 + 面板正常"（G1）；
2. 可排期：清理 `upgrade-info` 死消息处理器（G2，pre-existing）。

*关联文档：verification.md ｜ TODO.md ｜ plan.md ｜ solution.md ｜ req.md ｜ discussion.md ｜ roadmap.md（M3）*
