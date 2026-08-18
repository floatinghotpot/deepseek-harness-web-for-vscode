# 全局 TODO（项目级：功能优先级 + 剩余问题）

**日期**: 2026-08-17 ｜ **规则**: 项目级待办（跨 feature），区别于各 feature 目录内的 `TODO.md`（该 feature 的延后项，机械提取自 plan.md）

## 优先级（P0 → P2）

### P0 — 近期（下 1-2 个迭代）

| # | 项 | 目的/价值 | 成本 | 状态 |
|---|---|---|---|---|
| G-01 | **T13 共享实例探测（cwd-aware attach）** | 用户已跑 `dsh web`（如 3080）且 cwd 匹配时挂接，不重复起进程；VS Code/Antigravity 双开多项目时按工作区各自独立 | 中（~1 天） | 设计已细化（见 00-dsh-vscode/discussion.md） |
| G-02 | **工作区切换联动**（新） | 用户切换文件夹时提示是否切换 DSH 工作区（A 提示确认 / B 手动命令 `DSH: 使用当前文件夹`），不静默改 cwd | 中（~0.5 天） | 待排期 |
| G-03 | **T16 dsh 版本软校验** | 检测到旧版 dsh 时 UI 警告（建议 ≥0.1.0-rc.6），避免"解析到旧版"类问题；不做内置固化 | 低 | 待排期 |

### P1 — 中期

| # | 项 | 目的/价值 | 成本 | 状态 |
|---|---|---|---|---|
| G-04 | **GitHub Actions 自动双发工作流** | tag 触发自动发布 Marketplace + Open VSX（模板在 doc/publishing.md） | 低（~0.5 天） | 待排期 |
| G-05 | **T17 settings 镜像 / 上游 isLoopback** | 让嵌入式页面同步 host 设置（locale 等）；主题已由 matchMedia shim 覆盖 | 低（提上游 issue）/ 高（本地实现） | **优先提上游 issue**，本地不做 |
| G-06 | **README/详情页同步** | 详情页 README 快照随发版更新；多语言 README 门（9 语言壳层已就绪） | 低 | 随发版自动 |

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
- 关联：[00-dsh-vscode/TODO.md](00-dsh-vscode/TODO.md)、[00-dsh-vscode/verification.md](00-dsh-vscode/verification.md)、[publishing.md](../publishing.md)
