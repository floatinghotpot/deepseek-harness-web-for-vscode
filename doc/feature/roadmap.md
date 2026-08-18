# 项目路线图（Roadmap）—— 全景视图

**日期**: 2026-08-18 ｜ **状态**: 待评审
**定位**: 项目**全景**——架构、MVP、功能、非功能工作，无论已完成（`[x]`）还是待办（`[ ]`）都列出；TODO（`[TODO.md](TODO.md)`）只聚焦未完成功能并携带细节。

---

## 1. 架构（Architecture）

- [x] **桥架构**：webview 文档直载 DSH 前端 + postMessage 传输桥（fetch/WS/剪贴板）→ 扩展宿主 Node 代发，过 `/api` 围栏（v0.0.1）
- [x] **进程托管**：spawn `dsh web --port 0`、端口解析、SIGTERM 优雅退出、Windows 进程树终止（v0.0.2/0.0.9）
- [x] **UI 形态**：编辑器标签页承载 DSH UI + 侧边栏启动器 + 状态栏（v0.0.4–0.0.6）
- [x] **主题跟随**：matchMedia shim（webview 嵌入 settings 限制的绕行方案，v0.0.3）
- [x] **工作区锚点**：IDE 工作区 ↔ DSH workspace 的会话级联动（G-02，feature 01）
- [ ] **多会话架构**：单 dsh 实例 + 多会话 + 同工作区（workspace 按路径组织）；会话管理器侧边栏（G-12）
- [ ] **IDE 上下文桥**：`ide-open-file` / `ide-request-context` 协议（G-10/G-11）

## 2. MVP（v0.0.1–v0.0.10，已完成 ✅）

- [x] 一键启动/停止 dsh（命令、状态栏、启动器）
- [x] 编辑器标签页内嵌 DSH Web UI（对话/工作区/设置/插件全功能）
- [x] 剪贴板桥（V8 修复）、主题跟随、9 语言 i18n
- [x] 跨平台（macOS/Linux/Windows CI 全绿）、共享 `~/.dsh` 实例
- [x] 双渠道发布（Marketplace + Open VSX，v0.0.10）

## 3. 功能（Features）

### M1 工作区对齐（v0.1.x）— [01-workspace-alignment](01-workspace-alignment/) ✅
- [x] **G-02 工作区切换联动**：DSH workspace 锚点随 IDE 切，不杀进程、reload 自动恢复 → [01-workspace-alignment/verification.md](01-workspace-alignment/verification.md)
- [x] **UI 层工作区对齐**：面板显示 IDE 工作区（localStorage 预置，Spike 实证）
- [x] **点图标自动启动**（UX 优化）
- [x] **G-03 dsh 版本软校验 + 升级辅助**：旧版 UI 警告 + 按安装方式推荐升级命令（24h 门、终端预填）

### M2 多会话管理（v0.2.x）— 02-session-management（占位）
- [ ] **G-12 会话管理器侧边栏**：顶部进程状态 + `＋新建会话` + 会话列表（`✕` 关标签页、显示模型名、同工作区不显 cwd）
- [ ] **多面板绑定多会话**：`＋新建会话` → `session.create` → 新面板（localStorage 预置指向会话）——已核实可行

### M3 IDE 上下文（v0.3.x）
- [ ] **G-10 路径点击跳转**：聊天窗路径 → 打开文件行
- [ ] **G-11 选区右键快捷提问**：选区/文件一键进 DSH 会话

### M4 编排增强（v0.4.x）
- [ ] **多会话并排**：同工作区不同模型双面板对比

## 4. 非功能工作（Non-feature）

- [x] 单测体系（25/25）、CI 三平台矩阵、真实 dsh 冒烟
- [x] 安全审计（提交/发布前）、CSP/回环/无 SSRF
- [x] 文档体系（架构/市场/策略/Feature Pipeline/发布指南）
- [x] CHANGELOG、README 双语、徽章
- [ ] **G-04 CI 自动双发**（tag 触发发布，模板在 doc/publishing.md）
- [ ] 上游 issue 清单（Diff 写前审查 / 终端委派 / `@` 引用 / `isLoopback`）
- [ ] 多语言门自动化（新增文案强制 9 语言，已由 i18n.test.js 部分覆盖）

---

## 依赖关系

```
架构（桥/进程/UI，✅）→ M1 工作区对齐（✅）→ M2 多会话管理 → M3 IDE 上下文 → M4 编排
非功能项持续并行
```

*关联文档：product-strategy.md ｜ TODO.md（未完成功能细节）｜ 00-dsh-vscode/verification.md*
