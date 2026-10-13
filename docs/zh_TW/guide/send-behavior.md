# 傳送行為

::: info
**注意**：此功能於 1.3.7 及之後的版本中提供。
:::

將傳送快捷鍵改為 `Ctrl+Enter`（在 macOS 上為 `⌘+Enter`），讓 `Enter` 鍵變成換行鍵，方便你輕鬆撰寫多行提示詞。

## 為什麼需要這個功能

預設情況下，按下 `Enter` 會立即傳送訊息。撰寫較長的提示詞、貼上多行程式碼，或仔細排版輸入內容時，這常常會導致誤傳送：你只是想換行，訊息卻已經送出了。

啟用後：

- **Enter**：插入換行
- **Ctrl+Enter**（macOS：**⌘+Enter**）：傳送訊息

Shift+Enter 與輸入法組字仍保留網站原本的行為；附件仍在上傳時，Ctrl／⌘+Enter 會等待上傳完成後才傳送。

## 如何啟用

1. 開啟 Voyager 彈出視窗。
2. 在 **輸入選項** 中，開啟 **Ctrl+Enter 傳送**（在 macOS 上顯示為 **⌘+Enter 傳送**）。

## 其他網站

- **AI Studio** 的運作方式相反：開啟 **AI Studio Enter 傳送**，即可用 `Enter` 傳送，並以 `Ctrl/⌘+Enter` 換行。
- **Claude、ChatGPT 與 DeepSeek**：請從[外掛市集](/zh_TW/plugins)安裝該網站的 **Ctrl/Cmd+Enter 傳送** 外掛。
- **Safari**：如果在 Gemini 中需要按兩次 Enter 才能傳送，請開啟 **修復 Safari Enter 鍵**。

## 功能特點

- **零效能負擔**：停用時不會啟用任何鍵盤事件監聽器，對頁面效能沒有影響。
- **即時切換**：在設定中切換後立即生效，無需重新整理頁面。
