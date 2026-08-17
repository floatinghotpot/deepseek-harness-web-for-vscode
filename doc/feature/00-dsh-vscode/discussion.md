# DeepSeek Harness for VS Code — 讨论记录（discussion）

> 阶段：Feature Pipeline 第一份文档（原始记录，一旦 req.md 存在即只读）｜ 日期：2026-08-17
> 本文件记录动机、讨论、决策与已核实事实；新需求请直接写入 req.md。

---

## 1. 动机（用户原话要点）

- 日常大量使用 **VS Code** 与 **Antigravity IDE**；
- 希望把 **DeepSeek Harness（DSH）** 嵌入这两个 IDE，实现"编辑代码与跑 DSH agent 工作流"在同一窗口协同；
- 从 **MVP** 开始，快速看到能用的东西。

## 2. 关键决策记录

### 2.1 命名（已定）

| 项 | 决定 | 理由 |
|---|---|---|
| Display Name | **DeepSeek Harness for VS Code** | 用户共识：大众熟悉 "DeepSeek / Harness / VS Code"，不熟悉缩写 "DSH" → 弃用 DSH 开头；候选 "Dock" 有 macOS Dock 歧义 → 弃用 |
| Extension ID | `floatinghotpot.deepseek-harness-for-vscode` | publisher 已确认：GitHub 账号 [floatinghotpot](https://github.com/floatinghotpot)；name 与展示名一致、可搜索；不与 liumin 的 `deepseek-harness-for-vscode-plugin` 冲突 |
| 仓库名 | `deepseek-harness-for-vscode` | 对外一致；本地文件夹保持 `dsh4vscode` 不变 |
| 展示名相似度风险 | 接受 | 与 liumin 的 "Deepseek Harness (DSH) for VSCode" 相近；差异化靠描述/质量/文档（见市场分析 §5.1） |

### 2.2 IDE 覆盖（已核实）

- **Antigravity 是 VS Code 的 fork**（[实测参考](https://ice-ice-bear.github.io/posts/2026-03-05-google-antigravity-ide/)），通过 **Open VSX / 自配 marketplace** 安装扩展；
- → 一份标准 VS Code 扩展 + 发布到 **Microsoft Marketplace 与 Open VSX 双渠道** = 覆盖 VS Code 与 Antigravity；
- → 架构提案、市场分析主体不变，仅发布渠道增加 Open VSX。

### 2.3 流程选择（已定）

- MVP 路径 = **先 req.md（用户批准）→ 再 Phase 0 Spike（技术验证）→ 再实现**；
- req.md 只写 WHAT（需求+验收），实现方式（iframe vs 传输桥）留给 Spike 结论 + solution.md。

## 3. 已核实事实清单（供 req/solution 引用，均来自源码/实测，非臆测）

- DSH 启动：`dsh web` ≡ `dsh --profile web`；`--port 0` 由 OS 分配端口并向 stdout 打印 `dsh web: http://127.0.0.1:<port>`；`--host 0.0.0.0` 被官方拒绝（只能回环）——`@deepseek-ai/dsh-web-app/lib/startup.js`
- 默认 `$DSH_HOME` = `~/.dsh`，可被环境变量覆盖；profile 首次自动初始化，无需 pnpm/网络——`dsh-home-paths`、`dsh-app-boot` README
- API 网关默认项目目录 = 子进程 `process.cwd()`——`dsh-host-apiproxy/lib/index.js:5627` → 扩展 spawn 时传 `cwd: workspaceFolder` 即实现"当前文件夹为默认工作区"
- `/api` 浏览器信任围栏：Origin 主机必须 == Host 主机；无任何 CORS 头 → **webview 不能直连 API**，必须走扩展宿主代发或 iframe 同源（架构提案 §2.4/§5）
- 前端把 API 解析到页面自身 origin（`resolveBase()` 用 `location.origin`），事件流走 WebSocket `/api/events.mux`、`/api/events.host`（架构提案 §2.3）
- 子进程 SIGTERM/SIGINT 优雅退出，5s 宽限——`profile-boot-DG5t9aNs.js`
- 竞争格局：DSH 内嵌扩展现共 **8 个**（Marketplace 7 + Open VSX 1），合计 ~341 安装（市场分析 §5.1，2026-08-17 实测）
- 官方仓库已有用户自发推广同类插件：[Discussion #1353](https://github.com/deepseek-ai/deepseek-harness/discussions/1353)

## 4. 开放问题（req 评审时确认）

1. ~~publisher 账号~~ → **已解决：`floatinghotpot`**（2026-08-17）
2. ~~VS Code 最低版本~~ → **已解决：`engines.vscode: ^1.90.0`**（2026-08-17，T1）
3. ~~Node 版本策略~~ → **已解决**（2026-08-17，T1）：扩展宿主 Node ≥18（`fetch`/`AbortSignal` 可用）；WS 中继用 `ws` 包（不依赖 Node 22 global WebSocket）；dsh 子进程用系统 Node（≥18），二进制多级探测兜底
4. **隔离模式**：MVP 默认共享 `~/.dsh`；是否 MVP 内就要提供"自定义 DSH_HOME"设置？（建议 MVP 后）
7. **改名**（2026-08-17）：扩展 `name` 由 `deepseek-harness-for-vscode` 改为 **`deepseek-harness-web-for-vscode`**——VS Code Marketplace 的扩展 name **全局唯一**，原名已被 `skymecode/deepseek-harness-for-vscode` 占用（上传 409 "already exists"）。展示名不变；版本升至 0.0.5；Open VSX 旧条目停更于 0.0.4。
6. **界面形态**（2026-08-17 新增）：**编辑器标签页**（WebviewPanel，对齐 Claude Code 展示方式）替代侧边栏视图——用户实测发现侧边栏视图与资源管理器等侧栏树重叠。req R2 已同步修订。
   - **2026-08-17 定案（混合形态）**：侧边栏保留轻量**启动器**（活动栏图标 + 状态 + 启动/打开面板/停止按钮），DSH 主界面始终开在**编辑器标签页**——启动器不承载 UI，与资源管理器树不冲突。req R2 已同步修订。
5. **主题跟随**（2026-08-17 新增）：DSH 默认"跟随系统"，VS Code 深色模式下网页仍白底——是否把"主题跟随 VS Code"纳入 MVP？（方案：扩展经 API `settings.update {ns:'ui-theme', patch:{preference}}` 写入，跟随 VS Code 主题切换）

*关联文档：架构提案 `doc/architecture/proposal-by-deepseek.md` ｜ 市场分析 `doc/marketing/market-analysis.md`*
