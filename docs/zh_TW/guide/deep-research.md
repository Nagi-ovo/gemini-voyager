# Deep Research 匯出

匯出 Deep Research 產生的最終報告，或把它完整的「思考」過程儲存為 Markdown 檔案。

## 1. 報告匯出（PDF／圖片）

Deep Research 產生的報告可以匯出為排版精美的 PDF，或方便分享的單張圖片（也支援 Markdown 與 JSON 格式）。開啟報告的 **Share & Export** 選單，然後選擇 **儲存報告**。

![報告匯出](/assets/deep-research-report-export.png)

## 2. 思考過程匯出（Markdown）

除了最終報告，你也可以匯出 Deep Research 對話中完整的「思考」內容。

### 功能特色

- **一鍵匯出**：報告的 **Share & Export** 選單中會出現下載選項
- **結構化格式**：依原始順序保留思考階段、思考項目與研究過的網站
- **易讀的標題**：章節標題為英文；若 Voyager 設定為其他語言，每個標題會同時顯示該語言與英文
- **自動命名**：檔案名稱附有時間戳記，方便整理（例如 `deep-research-thinking-20240128-153045.md`）

### 如何使用

1. 在 Gemini™ 上開啟一則 Deep Research 對話
2. 點擊報告的 **Share & Export** 按鈕
3. 選擇 **下載 Thinking 內容**
4. Markdown 檔案會自動下載

![Deep Research 思考內容匯出](/assets/deepresearch_download_thinking.png)

### 匯出檔案格式

匯出的 Markdown 檔案包含：

- **標題**：對話標題
- **中繼資料**：匯出時間與思考階段總數
- **思考階段**：每個階段包含：
  - 思考項目（含標題與內容）
  - 研究過的網站（含連結與標題）

#### 範例結構

```markdown
# Deep Research Conversation Title

**Exported At:** 2025-12-28 17:25:35
**Total Phases:** 3

---

## Thinking Phase 1

### Thought Title 1

Thought content...

### Thought Title 2

Thought content...

#### Researched Websites

- [domain.com](https://example.com) - Page Title
- [another.com](https://another.com) - Another Title

---

## Thinking Phase 2

...
```

## 隱私

所有擷取與格式化作業 100% 在你的瀏覽器本機完成，不會將任何資料傳送到外部伺服器。
