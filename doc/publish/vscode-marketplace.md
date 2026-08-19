# VS Code Marketplace 发布指南

本文档介绍如何将扩展发布至微软官方 [Visual Studio Marketplace](https://marketplace.visualstudio.com/)。

---

## 1. 准备工作（一次性）

### 1.1 创建 Publisher 与 Azure DevOps 组织
1. 访问 [VS Code Marketplace Publisher 管理页](https://aka.ms/vscode-create-publisher)；
2. 使用微软账号登录，并创建/选择一个关联的 **Azure DevOps Organization**；
3. 创建 Publisher ID（本项目为 `floatinghotpot`）。

### 1.2 申请 Personal Access Token (PAT)
1. 登录关联的 Azure DevOps 组织（`https://dev.azure.com/<Your-Org>`）；
2. 点击右上角 **User settings**（用户设置）→ **Personal Access Tokens** → **New Token**；
3. 配置参数：
   * **Name**: `vsce-publish`（或其他易识别名称）
   * **Organization**: 选择 **All accessible organizations** 或当前组织
   * **Scopes**: 点击 **Show all scopes**，找到 **Marketplace**，勾选 **Manage**（⚠️ 注意：不要选 Code 权限，必须是 Marketplace 的 Manage 权限）；
4. 生成并复制 PAT（Token 仅显示一次，请妥善保存）。

### 1.3 本地登录认领
在本地终端执行登录以缓存凭据（凭据保存在 `~/.vsce`）：
```sh
npx --no-install vsce login floatinghotpot
# 在交互提示中粘贴生成的 PAT
```

---

## 2. 发布流程（每次发版）

### 2.1 推荐方式：Makefile
配置环境变量或在已登录状态下直接执行：
```sh
# 方式 A：从环境变量读取 PAT
export VSCE_PAT="your-azure-devops-pat"
make publish-vscode

# 方式 B：已执行过 vsce login，直接发布
make publish-vscode
```

### 2.2 手动底层命令（排查用）
```sh
# 1. 编译并打包
npm run compile
npx --no-install vsce package

# 2. 发布指定 VSIX 文件（使用 --packagePath 避免自动 bump/tag）
npx --no-install vsce publish --packagePath deepseek-harness-web-for-vscode-<version>.vsix
```

---

## 3. 版本更新与撤销下架

- **版本迭代**：在 `package.json` 中修改 `version`（新版本号必须严格大于线上版本），重新打包并执行发布命令；
- **撤销/下架**：
  * 在 [Visual Studio Marketplace 管理后台](https://marketplace.visualstudio.com/manage) 找到对应扩展，选择 **Unpublish**；
  * 或通过 CLI 下架：
    ```sh
    npx --no-install vsce unpublish floatinghotpot.deepseek-harness-web-for-vscode
    ```

---

## 4. 常见问题与排错

### 4.1 429 Too Many Requests / RequestBlockedException (`VSID` Concurrency)
- **现象**: 提示 `Request was blocked due to exceeding usage of resource 'Concurrency' in namespace 'VSID'` 或浏览器访问出现 429。
- **根因**: 微软 Azure DevOps 身份认证接口对当前出口 IP 或账号触发了短时频控限流。
- **对策**:
  1. 等待 2 ~ 5 分钟冷却后重试；
  2. 切换网络环境（如连接手机热点更换出口 IP）；
  3. 如果开启了代理，将 `*.azure.com` / `*.visualstudio.com` 加入直连白名单或切换代理节点。

### 4.2 Publisher 命名与扩展名冲突
- **注意**: VS Code Marketplace 的扩展 ID 具有全局唯一性约束。
- 本扩展官方 ID 已统一为 `floatinghotpot.deepseek-harness-web-for-vscode`。
