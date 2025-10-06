<div align="center">
  <img src="public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h5>一个为 Gemini 聊天添加丝滑交互时间线的 Chrome 扩展。</h5>
</div>

## 简介 <a name="intro"></a>

**Gemini Voyager** 让你在 `https://gemini.google.com/app` 上的聊天体验焕然一新，新增了一个精致、交互式的时间线，灵感源自 [AI Studio](https://aistudio.google.com/) 的直观流程：

<div align="center">
  <img src="public/teaser.png" alt="teaser"/>
</div>

- 你的消息会映射为时间线节点，点击可跳转或平滑滚动到对应消息。
- 悬停节点可预览消息内容（3 行截断并渐变淡出）。
- 长按节点可加**星标**，星标会在所有标签页间同步。
- 强大的 SPA 观察器确保你滚动时活跃状态始终同步。

## 快速开始 <a name="gettingStarted"></a>

已支持浏览器：Chrome、Edge（Chromium）、Opera（Chromium）、Firefox。

### 加载扩展（Chromium：Chrome / Edge / Opera）

1. 前往项目的 Releases 页面，下载最新版 `gemini-voyager-chrome-vX.Y.Z.zip`。
2. 解压到任意文件夹（根目录可见 `manifest.json`）。
3. 打开浏览器扩展页面并开启“开发者模式”：
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`
   - Opera：`opera://extensions`
4. 点击“加载已解压”/“Load unpacked”。
5. 选择解压的文件夹（例如 `Gemini Voyager vX.Y.Z`）。

### 加载扩展（Firefox）

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

## 参考

灵感来源于“[ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline)”。
我们针对 Gemini 适配了时间线映射和观察者模式，并扩展了 UI/UX。

## 贡献指南 <a name="contributing"></a>
欢迎所有的 Pull Request 和 Issue！

开发规范和最佳实践请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

提交 Issue 前，请先查阅我们的 [Bug 报告模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md) 和 [功能请求模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md)，以便我们高效处理你的反馈。

感谢你帮助改进 **Gemini Voyager** ！
