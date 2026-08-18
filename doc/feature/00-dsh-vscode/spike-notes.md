# Phase 0 Spike — 实测笔记

**日期**: 2026-08-17 ｜ **目的**: 验证 req.md R1–R6 的技术假设，为 solution.md 提供事实依据
**验证环境**: macOS，Node v24.19.0，`@deepseek-ai/dsh@0.1.0-rc.6`（npx 缓存），沙箱内隔离 `DSH_HOME`

---

## ✅ 已实测通过（服务器侧，本机可复现）

### S1. spawn + 端口解析（req R1）
- `dsh web --port 0` 启动成功，stdout 打印一行：`dsh web: http://127.0.0.1:62750`
- → **扩展侧解析该行即得实际端口**（OS 分配，无端口冲突）
- 重复/幂等：由扩展侧判断（已运行则不重启）——代码逻辑层面，Spike 已按此实现

### S2. `/api` 信任围栏行为（req R2 传输方式的关键依据）
| 请求形态 | 结果 | 结论 |
|---|---|---|
| Node 式（无 Origin / 无 sec-fetch-site） | **200** | 扩展宿主代发路径可行（桥方案） |
| 同源浏览器（Origin=Host + same-origin） | **200** | 正常浏览器工作 |
| webview 式（Origin: `vscode-webview://…` + cross-site） | **403** | **webview 不能直连 API**——架构判断成立 |
| 无 Origin 但 `sec-fetch-site: cross-site` | **403** | 围栏独立于 Origin 即可拒绝 |
| 静态 `/plugins/<id>/client.js` | **200**（不受围栏影响） | 经典 script 跨源加载插件 bundle 可行 |

### S3. 默认工作区 = 子进程 cwd（req R4）
- `host.describe` 返回 `cwd: <workspaceRoot>` —— 与 spawn 的 cwd 一致
- → **扩展 spawn 时传 `cwd: workspaceFolder` 即实现"当前文件夹为默认工作区"**，无需额外 API

### S4. 优雅退出与清理（req R3）
- SIGTERM → 进程优雅退出（后台任务 exit 0），端口释放，无残留进程
- DSH 自带 5s 宽限逻辑（源码 `createProcessShutdown`）；扩展侧再加 6s SIGKILL 兜底

### S5. 其他确认
- `GET /` 返回 index.html，`<head>` 首行已注入 `window.__DSH_BOOT__`（含 `/plugins/...` 图）——webview 文档组装的数据源成立
- `DSH_HOME` 环境变量覆盖生效（`.spike-dsh-home` 内自动初始化 `profiles/web`、`storages/`）——隔离模式机制成立（后续 N 项可用）
- `dsh web` 首个 profile 自动初始化，无需 pnpm/网络
- 沙箱限制备注：沙箱禁止写 `~/.dsh`（EPERM）——仅本验证环境限制，用户机器无此问题；顺带证明隔离 DSH_HOME 的必要场景

### S6. 二进制解析（用户实测发现，2026-08-17）
- 现象：用户已 `npm i -g @deepseek-ai/dsh`，扩展 spawn `dsh` 仍 `ENOENT`
- 根因：**GUI 启动的 VS Code 不继承 shell 的 PATH**（nvm/homebrew bin 缺失）；`code .` 只让已运行实例开文件夹，PATH 不刷新
- 对策：扩展实现多级自动探测（env `DSH_BIN` → PATH → `npm prefix -g` → 常见路径 → npx 缓存），spike 内已验证可命中
- → 该逻辑即 MVP 的"二进制解析"任务（架构提案 §5.2），Spike 提前验证通过
- 用户侧解法：完全退出 VS Code（Cmd+Q）后从终端 relaunch，或设 `DSH_BIN`

## ⏳ 待用户在 VS Code / Antigravity 实测（VS Code 1.125.1 与 Antigravity 1.107.0 均已在机器上）

Spike 扩展：`spike/dsh-webview-spike/`（F5 开发宿主即可，README 有步骤）。逐项打勾：

- [x] **V1. iframe 渲染**：webview CSP `frame-src http://127.0.0.1:*` 是否放行，DSH UI 是否完整渲染——**实测通过：完整渲染**（左栏工作区/会话 + 对话区 + 输入框）
- [x] **V2. 端到端对话**：发送消息 → agent 回复——**实测通过**（用户机器模型已配置）
- [x] **V3. 键盘/剪贴板**：`/` 命令菜单 ✅、Esc 关闭 ✅；`@` 无菜单 = DSH 原生行为（浏览器一致，无 skill/subagent 可引用）✅；**剪贴板 = 致命否决项**（见 V8）
- [x] **V5. 共享实例**：webview 与浏览器打开同一 URL，会话互通——**实测通过**（任一端新建会话另一端可见）
- [x] **V6. 生命周期**：停止 → `server exited (code=0, signal=null)` = DSH 优雅清理后以 0 退出，**期望行为**
- [ ] **V7. Antigravity**：vsix 安装后可激活、渲染（可缓，MVP 后）

### V8. 剪贴板：iframe 方案的致命否决项（2026-08-17）
- 现象：复制/粘贴按钮与**原生 Cmd+C / Cmd+V 全部不可用**（浏览器正常）
- 根因（已查证）：[microsoft/vscode#182642](https://github.com/microsoft/vscode/issues/182642)（open，2023 起未修复）——webview 内**跨源 iframe 的 `navigator.clipboard` 一律 `Write permission denied`**，`allow="clipboard-read; clipboard-write"` 无效；原生 Cmd+C/V 受 [#129178](https://github.com/microsoft/vscode/issues/129178) 影响同样不可用
- 影响：聊天 UI 无法复制代码块/粘贴长文本——**核心交互缺失，iframe 方案不可作为正式 MVP**
- **决策：MVP 内嵌方式改用传输桥**（架构提案 §5 推荐方案）：DSH 前端直接加载进 webview 文档（非 iframe），注入 `navigator.clipboard` shim → postMessage → `vscode.env.clipboard`，复制/粘贴完整可用

## 决策输入（供 solution.md）

| 项 | Spike 结论 |
|---|---|
| 子进程 + 端口解析 | ✅ 直接采用 `--port 0` + stdout 解析 |
| 内嵌方式 | **❌ iframe 否决（剪贴板，V8）→ 传输桥（架构提案 §5）** |
| 剪贴板 | 桥内 `navigator.clipboard` shim → `vscode.env.clipboard` |
| 工作区默认目录 | spawn `cwd`（零额外代码） |
| 停止/清理 | SIGTERM + 6s SIGKILL 兜底 |
| 隔离模式 | `DSH_HOME` 覆盖机制已验证，MVP 后启用 |
| 二进制解析 | ✅ 多级自动探测已实现并验证（S6） |
| 文档组装 | dist 含 KaTeX 字体（CSS `url(/assets/fonts/…)`）→ 需内联字体为 data: URL 或走本地资源；插件 bundle 用经典 script 跨源（已验证 200） |

*关联文档：req.md ｜ 架构提案 ｜ 市场分析*
