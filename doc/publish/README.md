# 发布指南（Publishing Guide）

**适用项目**: `floatinghotpot/deepseek-harness-web-for-vscode`  
**扩展 ID**: `floatinghotpot.deepseek-harness-web-for-vscode`

---

## 1. 渠道信息概览

| 渠道 | Publisher / Namespace | 目标平台 | 说明 |
|---|---|---|---|
| **VS Code Marketplace** | `floatinghotpot` | 官方 VS Code / Cursor | 微软官方扩展商店 |
| **Open VSX** | `floatinghotpot` | Google Antigravity / VSCodium / Gitpod | Eclipse 开源扩展注册表 |

---

## 2. 快速参考（Makefile 封装）

推荐使用已封装的 `Makefile` 自动化指令（令牌均从环境变量读取，执行命令带 `@` 零回显）：

```sh
# 1. 编译并打包 VSIX（产物：deepseek-harness-web-for-vscode-<version>.vsix）
make package

# 2. 单独发布至 VS Code Marketplace（需配置 VSCE_PAT 环境变量或已 vsce login）
make publish-vscode

# 3. 单独发布至 Open VSX（需配置 OVSX_TOKEN 环境变量）
make publish-ovsx

# 4. 双渠道一次性全量发布（package + publish-vscode + publish-ovsx）
make publish

# 5. 创建 Git 版本 Tag（不自动 push）
make tag
```

---

## 3. 文档目录导航

根据发布目标与场景查阅对应子文档：

1. **[VS Code Marketplace 发布指南](vscode-marketplace.md)**  
   * 微软账号与 Azure DevOps 组织配置
   * Personal Access Token（PAT）申请与权限设置
   * `vsce` 登录与发布操作、常见 429/VSID 频控排错
2. **[Open VSX 发布指南](open-vsx.md)**  
   * Eclipse Foundation 账户与 GitHub 关联
   * 签署 Publisher Agreement 与 Access Token 申请
   * CLI 创建 namespace 与发布操作
3. **[GitHub Actions 自动化发布](github-actions.md)**  
   * 基于 Git Tag 的 CI/CD 自动双发工作流配置
   * GitHub Secrets 设置与发版安全规范

---

## 4. 版本管理规范

- **手动 Bump 版本**：版本号一律在 `package.json` 中显式更新（`0.1.0` → `0.1.1`），不使用 vsce 的自动 bump 功能；
- **显式指定包路径**：CLI 发布时必须指定 `--packagePath` 参数，避免工具自动触发 git tag / commit（严格遵循仓库 Zero Global Commit 策略）；
- **发布前检查清单（Checklist）**：
  - [ ] `npm test` 单元测试与跨平台 smoke 测试全绿；
  - [ ] `vsce ls` 检查打包清单，确认无多余冗余文件（无 `node_modules` 杂物）；
  - [ ] `package.json` 中的 `version`、`displayName`、`description` 与 `icon` 完整无误；
  - [ ] 根目录 `README.md`、`README.zh.md`、`LICENSE` 均已更新；
  - [ ] 发版后验证双平台安装与激活正常。
