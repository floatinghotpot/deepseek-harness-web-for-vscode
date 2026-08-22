# Bugfix — 侧边栏状态卡在 "Starting…"（view 重新 resolve 时状态消息丢失）

**日期**: 2026-08-22 ｜ **影响**: v0.3.2（侧边栏切换后状态显示异常）
**环境**: macOS 睡眠唤醒 + 侧边栏切换（文件树 ↔ dsh）触发

## 现象（用户实测）

- 打开 VS Code / 切换工作区：dsh4vscode 正常启动、侧边栏状态正确；
- **笔记本睡眠唤醒后**（或**切换侧边栏**再切回 dsh 图标）：web UI 显示正常、会话列表正常刷新，
  但侧边栏状态区**卡在 "Starting…"（闪烁圆点）**，显示"启动 DeepSeek Harness"按钮；
- 关闭 VS Code 时日志显示 `deactivate: state=ready` —— manager 状态机本身是 ready，
  与实际渲染的 UI 不一致。

## 根因（代码事实）

1. 侧边栏 `WebviewView` 每次切换/重建都会触发 `resolveWebviewView`（`src/launcherView.ts`）：
   ```ts
   webviewView.webview.html = launcherHtml({ state: this.manager.state, ... }); // ① 页面异步加载
   this.postStatus({ state: this.manager.state, ... });                        // ② 立即推状态
   ```
2. **`webview.html = ...` 是异步加载**：页面 JS 的 `window.addEventListener("message")` 需要时间注册；
3. 若 ② 的 `server-status` 消息在页面监听器注册**之前**发送 → **消息被丢弃**；
4. 状态卡住的场景：`resolveWebviewView` 时 manager 处于 `starting`（HTML 按 starting 渲染），
   之后 manager 变 `ready` 触发 `postStatus(ready)` —— 若这条消息同样丢失 → UI 永远停在起始渲染的
   "Starting…"；
5. 会话列表**不受影响**的原因：`pollSessions` 是**定时轮询**（`SESSIONS_POLL_MS` 间隔），
   页面加载完成后总能送达 → 列表正常、状态卡死，二者矛盾正是竞态的典型特征；
6. manager 状态机本身**无异常**（deactivate 时仍 `state=ready`），问题纯在 webview 消息投递时序。

## 修复

- **`src/launcherView.ts`**：新增 **view-ready 握手**——
  - webview 页面 JS 开头发送 `vscode.postMessage({ type: "view-ready" })`；
  - 宿主 `onDidReceiveMessage` 收到 `view-ready` 后**补推当前状态**（`postStatus` + `postWorkspace`）；
  - 握手消息必然在页面监听器注册**之后**送达，保证状态必达，与初始 HTML 渲染时序无关。
- 顺带保留诊断日志：`resolveWebviewView` 打印 `managerState`，webview 打印初始状态与收到的
  `server-status`（睡眠/切换问题复现时可直接看 Console 定位）。

## 验证

- `npm run compile`（tsc strict）零 issue；`npm test` 81 项 80 过——唯一失败
  `resolveDshPath finds dsh in an injected home` 为**预先存在的环境相关失败**（机器有全局 dsh，
  与本次修复无关）；
- 用户 F5 实测：睡眠唤醒 / 切换侧边栏后再切回 dsh，**状态正确显示 ready** ✅。

## 后续建议（防同类）

- webview 与宿主通信的通用纪律：**`webview.html` 赋值后不要立即 postMessage**，一律走
  "页面加载完成握手 → 宿主补推"模式，避免异步加载竞态；
- 状态类 UI 若依赖"事件驱动推送"，务必有**轮询或握手兜底**，否则单次消息丢失即永久卡死。

*关联文档：doc/fix/20260820-v031-fixes/record.md ｜ doc/fix/20260820-v032-dsh-v011-rc2/record.md ｜ CHANGELOG.md*
