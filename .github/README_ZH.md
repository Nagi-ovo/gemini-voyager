<div align="center">
  <img src="public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h5>一个为 Gemini 聊天添加丝滑交互时间线的 Chrome 扩展。</h5>
</div>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol?utm_source=item-share-cb" target="_blank">
    <img alt="Chrome Web Store" src="https://img.shields.io/badge/安装-Chrome%20Web%20Store-4285F4?logo=google-chrome&logoColor=white">
  </a>
</p>

## 简介 <a name="intro"></a>

**Gemini Voyager** 让你在 `https://gemini.google.com/app` 上的聊天体验焕然一新，新增了一个精致、交互式的时间线，灵感源自 [AI Studio](https://aistudio.google.com/) 的直观流程：

<div align="center">
  <img src="public/teaser.png" alt="teaser"/>
</div>

### 时间线

- 你的消息会映射为时间线节点，点击可跳转或平滑滚动到对应消息。
- 悬停节点可预览消息内容（3 行截断并渐变淡出）。
- 长按节点可加**星标**，星标会在所有标签页间同步。
- 强大的 SPA 观察器确保你滚动时活跃状态始终同步。

### Prompt 管理器

- 保存常用 prompt，支持标签、关键词搜索与一键复制
- 支持 JSON 导入/导出你的 prompt 集合
- 浮动小面板锚定在触发图标，支持锁定位置；适配 Gemini 与 AI Studio

### 文件夹管理器

- 使用文件夹和子文件夹整理对话（支持两级结构）
- 从侧边栏直接拖放对话到文件夹
- 自动识别 Gem 类型并显示专属图标（学习教练、头脑风暴伙伴、职业指导等）
- 在对话间无缝切换，无需刷新页面

### 导出聊天记录

- 在 Gemini 页面左上角 Logo 旁会出现一个导出图标，点击即可下载当前页面的聊天记录 JSON。
- 导出文件采用 `gemini-voyager.chat.v1` 格式，包含：
  - `url`、`exportedAt`、`count`
  - `items`：按顺序的 `{ user, assistant, starred }`
    - `starred` 与时间线中的星标保持一致（基于用户回合）
    - 助手文本会排除页面上的思维开关标签（如“显示思路/Show thinking”）

示例结构：

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

## TODOs <a name="todos"></a>

- [x] 支持提示词管理（Prompt Management）
- [x] 支持导出当前聊天记录
- [ ] 更多功能敬请期待...

## 快速开始 <a name="gettingStarted"></a>

已支持浏览器：Chrome、Edge（Chromium）、Opera（Chromium）、Firefox。

### 从商店安装（推荐）

- Chrome / Edge / Opera：从 Chrome 网上应用店安装：[打开商店](<!-- REPLACE_WITH_CHROME_WEB_STORE_URL -->)
- Firefox：从 Firefox 附加组件安装：[打开商店](<!-- REPLACE_WITH_FIREFOX_ADDONS_URL -->)

### 手动安装（ZIP）

如需手动安装：

#### 加载扩展（Chromium：Chrome / Edge / Opera）

1. 前往项目的 Releases 页面，下载最新版 `gemini-voyager-chrome-vX.Y.Z.zip`。
2. 解压到任意文件夹（根目录可见 `manifest.json`）。
3. 打开浏览器扩展页面并开启“开发者模式”：
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`
   - Opera：`opera://extensions`
4. 点击“加载已解压”/“Load unpacked”。
5. 选择解压的文件夹（例如 `Gemini Voyager vX.Y.Z`）。

#### 加载扩展（Firefox）

1. 前往 Releases 页面下载 `gemini-voyager-firefox-vX.Y.Z.zip`。
2. 解压。
3. 在 Firefox 打开 `about:debugging#/runtime/this-firefox`。
4. 点击“Load Temporary Add-on…”。
5. 选择解压目录中的 `manifest.json`。

### 本地开发（推荐 Bun）

```bash
bun i
# Chrome 开发
bun run dev:chrome
# Firefox 开发
bun run dev:firefox
```

或 `pnpm`:

```bash
pnpm install
# Chrome 开发
pnpm run dev:chrome
# Firefox 开发
pnpm run dev:firefox
```


## 参考

灵感来源于“[ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline)”。
我们针对 Gemini 适配了时间线映射和观察者模式，并扩展了 UI/UX。

## 贡献指南 <a name="contributing"></a>
欢迎所有的 Pull Request 和 Issue！

开发规范、最佳实践以及添加新 Gem 的说明，请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

提交 Issue 前，请先查阅我们的 [Bug 报告模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md) 和 [功能请求模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md)，以便我们高效处理你的反馈。

感谢你帮助改进 **Gemini Voyager** ！
