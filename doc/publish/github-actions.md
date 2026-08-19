# GitHub Actions 自动化发布指南

本文档介绍如何通过 GitHub Actions 实现基于 Git Tag 的双渠道（VS Code Marketplace + Open VSX）全自动 CI/CD 发布流程。

---

## 1. 前提条件与 Secrets 配置

在启用自动化发布工作流前，必须在 GitHub 仓库中配置好双平台的发布 Token：

1. 打开 GitHub 仓库页面；
2. 进入 **Settings** → **Secrets and variables** → **Actions**；
3. 点击 **New repository secret**，添加以下两个 Secret：
   * **`VSCE_PAT`**: Azure DevOps 生成的具有 `Marketplace (Manage)` 权限的 PAT；
   * **`OVSX_PAT`**: Open VSX 生成的 Access Token。

---

## 2. 工作流配置（.github/workflows/publish.yml）

创建 `.github/workflows/publish.yml` 文件：

```yaml
name: publish

on:
  push:
    tags:
      - "v*"

jobs:
  publish:
    name: Build & Publish Extension
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install Dependencies
        run: npm ci --cache .npm-cache

      - name: Compile TypeScript
        run: npm run compile

      - name: Run Test Suite
        run: npm test

      - name: Package VSIX
        run: npm run package

      - name: Publish to VS Code Marketplace
        uses: HaaLeo/publish-vscode-extension@v1
        with:
          pat: ${{ secrets.VSCE_PAT }}
          registryUrl: https://marketplace.visualstudio.com

      - name: Publish to Open VSX
        uses: HaaLeo/publish-vscode-extension@v1
        with:
          pat: ${{ secrets.OVSX_PAT }}
          extensionFile: "*.vsix"
          registryUrl: https://open-vsx.org
```

---

## 3. 标准发版触发流程

1. **更新版本号**：在 `package.json` 中修改 `version`（例如从 `0.1.0` 改为 `0.1.1`）；
2. **本地测试与提交**：
   ```sh
   npm test
   git add package.json package-lock.json
   git commit -m "chore(release): v0.1.1"
   git push origin main
   ```
3. **打 Tag 并推送到远程**：
   ```sh
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. **工作流自动执行**：
   * GitHub Actions 检测到 `v*` Tag 推送，自动启动 `publish` 工作流；
   * 自动执行测试、打包并并发发布至 VS Code Marketplace 和 Open VSX。

---

## 4. 安全与操作纪律

- **Token 权限最小化**：`VSCE_PAT` 仅授予 Marketplace 范围，不开放 Code 读写权限；
- **禁止本地暴露 Token**：切勿将 Token 硬编码提交至代码库或日志中；
- **严格遵守 Zero Global Commit 策略**：发版版本更新采用显式文件路径提交流程，避免自动脚本产生不可控提交。
