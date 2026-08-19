# Open VSX 发布指南

本文档介绍如何将扩展发布至 [Open VSX Registry](https://open-vsx.org/)（供 Google Antigravity、VSCodium、Gitpod 等开源生态使用）。

---

## 1. 准备工作（一次性）

> ⚠️ **官方强制要求**：发布至 Open VSX 必须拥有 **Eclipse Foundation 账号** 并签署 **Publisher Agreement**，仅拥有 GitHub 账号授权是不够的。

### 1.1 注册 Eclipse 账号
1. 打开 [Eclipse 注册页面](https://accounts.eclipse.org/user/register)；
2. 填写注册信息，**特别注意：必须填写 GitHub Username 字段，且与登录 open-vsx.org 时使用的 GitHub 账号完全一致**；
3. 查收验证邮件并激活 Eclipse 账号。

### 1.2 绑定并签署 Publisher Agreement
1. 访问 [open-vsx.org](https://open-vsx.org/)，点击右上角头像使用 **GitHub 授权登录**；
2. 进入 **Settings** → **Profile**；
3. 点击 **Log in with Eclipse** 完成账号授权关联；
4. 关联成功后，Profile 页面会出现 **Show Publisher Agreement** 按钮；
5. 点击并阅读协议内容，点击 **Agree** 签署。

### 1.3 申请 Access Token
1. 在 [open-vsx.org](https://open-vsx.org/) 中进入 **Settings** → **Access Tokens**；
2. 点击 **Generate New Token**，复制生成的 Token（仅显示一次）。

### 1.4 创建 Namespace（必须通过 CLI）
在本地终端执行以下命令创建 Namespace（`floatinghotpot`）：
```sh
npx --yes ovsx create-namespace floatinghotpot -p <YOUR_OVSX_TOKEN>
```
*注：也可以使用已封装的 `make namespace`（需先导出 `OVSX_TOKEN` 环境变量）。*

---

## 2. 发布流程（每次发版）

### 2.1 推荐方式：Makefile
在本地环境配置 Token（例如写入 `~/.zshrc`：`export OVSX_TOKEN="xxx"`）：
```sh
make publish-ovsx
```

### 2.2 手动底层命令（排查用）
```sh
# 1. 编译并打包
npm run compile
npx --no-install vsce package

# 2. 发布至 Open VSX
npx --yes ovsx publish deepseek-harness-web-for-vscode-<version>.vsix -p "$OVSX_TOKEN"
```

---

## 3. 安全扫描与审核机制

Open VSX 在每次包上传时会自动执行后台静态扫描：
- **Secret 探测**：扫描包内是否存在泄露的私钥、API Token 等敏感信息；
- **Blocklist & Typosquatting**：防仿冒与恶意代码库黑名单检测；
- 项目已通过合规自检，打包时仅包含 `out/`、`media/`、`package.json`、`README` 等白名单文件。

---

## 4. 常见问题与排错

### 4.1 "User is not authorized" / "Publisher Agreement required"
- **根因**: Eclipse 账号未与 Open VSX Profile 关联，或未在网页端点击签署 *Publisher Agreement*。
- **对策**: 重新进入 `open-vsx.org` -> *Settings* -> *Profile*，确认 Eclipse 绑定状态并确认同意签署协议。

### 4.2 "Namespace does not exist"
- **根因**: 未执行 CLI 创建命名空间操作。
- **对策**: 运行 `npx --yes ovsx create-namespace floatinghotpot -p <TOKEN>` 完成一次性创建。
