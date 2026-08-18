# doc/ 文档索引与规范（README）

**日期**: 2026-08-18 ｜ **定位**: 本目录是项目的**知识库**——决策、事实、流程记录。本文件是 doc/ 的导航与规范：下面**每个文件/文件夹各占一行**并附说明，再往下是写作规则与阅读路径。

---

## 1. 目录清单（每项一行）

```
doc/
├── README.md                                ← 本文件：doc/ 导航与规范（规则见 §2，路径见 §3）
│
├── architecture/                            ← 跨项目/架构级提案（不进 feature 管线）
│   └── proposal-by-deepseek.md              ← 桥架构总提案 + DSH 安装包源码事实核查（§2 Facts，非臆测）
│
├── feature/                                 ← 需求驱动的特性流程 + 项目级规划（规划类文档放根，管线类进 NN-feature-name/）
│   ├── roadmap.md                           ← 项目全景：架构/MVP/功能/非功能，完成 [x] 与待办 [ ] 全列出
│   ├── TODO.md                              ← 全局待办：跨 feature 优先级（G-01..G-12，P0→P2）+ 剩余问题
│   └── NN-feature-name/                     ← 特性管线目录（NN = 两位数字编号；当前实例：00-dsh-vscode；下方文件按管线顺序排列）
│       ├── discussion.md                    ← 头脑风暴/审计事实原始记录；req 成立后只读
│       ├── req.md                           ← 需求清单 + 验收标准（无实现细节；用户批准）
│       ├── solution.md                      ← 怎么做：架构、文件变更清单、数据契约（基于代码事实；用户批准）
│       ├── plan.md                          ← RTTM 追溯 + 任务清单（✅/❌/⏭️；用户批准）
│       ├── verification.md                  ← 收口审计：RTTM 复查 + 确认代码存在且被调用（自动）
│       ├── summary.md                       ← 结果记录：做了什么、改了什么（自动）
│       ├── TODO.md                          ← plan 中 ❌/⏭️ 的机械提取（禁止手写；非空 = 特性未完成）
│       └── spike-notes.md                   ← 一次性技术验证的事实记录（S1..Fn，如 /api 围栏、剪贴板）
│
├── fix/                                     ← 复杂缺陷修复记录（简单修复只进 daily，不建目录）
│   ├── 20260817-vsix-missing-ws/            ← 缺陷修复目录（yyyyMMdd-fix-name 命名；vsix 缺 ws → 激活崩溃）
│   │   └── record.md                        ← 根因/修复/验证记录
│   └── 20260817-cross-platform/             ← 第二个修复目录（Windows 二进制解析/spawn 失效）
│       └── record.md                        ← 根因/修复/验证记录
│
├── marketing/                               ← 产品方向：市场、策略、差距、外部建议评估
│   ├── market-analysis.md                   ← 该不该做、卖给谁、凭什么赢、怎么衡量成功（数据当日实拉）
│   ├── product-strategy.md                  ← 策略：定位（桥，不是 Agent）/ 价值 / 边界 / 功能清单 / 反模式
│   ├── product-gap.md                       ← 事实 + 差距：v0.0.10 能力事实（带代码锚点）→ 按价值层差距对照；strategy 的依据
│   └── advise-by-gemini.md                  ← 外部（Gemini）提案评估：哪些吸收进策略、哪些拒绝
│
└── publishing.md                            ← 发布指南：双渠道元数据、操作步骤、GitHub Actions 模板
```

> `doc/daily/YYYYMMDD.md`（每日摘要）未列出——按用户要求在任务收尾时按需创建，目前尚无。

## 2. 写作规则

1. **语言**：全部中文（CLAUDE.md §1）；代码标识符/commit message 保持英文。
2. **事实优先**：现状/差距类内容必须基于代码与 DSH 协议事实，标注来源（文件:行号），禁止臆测——见 `product-gap.md` 的写法。
3. **交叉引用代替重复**：同一事实只在归属文档维护一份，其余用相对链接引用（如 `product-strategy.md` §3 结论摘要 → `product-gap.md`；roadmap 细节 → TODO.md）。
4. **命名**：feature 子目录用 `NN-feature-name`（NN = 两位数字编号，当前实例 `00-dsh-vscode`）；fix 子目录用 `yyyyMMdd-fix-name`（yyyyMMdd = 修复日期，当前实例 `20260817-vsix-missing-ws`、`20260817-cross-platform`）；全局文档用语义名。
5. **状态标注**：每份文档头部带 `**日期**` 与 `**状态**`（待评审/已批准等），便于追溯决策时点。
6. **职责分离**：架构提案进 `architecture/`，需求驱动的特性流程进 `feature/`，简单缺陷修复只进 daily——不要混放。

## 3. 阅读路径（从哪开始）

**我想了解项目全貌（做完了什么、还差什么）**
→ `feature/roadmap.md`

**我想了解下一阶段要做什么（优先级）**
→ `feature/TODO.md`（全局）→ 对应 feature 目录

**我想了解产品方向与取舍**
→ `marketing/product-strategy.md` → `product-gap.md`（事实依据）

**我想了解技术架构怎么来的**
→ `architecture/proposal-by-deepseek.md` → `feature/00-dsh-vscode/solution.md`

**我想了解这个扩展该不该做 / 市场怎么看**
→ `marketing/market-analysis.md`

**我想了解如何发布新版本**
→ `publishing.md`

---

*关联文档：CLAUDE.md（工作方式与流程纪律）｜ 本文件为 doc/ 目录的导航与规则说明*
