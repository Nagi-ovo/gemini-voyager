<div align="center">
  <img src="public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h5>一个为 Gemini 聊天添加丝滑交互时间线的 Chrome 扩展。</h5>
</div>

## 简介 <a name="intro"></a>

**Gemini Voyager** 为 `https://gemini.google.com/app` 增强了一个紧凑优雅的时间线：

- 你的消息会映射为时间线上的圆点，点击可跳转或平滑滚动到对应消息。
- 悬停可预览消息内容（3 行截断并渐变淡出）。
- 长按可为圆点加星标，星标会在所有标签页间同步。
- 强大的 SPA 观察器确保你滚动时活跃状态始终同步。

## 快速开始 <a name="gettingStarted"></a>

### 加载扩展（Chrome）

1. 打开 Chrome 浏览器
2. 访问 [chrome://extensions](chrome://extensions)
3. 勾选“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择本项目中的 `dist_chrome` 文件夹（需先执行 dev 或 build）

注意：Edge（Chromium）同样可以加载 `dist_chrome` 作为未打包扩展，但本项目主要面向 Chrome。

## 参考

灵感来源于“[ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline)”。
我们针对 Gemini 适配了时间线映射和观察者模式，并扩展了 UI/UX。

## 贡献指南 <a name="contributing"></a>
欢迎所有的 Pull Request 和 Issue！

开发规范和最佳实践请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

提交 Issue 前，请先查阅我们的 [Bug 报告模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md) 和 [功能请求模板](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md)，以便我们高效处理你的反馈。

感谢你帮助改进 **Gemini Voyager** ！
