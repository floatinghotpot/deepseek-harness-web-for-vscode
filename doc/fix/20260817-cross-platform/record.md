# Bugfix — 跨平台兼容（Windows 二进制解析/spawn 失效）

**日期**: 2026-08-17 ｜ **影响**: v0.0.1–v0.0.7 在 Windows 上大概率无法启动 dsh

## 审计结论（发布后回查）

| 平台 | 结论 |
|---|---|
| macOS | ✅ 本机全测 |
| Linux | ⚠️ 基本可用（候选路径兼容） |
| Windows | ❌ ① 解析候选全是 mac/linux 路径（Windows npm shim 在 `%AppData%\npm\dsh.cmd`、npx 缓存 `%LocalAppData%\npm-cache`、无 `bin` 子目录）；② `spawn` 未开 `shell`，spawn `.cmd` 失败 |

## 修复

- `resolveDshPath(home, platform)`：平台参数化——Windows 增加 `.cmd` 后缀候选、`%LocalAppData%\npm-cache\_npx\...` 缓存路径、npm prefix 不加 `bin` 后缀；排除 mac 专属路径（homebrew）
- `spawn`/`spawnSync --version`：Windows 下 `shell: true`（.cmd/.bat 需要）
- `npm test` 脚本去掉 glob（Windows cmd 不展开 `"test/*.test.js"`）→ `node --test` 默认发现
- 新增 `scripts/smoke.js`：真实 spawn dsh + host.describe 冒烟（CI 用）

## 验证

- 单测 22 → **24**（新增 Windows 布局 fixture：`dsh.cmd` 命中、排除 homebrew）
- 本地 smoke 通过（DSH_HOME 隔离）
- **CI 三平台矩阵** `.github/workflows/ci.yml`：ubuntu/windows/macos × node 22 × `npm test` + `npm i -g @deepseek-ai/dsh && node scripts/smoke.js`（push/PR 触发）——**首次 push 后由 GitHub 实机验证**
- 待办：CI 绿灯后，Windows 实机（或 runner 日志）确认解析与 spawn

*关联文档：serverManager.ts ｜ Makefile ｜ 发布后质量检查*
