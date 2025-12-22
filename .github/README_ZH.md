<div align="center">
  <img src="../public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h3>打造属于你的 Gemini 体验 ✨</h3>
  <p>
    优雅的时间线导航、文件夹管理对话、构建专属提示词库。<br>
    <b>这是 Google Gemini 缺失的那块拼图。</b>
  </p>
  
  <p>
    <img src="https://img.shields.io/badge/Chrome-✓-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
    <img src="https://img.shields.io/badge/Edge-✓-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
    <img src="https://img.shields.io/badge/Firefox-✓-FF7139?style=flat-square&logo=firefox&logoColor=white" alt="Firefox">
    <img src="https://img.shields.io/badge/Safari-✓-000000?style=flat-square&logo=safari&logoColor=white" alt="Safari">
    <img src="https://img.shields.io/badge/Opera-✓-FF1B2D?style=flat-square&logo=opera&logoColor=white" alt="Opera">
    <img src="https://img.shields.io/badge/Brave-✓-FB542B?style=flat-square&logo=brave&logoColor=white" alt="Brave">
  </p>
  <p>
    <img src="https://img.shields.io/github/stars/Nagi-ovo/gemini-voyager?style=flat-square&logo=github" alt="GitHub Star">
    <img src="https://img.shields.io/github/forks/Nagi-ovo/gemini-voyager?style=flat-square&logo=github" alt="GitHub Fork">
    <img src="https://img.shields.io/github/v/release/Nagi-ovo/gemini-voyager?style=flat-square&logo=github" alt="最新版本">
    <img src="https://img.shields.io/chrome-web-store/users/kjdpnimcnfinmilocccippmododhceol?style=flat-square&logo=google-chrome" alt="Chrome 商店用户数">
    <img src="https://img.shields.io/chrome-web-store/rating/kjdpnimcnfinmilocccippmododhceol?style=flat-square&logo=google-chrome" alt="Chrome 商店评分">
  </p>
</div>

<p align="center">
  <a href="https://nagi.fun/gemini-voyager/">📖 文档</a> • 
  <a href="../README.md">English</a>
</p>

---

## 👋 为什么开发 Gemini Voyager？

我们都很喜欢 Gemini，但有时候总觉得它少了一点"秩序感"。

这就是我们开发 **Gemini Voyager** 的初衷。它不仅仅是一个工具，更是一个能帮你把 AI 对话变得井井有条、触手可及的得力助手。无论你是需要处理大量对话的研究人员，还是喜欢收藏代码片段的开发者，亦或是单纯的整理控，Voyager 都是为你准备的。

---

## 📚 目录

- [👋 为什么开发 Gemini Voyager？](#-为什么开发-gemini-voyager)
- [📚 目录](#-目录)
- [✨ 功能特性](#-功能特性)
  - [📍 时间线导航](#-时间线导航)
  - [📂 文件夹管理](#-文件夹管理)
  - [💡 提示词库](#-提示词库)
  - [📐 公式复制](#-公式复制)
  - [💾 对话导出](#-对话导出)
  - [📏 对话宽度调整](#-对话宽度调整)
- [📥 安装方式](#-安装方式)
  - [方式一：手动安装（推荐）](#方式一手动安装推荐)
    - [1）临时安装（开发者模式）—— 简单且安全](#1临时安装开发者模式-简单且安全)
    - [2）永久安装（适用于 Firefox ESR，可安装未签名插件）](#2永久安装适用于-firefox-esr可安装未签名插件)
  - [方式二：Chrome 应用商店（更方便但可能不是最新版）](#方式二chrome-应用商店更方便但可能不是最新版)
- [🛠️ 开发者指南](#️-开发者指南)
  - [Safari 开发](#safari-开发)
- [🌟 相关项目与致谢](#-相关项目与致谢)
- [🤝 参与贡献](#-参与贡献)
- [☕ 支持本项目](#-支持本项目)

---

## ✨ 功能特性

<div align="center">
  <img src="../docs/public/assets/teaser.png" alt="teaser"/>
</div>

### 📍 时间线导航
**再也不在长对话中迷路。**
通过可视化的节点，一眼看清对话结构。
- **瞬间跳转**：点击节点即可直接滚动到对应消息。
- **快速预览**：鼠标悬停即可查看内容，无需来回滚动。
- **标记重点**：长按节点即可星标重要消息（跨标签页同步！）。

### 📂 文件夹管理
**让灵感井井有条。**
告别杂乱无章的历史记录列表。将你的对话拖拽到文件夹中，按照你的逻辑进行分类。
- **两级层级**：支持文件夹和子文件夹，满足深度整理需求。
- **轻松管理**：双击重命名，长按多选。
- **多端同步**：支持导入/导出，让你的整理成果在不同设备间无缝衔接。

<details>
<summary>👀 查看演示</summary>

<table>
  <tr>
    <td align="center" width="50%">
      <p><b>Gemini</b></p>
      <img src="../docs/public/assets/gemini-folders.png" alt="Gemini 文件夹" style="max-width: 100%;"/>
    </td>
    <td align="center" width="50%">
      <p><b>AI Studio</b></p>
      <img src="../docs/public/assets/aistudio-folders.png" alt="AI Studio 文件夹" style="max-width: 100%;"/>
    </td>
  </tr>
</table>

</details>

### 💡 提示词库
**你的私人提示词宝库。**
不要重复编写相同的指令。保存你最常用的提示词，随时随地调用。
- **标签与搜索**：通过标签分类，秒级找到你需要的提示词。
- **全网通用**：不仅支持 Gemini 和 AI Studio，现在更支持添加**自定义网站**，在任何网页使用提示词管理器。

<details>
<summary>👀 查看截图</summary>

<div align="center">
  <img src="../docs/public/assets/gemini-prompt-manager.png" alt="提示词管理器" style="max-width: 100%;"/>
</div>

</details>

### 📐 公式复制
**理科生的福音。**
看到漂亮的 LaTeX 公式想复用？点击一下即可复制源代码，告别手动敲击。

<details>
<summary>👀 查看截图</summary>

<div align="center">
  <img src="../docs/public/assets/gemini-math-copy.png" alt="公式复制" style="max-width: 100%;"/>
</div>

</details>

### 💾 对话导出
**你的数据，你做主。**
将对话以你需要的格式保存下来。
- **多种格式**：结构化的 JSON 或适合打印阅读的 Markdown/PDF。
- **干净纯粹**：自动移除界面上的无关元素，只保留核心内容。
- **完整无缺**：图片会自动打包到 `assets/` 文件夹中。

<details>
<summary>👀 查看导出指南</summary>

<table>
  <tr>
    <td align="center" width="50%">
      <p><b>步骤 1：点击导出图标</b></p>
      <img src="../docs/public/assets/gemini-export-guide-1.png" alt="导出指南步骤 1" style="max-width: 100%;"/>
    </td>
    <td align="center" width="50%">
      <p><b>步骤 2：选择导出格式</b></p>
      <img src="../docs/public/assets/gemini-export-guide-2.png" alt="导出指南步骤 2" style="max-width: 100%;"/>
    </td>
  </tr>
</table>

</details>

### 📏 对话宽度调整

**怎么舒服怎么来。**
屏幕够大？那就利用起来。自定义对话框宽度（400px - 1400px），找到最适合你的阅读体验。

> **设置面板**：点击扩展图标调整滚动模式、对话宽度和时间线选项。

<details>
<summary>查看教程</summary>

<table>
  <tr>
    <td align="center" width="50%">
      <p><b>如何打开设置</b></p>
      <img src="../docs/public/assets/gemini-open-settings-guide.png" alt="打开设置指南" style="max-width: 100%;"/>
    </td>
    <td align="center" width="50%">
      <p><b>对话宽度调整</b></p>
      <img src="../docs/public/assets/gemini-chatwidth.png" alt="对话宽度调整" style="max-width: 100%;"/>
    </td>
  </tr>
</table>

</details>

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

#### 1）临时安装（开发者模式）—— 简单且安全
1. 前往 [项目 Releases 页面](https://github.com/Nagi-ovo/gemini-voyager/releases)，下载 `gemini-voyager-firefox-vX.Y.Z.zip`
2. 解压文件
3. 在 Firefox 中打开 `about:debugging#/runtime/this-firefox`
4. 点击"临时载入附加组件..."
5. 选择解压文件夹中的 `manifest.json` 文件

> 提示：此方法为临时安装，重启 Firefox 后需重新载入。

#### 2）永久安装（适用于 Firefox ESR，可安装未签名插件）
如果你希望永久安装并使用发行版构建，可在 Firefox ESR（Extended Support Release）中允许安装未签名扩展：

1. 安装 [`firefox-esr`](https://www.mozilla.org/zh-CN/firefox/enterprise/)（ESR 版本通常提供以下配置选项）。
2. 地址栏输入 `about:config`，接受风险提示后继续。
3. 搜索 `xpinstall.signatures.required`，将其值设为 `false`。
4. 从 Releases 下载 `gemini-voyager-firefox-vX.Y.Z.xpi`。
5. 将 `.xpi` 文件拖入已打开的 Firefox ESR 窗口，或通过附加组件管理器安装该文件。

注意事项：
- 关闭签名校验会降低浏览器安全性，请仅在信任的构建下使用此方法。
- 该偏好项通常只在 Firefox ESR 可用；在新版标准 Firefox 中可能不可用。如果找不到该选项，请使用临时安装或等待官方签名发布。
- 安装完成后，根据需要决定是否保留 `xpinstall.signatures.required` 为 `false`，或在不再需要未签名扩展时切回 `true`。
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

### Safari 开发

Safari 需要额外的构建步骤。查看 [safari/README_ZH.md](../safari/README_ZH.md) 了解：
- 从源代码构建
- 开发工作流与自动重载
- 添加 Swift 原生代码
- 调试与发布

开发规范和最佳实践请参考 [CONTRIBUTING.md](./CONTRIBUTING.md)。
</details>

---

## 🌟 相关项目与致谢

- **[DeepSeek Voyager](https://github.com/Azurboy/deepseek-voyager)** - Gemini Voyager 的 Fork 版本，为 DeepSeek 适配，为 DeepSeek 用户带来时间线导航和对话管理功能！

- **[ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline)** - 为 ChatGPT 设计的时间线导航扩展，本项目的灵感来源：Gemini Voyager 为 Gemini 适配了时间线概念，并添加了文件夹管理、提示词库、聊天导出等大量新功能。


## 🤝 参与贡献
[<img src="https://devin.ai/assets/askdeepwiki.png" alt="Ask DeepWiki" height="20"/>](https://deepwiki.com/Nagi-ovo/gemini-voyager )

欢迎参与贡献！无论是报告问题、提出功能建议、改进文档还是提交代码：

- **Issue**：使用我们的 [Bug 报告模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md)或[功能请求模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md)
- **Pull Request**：查看[贡献指南](./CONTRIBUTING.md)了解详细说明

感谢你帮助 Gemini Voyager 变得更好！❤️

---

## ☕ 支持本项目

<div align="center">
  <a href="https://github.com/Nagi-ovo/gemini-voyager">
    <img src="https://raw.githubusercontent.com/Nagi-ovo/gemini-voyager/main/docs/public/assets/sponsors.svg" width="1000px" />
  </a>
</div>

如果 Gemini Voyager 让你的工作效率提升了，不妨请我喝杯咖啡，这将支持我持续维护和更新！

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
        <img src="../docs/public/assets/wechat-sponsor.png" alt="微信支付" width="200"><br>
        <sub><b>微信支付</b></sub>
      </td>
      <td align="center">
        <img src="../docs/public/assets/alipay-sponsor.jpg" alt="支付宝" width="200"><br>
        <sub><b>支付宝</b></sub>
      </td>
    </tr>
  </table>
</div>

---

<div align="center">
  <a href="https://www.star-history.com/#Nagi-ovo/gemini-voyager&type=date&legend=top-left">
   <picture>
     <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Nagi-ovo/gemini-voyager&type=date&theme=dark&legend=top-left" />
     <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Nagi-ovo/gemini-voyager&type=date&legend=top-left" />
     <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Nagi-ovo/gemini-voyager&type=date&legend=top-left" />
   </picture>
  </a>
  
  <p>Made with ❤️ by Jesse Zhang</p>
  <sub>MIT License © 2025</sub>
</div>
</content>