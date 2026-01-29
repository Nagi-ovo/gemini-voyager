# 上下文同步：記憶傳輸（實驗性）

**不同維度，無縫共享**

在網頁端迭代邏輯，在 IDE 中實作程式碼。Gemini Voyager 打破了維度壁壘，讓您的 IDE 能夠即時獲得網頁端的「思考過程」。

## 告別頻繁切換

開發者最大的痛苦：在網頁端詳細討論完解決方案後，回到 VS Code/Trae/Cursor 卻又要像對陌生人一樣重新解釋需求。由於配額和回應速度的限制，網頁端是「大腦」，而 IDE 是「雙手」。Voyager 讓它們共享同一個靈魂。

## 簡單三步即可同步

1. **喚醒 CoBridge**：從 VS Code Marketplace 安裝 **CoBridge** 擴充功能並啟動它。它是連接網頁端和您本機的橋樑。
   ![CoBridge 擴充功能](/assets/CoBridge-extension.png)

   ![CoBridge 伺服器已開啟](/assets/CoBridge-on.png)

2. **握手連接**：
   - 在 Voyager 設定中啟用「Context Sync」（上下文同步）。
   - 對齊埠號。當您看到「IDE Online」時，表示已連接。

   ![上下文同步控制台](/assets/context-sync-console.png)

3. **一鍵同步**：點擊 **「Sync to IDE」**。

   ![同步完成](/assets/sync-done.png)

## 在 IDE 中紮根

同步後，您的 IDE 根目錄中會出現一個 `.vscode/AI_CONTEXT_SYNC.md` 檔案。無論是 Trae、Cursor 還是 Copilot，它們都會透過各自的規則檔案自動讀取這段「記憶」。**AI 模型將不再遭受記憶喪失之苦，能夠立即進入狀況。**

## 原理

- **零污染**：CoBridge 會自動處理 `.gitignore`，確保您的私密對話永遠不會被推送到 Git 儲存庫。
- **業界標準**：完整的 Markdown 格式，讓您 IDE 中的 AI 閱讀起來就像閱讀說明書一樣順暢。
- **專業提示**：如果對話是發生在一段時間之前，請先使用 [Timeline]（時間軸）向上捲動，讓網頁端「回憶」起上下文，以獲得更好的同步效果。
