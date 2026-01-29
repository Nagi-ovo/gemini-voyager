# Deep Research 導出

將 Deep Research 對話中的完整「思考」內容導出為格式優美的 Markdown 文件。

## 功能特性

- **一鍵導出**:點擊分享和導出按鈕即可下載
- **結構化格式**:按原始順序保留思考階段、思考條目和研究網站
- **雙語標題**:Markdown 文件包含中英文雙語章節標題
- **自動命名**:文件使用時間戳命名,便於整理(例如:`deep-research-thinking-20240128-153045.md`)

## 使用方法

1. 在 Gemini 上打開一個 Deep Research 對話
2. 點擊對話的**分享和導出**按鈕
3. 選擇 "下載 Thinking 內容" (Download thinking content)
4. Markdown 文件將自動下載

![Deep Research 導出](/assets/deepresearch_download_thinking.png)

## 導出文件格式

導出的 Markdown 文件包含:

- **標題**:對話標題
- **元數據**:導出時間和思考階段總數
- **思考階段**:每個階段包含:
  - 思考條目(包含標題和內容)
  - 研究網站(包含連結和標題)

### 示例結構

```markdown
# Deep Research 對話標題

**導出時間 / Exported At:** 2025-12-28 17:25:35
**總思考階段 / Total Phases:** 3

---

## 思考階段 1 / Thinking Phase 1

### 思考標題 1

思考內容...

### 思考標題 2

思考內容...

#### 研究網站 / Researched Websites

- [domain.com](https://example.com) - 頁面標題
- [another.com](https://another.com) - 另一個標題

---

## 思考階段 2 / Thinking Phase 2

...
```

## 隱私保護

所有提取和格式化操作都 100% 在瀏覽器本地完成。不會向外部伺服器發送任何數據。
