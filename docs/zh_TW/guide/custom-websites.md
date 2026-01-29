# 提示詞管理器的自定義網站

提示詞管理器現在可以在您選擇的任何網站上使用，不僅限於 Gemini 和 AI Studio。

## 工作原理

當您添加自定義網站時：

1. 擴充功能會請求訪問該特定網站的權限
2. 提示詞管理器會被注入到該網站
3. **僅**激活提示詞管理器功能（不包括時間線、資料夾或其他功能）

## 添加網站

1. 點擊擴充功能圖標打開彈窗
2. 滾動到**提示詞管理器**部分
3. 輸入網站 URL（例如：`chatgpt.com` 或 `claude.ai`）
4. 點擊**添加網站**
5. 在提示時授予權限

## 支持的 URL 格式

您可以輸入各種格式的 URL：

- `chatgpt.com`
- `www.chatgpt.com`
- `https://chatgpt.com`
- `claude.ai`

擴充功能會自動規範化 URL，並請求 `https://` 和 `https://www.` 兩個版本的權限。

## 隱私與安全

- **使用者控制**：您明確添加想要使用提示詞管理器的網站
- **功能限制**：自定義網站上只激活提示詞管理器（不包括時間線、資料夾等）
- **便捷管理**：隨時在擴充功能彈窗中添加或移除網站

## 示例

您可能想要使用提示詞管理器的熱門 AI 聊天網站：

- `chatgpt.com` - ChatGPT
- `claude.ai` - Claude
- `copilot.microsoft.com` - Microsoft Copilot
- `bard.google.com` - Google Bard（舊版）
- `poe.com` - Poe

## 移除網站

1. 打開擴充功能彈窗
2. 在列表中找到網站
3. 點擊**移除**
4. 內容腳本將自動註銷

## 故障排除

### 添加網站後提示詞管理器沒有出現

1. **刷新頁面** - 擴充功能只在頁面載入時激活
2. 檢查 URL 格式是否正確（例如：`chatgpt.com` 而不是 `chat.openai.com/chatgpt`）
3. 打開瀏覽器控制台（F12）查看 `[Gemini Voyager]` 日誌

### 如何檢查是否正常工作

打開瀏覽器控制台（F12）查找：

```
[Gemini Voyager] Checking custom websites: ...
[Gemini Voyager] Is custom website: true
[Gemini Voyager] Custom website detected, starting Prompt Manager only
```

### 想在自定義網站上使用其他功能？

目前，自定義網站上僅支持提示詞管理器。其他功能（時間線、資料夾等）是專門為 Gemini 和 AI Studio 設計的，在其他網站上無法使用。
