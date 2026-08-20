# 升级渠道与 rc.8 兼容（upgrade-channels）— 讨论记录（discussion）

**日期**: 2026-08-20 ｜ **来源**: 用户反馈 + npm registry / dsh 源码实拉查证

## 背景事实（全部实证）

### F1 — dsh rc.8 已发布，但挂在 `next` 渠道
npm registry 实测（2026-08-20）：
```json
{"next":"0.1.0-rc.8","latest":"0.1.0-rc.7"}
```
`0.1.0-rc.8` 存在，属于 `next` dist-tag；`latest` 仍指向 `0.1.0-rc.7`。

### F2 — 扩展当前只跟踪 `latest`
`src/versionCheckService.ts` L59-60：
```ts
const pkg = (await res.json()) as { "dist-tags"?: { latest?: string } };
const latest = pkg["dist-tags"]?.latest;
```
- 只读 `dist-tags.latest`，完全不读 `next` → 用户装 rc.7 时 current==latest，不提示 rc.8（行为符合"只提示稳定渠道"的旧设计，但漏掉 rc 用户）。
- 升级命令（`versionCheck.ts` `upgradeCommandFor`）一律 `@latest`，rc 用户即使点升级也装回 rc.7（装不到 rc.8）。

### F3 — rc.8 新增"自动打开默认浏览器"，`--no-open` 可关闭
实拉 `@deepseek-ai/dsh-web-app@0.1.0-rc.8` tarball 查证：
- `lib/index.js` L32：`openBrowser: z.boolean().default(true)` —— **默认开浏览器**；
- `lib/startup.js` L22：`.option("--no-open", "do not open the Web UI in the default browser")`；
- `lib/startup.js` L43：`openBrowser: options.open`（`--no-open` 置 false）；
- `lib/index.js` L174：`handoffBrowser = config.openBrowser && !launchedThroughSsh(ctx)` —— SSH 启动自动跳过，**普通 spawn 不跳过**；
- 触发时打印 `dsh web: opening the default browser; pass --no-open to disable`。
- **rc.7 对比**：`@deepseek-ai/dsh-web-app@0.1.0-rc.7` 的 `startup.js`/`index.js` 无 `openBrowser`/`--no-open` —— 该行为 **rc.8 新增**。

### F4 — 扩展 spawn 未传 `--no-open`
`src/serverManager.ts` L245：
```ts
spawn(bin, ["web", "--port", "0", ...(opts.extraArgs ?? [])], …)
```
- `extraArgs` 选项存在（L46-47）但**无任何调用方**；
- 后果：用户升 rc.8 后，扩展每次启动 dsh 都会弹出外部浏览器——与"Web UI 内嵌进 VS Code"的定位冲突。

### F5 — 不能无条件加 `--no-open`
- `dsh` CLI 的 web 参数由 web-app 插件用 commander 解析，**未知选项直接报错退出**（`error: unknown option '--no-open'`）；
- rc.7 及更早无此 flag → 无条件传会**启动失败**；
- 必须版本门控：`version >= 0.1.0-rc.8` 才传。扩展启动时已解析版本（`serverManager.ts` L232 `resolveDshVersion`），且 `versionCheck.ts` 已有 `compareVersions`（支持 `-rc.N` 比较，含测试）可复用。
- 附带确认：rc.8 打印 URL 行格式不变（`dsh web: http://127.0.0.1:<port>` 前缀），`parseUrlLine` 正则（`serverManager.ts` L62）不受"opening the default browser"附加输出影响。

### F6 — 用户需求（2026-08-20 口头提出）
> 希望扩展检测 `next` 渠道；侧边栏同时显示 **latest** 与 **next** 两个升级选项，让用户自己决定升级到哪个渠道。

## 结论
- `--no-open` 门控是 **rc.8 兼容性硬伤**，必须修（R1）；
- `next` 双渠道检测 + 侧边栏双选项是**新功能**（R2），用户已口头批准走 Feature Pipeline。

*关联文档：req.md ｜ solution.md ｜ plan.md ｜ src/versionCheck.ts ｜ src/versionCheckService.ts ｜ src/serverManager.ts ｜ src/launcherView.ts*
