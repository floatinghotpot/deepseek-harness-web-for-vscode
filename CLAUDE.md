# CLAUDE.md

Vibe Coding 八荣八耻

以臆猜接口为耻，以查档求证为荣。
以模糊开工为耻，以对齐需求为荣。
以脑补业务为耻，以请示规则为荣。
以新增冗余为耻，以复用存量为荣。
以省略校验为耻，以完备测例为荣。
以乱改架构为耻，以恪守规范为荣。
以不懂装懂为耻，以坦诚存疑为荣。
以批量乱改为耻，以分步迭代为荣。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **项目速览**（2026-08-17）：
> - 产品：**DeepSeek Harness for VS Code** —— VS Code 扩展，一键启动 DeepSeek Harness（DSH）并把其 Web UI 内嵌进 IDE；同时兼容 Antigravity（VS Code fork，走 Open VSX）。
> - 技术栈：**Node.js + TypeScript**（VS Code 扩展 API）；npm 管理；vsce 打包；git 版本控制（仓库名 `deepseek-harness-for-vscode`，publisher `floatinghotpot`）。
> - 架构：传输桥方案（webview 文档直载 DSH 前端 + fetch/WS/剪贴板 shim，经 postMessage 转发到扩展宿主 Node 代发）。详见 `doc/feature/00-dsh-vscode/solution.md`。
> - 当前阶段：MVP 实现中（`doc/feature/00-dsh-vscode/plan.md` T1–T12）。

## 0. Thinking Discipline (MUST READ FIRST)

> "The models make wrong assumptions on your behalf and just run along with them without checking. They don't manage their confusion, don't seek clarifications, don't surface inconsistencies, don't present tradeoffs, don't push back when they should." — Andrej Karpathy

**Before answering any question about the codebase, ask yourself: "Did I read the code, or am I guessing?"** If you haven't read the relevant source file, DO NOT ANSWER. Run grep/read first. Naming conventions, prior experience, and "this is how it usually works" are NOT valid sources.

- **Manage confusion**: When something looks inconsistent or unclear, STOP. Name what's confusing. Ask. Do not silently pick an interpretation and proceed.
- **Push back**: If a simpler approach exists, say so. If the user's request contains scope creep, flag it. If a proposed change has hidden risks, surface them. Do not be a passive executor.
- **Present tradeoffs**: When multiple valid approaches exist, lay out the options before picking one. Let the user decide.

## 1. Communication & Language
- **User Correspondence**: ALWAYS respond to the user in **Chinese**.
- **Documentation**: ALL project-wide documentation (Markdown files) must be written in **Chinese**.
- **Technical Content**: Code identifiers, comments, and Git commit messages must be in **English**.
- **Transparency**: For complex refactoring or destructive actions, describe the plan in `Thought` and obtain approval first.

## 2. Risk, Production Safety & Code Quality
- **Quality First**: Do not rush. If unsure about the quality of the code, ask for clarification.
- **Simplicity First**: Minimum code that solves the problem. No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested. If 200 lines could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
- **Surgical Changes**: Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Every changed line should trace directly to the user's request. Remove only imports/variables that YOUR changes made unused.
- **Code Review**: after any code changes, always check for bracket balance and syntax errors. if TypeScript changed, run `npm run compile` (tsc strict) and fix **ALL** issues — including `info` level. if plain JS changed, run `node --check <file>`. The target is zero issues.
- **Defer Requires Proof**: Every deferred issue MUST cite a concrete blocker (unavailable API, cross-module migration plan, Phase 2 feature gate not yet open). Severity (P1/P2), frequency ("low risk"), or effort ("too large") are NOT valid reasons to defer — avoid small issues accumulate into technical debt.
- **Partial Formatting**: ONLY format new or modified code. Global reformatting is FORBIDDEN.
- **Environment Isolation**: No `make`, real-device testing, or deployment scripts allowed without permission. **本仓库的 `Makefile`（compile/test/package/publish 等）已获用户许可（2026-08-17）**；发布目标从环境变量读令牌（`OVSX_TOKEN`/`VSCE_PAT`），令牌不进仓库。Publishing to VS Code Marketplace / Open VSX requires explicit user confirmation.
- **Side Effects**: For operations with external side effects (e.g., API calls, spawning `dsh` servers, npm install), notify the risk in `Thought` beforehand.
- **DSH 运行约束**: 扩展只能向 `127.0.0.1`/`localhost` 代发请求；不得弱化 DSH 的 `/api` 信任围栏；`dsh web` 不允许 `--host 0.0.0.0`。见 `doc/feature/00-dsh-vscode/spike-notes.md`（S2/F2）。

## 3. Pre-edit Check (Adaptive Gate)
**Before invoking ANY write/modify tools, conduct a scope assessment:**
- **Micro-edit** (typo fix, single-line CSS/comment): Output brief: `[Pre-edit OK] Scope trivial.`
- **Standard-edit** (logic change, refactoring, multi-line change): **MUST** output the full checklist (Note: Show the plan/checklist only; do not output proposed code in the chat):
  1. **Bracket Balance**: Are all `{}` `[]` `()` symmetric for this edit?
  2. **Symbol Dependencies**: Will any deleted/renamed symbols break other files?
  3. **Validation Plan**: What analysis/test command will run immediately after the edit? (`npm run compile` / `node --check` / `npm test`)
  4. **Path Safety**: Is the operation restricted to the target directory?
  5. **Contract Change**: Does the edit change a function's contract—exceptions thrown, return semantics, preconditions, or side effects? If yes, grep all call sites and verify every caller is compatible with the new behavior **before** editing.
  6. **Language Switch**: If switching to a different language, verify each construct against this language (TS vs JS vs webview-injected JS). No assumptions from the prior one.

## 4. Task Splitting & Flow Control
- **Splitting Threshold**: If a task involves **>= 3 files** OR **> 50 lines of code changes**, a `Subtasks` list MUST be generated first.
- **Single Responsibility**: Each subtask must focus on a single file or a cohesive logic group.
- **Zero-Defect Gate**: If `npm run compile` / `node --check` / lint returns errors, the task is "Blocked" until fixed.
- **MVP 节奏**: 实现严格按 `doc/feature/00-dsh-vscode/plan.md` 的 T1–T12 推进；每 2–3 个任务对照 `req.md` 自审；未列入 plan 的功能不得顺手实现。

## 5. Version Control - Git（Zero Global Commit Policy）

**本仓库使用 git。为防工作区污染，遵循显式路径提交流程：**
1. **Status Review**: 提交请求时，先运行 `git status` 列出全部变更。
2. **Batch Plan (Explicit Only)**: 提交前必须给出 **Batch Plan** 供评审，包含：
   - 全部待提交文件的**显式完整路径**（禁止 `git add .`、`git add *` 等通配符）；
   - 拟定的 **Commit Message**（英文，遵循 Conventional Commits 风格，可带 plan 任务号，如 `feat(server): spawn dsh web with OS-assigned port (T2)`）。
3. **Execution Lock**: 等待用户显式确认（如 "Go"）后才可 `git commit`。未经确认的提交 FORBIDDEN。
4. **Push Policy**: `git push` 同样需要显式确认（公共仓库推送即发布）。
5. **No Auto Footer**: 不得在 commit message 中追加 `Co-Authored-By` 或任何自动生成的脚注；只写入用户批准的 message。
6. **.gitignore 必须覆盖**：`node_modules/`、`out/`、`*.vsix`、`.spike-dsh-home/`、`spike/`（一次性验证代码，MVP 后移除）、`.DS_Store` 等。

## 6. Documentation SOP

### Directory Convention
- **Feature Pipeline**: Follow `discussion → req → solution → plan → verification → summary + TODO` in `doc/feature/{NN-name}/`，**特性目录以两位数字编号作索引**（如 `00-dsh-vscode`、`01-xxx`），新特性取下一个编号。
- **架构文档**: 跨项目的架构/提案类文档放 `doc/architecture/`，**不进 `doc/feature/`**（Feature Pipeline 只承载需求驱动的特性流程）。
- **Bugfix Pipeline**: Record complex fixes in `doc/fix/{name}/`; simple fixes go to Daily Summary only.
- **Consistency**: Keep `doc/daily/YYYYMMDD.md` updated at the end of task series upon user request.

### Feature Pipeline (MANDATORY)

```
discussion.md → req.md → solution.md → plan.md → (implementation) → verification.md → plan.md review → summary.md + TODO.md
```

| Stage | Gate | Purpose |
|---|---|---|
| `discussion.md` | — | Raw record: brainstorms, meetings, code audit facts. Once `req.md` exists, discussion.md is READ-ONLY as a requirement source. New requirements go directly to req.md. |
| `req.md` | **User must approve** | What to do: requirements list + acceptance criteria. No implementation details. |
| `solution.md` | **User must approve** | How to do it: architecture, file change list, data contracts. If new requirements are discovered during solution writing, add them to req.md first—do NOT silently expand scope. |
| `plan.md` | **User must approve** | RTTM (req→task traceability matrix) + task checklist. Each task marked `✅` / `❌` / `⏭️`. |
| *(implementation)* | **Auto** | Write code. Every 2-3 completed tasks: lightweight self-audit against req.md, note any gaps. |
| `verification.md` | **Auto** | Close-out audit. Must: (a) re-check req→plan coverage via RTTM, (b) for each ✅ item confirm code exists AND is called (not dead code), (c) list every gap found with severity and suggested action. |
| `plan.md` review | **Auto** | Update task statuses based on verification results. |
| `summary.md` | **Auto** | Result record: what was done, what changed. |
| `TODO.md` | **Auto** | Mechanical extraction of `❌` + `⏭️` items from plan.md. Manual authoring FORBIDDEN. |

#### Plan Item States

- `✅` done — implemented and verified
- `❌` not done — attempted but blocked (carries block reason)
- `⏭️` skipped — explicitly deferred this round (carries decision reason)

Both `❌` and `⏭️` flow into TODO.md. `❌` items are likely to be re-queued directly next round; `⏭️` items are re-evaluated.

#### TODO.md

- `TODO.md` non-empty = Feature NOT complete. This is a factual signal.
- Human reviews TODO.md and decides: close the feature, defer to next round, or abandon.

#### plan.md Format (MANDATORY)

Self-contained — executor should NOT need to re-read solution.md.

| Section | Rule |
|---|---|
| Title | `# <Name> — 实施计划` |
| Header | `**日期**: YYYY-MM-DD` + `**来源**: [discussion.md](...), [req.md](...), [solution.md](...)` |
| RTTM | `\| 需求 \| 任务 \| 验证方式 \|` |
| Tasks | `### T# — 描述`，含 file path + line numbers + `- [ ]` sub-tasks + code snippet + `**完成标准**: ...` |
| Status | `✅` done / `❌` blocked / `⏭️` skipped / `⏳` pending |
| Order | ASCII dependency graph |
| Footer | `*关联文档：discussion.md \| req.md \| solution.md*` |

### Solution Document Structure (MANDATORY)
Before writing any solution document (`doc/fix/{name}/solution.md` or `doc/feature/{name}/solution.md`), follow this structure based on **code facts, not assumptions**:

1. **Goal** — target architecture / desired behavior (from proposal)
2. **Facts** — audit the actual code to confirm current state:
   - Read every relevant source file; list supported types, methods, and paths
   - Never assume "the code should support X" — verify it does
   - **Impact Breadth**: When the root cause is a shared component failure (auth expiry,
     HTTP timeout, null credentials, session invalidation), grep ALL pages/flows that
     depend on that component. The fix scope must cover the full blast radius, not just
     the page that reported the bug. List the affected callers explicitly in Facts.
3. **Gap** — diff between Goal and Facts; this IS the problem to solve
4. **Call-site Audit** (CONDITIONAL — REQUIRED when any Task changes a shared function's
   contract: new exceptions, changed return semantics, new preconditions):
   - Grep all references to the function being modified; list every call site with file
     path and line number
   - For each call site, classify: **compatible** (new behavior is correct for this caller)
     or **conflict** (caller relies on old behavior and will break)
   - If any call site is classified as conflict, the solution MUST be redesigned before
     writing Tasks. Do not proceed with a design that breaks known callers.
5. **Tasks** — concrete code changes to close the gap, with exact file paths and line ranges

**Rule**: Every "改为 xxx" statement in a solution MUST be backed by a code fact verified in step 2. No fact-check = no solution.

## 7. Execution Environment & Tooling

- **Runtime**: Node.js ≥ 20（开发环境 v24）；npm 11。
- **语言与编译**: TypeScript（`tsc` strict，`outDir: out`）；webview 注入脚本用纯 JS（`media/bridge-client.js`，不经过 tsc，改动后 `node --check`）。
- **构建**: `npm run compile`（tsc）、`npm run watch`（开发）、`npm run package`（`vsce package`，产物 vsix）。
- **测试**: 内置 `node:test` + `node:assert`（零依赖）；测试文件放 `test/`；`npm test` 跑全量。
- **打包发布**: `@vscode/vsce`；双渠道：Microsoft Marketplace + Open VSX（Antigravity 兼容）。发布需用户显式确认（§2/§5）。
- **依赖纪律**: 依赖最小化——能用 Node 内置（`node:http`、`fetch`、`WebSocket` ≥22、`node:test`）就不加包；必须新增依赖时先说明理由。
- **DSH 事实速查**（详见 `doc/feature/00-dsh-vscode/spike-notes.md`）：
  - `dsh web --port 0` 打印 `dsh web: http://127.0.0.1:<port>`；`~/.dsh` 为默认状态目录（`DSH_HOME` 可覆盖）；
  - `/api` 围栏：无浏览器头的 Node 请求放行；webview 跨源直连 403；静态 `/plugins/` 无围栏；
  - **webview 内 iframe 剪贴板不可用**（按钮 API + 原生 Cmd+C/V 双废）——本项目用传输桥方案修复；
  - dist 的 shell bundle 用相对 import（`./vendor-*.js`），资产必须同源（vscode-resource）加载。
- **项目布局**:
  - `src/` — 扩展宿主 TypeScript 源码（extension/serverManager/documentAssembly/bridgeHost/panelProvider/commands/themeSync）
  - `media/` — webview 注入脚本、图标等静态资产
  - `test/` — 单测
  - `doc/` — 文档（Feature Pipeline 见 §6）
  - `spike/` — 一次性验证代码（Phase 0 Spike），MVP 完成后移除
  - `.spike-dsh-home/` — Spike 隔离 DSH_HOME 产物（gitignore）

## Appendix A: 本地化（i18n）
- VS Code 扩展本地化约定：扩展名/命令/设置描述用 `package.nls.json`（en）+ `package.nls.zh-cn.json`（zh-CN）成对维护；代码内用户可见字符串用 `vscode.l10n.t()`（VS Code ≥1.73）或等价机制。
- 新增用户可见文案时，中英两份必须同步（不要拿英文当中文）；命令标题等标识符本身保持英文。
- 仓库文档一律中文（§1），不适用 nls 机制。

## Appendix B: VS Code Webview UI 规则
- **禁止硬编码颜色**：一律使用 VS Code 主题变量（`var(--vscode-editorWidget-background)`、`var(--vscode-button-background)` 等），深/浅色由 VS Code 主题自动决定，不要自己判断。
- **CSP 强制**：webview 必须带 CSP（`default-src 'none'` + 最小授权），见 `doc/feature/00-dsh-vscode/solution.md` §5.6；`connect-src 'none'` 由传输桥全拦截兜底。
- **外部资源必须同源或 data:**：字体/脚本/样式不得裸跨源引用（CORS 教训，见 spike-notes F10/F11）。
- **贴合 VS Code 设计语言**：字号、间距、控件、状态栏文案遵循 VS Code 惯例；面板/侧边栏高度自适应。
- **错误与加载态**：webview 必须有 starting/error/stopped 状态覆盖层（对齐 plan T8/T9），禁止白屏无提示。
- **可访问性**：按钮有 aria-label/文本；焦点顺序自然；键盘可操作。

---

**[Boot Instruction]**:
These rules serve as the "initialization firmware". If any violation is observed, the user may trigger a reset with the keyword: **"Check Rules"**.
