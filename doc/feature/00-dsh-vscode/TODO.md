# TODO（延后项）

> 机械提取自 [plan.md](plan.md) 的 `⏭️` 项（2026-08-17 verification 审计后登记）。
> 非空 = 特性未完全闭合；由人工决定：下轮排期 / 关闭 / 放弃。

## 延后项（⏭️）

| 任务 | 决策原因 |
|---|---|
| T13 — 共享实例探测（attach 已运行 dsh，req N5） | MVP 后；扩展总是另起进程，不挂接用户已运行的 3080 实例（G1） |
| T14 — 中继 AbortController 真正传递 | MVP 后；客户端 30s 超时已兜底（G2） |
| T15 — 下载流式转发 | MVP 后；全缓冲 ArrayBuffer 已可用（G3） |
| T16 — dsh 版本固化/校验 | MVP 后；npx 缓存 mtime 启发式已可用（G4） |
| T17 — 嵌入式 settings 镜像 / 上游 isLoopback 声明 | 需上游配合或桥扩展；主题已由 matchMedia shim 覆盖（G5） |
| T18 — 主题切换重载兜底 | 待确认 DSH live-apply 行为（G7） |

*关联文档：verification.md ｜ plan.md*
