# 提示词管理器的自定义网站

提示词管理器现在可以在您选择的任何网站上使用，不仅限于 Gemini 和 AI Studio。

## 工作原理

当您添加自定义网站时：

1. 扩展会请求访问该特定网站的权限
2. 提示词管理器会被注入到该网站
3. **仅**激活提示词管理器功能（不包括时间线、文件夹或其他功能）

## 添加网站

1. 点击扩展图标打开弹窗
2. 滚动到**提示词管理器**部分
3. 输入网站 URL（例如：`chatgpt.com` 或 `claude.ai`）
4. 点击**添加网站**
5. 在提示时授予权限

## 支持的 URL 格式

您可以输入各种格式的 URL：

- `chatgpt.com`
- `www.chatgpt.com`
- `https://chatgpt.com`
- `claude.ai`

扩展会自动规范化 URL，并请求 `https://` 和 `https://www.` 两个版本的权限。

## 隐私与安全

- **用户控制**：您明确添加想要使用提示词管理器的网站
- **功能限制**：自定义网站上只激活提示词管理器（不包括时间线、文件夹等）
- **便捷管理**：随时在扩展弹窗中添加或移除网站

## 示例

您可能想要使用提示词管理器的热门 AI 聊天网站：

- `chatgpt.com` - ChatGPT
- `claude.ai` - Claude
- `copilot.microsoft.com` - Microsoft Copilot
- `bard.google.com` - Google Bard（旧版）
- `poe.com` - Poe

## 移除网站

1. 打开扩展弹窗
2. 在列表中找到网站
3. 点击**移除**
4. 内容脚本将自动注销

## 故障排除

### 添加网站后提示词管理器没有出现

1. **刷新页面** - 扩展只在页面加载时激活
2. 检查 URL 格式是否正确（例如：`chatgpt.com` 而不是 `chat.openai.com/chatgpt`）
3. 打开浏览器控制台（F12）查看 `[Gemini Voyager]` 日志

### 如何检查是否正常工作

打开浏览器控制台（F12）查找：

```
[Gemini Voyager] Checking custom websites: ...
[Gemini Voyager] Is custom website: true
[Gemini Voyager] Custom website detected, starting Prompt Manager only
```

### 想在自定义网站上使用其他功能？

目前，自定义网站上仅支持提示词管理器。其他功能（时间线、文件夹等）是专门为 Gemini 和 AI Studio 设计的，在其他网站上无法使用。
