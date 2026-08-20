# 升级渠道与 rc.8 兼容（upgrade-channels）— 需求（req）

**日期**: 2026-08-20
**来源**: [discussion.md](discussion.md)、用户 2026-08-20 口头需求（已批准）、[roadmap.md](../roadmap.md) G-03
**状态**: ✅ 用户已批准（2026-08-20，选择"两项一起做，快速走 Feature Pipeline"）

> 本文件只定义 **做什么（WHAT）** 与 **验收标准**，不含实现细节（HOW）。

---

## 1. 背景（一句话）

dsh rc.8 发布在 `next` 渠道且新增"自动开浏览器"行为：扩展若不跟进，rc 用户既看不到 rc.8 升级提示，升上去后每次启动还会弹出外部浏览器。

## 2. 范围（2 项需求）

### R1 — `--no-open` 版本门控（rc.8 兼容，硬需求）

扩展 spawn `dsh web` 时，**仅当 dsh 版本 ≥ 0.1.0-rc.8**（该 flag 存在的版本）追加 `--no-open`，防止嵌入式 Web UI 场景下弹出外部浏览器；更早版本不传（commander 遇未知选项会启动失败）。

**验收**：
- 版本 `0.1.0-rc.8` 及以上 → spawn 参数含 `--no-open`；
- 版本 `0.1.0-rc.7` 及更早 / 版本未知 / 不可解析 → 不传；
- 版本未知时不传（保守：宁可在 rc.8 边缘场景弹浏览器，也不能让旧版本启动失败）；
- rc.8 的 URL 行解析不受影响（`dsh web: http://127.0.0.1:<port>` 前缀格式未变）。

### R2 — next 渠道检测 + 侧边栏双升级选项

- 版本检测同时读取 npm `dist-tags.latest` 与 `dist-tags.next`，两者分别缓存；
- 侧边栏在 dsh ready 时：`current < latest` → 显示 **latest 升级按钮**；`current < next` → 显示 **next 升级按钮**（两个按钮可同时出现，各自显示目标版本号）；
- 点击某渠道按钮 → QuickPick 按该渠道给出升级命令（`@latest` / `@next`，按安装方式推荐），**绝不自动执行**（沿用现有 24h 门、终端预填交互）；
- 若某渠道版本不高于当前版本，则不显示该按钮。

**验收**：
- 用户装 `0.1.0-rc.7` 时：侧边栏同时出现 `latest 0.1.0-rc.7` 与 `next 0.1.0-rc.8` 两个按钮（实测 registry 数据）；
- 用户装 `0.1.0-rc.8`（或更新）时：next 按钮不出现，latest 按钮在 `latest > current` 时才出现；
- 点击 next 按钮 → QuickPick 推荐命令含 `@next`；点击 latest → 含 `@latest`；
- 命令只预填终端，不自动执行；24h 检查门与离线安全行为保持。

## 3. 决策项

| # | 决策项 | 决定 | 备注 |
|---|---|---|---|
| D1 | `--no-open` 门控阈值 | **≥ 0.1.0-rc.8** | flag 首次出现的版本（F3/F5 实证） |
| D2 | 版本未知时 | **不传 `--no-open`** | 保守优先：宁可弹浏览器，不能启动失败 |
| D3 | 侧边栏形态 | **两个独立按钮**（latest / next） | 用户明确要"两个选项，自己决定" |
| D4 | 按钮点击后 | 沿用 QuickPick + 终端预填 | 不自动执行（既有交互） |
| D5 | 旧 i18n 键 `upgrade.available` | 由 `upgrade.availableLatest/availableNext` 取代 | 无死键 |

## 4. 非目标

| # | 项 | 原因 |
|---|---|---|
| N1 | WS 推送式版本通知 | 24h 轮询已够，MVP 不做推送 |
| N2 | 自动升级/自动执行命令 | 安全红线：只预填不执行 |
| N3 | 多 registry / 自定义源 | 只跟踪 npm 官方 registry |
| N4 | 更新 dsh 主程序本身的其他渠道（brew 等） | 维持 `upgradeCommandFor` 现状，只加渠道参数 |

## 5. 约束

- **C1** 不弱化现有行为：24h 门、离线静默、QuickPick 预填不执行、`upgradeCommandFor` 路径推断全部保留；
- **C2** 纯函数逻辑放 vscode-free 模块（`versionCheck.ts`），可单测；
- **C3** 新增/修改用户可见文案必须 9 语言同步（i18n 表）；
- **C4** 全程 `npm test` 绿 + `npm run compile`（tsc strict）零 issue。

## 6. 验收总则

- **完成 = R1 + R2 全部验收通过**；单测覆盖：`shouldPassNoOpen` 阈值矩阵、`upgradeCommandFor` 双渠道命令、`isUpdateAvailable` 既有回归、i18n 新键 parity；
- 真实 dsh 集成验证：rc.8 下 spawn 参数含 `--no-open`、URL 解析正常（若本机无 rc.8，则以单测 + 代码审查为准，标注待真机）。

---

*关联文档：discussion.md ｜ solution.md ｜ plan.md ｜ 01-workspace-alignment/req.md（G-03 原型）*
