# DSH × VS Code 扩展 —— 市场分析

> 阶段：`marketing / market-analysis` ｜ 日期：**2026-08-17** ｜ 状态：待评审
>
> 前置文档：[`doc/architecture/proposal-by-deepseek.md`](../architecture/proposal-by-deepseek.md)（产品架构提案）
> 本文回答：**这个扩展该不该做、卖给谁、凭什么赢、怎么衡量成功。**
>
> 数据口径：除特别注明外，所有安装量 / star / 下载量数据均为 2026-08-17 当日实拉（VS Code Marketplace 公开 API、GitHub API、npm API），来源见 §13。

---

## 1. 执行摘要

- **市场大，赛道热**：AI 编程助手市场预计 2032 年达 **$127.05B（CAGR 48.1%）**（[MarketsandMarkets](https://www.marketsandmarkets.com/PressReleases/ai-code-assistants.asp)）；终端派 agent 正在爆发——Claude Code 据报已达 **$2.5B ARR**（[agentmarketcap](https://agentmarketcap.ai/blog/2026/04/25/claude-code-25b-arr-fastest-ai-developer-tool-billion-dollar-revenue)），开源 agent（OpenCode 19.8 万 star）快速崛起。
- **DSH 底盘厚**：DeepSeek Harness 仓库 **13.9 万 star**，`@deepseek-ai/dsh` CLI **近 30 天 npm 下载 19.6 万**——是"有真实用户基数的开源 agent 框架"，但 **DeepSeek 官方没有出 VS Code 扩展**。
- **品类已验证但极小**：Marketplace 上已有 8 个 DSH 内嵌扩展（Marketplace 7 + Open VSX 1），合计仅 **~341 安装**——证明"能做成"，也证明"没人做好"。机会不是抢这 341 个用户，而是**吃下 DSH 存量用户（月 19.6 万下载）中"住在 VS Code 里"的那部分**。
- **结论**：**做**。以"官方级体验的 DSH-in-VS-Code 壳层"为定位，靠**正确的生命周期管理 + 深度 VS Code 集成 + 与浏览器共享实例 + 上游共建**建立壁垒；成功标准见 §11（6 个月 2k+ 安装即可把现有品类扩大一个数量级）。

---

## 2. 市场定义

### 2.1 我们卖什么

一个 VS Code 扩展：**一键启动 DeepSeek Harness（DSH）并把其官方 Web UI 内嵌进 VS Code**（侧边栏/编辑器标签页），同时叠加 VS Code 原生能力（附加当前文件夹、命令面板、主题同步）。产品本质是 **DSH 的"官方级体验壳层"**，而非又一个从零写的 IDE agent。

### 2.2 市场边界（我们不在哪里竞争）

| 边界 | 说明 |
|---|---|
| 不做 IDE agent | 不写对话/工具/编排引擎——那是 DSH 的事（Everything is a Plugin） |
| 不锁 DeepSeek 模型 | DSH 的 LLM 设置支持自定义 provider/baseURL/API key，我们不做模型生意 |
| 不替代浏览器 UI | 与浏览器 Web UI **共享同一实例**，互为入口而非互斥 |
| 不碰云端 | 本地进程方案，vscode.dev/远程开发场景不承诺（见架构提案 §5.5/§8） |

---

## 3. 市场规模（TAM / SAM / SOM）

> 说明：本产品是"存量工具（DSH）的 IDE 入口"，不是"从零教育市场的品类"，因此**自上而下的 TAM 数字只作背景，真正可执行的测算在 SAM/SOM（自下而上）**。

### 3.1 TAM（潜在总市场）

AI 编程助手市场 2026 年约 **$16–18B**，2032 年预计 **$127.05B（CAGR 48.1%）**（[MarketsandMarkets](https://www.marketsandmarkets.com/PressReleases/ai-code-assistants.asp)；其 2025 基线 $8.35B，2026 在 $12–16B 区间，取中值）。VS Code 侧装机量级参考（2026-08-17 Marketplace API）：

| 扩展 | 安装量 |
|---|---|
| GitHub Copilot | 74.4M |
| Tabnine（旧） | 9.6M |
| Cline | 5.0M |
| Continue | 3.9M |
| Roo Code | 1.9M |
| Amazon Q | 1.8M |
| Cody | 877K |

→ VS Code 是 AI 编程事实主战场；TAM 视角下空间足够大，**瓶颈从来不是市场容量，而是 DSH 自身用户盘子**。

### 3.2 SAM（可服务市场）

以 DSH 存量用户为分母：

- DSH CLI 月下载 **195,945**（2026-07-17 → 08-15，[npm](https://www.npmjs.com/package/@deepseek-ai/dsh)）；
- 仓库 star **139,332**（[GitHub](https://github.com/deepseek-ai/deepseek-harness)），star 与活跃用户比约 3–5:1（开源惯例）→ 活跃开发者估 **2.8–4.6 万**；
- 其中"主要工作在 VS Code 中"的开发者占比估 40–60%（VS Code 仍是桌面 IDE 第一份额）→ **SAM ≈ 1.1–2.8 万潜在用户**；
- 国内（中文）开发者占 DSH 用户相当比例（前端默认 `zh-CN`、DeepSeek 主场），估 40%+。

**SAM ≈ 1–3 万人**。这已经比现有 DSH 扩展合计（~341 安装）大 30–90 倍——**赛道远未饱和**。

### 3.3 SOM（可获取市场 / 12 个月目标）

- 基准参照：开源 IDE agent 的"安装/仓库活跃"转化（Cline 5.0M 安装 vs 66K star ≈ 75:1，含大量免费流量放大，不可直接套用）；
- 本产品更合理的参照：**DSH 用户中"愿意在 VS Code 里用 DSH"的渗透率**。参照同类"官方 UI 壳层"型扩展（如各类 local-first 工具）首年渗透率 5–15%：
  - 保守：SAM 下限 1.1 万 × 5% ≈ **550 安装**；
  - 中性：SAM 中值 1.9 万 × 10% ≈ **1,900 安装**；
  - 乐观：SAM 上限 2.8 万 × 15% ≈ **4,200 安装**。
- 即使保守达成，也已是现有品类（~341）的 **1.6 倍以上**；中性达成则扩大 **5–6 倍**。

---

## 4. 宏观趋势（对本品有利/不利）

| 趋势 | 对本品 | 依据 |
|---|---|---|
| 终端派 / 本地 agent 爆发 | **有利**：DSH 属 CLI-first 本地 harness，正处风口 | Claude Code $2.5B ARR、OpenCode 19.8 万 star |
| 开源 agent 崛起 | **有利**：DSH 13.9 万 star 是开源阵营头部 | [GitHub](https://github.com/deepseek-ai/deepseek-harness) |
| "Everything is a Plugin" 生态 | **有利**：DSH 插件体系（浏览器插件、工具、preset、skill）是差异化富矿，壳层可直接展示全部能力 | DSH README、架构提案 §2.2 |
| 自带密钥 / 自托管（BYOK / local-first） | **有利**：DSH 本地跑、用户自己配模型，规避云端合规 | 企业用户尤其在意 |
| 数据本地化 / 合规收紧 | **有利**：本地进程 + 回环绑定，代码不出机器 | 架构提案 §5.5 |
| VS Code 仍是主流 IDE 入口 | **有利**：74M Copilot 装机证明 IDE 内分发效率 | §3.1 表 |
| 上游官方下场做官方扩展 | **风险**：见 §5.4，用"上游共建"对冲 | — |
| Marketplace 政策限制付费 | **中性**：货币化走外部渠道（§8） | — |

---

## 5. 竞争格局

### 5.1 直接竞品：现有 DSH 内嵌扩展（2026-08-17 实测）

| 扩展 | 安装 | 亮点 | 可攻击的弱点 |
|---|---|---|---|
| [DSH（dsh-vscode-panel）](https://marketplace.visualstudio.com/items?itemName=Fengze233.dsh-vscode-panel) | 150 | 侧边栏网页界面 | 无生命周期管理/集成深度不明 |
| [Deepseek Harness (DSH) for VSCode](https://marketplace.visualstudio.com/items?itemName=liumin.deepseek-harness-for-vscode-plugin) | 86 | 侧边栏内嵌 + 当前文件夹作工作区 | 安装量小，无配套文档 |
| [DSH UI (Unofficial)](https://marketplace.visualstudio.com/items?itemName=magicshawn.deepseek-harness-ui) | 33 | 非官方视觉工作区 | 非官方、维护存疑 |
| [DSH Launcher](https://marketplace.visualstudio.com/items?itemName=young1839.dsh-launcher) | 28 | 一键启停/更新，编辑器标签页内嵌 | 起步晚，功能面窄 |
| [Embedded DSH for VS Code](https://marketplace.visualstudio.com/items?itemName=Skylake0216.embedded-deepseek-harness-for-vs-code) | 20 | 与浏览器共享实例 | 安装量最小 |
| [DeepSeek Harness Chat](https://marketplace.visualstudio.com/items?itemName=MJ-chang.deepseek-harness-chat) | 17 | 聊天场景 | 功能面窄 |
| [DeepSeek Harness Web（Open VSX）](https://open-vsx.org/extension/hudi/dsh-integration) | 5 | 已占 Open VSX 位 | 起步最早但量极小 |
| [DeDge DeepSeek Harness](https://marketplace.visualstudio.com/items?itemName=diRactive-Edge.dedge-deepseek-harness-vscode) | 2 | — | 刚发布 |

**判断**：品类被 **8 个扩展**（Marketplace 7 + Open VSX 1）共同验证（技术可行 + 有真实需求），但合计仅 **~341 安装**（Marketplace 336 + Open VSX 5），说明**无一做出突破性体验**——共同缺口：文档与维护、生命周期健壮性、VS Code 深度集成、中文社区运营。这正是本品的切入点。**竞争策略不是"打败这 8 个"，而是把品类天花板从 341 抬到数千。**

> 生态热度佐证：官方仓库已有用户自发推广自己的 DSH-VS Code 插件（[deepseek-ai/deepseek-harness Discussion #1353](https://github.com/deepseek-ai/deepseek-harness/discussions/1353)），说明需求真实存在、官方渠道可借力。

### 5.2 间接竞品：VS Code 内 AI agent（我们不直接竞争，但要清楚边界）

| 产品 | 安装/规模 | 与本品的差异 |
|---|---|---|
| GitHub Copilot | 74.4M | 云侧补全/agent，非自托管 harness；**可共存** |
| Cline | 5.0M | IDE 内自治 agent；DSH 是"框架级" harness（goal/workflow/subagent/skill 体系），定位不同层 |
| Roo Code | 1.9M | Cline fork，同上 |
| Continue | 3.9M | 开源 agent，同上 |

**边界陈述**：本品的竞品是"DSH 的其他入口（浏览器/终端）"，不是 Cline。用户在 Cline 里写 agent、在 DSH 里跑完整工作流/目标驱动任务——互补场景多于替代。对"DSH 已用户"做转化，不做 Cline 用户争夺。

### 5.3 终端/独立 agent（对 DSH 的威胁，间接影响本品）

Claude Code（$2.5B ARR）、OpenCode（19.8 万 star）、Aider（4.8 万 star）验证了"本地 agent"需求爆炸；它们也是 DSH 的替代选择。本品通过降低 DSH 的 IDE 使用摩擦，**帮 DSH 留在用户工作流里**，间接对抗这一威胁。

### 5.4 上游风险：DeepSeek 官方下场

- DSH 是 DeepSeek 官方开源项目（13.9 万 star），官方若发布 VS Code 扩展，将带走大部分品类流量；
- **对冲策略**：① 积极向上游提 PR（架构提案路径 C：`--trusted-origin` + CORS），争取成为"官方认可/合入"的集成层；② 在官方下场前建立体验/文档/社区壁垒；③ 若官方确实下场，本品的"深度集成 + 独立维护"仍可差异化（官方扩展常保持克制，第三方可做得更激进）。

### 5.5 定位总表

| 维度 | 本品 | Cline/Roo | 现有 DSH 扩展 |
|---|---|---|---|
| 角色 | DSH 官方 UI 的 VS Code 壳层 | IDE agent | 同上（但粗糙） |
| 与 DSH 关系 | 共享实例、零 fork | 无关 | 共享实例（部分） |
| 生命周期管理 | 全托管（启动/健康/重启/清理） | 内建 | 弱/缺失 |
| VS Code 集成 | 附加文件夹、命令、主题同步 | 原生 | 浅 |
| 上游 | 提 PR 共建 | 独立 | 无 |

---

## 6. 目标用户与画像

### P1 — DSH 重度用户（Primary，占潜在 60%）
- 已装 `@deepseek-ai/dsh`、日常在终端/浏览器用 DSH；
- 痛点：**切窗口**——编辑器里改代码、浏览器里盯 agent，上下文断裂；
- 诉求：内嵌、不丢状态（同一 `~/.dsh`）、一键启停；
- 转化路径：DSH 官方渠道（README/讨论区/插件目录）→ 安装 → 留存。

### P2 — VS Code 用户中的 DSH 观望者（占 30%）
- 听说过 DSH（13.9 万 star 的声量）但觉得 CLI/浏览器麻烦；
- 痛点：**上手门槛**；
- 诉求："装个扩展就能玩"，当前文件夹即工作区；
- 转化路径：Marketplace 搜索（"deepseek harness"）→ 安装 → 体验。

### P3 — 团队/自托管用户（占 10%，企业化潜力最高）
- 需要本地数据、自带模型、多会话/工作流治理；
- 诉求：内网可用、无云端依赖、可脚本化启停；
- 转化路径：企业试用 → 付费（§8）。

### 地域
- **国内开发者优先**：DeepSeek 主场、前端默认 `zh-CN`、中文文档与社区投入回报最高；海外次之。

---

## 7. 定位与差异化

**一句话定位**：*把 DeepSeek Harness 装进 VS Code 的官方级入口——启动、内嵌、集成、共享，一条命令。*

差异化支柱（按可防御性排序）：

1. **正确性（防复制）**：完整子进程生命周期（端口解析、健康检查、崩溃重启退避、共享实例探测、优雅退出）——现有扩展无一做到；
2. **共享实例（用户价值）**：与浏览器/终端打开的是**同一个 DSH 实例**，会话、设置、插件零分裂；
3. **深度集成（护城河）**：附加当前文件夹（`workspace.create`）、命令面板、主题同步、后续可挂 VS Code 文件/编辑器事件；
4. **安全姿态（信任）**：回环绑定、不弱化围栏、CSP 收紧——安全模型写进文档可审计；
5. **上游共建（长期）**：向 DSH 上游提 `--trusted-origin`/CORS PR，从"第三方壳"走向"官方合作层"。

---

## 8. 商业模式与定价

> 前提：VS Code Marketplace 不允许直接售卖扩展（[Marketplace 政策](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)），货币化必须走外部渠道——这是 Cline/Roo/Continue 的通行做法（扩展免费 + 外部订阅/企业版）。

| 期 | 模式 | 说明 |
|---|---|---|
| 冷启动期（0–6 月） | **免费开源** | 抢品类天花板；MIT/Apache-2.0；GitHub Sponsors / 爱发电（国内）接受捐赠 |
| 成长期（6–18 月） | **Freemium** | 免费核心 + 可选 Pro（企业功能：多实例管理、团队配置下发、内网安装包、优先支持）；扩展本体始终免费 |
| 成熟期 | **企业版/支持合同** | P3 画像（自托管团队）付费意愿最高；`dsh` 月下载 19.6 万中的企业用户是漏斗顶端 |

**定价锚点**：同类"本地工具 IDE 壳"付费区间 $5–15/月/席位；首年不指望收入，**指标先行（§11）**。

---

## 9. SWOT

| 优势（S） | 劣势（W） |
|---|---|
| DSH 底盘大：13.9 万 star / 月 19.6 万下载 | 品类现状小（~341 安装），需自己教育"DSH 可以在 VS Code 里用" |
| 架构提案已给出可落地的零 fork 方案 | 传输桥有 ~300–500 行自研代码，需随 DSH 演进维护 |
| 现有竞品无一款"做对" | 单人/小团队维护，上游节奏不可控 |
| 中文社区主场 + 前端默认 zh-CN | vscode.dev/远程场景不支持，会被部分用户一票否决 |

| 机会（O） | 威胁（T） |
|---|---|
| 官方无 VS Code 扩展，"官方位"空悬 | DeepSeek 官方下场（§5.4） |
| 本地/自托管/BYOK 需求上升 | 上游改传输协议导致桥面重写 |
| DSH 插件生态（workflow/goal/skill）可做成差异化内容 | Marketplace 政策收紧 / 开源许可争议 |
| 与浏览器共享实例 = 独有卖点 | 用户自启 `dsh web` 端口冲突体验（有探测方案） |

---

## 10. 进入市场策略（GTM）

**阶段一（0–3 月）· 冷启动**
- 发布到 VS Code Marketplace + Open VSX；GitHub 开源 + 中文 README 优先；
- 内容：3 篇图文（安装/内嵌/附加文件夹）+ 1 条 90s 演示视频（中文）；
- 渠道：DSH 官方讨论区/README（提 PR 加"第三方工具"小节）、掘金/知乎/微信公众号、Reddit r/DeepSeek、Hacker News Show HN；
- 关键词占位：Marketplace 搜索词 "deepseek harness" / "dsh" / "deepseek"。

**阶段二（3–6 月）· 破圈**
- 向上游提 `--trusted-origin` + CORS PR（架构提案路径 C），争取官方 README 收录 → 流量从 341 品类跳变；
- 发布"与浏览器共享实例"对比实测（独有卖点）；
- 收集 P3 企业试用名单（内网部署白皮书）。

**阶段三（6–12 月）· 商业化验证**
- Pro 功能上线（多实例/配置下发）；首年目标以安装与留存为主，收入为辅。

**渠道权重预估**：Marketplace 搜索 40% ｜ DSH 官方社区/README 收录 30% ｜ 中文技术社区 20% ｜ 其他 10%。

---

## 11. 关键指标与成功标准

| 指标 | 基线（现有品类） | 6 个月目标 | 12 个月目标 |
|---|---|---|---|
| 安装量 | 合计 ~341 | **2,000**（≈ SOM 中性下限） | 5,000 |
| 周活跃面板打开（DAU/MAU） | 无数据 | MAU ≥ 安装量 30% | ≥ 35% |
| 留存（安装后 4 周仍活跃） | 无数据 | ≥ 25% | ≥ 30% |
| 与浏览器共享实例占比 | — | ≥ 40%（说明"真在用"而非尝鲜） | ≥ 50% |
| 崩溃/启动失败率 | — | < 2% | < 1% |
| 上游 PR 合入 | 0 | ≥ 1 | ≥ 2 |

**红线（不达即停/转型）**：6 个月安装 < 500 → 说明 DSH 用户转化假设错误，转型评估（改做官方 README 收录 / 转向企业定制 / 放弃）。

---

## 12. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 上游官方下场做官方扩展 | 高 | 提前 PR 共建成为"官方合作层"；官方扩展通常克制，深度集成仍可差异 |
| 品类天花板低于预期（DSH 用户"住在终端/浏览器"比例过高） | 中 | 早期即验证 P2 转化（观望者）；设置指标红线（§11） |
| 桥面维护成本随 DSH 升级上升 | 中 | 桥只透传官方信封（架构提案 §5.4）；版本兼容测试 |
| 单人维护不可持续 | 中 | 开源化 + 早期贡献者；文档 SOP 化（CLAUDE.md 已覆盖） |
| Marketplace 政策/许可风险 | 低 | 纯自有代码 + 上游 PR 合规；不捆绑 DSH 源码 |
| 网络安全质疑（本地服务） | 低 | 回环绑定 + 围栏不动 + CSP 收紧，安全模型公开可审计（架构提案 §5.5） |

---

## 13. 附录：数据来源与方法

- **Marketplace 安装量**：VS Code Marketplace 公开 GraphQL/API（`marketplace.visualstudio.com/_apis/public/gallery/extensionquery`），2026-08-17 实拉；
- **GitHub star**：GitHub REST API，2026-08-17 实拉（deepseek-harness 139,332；opencode 198,210；cline 66,311；aider 48,276；continue 35,507）；
- **npm 下载**：npm downloads API，`@deepseek-ai/dsh` 近 30 天 195,945（2026-07-17 → 08-15）；
- **市场规模**：[MarketsandMarkets AI Code Assistants $127.05B by 2032 / CAGR 48.1%](https://www.marketsandmarkets.com/PressReleases/ai-code-assistants.asp)；[Claude Code $2.5B ARR](https://agentmarketcap.ai/blog/2026/04/25/claude-code-25b-arr-fastest-ai-developer-tool-billion-dollar-revenue)；
- **测算方法**：SAM 采用"DSH 活跃开发者（star/下载折算）× VS Code 占比 × 渗透率"自下而上估算，区间化表达，标注保守/中性/乐观三档；SOM 以同品类（local-first 工具 IDE 壳层）首年渗透率 5–15% 为锚；
- **局限性**：第三方咨询数字（TAM/CAGR）未独立核验，仅作背景；各扩展"是否共享实例/集成深度"基于公开描述推断，未逐一下载验证。

*关联文档：架构提案 `doc/architecture/proposal-by-deepseek.md` ｜ 后续进入 `doc/feature/00-dsh-vscode/req.md` 需求阶段*
