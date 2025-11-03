<div align="center">
  <img src="../public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h3>让 Gemini 体验更上一层楼 ✨</h3>
  <p>优雅的时间线导航、文件夹管理对话、保存常用提示词——这一个强大的扩展就够了</p>
  
  <p>
    <img src="https://img.shields.io/badge/Chrome-✓-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
    <img src="https://img.shields.io/badge/Edge-✓-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
    <img src="https://img.shields.io/badge/Firefox-✓-FF7139?style=flat-square&logo=firefox&logoColor=white" alt="Firefox">
    <img src="https://img.shields.io/badge/Safari-✓-000000?style=flat-square&logo=safari&logoColor=white" alt="Safari">
    <img src="https://img.shields.io/badge/Opera-✓-FF1B2D?style=flat-square&logo=opera&logoColor=white" alt="Opera">
    <img src="https://img.shields.io/badge/Brave-✓-FB542B?style=flat-square&logo=brave&logoColor=white" alt="Brave">
  </p>
</div>

<p align="center">
  <a href="../README.md">English</a>
</p>

---

## ✨ 功能介绍

**Gemini Voyager** 通过五大强大功能提升你的 Gemini 聊天体验：

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

### 📏 自定义对话宽度

个性化你的阅读体验：
- **宽度自由调整**：通过交互式滑块在 400px 至 1400px 之间自由设置
- **实时预览**：拖动滑块即可立即看到效果
- **自动保存**：设置会自动保存并同步到所有标签页

---

## 📥 安装方式

> **⚠️ 推荐：** 从 [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下载最新版本  
> Chrome 应用商店的版本可能因审核延迟而不是最新的

### 方式一：手动安装（推荐）

**Chromium 浏览器（Chrome、Edge、Opera、Brave、Vivaldi、Arc）：**

1. 前往[项目 Releases 页面](https://github.com/Nagi-ovo/gemini-voyager/releases)，下载最新的 `gemini-voyager-chrome-vX.Y.Z.zip`
2. 解压到任意文件夹（可看到根目录下的 `manifest.json` 文件）
3. 打开浏览器的扩展管理页面并启用"开发者模式"：
   - Chrome：访问 `chrome://extensions`
   - Edge：访问 `edge://extensions`
   - Opera：访问 `opera://extensions`
4. 点击"加载已解压的扩展程序"
5. 选择刚才解压的文件夹

<details>
<summary>Firefox 安装方法</summary>

1. 前往 [项目 Releases 页面](https://github.com/Nagi-ovo/gemini-voyager/releases)，下载 `gemini-voyager-firefox-vX.Y.Z.zip`
2. 解压文件
3. 在 Firefox 中打开 `about:debugging#/runtime/this-firefox`
4. 点击"临时载入附加组件..."
5. 选择解压文件夹中的 `manifest.json` 文件
</details>

<details>
<summary>Safari 安装方法</summary>

1. 从 [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下载 `gemini-voyager-safari-vX.Y.Z.zip`
2. 解压并转换：`xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"`
3. 在 Xcode 中打开并运行（⌘R）
4. 在 Safari → 设置 → 扩展中启用

**系统要求：** macOS 11+、Xcode Command Line Tools（`xcode-select --install`）、Safari 14+

**注意：** 本地使用无需 Apple Developer 账号！详细说明请查看 [安装指南](../.github/docs/safari/INSTALLATION_ZH.md)。
</details>

### 方式二：Chrome 应用商店（更方便但可能不是最新版）

<div align="center">
  <a href="https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol?utm_source=item-share-cb" target="_blank">
    <img src="https://img.shields.io/badge/从这里安装-Chrome%20应用商店-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="从 Chrome 应用商店安装" height="50">
  </a>
</div>

最简单的安装方法，但可能没有最新功能：

1. 点击上方按钮访问 Chrome 应用商店
2. 点击"添加至 Chrome"
3. 扩展会自动在 Gemini 上激活

**适用于：** Chrome、Edge、Opera、Brave、Vivaldi、Arc 等所有 Chromium 浏览器

<details>
<summary>Edge 和 Opera 用户的安装说明</summary>

**Microsoft Edge 用户：**
1. 通过上方按钮访问 Chrome 应用商店
2. 浏览器会提示"允许来自其他商店的扩展"
3. 点击"允许"后即可正常安装

**Opera 用户：**
1. 先安装 [Install Chrome Extensions](https://addons.opera.com/extensions/details/install-chrome-extensions/)（Opera 官方扩展）
2. 然后访问 Chrome 应用商店
3. 像在 Chrome 上一样安装即可

**Brave、Vivaldi、Arc 等其他 Chromium 浏览器：**  
无需任何额外步骤，直接从 Chrome 应用商店安装即可！
</details>

---

## 🛠️ 开发者指南

<details>
<summary>点击查看开发环境配置方法</summary>

想要参与贡献或自定义扩展？以下是开发环境配置方法：

```bash
# 安装依赖（推荐使用 Bun）
bun i

# 开发模式（支持热重载）
bun run dev:chrome   # Chrome 和 Chromium 浏览器
bun run dev:firefox  # Firefox
bun run dev:safari   # Safari（需要 macOS）

# 生产构建
bun run build:chrome   # Chrome
bun run build:firefox  # Firefox
bun run build:safari   # Safari
bun run build:all      # 所有浏览器
```

或使用 npm/pnpm：
```bash
pnpm install
pnpm run dev:chrome    # Chrome
pnpm run dev:firefox   # Firefox
pnpm run dev:safari    # Safari（仅限 macOS）
```

### Safari 开发

Safari 需要额外的构建步骤。查看 [safari/README_ZH.md](../safari/README_ZH.md) 了解：
- 从源代码构建
- 开发工作流与自动重载
- 添加 Swift 原生代码
- 调试与发布

开发规范和最佳实践请参考 [CONTRIBUTING.md](./CONTRIBUTING.md)。
</details>

---

## 🙏 致谢

灵感来源于 [ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline)。我们为 Gemini 适配了时间线概念，并添加了文件夹管理、提示词库、聊天导出等大量新功能。


## 🤝 参与贡献

欢迎参与贡献！无论是报告问题、提出功能建议、改进文档还是提交代码：

- **Issue**：使用我们的 [Bug 报告模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md)或[功能请求模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md)
- **Pull Request**：查看[贡献指南](./CONTRIBUTING.md)了解详细说明

感谢你帮助 Gemini Voyager 变得更好！❤️

---

## ☕ 支持本项目

如果你觉得 **Gemini Voyager** 对你有帮助，欢迎请我喝杯咖啡！你的支持能让这个项目持续发展。

<div align="center">
  <a href="https://www.buymeacoffee.com/Nag1ovo" target="_blank">
    <img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" >
  </a>
</div>

<div align="center">
  <p><b>或通过微信/支付宝赞助：</b></p>
  <table>
    <tr>
      <td align="center">
        <img src="../public/wechat-sponsor.png" alt="微信支付" width="200"><br>
        <sub><b>微信支付</b></sub>
      </td>
      <td align="center">
        <img src="../public/alipay-sponsor.jpg" alt="支付宝" width="200"><br>
        <sub><b>支付宝</b></sub>
      </td>
    </tr>
  </table>
</div>

---

<div align="center">
  <p>用 ❤️ 为 Gemini 社区打造</p>
  <p>觉得有用的话，请给我们点个 ⭐ 吧！</p>
</div>
