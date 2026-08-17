# 发布指南（VS Code Marketplace + Open VSX）

**日期**: 2026-08-17 ｜ 适用于：`floatinghotpot/deepseek-harness-for-vscode`

双渠道信息：
- **Extension ID**：`floatinghotpot.deepseek-harness-web-for-vscode`
- **Marketplace publisher**：`floatinghotpot`（名下 0 扩展，2026-08-17 核实，可认领）
- **Open VSX namespace**：`floatinghotpot`（未创建，需先创建）
- **VSIX**：`npm run package`（当前 25+ 文件，含 icon.png/README/README.zh/LICENSE/nls）

发布前元数据均已就绪：`icon`（128×128 PNG）、`keywords`、`galleryBanner`、`repository`、`engines`、`categories`、nls 双语、LICENSE(MIT)、README.md/README.zh.md。

> **2026-08-17 改名**：原 `name: deepseek-harness-for-vscode` 在 VS Code Marketplace **全局唯一约束下被占用**（`skymecode/deepseek-harness-for-vscode`）→ 改为 `deepseek-harness-web-for-vscode`（v0.0.5 起）。Open VSX 旧条目 `floatinghotpot/deepseek-harness-for-vscode` 停留在 0.0.4，新 ID 双渠道一致。

---

## 一、VS Code Marketplace

### 1. 准备（一次性）
1. 打开 <https://aka.ms/vscode-create-publisher> → 登录（任意微软账号）→ 创建/选择 **Azure DevOps 组织**；
2. 在该组织创建 **Personal Access Token**：
   - 位置：组织 → User settings → Personal Access Tokens → New Token
   - **Scope 必须选 "Marketplace" 下的 "Manage"**（不是 Code 的 scope）
   - 记下 token（只显示一次）
3. 认领 publisher：
   ```sh
   npx --no-install vsce login floatinghotpot
   # 粘贴 PAT；成功则凭据存入 ~/.vsce
   ```

### 2. 发布（每次发版）
```sh
# 1) 先手动 bump 版本（遵循本仓库 git 纪律，不用 vsce 的自动 bump/git 操作）
#    package.json "version": "0.0.2" ...
# 2) 打包
npm run package
# 3) 发布预构建的 vsix（--packagePath 跳过 vsce 的版本号/git 行为）
npx --no-install vsce publish --packagePath deepseek-harness-web-for-vscode-0.0.5.vsix
```

### 3. 更新与撤销
- 再次发布 = 同命令（版本号必须比线上大）；
- 下架：Marketplace 管理页 Unpublish / vsce unpublish。

---

## 二、Open VSX（Antigravity 渠道）

> 官方要求：**Eclipse Foundation 账户 + 签署 Publisher Agreement**（GitHub 登录不够）。
> 来源：<https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions>

### 1. 准备（一次性）
1. **创建 Eclipse 账户**：<https://accounts.eclipse.org/user/register> —— **必须填写 GitHub Username 字段，且与 open-vsx.org 登录用的 GitHub 账号一致**；
2. **登录并签署协议**：open-vsx.org → 右上角头像 → GitHub 授权登录 → 头像 → *Settings* → *Profile* → 点 **Log in with Eclipse** 授权关联 → 成功后 Profile 页出现 **Show Publisher Agreement** 按钮 → 读完点 **Agree**；
3. **创建 Access Token**：Settings → *Access Tokens* → Generate New Token（token 只显示一次，妥善保存）；
4. **创建 namespace（用 CLI，不是网页）**：
   ```sh
   npx --yes ovsx create-namespace floatinghotpot -p <OVSX_TOKEN>
   ```

### 2. 发布
```sh
npx --yes ovsx publish deepseek-harness-web-for-vscode-0.0.5.vsix -p <OVSX_TOKEN>
```

> Open VSX 发布时自动扫描（secret/blocklist/typosquat）——本仓库已通过自检（见安全审计）。

---

## 三、推荐：GitHub Actions 一键双发

手动双发易漏。建议在仓库加发布工作流（**首次发布后可做**）：

`.github/workflows/publish.yml`：
```yaml
name: publish
on:
  push:
    tags: ["v*"]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci --cache .npm-cache
      - run: npm run compile
      - run: npm run package
      - name: Publish to VS Code Marketplace & Open VSX
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
仓库 Settings → Secrets：`VSCE_PAT`、`OVSX_PAT`。发版流程：bump 版本 → 打 tag `v0.0.x` → push tag → 工作流双发。

---

## 四、版本管理约定（本仓库）

- **版本号只在 `package.json` 手动 bump**（0.0.1 → 0.0.2 …），提交经 Batch Plan 批准；
- **vsce 一律用 `--packagePath`**，避免 vsce 自动 bump/tag/commit（与本仓库 Zero Global Commit Policy 冲突）；
- 首次发布后建立 CHANGELOG.md（Marketplace Changes 标签页需要，非首次发布前补）。

## 五、上线前检查清单

- [ ] `npm test` 全绿（当前 20/20）
- [ ] `vsce ls` 产物干净（无 node_modules/.npm-cache/out 之外的杂物）
- [ ] publisher/namespace 已认领（`floatinghotpot` 双渠道）
- [ ] README.md（en）+ README.zh.md + LICENSE 在仓库根
- [ ] `repository` 指向真实仓库
- [ ] 首次发布后：Marketplace 页面补 tags、验证 Antigravity 可装（Open VSX）

*关联文档：README.md ｜ verification.md ｜ TODO.md*
