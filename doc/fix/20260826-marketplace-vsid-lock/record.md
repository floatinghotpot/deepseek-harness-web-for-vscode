# 事件记录 — Marketplace 发布通道被 VSID 并发锁卡死 + 扩展从 Marketplace 消失

**日期**: 2026-08-26 ｜ **影响**: publisher 全部 Marketplace 发布/管理 API（含只读 `vsce verify-pat`）
**状态**: ✅ 微软已回复（2026-08-26）：扩展已移除（名称永久作废）、publisher 进入 30 天冷却期；整改后可申请复审恢复

## 现象（时间线）

- **2026-08-19 起**：所有指向 Marketplace 发布 API 的调用被拦截，报
  `Request was blocked due to exceeding usage of resource 'Concurrency' in namespace 'VSID'`
  （`RequestBlockedException`, eventId 3000）——包括 **只读的 `vsce verify-pat`**；
- 停止全部 Marketplace 调用 **>24h** 后拦截依旧 → 判定为**账号级后端锁**，而非临时节流；
- 同期扩展 `deepseek-harness-web-for-vscode`（0.1.0 及更早版本**发布正常**）从 Marketplace
  公开列表**消失**；
- **Open VSX 渠道完全正常**：0.0.6–0.3.3 全版本在售，下载 3048。

## 排查事实（外部 API 实查）

| 检查 | 结果 |
|---|---|
| 条目页 `items?itemName=floatinghotpot.deepseek-harness-web-for-vscode` | 404 |
| Gallery API fqname 精确查询（新 id 与 0.0.1–0.0.4 用过的旧 id 均查） | 0 条结果 |
| Marketplace publisher 落地页 | 账号存在且 verified（2026-08-17 创建），页面扩展列表 JSON 为空 `"extensions":[]` |
| 换第二个有效 PAT（Marketplace>Manage 作用域） | 同样被拦 → **锁在账号/命名空间级，与令牌无关** |
| 直连 / VPN | 相同错误 → **非网络问题** |
| 同赛道竞品（`deepseek-harness-for-vscode-plugin` 等 8 个近名扩展，首发 08-15~08-23） | **全部在线** → 排除"按竞品清理"，问题特定于本 publisher |
| Wayback Machine / 搜索引擎索引 | 无条目页快照（404 页不被收录，正常） |

## 微软回复（2026-08-26，原文引用）

> Hi @Liming Xie,
>
> Thank you for reaching out.
> Your publisher is blocked and the extension is removed in accordance with the Visual Studio
> Marketplace Publisher Agreement (https://aka.ms/vsmarketplace-agreement) and the Visual Studio
> Marketplace Terms of Use (https://aka.ms/vsmarketplace-ToU).
> As per the Visual Studio Marketplace policy, a mandatory cooldown period of 30 days is required
> before any reinstatement, and extensions are not reinstated after removal.
>
> We request that you reach out to us again after the completion of the cooldown period. At that
> time, we will review your request based on the applicable policy and required remediation.
> For additional context on our security and trust practices, please refer to the Visual Studio
> Marketplace Security and Trust blog
> (https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace.)
> Thank you for your understanding and cooperation.
> Regards,
> VS Marketplace Support Team.
> (representative: bc72cb2e)

## 关键结论（依据回复 + 官方规则）

- 扩展为 **removed（移除）** 而非 unpublished → **扩展名 `deepseek-harness-web-for-vscode` 永久作废**
  （官方规则：移除后名称永久保留，原 publisher 也不能再用）；
- publisher 进入 **30 天强制冷却期**，期满后需主动联系，按"适用政策 + 所需整改"复审；
- 移除的扩展**不予恢复** → 重新上架必须换新名；
- 回复未指明具体违规条款（模板化引用协议 + ToU），确切原因预计在冷却期后复审中披露。

## 根因分析（基于官方政策文档 + 代码事实）

**已排除**：

- 竞品清理：同赛道 8 个近名扩展全部在线；Marketplace 本身容纳大量 Copilot 直接竞品；
- 令牌/限流：VSID 并发锁为移除流程的连带机制（微软版主确认服务端计数器卡死、需人工清除）；
- Listing 披露不足（协议 §8(d)）：README 已明确披露 spawn 子进程、回环绑定、传输桥中继。

**最可能原因（按概率排序）**：

1. **安全审查命中"恶意扩展模板"特征（最可能）**：架构 = spawn 本地服务器 + webview 加载外部
   Web 应用 + 传输桥代发 fetch/WS/剪贴板，与数据外泄型恶意扩展的经典模板高度相似；README
   披露的"剪贴板读写无权限弹窗桥接"为审核敏感点。官方博客确认：移除前经安全工程师人工复核，
   且现有扩展会被定期重扫（rescan）——08-19（0.2.0 发布尝试日）正处窗口。
2. **社区举报触发复审（很可能）**：8+ 近名扩展的拥挤赛道 + DeepSeek 热点；对应协议
   §(g)(v) "complaint(s) about the content or quality"。
3. **publisher 账号良好状态 / 验证缺失（存在）**：域名未验证（`isDomainVerified:false`）；
   新账号（08-17 创建）三天内即出问题。

## 处置

- 2026-08-26：按版主指引发邮件至 `vsmarketplace@microsoft.com`（publisher 名 + publisherId +
  错误日志 + 时间线 + 扩展安全说明 6 点，全部基于代码事实）；
- 2026-08-26：微软回复（见上，原文引用）——确认移除 + 30 天冷却期。

## 验证（进行中）

- 冷却期（按回复 08-26 起算 → 保守 **2026-09-25 后**再联系；需回信确认精确起点）结束后复审；
- 复审通过后：换新扩展名 → `vsce verify-pat` → `make publish-vscode-only` 重新发布。

## 后续建议（待办）

- [ ] 回信 vsmarketplace@microsoft.com 确认：① 冷却期精确起点/结束日；② 具体违规条款
      （要求指明，以便对症整改）；
- [ ] **新扩展名策略（已决策 2026-08-26）**：Marketplace 用**专用 id**，Open VSX / GitHub 项目名
      `deepseek-harness-web-for-vscode` **保持不变**（不牺牲 Open VSX 3048 下载与仓库命名）。
      实现方式：同一源码 + Marketplace 专属 manifest（发布时以另一个 `name` 打专属 vsix，仅发
      Marketplace）。候选名（公开查询初步未见占用，最终以发布时校验为准）：
      `deepseek-harness-web` / `deepseek-harness-vscode-web` / `deepseek-harness-ide` /
      `dsh-ide` / `dsh-web-bridge` / `dsh-ide-bridge`。注意：双 id = VS Code 视角下为两个扩展
      （用户不可同时安装两渠道版本）；移除扩展的 displayName 是否释放待冷却期后向微软确认；
- [ ] 整改清单（复审前完成）：README 强化安全声明 + 新增 SECURITY.md（全部回环、零外传、
      可审计）；完成 publisher 域名验证（isDomainVerified:false → true）；评估扩展代码签名
      （vsce signing）；软化剪贴板桥的敏感描述；
- [ ] 冷却期满后按"适用政策 + 整改"提交复审；
- [ ] 发布成功后吊销本轮全部 PAT；评估 Entra ID 自动化发布（2026-12-01 全局 PAT 退役）；
- [ ] 后续跟进帖：微软 Q&A 提问帖（版主 08-24/08-26 仍在主动询问进展）。

*关联文档：doc/publish/README.md ｜ doc/publish/vscode-marketplace.md ｜ CHANGELOG.md*
