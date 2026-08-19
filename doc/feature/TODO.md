# 全局 TODO（项目级：功能优先级 + 剩余问题）

**日期**: 2026-08-17 ｜ **规则**: 项目级待办（跨 feature），区别于各 feature 目录内的 `TODO.md`（该 feature 的延后项，机械提取自 plan.md）

## 优先级（P0 → P2）

### P0 — 近期（下 1-2 个迭代）

| # | 项 | 目的/价值 | 成本 | 状态 |
|---|---|---|---|---|
| G-01 | **T13 共享实例探测（cwd-aware attach，轻量版）** | 用户已手动跑 `dsh web`（如 3080）且 cwd 匹配时扩展挂接/提示，不重复起进程——**不做共享 dsh 服务**（已决策：每 IDE 各管各的 dsh，多 IDE 同工作区为已知限制） | 低（~0.5 天） | 待排期 |
| G-02 | **工作区切换联动 + UI 对齐** | DSH workspace 锚点随 IDE 切换（会话级切换、不杀进程、reload 自动恢复、面板显示 IDE 工作区）——**feature 01 已完成** ✅ | 中（~0.5 天） | ✅ 完成（01-workspace-alignment/verification.md） |
| G-03 | **T16 dsh 版本软校验 + 升级辅助** | 检测到旧版 dsh 时 UI 警告 + 按安装方式推荐升级命令（npx/npm 全局/nvm）；24h 门防打扰、集成终端预填不自动执行 | 低 | ✅ 完成（随 feature 01，versionCheck.ts/service） |

### P1 — 中期

| # | 项 | 目的/价值 | 成本 | 状态 |
|---|---|---|---|---|
| G-04 | **GitHub Actions 自动双发工作流** | tag 触发自动发布 Marketplace + Open VSX（模板在 doc/publish/github-actions.md） | 低（~0.5 天） | 待排期 |
| G-05 | **T17 settings 镜像 / 上游 isLoopback** | 让嵌入式页面同步 host 设置（locale 等）；主题已由 matchMedia shim 覆盖 | 低（提上游 issue）/ 高（本地实现） | **优先提上游 issue**，本地不做 |
| G-06 | **README/详情页同步** | 详情页 README 快照随发版更新；多语言 README 门（9 语言壳层已就绪） | 低 | 随发版自动 |
| G-12 | **会话管理器侧边栏 + 多面板多会话** | 会话列表镜像 + `＋新建会话` 开新面板绑新会话（localStorage 预置）——**feature 02（02-session-management）**，复杂度高 | 高（~2-3 天） | ✅ **完成（roadmap M2，v0.2.0）** |

### P2 — 低优先 / 观察

| # | 项 | 目的/价值 | 成本 | 状态 |
|---|---|---|---|---|
| G-07 | T15 下载流式转发 | 大导出文件避免整包内存缓冲 | 中 | 多数用户无感，**倾向关闭** |
| G-08 | T14 AbortController 传递 | 取消请求真正中断宿主 fetch | 中 | 30s 超时已兜底，**倾向关闭** |
| G-09 | T18 主题重载兜底 | 主题切换若 DSH 不 live-apply 则强制重载 | 低 | **先验证** DSH live-apply 行为，无问题则关闭 |

## 待验证（决策前置）

| # | 验证项 | 影响 |
|---|---|---|
| V-01 | DSH 主题切换是否 live-apply（不开面板重载） | 决定 G-09 关闭或实现 |
| V-02 | `host.describe.cwd` 对 attach 探测的可靠性（多实例并存） | 决定 G-01 的探测策略 |

## 说明

- 各 feature 的**延后项**仍在其目录内 `TODO.md`（如 `00-dsh-vscode/TODO.md` 的 T13–T18），本文件是**跨 feature 的优先级排序**，项可引用它们
- 完成一项 → 从本表移除或标记 ✅；新增项 → 按优先级插入
- 关联：[00-dsh-vscode/TODO.md](00-dsh-vscode/TODO.md)、[00-dsh-vscode/verification.md](00-dsh-vscode/verification.md)、[publish/README.md](../publish/README.md)
