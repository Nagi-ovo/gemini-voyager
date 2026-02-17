# 記憶搬運：上下文同步（實驗性）

**不同次元，絲滑共享**

在網頁端推演邏輯，在 IDE 裡落地程式碼。 Gemini Voyager 打通次元壁，讓您的 IDE 瞬間擁有網頁端的「思維過程」。

## 告別反覆橫跳

開發者最煩的事：在網頁上聊透了方案，回到 VS Code/Trae/Cursor 卻要像面對陌生人一樣重新解釋需求。 由於額度和回應速度，網頁端是「大腦」，IDE 是「手」。 Voyager 讓它們共用一個靈魂。

## 極簡三步，同頻呼吸

1. **安裝並喚醒橋接器**：
   安裝 **CoBridge** 插件。它是連接網頁與本地 IDE 的核心橋梁。
   - **[前往插件市場安裝](https://open-vsx.org/extension/windfall/co-bridge)**

   ![CoBridge 擴充功能](/assets/CoBridge-extension.png)

   安裝完成後，點擊右側圖示並啟動伺服器。
   ![CoBridge 伺服器開啟](/assets/CoBridge-on.png)

2. **握手對接**：
   - 在 Voyager 設定中開啟「上下文同步」。
   - 對齊埠號。看到「IDE Online」，說明它們已經連上了。

   ![上下文同步面板](/assets/context-sync-console.png)

3. **一鍵同步**：點擊 **「Sync to IDE」**。無論是複雜的**數據表格**，還是直觀的**參考圖片**，都能瞬間瞬移到您的 IDE 中。

   ![同步完成](/assets/sync-done.png)

## 落地生根

同步完成後，您的 IDE 根目錄會多出一個 `.cobridge/AI_CONTEXT.md`。 無論是 Trae、Cursor 還是 Copilot，它們會透過各自的 Rule 文件自動讀取這份「記憶」。

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

## 它的原則

- **零污染**：CoBridge 自動操作 `.gitignore`，不會把您這些私密對話推到 Git 倉庫裡。
- **懂行**：全 Markdown 格式，IDE 裡的 AI 讀起來就像讀說明書一樣順暢。
- **小貼士**：如果對話太久遠，先用【時間線】向上劃一下，讓網頁把記憶「想起來」，再同步效果更佳。

---

## 立刻起航

**思維已在雲端就緒，現在，讓他在本地落地生根。**

- **[安裝 CoBridge 插件](https://open-vsx.org/extension/windfall/co-bridge)**：找到您的次元傳送門，一鍵開啟「同頻呼吸」。
- **[訪問 GitHub 倉庫](https://github.com/Winddfall/CoBridge)**：深入了解 CoBridge 的底層邏輯，或者為這個「同步靈魂」的項目點個 Star。

> **大模型從此不再失憶，上手即戰。**
