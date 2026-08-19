# 会话管理（session-management）— TODO

**日期**: 2026-08-19 ｜ **规则**: plan.md 中延后项（blocked / skipped）的机械提取（Feature Pipeline）

## 延后项

**本 feature 无延后项** —— plan.md T1–T9 全部完成，无 blocked 或 skipped 项。

> 已知限制与后续建议（非 plan 延后项，详见 [verification.md](verification.md) §4）：
>
> | # | 项 | 处置 |
> |---|---|---|
> | G6 | 平铺布局 Reload 后 Antigravity 恢复空面板占位 | 用户决策不修（堆叠布局规避；备选 serializer 可能无效） |
> | G3 / G4 | 会话删除、归档恢复 | 依赖 DSH 上游 API，确认后排期 |
> | G7 | 用户在 DSH UI 内部切换会话时归档关面板不生效 | 扩展无法感知前端内部切换（MVP 常见场景已修复） |
> | G2 | 共享 localStorage 行为 | 靠"每次注入"兜底，未报告异常 |

*关联：verification.md §4 ｜ summary.md 已知限制*
