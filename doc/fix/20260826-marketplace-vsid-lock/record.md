# 事件记录 — Marketplace 发布通道被 VSID 并发锁卡死 + 扩展从 Marketplace 消失

**日期**: 2026-08-26 ｜ **影响**: publisher 全部 Marketplace 发布/管理 API（含只读 `vsce verify-pat`）
**状态**: 已按微软官方渠道邮件联系 Marketplace Operations，**待回复**

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

## 根因（微软官方确认）

微软 Q&A 版主（Microsoft External Staff）在公开提问帖回复确认：

> "The RequestBlockedException on the VSID Concurrency namespace indicates a **server-side rate
> limit lock** within the VS Marketplace backend… your account concurrency counter is stuck on the
> backend and **requires manual administrative clearing**."

即：账号的 VSID 并发计数器在 Marketplace 服务端**卡死**，只能由微软人工清除；社区版主无权限
重置。官方给出的最快渠道 = 直接邮件 `vsmarketplace@microsoft.com`（附 publisher 名、账号邮箱、
错误日志请求清除）。

扩展消失的**具体原因（removed vs unpublished）尚待微软回复确认**——不排除自动化安全审查误伤
（扩展架构为 spawn 本地 `dsh web` + 回环代发 fetch/WS，属"代理流量"模式，是扫描器重点目标）。

## 处置

- 2026-08-26：已按版主指引发邮件至 `vsmarketplace@microsoft.com`，内容含：
  - publisher 名 + publisherId（公开信息）+ 错误日志 + 时间线（>24h 空窗无效、换 PAT 无效、Open VSX 正常）；
  - 两个问题：① 清除并发锁；② 确认扩展是 removed 还是 unpublished、若 removed 则原因及名称是否仍保留；
  - 扩展安全说明（6 点，全部基于代码事实）：仅回环绑定 127.0.0.1、桥只代发到本地 dsh、webview
    CSP `connect-src 'none'`、无遥测/分析/数据采集、唯一出站为 24h 门控的 npm 版本检查（只 GET 无数据）、
    LLM 外呼由用户自己的本地 dsh 进程按用户配置发起。

## 验证（进行中）

- 待微软回复确认锁已清除 → 执行 `vsce verify-pat floatinghotpot` 一次验证 → 通过后
  `make publish-vscode-only` 发布 0.3.3（vsix 已打包）。

## 后续建议（待办）

- [ ] 微软回复后确认扩展状态：**unpublished** → 直接恢复发布；**removed** → 扩展名永久保留，
      需评估换名重发（注意 `package.json` name 为 Marketplace/Open VSX 共用 id，改名会新建双渠道条目）；
- [ ] 发布成功后吊销本轮用过的全部 PAT，改为发布前临时生成（或迁移 Entra ID 自动化发布，
      2026-12-01 起 Azure DevOps 全局 PAT 退役）；
- [ ] 若确认安全审查误伤：README 补充"仅回环连接、无数据外传、开源可审计"说明，降低再发误伤概率；
- [ ] 后续跟进帖：微软 Q&A 提问帖（版主 08-24/08-26 仍在主动询问进展）。

*关联文档：doc/publish/README.md ｜ doc/publish/vscode-marketplace.md ｜ CHANGELOG.md*
