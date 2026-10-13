# 記憶傳送：上下文同步（實驗性）

**不同維度，無縫共享**

在網頁端推敲邏輯，在 IDE 中落實程式碼。Voyager 打破維度的隔閡，讓你的 IDE 立即擁有網頁端的「思考過程」。

## 告別來回切換

開發者最頭痛的事：在網頁上把方案聊透之後，回到 VS Code、Trae 或 Cursor，卻得像面對陌生人一樣重新說明需求。由於額度與回應速度的限制，網頁端是「大腦」，IDE 則是「雙手」。Voyager 讓兩者共用同一個脈絡。

## 三個簡單步驟完成同步

1. **安裝並啟動橋接器**：
   在 VS Code 或相容的編輯器中安裝 **CoBridge** 擴充功能。它是連接網頁介面與本機 IDE 的核心橋樑。
   - **[從 Open VSX 安裝](https://open-vsx.org/extension/windfall/co-bridge)**

   ![CoBridge 擴充功能](/assets/CoBridge-extension.png)

   安裝完成後，**開啟任一工作目錄**，點擊右側圖示並啟動伺服器。
   ![CoBridge 伺服器已開啟](/assets/CoBridge-on.png)

2. **建立連線**：
   - 在 Voyager 彈出視窗的 **上下文同步** 區段中，將 **同步模式** 設為 **手動**。
   - 讓 **服務埠號** 與 CoBridge 使用的埠號一致。看到 "IDE 線上" 時，表示兩者已連線。

   ![上下文同步面板](/assets/context-sync-console.png)

3. **一鍵同步**：點擊 **同步到 IDE**。無論是複雜的**資料表格**，或是直觀的**參考圖片**，都能立即同步到你的 IDE 中。

   ![同步完成](/assets/sync-done.png)

## 落實到 IDE 中

同步完成後，你的 IDE 工作目錄中會出現 `.cobridge/AI_CONTEXT.md`。無論是 Trae、Cursor 或 Copilot，它們都會透過各自的規則檔案自動讀取這份「記憶」。

```
your-project/
├── .cobridge/
│   ├── images/
│   │   ├── context_img_1_1.png
│   │   └── context_img_1_2.png
│   └── AI_CONTEXT.md
├── .github/
│   └── copilot-instructions.md
├── .gitignore
├── .traerules
└── .cursorrules
```

## 設計原則

- **零污染**：CoBridge 會自動處理 `.gitignore`，確保你的私人對話不會被推送到 Git 儲存庫。
- **符合慣例**：採用完整的 Markdown 格式，讓 IDE 中的 AI 讀起來就像讀說明書一樣順暢。
- **實用小技巧**：如果對話已經是很久以前的內容，請先使用 [時間軸](/zh_TW/guide/timeline) 向上捲動，讓網頁端重新載入上下文，同步效果會更好。

---

## 準備起飛

**邏輯已在雲端就緒，現在讓它在本機落地生根。**

- **[安裝 CoBridge 擴充功能](https://open-vsx.org/extension/windfall/co-bridge)**：找到你的維度入口，一鍵開啟同步。
- **[造訪 GitHub 儲存庫](https://github.com/Winddfall/CoBridge)**：深入了解 CoBridge 的底層邏輯，或為這個同步工具專案點個 Star。

> **大型語言模型不再失憶，開箱即可上手。**
