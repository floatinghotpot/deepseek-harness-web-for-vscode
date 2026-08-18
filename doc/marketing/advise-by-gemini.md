# GUI Coding Agent 用户需求洞察与特性演进提案（advise-by-gemini）

> 阶段：`feature / proposal` ｜ 日期：**2026-08-18** ｜ 状态：待评审
> 
> 本文站在 **GUI Coding Agent 最佳实践**（参考 Cursor、Windsurf、Claude Code、Cline / Roo Code、GitHub Copilot 及 Antigravity 等顶级 IDE Agent 的演进轨迹），系统梳理开发者对现代 IDE Coding Agent 的真实心智诉求，并为 **DeepSeek Harness for VS Code (`dsh4vscode`)** 制定从单纯的“Web UI 内嵌壳层”升级为“IDE 深度共生 Coding Agent”的特性设计与落地路线图。

---

## 1. 执行摘要与愿景定位

### 1.1 当前现状与演进分水岭
- **MVP 现状（v0.0.1–v0.0.10）**：成功实现了 DSH 官方 Web UI 的“一键启停、进程托管、Webview 标签页内嵌、传输桥无感穿透、主题跟随与基础工作区绑定”。
- **面临的核心瓶颈**：当前形态本质上是 **"Web-in-Tab"（网页嵌在标签页）**。开发者在实际编写代码时，仍然面临“手动复制粘贴代码、手动描述报错、Agent 改写文件缺少可视化 Diff 逐项审查、无法一键引用选中代码”等交互断层。
- **演进愿景**：**从 Webview 容器迈向 IDE 深度共生的 Native-feel Coding Agent** —— 让 DSH 的强大编排框架（Everything is a Plugin / Workflow / Goal / Multi-Model）与 VS Code 的丰富上下文、编辑器交互能力（Editor API / Diagnostics / SCM / Terminal）双向贯通。

```
┌────────────────────────────────────────────────────────────────────────┐
│                        现代 GUI Coding Agent 三要素                      │
├───────────────────┬─────────────────────────┬──────────────────────────┤
│ 1. 上下文感知      │ 2. 交互式变更与审查     │ 3. 执行闭环与可控性      │
│ (Context Rich)    │ (Interactive Diff/Edit) │ (Execution & Safety)     │
│ 实时代码/诊断/Git  │ 行内/Diff/一键接受拒绝  │ 终端协同/检查点/权限拦截 │
└───────────────────┴─────────────────────────┴──────────────────────────┘
```

---

## 2. 开发者心智模型与核心痛点（Pain Points）

| 场景 | 开发者痛点 | 现代 GUI Coding Agent 的最佳实践 |
|---|---|---|
| **提问与引导** | 遇到报错或特定函数，需要手动切到 DSH 复制粘贴代码或手动输入文件路径。 | 选中文本右键/快捷键直发；`@file`、`@selection`、`@problems` 自动补全并带行号上下文。 |
| **代码生成与落地** | DSH 生成或修改代码后直接写入磁盘或只在聊天窗展示 markdown，开发者不知道具体改动了哪些行。 | 类似 Cursor / Cline 的 **Inline Diff Review**：显示 side-by-side 或 inline 差异对比，支持单个 chunk 的 Accept / Reject。 |
| **错误修复（Debug）** | 终端编译报错或 ESLint 标红，用户需要手动复制 stack trace 进提问框。 | VS Code 问题面板（Problems）和终端报错旁常驻 **"Ask DSH to Fix"** 快捷动作。 |
| **代码导航** | DSH 答复中输出 `src/foo.ts:42` 时，在内嵌 Webview 里只是普通文本，无法直接跳转。 | 路径自动识别为可点击超链接，点击直接在 VS Code 对应行号高亮打开文件。 |
| **工作流与轻量编辑** | 改几行简单代码（如增加类型标注）也要打开大标签页发起完整对话，心智较重。 | **Inline Edit（Cmd+K / Ctrl+K）** 悬浮输入框，原地快速修改当前函数或代码块。 |
| **安全与后悔药** | Agent 连续执行多步骤任务并批量修改了 10+ 文件，一旦逻辑出错很难干净回滚。 | **Local Snapshot / Checkpoint**（本地快照或 Git Stash 锚点），支持一键一键回退到运行前状态。 |

---

## 3. 特性蓝图：从“内嵌容器”到“深度共生”（Feature Matrix）

根据最佳实践，我们将完整需求划分为六个能力层级（Layer 1 ~ Layer 6）：

```
                  ┌─────────────────────────────────────┐
       Layer 6    │  多模型横向对比与子 Agent 编排        │
                  ├─────────────────────────────────────┤
       Layer 5    │  状态治理、安全检查点与一键回滚      │
                  ├─────────────────────────────────────┤
       Layer 4    │  集成终端协同与工具执行闭环          │
                  ├─────────────────────────────────────┤
       Layer 3    │  双向代码跳转与富符号互操作          │
                  ├─────────────────────────────────────┤
       Layer 2    │  行内编辑 (Cmd+K) 与 Diff 审查面板   │
                  ├─────────────────────────────────────┤
       Layer 1    │  VS Code 上下文感知与快捷注入 (@上下文)│
                  └─────────────────────────────────────┘
```

---

### Layer 1: 上下文感知与快捷注入（Context Awareness & Injection）

#### 1.1 选区快捷动作与右键菜单（Quick Actions）
- **选中代码右键菜单**：
  - `DSH: 解释这段代码 (Explain)`
  - `DSH: 重构 / 优化这段代码 (Refactor)`
  - `DSH: 为此代码生成单元测试 (Generate Tests)`
  - `DSH: 发送到当前会话 (Send to DSH)`
- **全局快捷键绑定**：例如 `Cmd+Shift+L`（或 `Alt+D`）将当前文件+选中行打包发送给 DSH 侧边栏/编辑器面板。

#### 1.2 富上下文标记注入（Context Mentions: `@` 符号扩展）
在 DSH 的输入框中，通过 bridge 扩展 `@` 符号能力，支持引用 IDE 内部上下文：
- `@file:path/to/file`：自动列出工作区文件供模糊搜索选择，发送时附带完整或切片内容。
- `@selection`：当前激活编辑器的选区内容及文件位置。
- `@problems` / `@diagnostics`：当前文件或整个工作区的所有 Linter/TS/编译错误。
- `@git-diff` / `@staged`：当前未提交的变更或暂存区差异。
- `@terminal`：终端最近 N 行的输出日志。

#### 1.3 Active Editor 焦点感知与自动关联
- 扩展宿主监听 `vscode.window.onDidChangeActiveTextEditor`。
- DSH 界面状态栏显示“当前焦点文件：`src/serverManager.ts:45`”，并在提问时提供一键附带当前文件上下文开关。

---

### Layer 2: 行内编辑与交互式 Diff 审查（Interactive Diff & Inline Edit）

#### 2.1 Inline Diff 审查与应用机制（Visual Code Review）
- **痛点**：目前 Agent 直接通过文件系统写盘，用户难以直观确认改动范围。
- **设计**：
  - 当 DSH 触发文件写操作时，IDE 提供拦截/审查模式（可配置自动应用或手动审查）。
  - 利用 VS Code 虚拟文档与 Diff API (`vscode.diff`)，弹出对比视图。
  - 在编辑器行内提供 CodeLens / Floating Bar：**`Accept All`**、**`Reject All`**、或者针对单个变更块（Hunk）的 **`Accept / Discard`**。

#### 2.2 行内轻量编辑（Inline Edit / Cmd+K）
- 类似 Cursor / GitHub Copilot 的快捷行内交互：
  - 在编辑器内按 `Cmd+K`，弹出轻量悬浮输入框。
  - 输入修改提示词（如“改为 async/await 风格并增加错误捕获”）。
  - 扩展调用 DSH 快速会话接口，原地生成流式 Diff 并直接渲染在编辑器内，按 Enter 确认接受，Esc 放弃。

---

### Layer 3: 双向代码跳转与富符号互操作（Bi-directional Interoperability）

#### 3.1 智能路径链接跳转（Deep Linking & File Navigation）
- Webview 内渲染的 Markdown 文本中，所有文件路径模式（例如 `src/documentAssembly.ts:52:10` 或 `./package.json`）自动转化为可点击的 IDE 链接。
- 点击直接调用 `vscode.window.showTextDocument`，并在对应行、列处闪烁高亮。

#### 3.2 诊断与错误快速修复（Fix with DSH）
- 在 VS Code 的 **Problems（问题面板）** 中，针对每条 Error / Warning 提供 CodeAction / Lightbulb 快速修复菜单：
  - `💡 Ask DSH to Fix this issue`
- 点击后自动将错误信息、周围代码行打包发给 DSH，直接启动针对性诊断与修复流。

---

### Layer 4: 集成终端协同与工具执行闭环（Terminal & Execution Loop）

#### 4.1 可视化终端托管与执行（Integrated Terminal Delegation）
- **当前方式**：DSH 在后台隐藏子进程中执行 shell 工具命令，用户无法直观查看实时彩色输出与进度。
- **优化方案**：
  - 提供配置选项 `deepseekHarness.toolExecution: "terminal" | "background"`。
  - 选择 terminal 时，通过 VS Code Terminal API 创建专用的 `DSH Agent Terminal`，所有命令在此终端真实打印执行，保留 ANSI 颜色，并允许用户随时 `Ctrl+C` 强行中止。

#### 4.2 终端失败输出一键排错（Terminal Error Interception）
- 当用户在普通终端执行命令失败（退出码非 0）时，终端右上方或弹窗提示：
  - `[DeepSeek Harness] 命令执行出错，是否协助排查？ [Explain / Fix in DSH]`。

---

### Layer 5: 状态治理、安全检查点与一键回滚（State Governance & Safety）

#### 5.1 本地变更检查点（Local Checkpoints & Time Travel）
- 在 Agent 开始执行跨多文件的大型重构或复杂 Goal 之前，扩展自动触发一次轻量本地快照（如 Git Temp Stash 或 Shadow Workspace 快照）。
- 会话面板中显示 Checkpoint 节点：
  - `📍 Checkpoint #3: "在修改 6 个文件前创建"` -> 提供按钮 `[ ⏪ 一键回滚到此状态 ]`。
  - 极大提升用户将复杂任务交给 Agent 时的安全感与可控感。

#### 5.2 细粒度操作确认与权限拦截（Granular Permission Prompts）
- 当 Agent 尝试执行具有高破坏性的操作（如 `rm -rf`、`git reset --hard`、覆盖核心配置文件）时，通过 VS Code 原生模态框弹出确认：
  - `⚠️ DSH 正在尝试执行危险操作: "rm -rf build/"。允许执行吗？ [允许一次] [本次会话信任] [拒绝]`。

---

### Layer 6: 多模型横向对比与子 Agent 编排（Multi-Model & Sub-agents）

#### 6.1 双模型并排对比（Side-by-Side Arena / Cross Review）
- 充分利用 DSH 的 Bring-Your-Own-LLM 特性：
  - 支持一键分屏打开两个 DSH 会话（例如左侧 DeepSeek-V3，右侧 Claude 3.7 / Gemini 2.5 Pro）。
  - 同步将当前提问广播到双会话，方便开发者横向比对不同模型的代码方案与思路。

#### 6.2 工作区配置与规则文件感知（Rules & Skills IDE Support）
- 对工作区内的 `.dsh/`、`AGENTS.md`、`.rules` 等规则文件提供 VS Code 代码高亮、Schema 校验与快速编辑模板。
- 支持在侧边栏 Launcher 中直接开关/查看当前工作区启用的 DSH 插件与 Skills 列表。

---

## 4. 特性优先级矩阵与演进路线图（Roadmap）

为了确保工程可交付性，建议按“先打通高频痛点，再构建深度原生能力”的节奏推进：

| 优先级 | 特性代号 | 特性名称 | 核心价值 | 预估复杂度 | 阶段归属 |
|---|---|---|---|---|---|
| **P0** | **F-NAV** | **Markdown 路径点击跳转** | 解决从聊天窗查看生成代码的最基础交互痛点 | 低 (~0.5天) | v0.1.0 |
| **P0** | **F-CTX-1**| **选区右键与快捷提问 (Quick Actions)** | 消除跨窗口复制粘贴，形成闭环工作流入口 | 低 (~1天) | v0.1.0 |
| **P0** | **F-DIFF** | **文件修改可视化 Diff 与审阅 (Accept/Reject)** | 解决代码直接落盘无感知、无法逐项把关的信任痛点 | 中 (~2-3天) | v0.1.0 |
| **P1** | **F-FIX** | **Problems 面板一键修复 (Fix with DSH)** | 联动 IDE 诊断系统，大幅提升 Debug 效率 | 中 (~1.5天) | v0.2.0 |
| **P1** | **F-CTX-2**| **富上下文 `@` 引用补全 (@file/@selection)** | 提升提问上下文质量与组织效率 | 中 (~2天) | v0.2.0 |
| **P1** | **F-CP** | **任务执行检查点与一键回滚 (Checkpoint)** | 消除大型任务重构的心理负担与风险 | 中 (~2天) | v0.2.0 |
| **P2** | **F-EDIT** | **行内轻量编辑 (Inline Cmd+K)** | 提供媲美 Cursor 的原地快速代码改写体验 | 高 (~3-5天) | v0.3.0 |
| **P2** | **F-TERM** | **集成终端可视化执行与报错拦截** | 工具链调用可见、可中断、可彩色渲染 | 中 (~2天) | v0.3.0 |
| **P3** | **F-ARENA**| **多模型分屏对战与评审 (Arena Mode)** | 高级研发场景下的模型交叉互验 | 低-中 (~1.5天) | v0.4.0 |

---

## 5. 技术可行性与桥接架构延伸（Architecture Blueprint）

实现上述原生化特性的关键，在于**将现有的 `bridgeHost`（postMessage 传输桥）从单一的“网络/剪贴板代理”扩展为“全功能双向 IDE 消息总线”**。

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           VS Code Extension Host (Node)                         │
│                                                                                 │
│   ┌────────────────────────┐  vscode API  ┌──────────────────────────────────┐  │
│   │ IDE Context Provider   │─────────────►│ - Active Editor & Selection      │  │
│   │ (Editor, Git, Problems)│              │ - Diagnostic / Problems API      │  │
│   │                        │              │ - SCM & Git Diffs                │  │
│   └───────────┬────────────┘              └──────────────────────────────────┘  │
│               │                                                                 │
│               │ postMessage (Extended Bus)                                      │
│               ▼                                                                 │
│   ┌────────────────────────┐              ┌──────────────────────────────────┐  │
│   │ BridgeHost.ts          │◄────────────►│ - Diff Review Provider (VS Code) │  │
│   │ (Extended API Gateway) │              │ - Terminal Manager               │  │
│   │                        │              │ - Checkpoint Manager (Git Stash) │  │
│   └───────────┬────────────┘              └──────────────────────────────────┘  │
│               │                                                                 │
└───────────────┼─────────────────────────────────────────────────────────────────┘
                │ postMessage
┌───────────────┼─────────────────────────────────────────────────────────────────┐
│               ▼                                                                 │
│   ┌────────────────────────┐                                                    │
│   │ BridgeClient.js        │                                                    │
│   │ (Webview Shim Layer)   │                                                    │
│   └───────────┬────────────┘                                                    │
│               │ DOM / Custom Events                                             │
│               ▼                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │ DSH Web Frontend (Embedded in WebviewPanel)                             │   │
│   │ - Context Mentions Adapter (@file, @selection)                          │   │
│   │ - Markdown File Link Interceptor (Click -> open-document)               │   │
│   │ - Diff Review Overlay / Accept-Reject Bridge Hooks                      │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 扩展的消息协议契约（Extended Bridge Protocol）：
1. **`ide-open-file`**（Webview -> Host）：
   `{ type: 'ide-open-file', path: string, line?: number, column?: number }`
2. **`ide-request-context`**（Webview -> Host）：
   `{ type: 'ide-request-context', scope: 'selection' | 'file' | 'problems' | 'git' }`
   Host 响应对应结构化内容，供 Webview 自动填充或作为 prompt 附件。
3. **`ide-show-diff`**（Webview / Host <-> Host）：
   `{ type: 'ide-show-diff', originalUri: string, modifiedContent: string, title: string }`
   触发 VS Code 原生 Diff 窗口进行行内对比。
4. **`ide-create-checkpoint`** / **`ide-rollback-checkpoint`**：
   管理任务执行前后的快照与回滚点。

---

## 6. 结论与下一步建议

通过以上架构升级与特性落地，`dsh4vscode` 将彻底跨越从“单纯内嵌 Web 页面”到“具有完整生产力价值的 IDE Native Coding Agent”的技术鸿沟：
1. **短期重点（v0.1.0 迭代）**：落地 **Markdown 路径点击跳转**、**选中代码右键快捷操作** 与 **基础文件变更 Diff 审查**，以极低的成本解决开发者最痛苦的交互断层。
2. **中期推进（v0.2.0 迭代）**：完善 **`@` 符号富上下文感知** 与 **任务安全检查点 (Checkpoint)**，大幅提升 Agent 解决复杂工程任务的稳定性。
3. **生态价值**：将上述桥接协议沉淀为标准 DSH Plugin 协议，使 DSH 官方生态能够无缝兼容任意 IDE 宿主环境。

---
*提案归档路径：[doc/feature/advise-by-gemini.md](advise-by-gemini.md)*
