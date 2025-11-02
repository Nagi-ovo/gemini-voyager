<div align="center">
  <img src="../public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h3>让 Gemini 体验更上一层楼 ✨</h3>
  <p>优雅的时间线导航、文件夹管理对话、保存常用提示词——这一个强大的扩展就够了</p>
</div>

<p align="center">
  <a href="../README.md">English</a>
</p>

---

## 🚀 快速安装

<div align="center">
  <a href="https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol?utm_source=item-share-cb" target="_blank">
    <img src="https://img.shields.io/badge/立即安装-Chrome%20应用商店-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="从 Chrome 应用商店安装" height="60">
  </a>

  <p><b>适用于所有 Chromium 浏览器：Chrome、Edge、Opera、Brave、Vivaldi、Arc 等</b></p>

  <details>
  <summary><i>使用 Edge 或 Opera？点击查看安装说明</i></summary>
  <br>
  <p align="left">
    <b>Microsoft Edge 用户：</b><br>
    1. 点击上方按钮访问 Chrome 应用商店<br>
    2. 浏览器会提示"允许来自其他商店的扩展"<br>
    3. 点击"允许"后即可正常安装<br>
    <br>
    <b>Opera 用户：</b><br>
    1. 先安装 <a href="https://addons.opera.com/extensions/details/install-chrome-extensions/">Install Chrome Extensions</a>（Opera 官方扩展）<br>
    2. 然后点击上方安装按钮<br>
    3. 像在 Chrome 上一样安装即可<br>
    <br>
    <b>Brave、Vivaldi、Arc 等其他 Chromium 浏览器：</b><br>
    直接点击上方安装按钮即可使用，无需任何额外步骤！
  </p>
  </details>

  <p><i>Firefox 版本即将推出！</i></p>
</div>

---

## ✨ 功能介绍

**Gemini Voyager** 通过四大强大功能提升你的 Gemini 聊天体验：

<div align="center">
  <img src="../public/teaser.png" alt="teaser"/>
</div>

### 📍 交互式时间线

全新的对话导航体验：
- **可视化导航**：所有消息以可点击的节点形式展示在时间线上
- **快速预览**：鼠标悬停即可预览消息内容
- **标记重要消息**：长按节点可添加星标，星标会在所有标签页间自动同步
- **始终同步**：自由滚动页面，时间线始终与聊天内容保持完美对齐

### 📂 文件夹管理器

让对话井井有条：
- **拖放操作**：直接从侧边栏拖动对话到文件夹中
- **两级组织结构**：创建文件夹和子文件夹，让分类更清晰
- **智能图标**：自动识别不同的 Gem 类型并显示专属图标（学习教练、编程助手、写作编辑等）
- **流畅切换**：在对话间即时切换，无需刷新页面
- **持久化存储**：文件夹结构保存在浏览器本地，多个 Gemini 账号（u/0、u/1 等）共享同一套文件夹

### 💡 提示词管理器

打造专属提示词库：
- **保存复用**：保存常用提示词并添加自定义标签
- **即时搜索**：通过关键词快速找到所需提示词
- **一键复制**：单击即可复用提示词
- **导入导出**：以 JSON 格式分享你的提示词库
- **全平台支持**：在 Gemini 和 AI Studio 上都能使用

### 💾 导出聊天记录

轻松保存对话内容：
- **一键导出**：点击 Gemini 徽标旁的导出图标即可
- **结构化格式**：获得干净、易读的 JSON 格式聊天记录
- **保留星标**：导出时会保留你标记的星标消息
- **自动清理**：自动移除"显示思路"等界面标签，让数据更纯净

<details>
<summary>导出格式示例</summary>

```json
{
  "format": "gemini-voyager.chat.v1",
  "url": "https://gemini.google.com/app/...",
  "exportedAt": "2025-01-01T12:34:56.000Z",
  "count": 3,
  "items": [
    { "user": "...", "assistant": "...", "starred": true }
  ]
}
```
</details>

---

## 📥 安装方式

### 方式一：Chrome 应用商店（推荐）

最简单的安装方法：

1. **访问 Chrome 应用商店**：[安装 Gemini Voyager](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol?utm_source=item-share-cb)
2. **点击"添加至 Chrome"**
3. **大功告成！** 扩展会自动在 Gemini 上激活

**适用于：** Chrome、Edge、Opera 及其他 Chromium 内核浏览器

### 方式二：手动安装（进阶）

适合开发者或偏好手动安装的用户：

#### 在 Chromium 浏览器上安装（Chrome / Edge / Opera）

1. 前往[项目 Releases 页面](https://github.com/Nagi-ovo/gemini-voyager/releases)，下载最新的 `gemini-voyager-chrome-vX.Y.Z.zip`
2. 解压到任意文件夹（可看到根目录下的 `manifest.json` 文件）
3. 打开浏览器的扩展管理页面并启用"开发者模式"：
   - Chrome：访问 `chrome://extensions`
   - Edge：访问 `edge://extensions`
   - Opera：访问 `opera://extensions`
4. 点击"加载已解压的扩展程序"
5. 选择刚才解压的文件夹（如 `Gemini Voyager vX.Y.Z`）

#### 在 Firefox 上安装

1. 前往[项目 Releases 页面](https://github.com/Nagi-ovo/gemini-voyager/releases)，下载 `gemini-voyager-firefox-vX.Y.Z.zip`
2. 解压文件
3. 在 Firefox 中打开 `about:debugging#/runtime/this-firefox`
4. 点击"临时载入附加组件..."
5. 选择解压文件夹中的 `manifest.json` 文件

---

## 🛠️ 开发者指南

想要参与贡献或自定义扩展？以下是开发环境配置方法：

```bash
# 安装依赖（推荐使用 Bun）
bun i

# Chrome 开发模式
bun run dev:chrome

# Firefox 开发模式
bun run dev:firefox
```

或使用 pnpm：
```bash
pnpm install
pnpm run dev:chrome  # Chrome
pnpm run dev:firefox # Firefox
```

开发规范和最佳实践请参考 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 🙏 致谢

灵感来源于 [ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline)。我们为 Gemini 适配了时间线概念，并添加了文件夹管理、提示词库、聊天导出等大量新功能。


## 🤝 参与贡献

欢迎所有人参与贡献！无论你想要：
- 🐛 报告 Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🔧 提交代码改进

**开始参与：**
- **Bug 报告**：使用我们的 [Bug 报告模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md)
- **功能建议**：使用我们的[功能请求模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md)
- **Pull Request**：查看[贡献指南](./CONTRIBUTING.md)了解详细说明

感谢你帮助 **Gemini Voyager** 变得更好！❤️

---

<div align="center">
  <p>用 ❤️ 为 Gemini 社区打造</p>
  <p>觉得有用的话，请给我们点个 ⭐ 吧！</p>
</div>
