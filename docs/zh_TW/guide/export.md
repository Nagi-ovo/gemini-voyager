# 徹底自由

Voyager 匯出功能可以把任何 Gemini 或 ChatGPT 對話下載成 Markdown、PDF、JSON 或圖片檔案。它會完整擷取聊天內容，包括程式碼區塊、圖片與格式，讓你為每一段 AI 對話保留一份永久、可攜的副本。

資料被鎖定是最大的敵人。
我們相信：你創作的，就應該屬於你。

## 格式比較

| 功能       | Markdown                         | PDF                 | JSON             | 圖片           |
| ---------- | -------------------------------- | ------------------- | ---------------- | -------------- |
| 適合對象   | 筆記應用程式（Obsidian、Notion） | 分享與列印          | 開發者、資料分析 | 在手機上分享   |
| 圖片       | 嵌入                             | 完整納入            | Base64 編碼      | 就地轉譯顯示   |
| 程式碼區塊 | 保留語法                         | 以視覺方式呈現      | 保留原始文字     | 以視覺方式呈現 |
| 檔案大小   | 最小                             | 最大                | 中等             | 大             |
| 可搜尋性   | 純文字                           | 透過 PDF 閱讀器搜尋 | 可程式化存取     | 不可           |

## 匯出全部

Voyager 讓你把資料從雲端取回到自己手上。

### 格式

- **Markdown**：適合 Obsidian 保險庫或 Notion。乾淨的排版文字，並嵌入圖片。
- **PDF**：適合分享或列印。排版精美，包含圖片。
- **JSON**：原始資料，適合想基於歷史紀錄進行開發的開發者。
- **圖片**：一張長型 PNG，很適合在手機上分享。可選擇窄、中、寬三種版面。

### 如何匯出

1. 點擊頁面右上角的 **匯出** 按鈕（適用於 ChatGPT 與目前的 Gemini 版面）。在 Gemini 上，你也可以從對話或回覆的 ⋮ 選單中選擇 **匯出對話記錄**；在較舊的 Gemini 版面上，請將滑鼠移到 Gemini 標誌上，即可看到 **匯出圖示**。
2. 選擇格式。
3. 完成。

這是你的資料，想怎麼用都可以。

<div style="display: flex; gap: 20px; margin-top: 20px;">
  <div style="flex: 1; text-align: center;">
    <p><b>步驟 1：找到匯出</b></p>
    <img src="/assets/gemini-export-guide-1.png" alt="匯出指南步驟 1" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; text-align: center;">
    <p><b>步驟 2：選擇格式</b></p>
    <img src="/assets/gemini-export-guide-2.png" alt="匯出指南步驟 2" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

### Safari 匯出 PDF 說明

在 Safari 上匯出 PDF 的步驟略有不同，需要手動列印：

1. 點擊 **匯出** 按鈕，並選擇 PDF 格式。
2. **等待約一秒**（讓頁面準備列印樣式）。
3. 按下 `Command + P` 開啟列印對話框。
4. 在列印對話框中選擇 **儲存為 PDF**。

<img src="/assets/safari-export-pdf.png" alt="Safari 匯出 PDF" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 20px;"/>

## Deep Research 匯出

Gemini 的 Deep Research 模式會產生包含來源、思考步驟與引用的結構化報告。Voyager 可以在保留所有中繼資料的情況下匯出這些對話：

1. 開啟一則已完成的 Deep Research 對話。
2. 開啟報告的 **Share & Export** 選單，並選擇 **儲存報告**。
3. 選擇格式。
4. 匯出內容會包含最終報告及其來源連結。若也要儲存思考過程，請參閱 [Deep Research 匯出](/zh_TW/guide/deep-research)。

這對學術研究、競品分析與技術文件特別有用，因為你需要保留推理鏈與來源出處。

## 何時匯出

- **知識存檔**：在重要對話被淹沒在聊天紀錄之前先保存下來。
- **團隊分享**：把一段除錯對話匯出成 PDF，分享給不使用 Gemini 的同事。
- **建立知識庫**：將對話匯出成 Markdown，並在 Obsidian 或 Notion 中整理。
- **資料分析**：使用 JSON 匯出，以程式方式分析對話模式或擷取結構化資料。
- **合規與稽核**：保存 AI 協助決策的紀錄，以供稽核追蹤。

## 支援平台

匯出功能可用於 Gemini 與 ChatGPT，支援 Chrome、Edge、Firefox、Safari、Opera 與 Brave。在 Safari 上，PDF 匯出需要點擊匯出後手動列印（按 Command+P）；Markdown 與 JSON 匯出仍會包含圖片。
