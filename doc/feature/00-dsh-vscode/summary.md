# DeepSeek Harness Web for VS Code — 总结（summary）

**日期**: 2026-08-17 ｜ **阶段**: Feature Pipeline 收口 + 双渠道发布完成

## 做了什么

从零开发了 **DeepSeek Harness Web for VS Code** 扩展（publisher `floatinghotpot`，ID `floatinghotpot.deepseek-harness-web-for-vscode`）：一键启动 DSH 并把其 Web UI 内嵌进 VS Code/Antigravity，与浏览器共享同一实例。**已双渠道发布 v0.0.6**。

- **架构**：扩展宿主 spawn `dsh web --port 0`（cwd=当前工作区）→ 传输桥（webview 文档直载 DSH 前端 + fetch/WS/剪贴板三个 shim，postMessage → Node 代发，过 `/api` 围栏）→ 编辑器标签页承载 UI（DeepSeek 标签页图标）+ 侧边栏启动器 + 状态栏
- **关键查证**：iframe 方案被剪贴板平台限制否决（microsoft/vscode#182642）；webview 页面 hostname 非回环导致 DSH settings scope 走 memory 模式 → **matchMedia shim** 修复主题跟随（R7）；Marketplace 的扩展 **name 与 displayName 均全局唯一** → 两次改名（`deepseek-harness-for-vscode` 被占用 → `deepseek-harness-web-for-vscode`；展示名 → "DeepSeek Harness Web for VS Code"）
- **质量**：22/22 单测（含回归：`/undefined` 405、glob、bridge var；i18n 双语表 parity）、真实 dsh 集成验证、用户 F5/安装版手工验收全过（渲染/流式对话/剪贴板/主题/共享实例/生命周期/标签页图标）
- **i18n**：按 Appendix A 建中央双语表（25 键 en/zh），按 `vscode.env.language` 取词；Marketplace description 纯英文
- **发布**：vsix 56 文件 100KB（含运行时依赖 `ws`）；Makefile 自动化（token 从环境变量读、零回显）；双渠道上线

## 文档产物

`doc/architecture/proposal-by-deepseek.md`、`doc/marketing/market-analysis.md`、`doc/feature/00-dsh-vscode/`（discussion/req/solution/plan/spike-notes/verification/TODO/summary）、`doc/fix/20260817-vsix-missing-ws/record.md`、`doc/publishing.md`、`Makefile`。

## 变更轨迹（git，全部已推送 + tag）

| commit | 内容 | tag |
|---|---|---|
| `e9246a6` | 项目基线（文档） | — |
| `486dc99` | feat: MVP（桥/编辑器标签页/启动器/状态栏/主题/打包/文档） | v0.0.1 |
| `7396018` | fix(packaging): vsix 打包运行时依赖 ws | v0.0.2 |
| `037ef80` | feat(i18n): 中央双语表 + 纯英文 description | v0.0.3 |
| `8edc0cf` | feat(panel): 编辑器标签页 DeepSeek 图标 | v0.0.4 |
| `2aa06be` | refactor(id): 改名 deepseek-harness-web-for-vscode（name 全局唯一冲突） | v0.0.5 |
| `6416260` | feat(meta): 展示名 "DeepSeek Harness Web for VS Code"（displayName 全局唯一冲突） | v0.0.6 |

**发布状态**：Marketplace + Open VSX 均 v0.0.6 ✅（2026-08-17）

## 遗留

见 [TODO.md](TODO.md)（T13–T18，⏭️ 延后）：共享实例探测、Abort 传递、下载流式、版本固化、settings 镜像/上游、主题重载兜底。

## 下一步建议

1. **Open VSX namespace 认领**（verified 盾牌）：<https://github.com/EclipseFdn/open-vsx.org/issues/new/choose>
2. **Marketplace 页**：等 CDN 生效后检查详情页/补 tags
3. **旧 ID 收尾**：Open VSX 旧条目 `floatinghotpot/deepseek-harness-for-vscode` 停更于 0.0.4（可选：页面留迁移说明）
4. **首个延后项排期**：T13 共享实例探测（与"用户已跑着 3080"场景最相关）

*关联文档：verification.md ｜ TODO.md ｜ plan.md ｜ doc/publishing.md*
