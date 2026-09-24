# DSH4VS Code 文案（兼容 dsh 0.1.7-rc.1，v0.3.6）

**日期**: 2026-09-24 ｜ **平台**: 小红书（可复用至博客/公众号）｜ **状态**: 待发布

---

## 标题

dsh4vscode 已抢鲜适配 deepseek harness 0.1.7-rc.1

## 正文

把 dsh 升到 **0.1.7-rc.1** 之后，打开 VS Code 里的 DSH 面板，是不是看到这句报错：

> Failed to load plugins — client-modules: HTML did not preload ...

别慌，不是你装错了，也不是 dsh 坏了 🙂

**发生了啥**
dsh 0.1.7 换了前端资源的引用方式——插件地址从「绝对路径」改成「相对路径」。扩展加载面板时还照着老地址去找，找不到，插件系统就起不来，面板自然空白了。就像朋友搬了家没告诉你新门牌号 🏠

**已经修好了（v0.3.6）**
- 三种地址写法（相对 / `./` 相对 / 绝对）现在全认得，自动还原成正确地址
- dsh 新增的 `favicon-dark.svg` 也一并处理
- 旧版本行为**完全不变**——0.1.5 与 0.1.7 均实测通过 ✅

**顺手还修了一个**（v0.3.5）
内嵌面板的「设置 → Models」之前打不开、设置改完也不保存；现在都正常了。

**怎么升级**
1. 更新 dsh：`npm i -g @deepseek-ai/dsh`
2. 扩展更新到 **v0.3.6**（Antigravity / Open VSX 可直接搜到；VS Code 的商店条目还在恢复中，暂时从 GitHub Releases 下 `.vsix` 安装）
3. 装 VSIX 的话，**装完重启一次 VS Code**（只 Reload Window 可能残留旧状态）
4. 侧边栏点 DSH 图标即可开工

免费开源 MIT，用得上就收藏 ✨

## 话题标签

#DeepSeek #DeepSeekHarness #DSH #AI编程 #VSCode #Antigravity #开源 #效率工具 #程序员日常
