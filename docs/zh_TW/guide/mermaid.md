# Mermaid 圖表渲染

自動將 Mermaid 程式碼渲染為視覺化圖表。

## 功能概覽

當 Gemini™ 輸出 Mermaid 程式碼區塊（流程圖、時序圖、甘特圖等）時，Voyager 會自動偵測並將其渲染為互動式圖表。

### 主要功能

- **自動偵測**：支援 `graph`、`flowchart`、`sequenceDiagram`、`gantt`、`pie`、`classDiagram` 以及所有主要的 Mermaid 圖表類型
- **切換檢視**：一鍵在渲染後的圖表與原始碼之間切換
- **全螢幕模式**：點擊圖表即可進入全螢幕，支援縮放與平移
- **深色模式**：自動配合頁面主題

## 開啟或關閉

Gemini 上的 Mermaid 圖表渲染預設為開啟。若要關閉，請開啟 Voyager 彈出視窗，在 **一般選項** 中關閉 **啟用 Mermaid 圖表轉譯**。AI Studio 不提供此功能。

## 如何使用

1. 請 Gemini 產生任何 Mermaid 圖表程式碼
2. 程式碼區塊會自動替換為渲染後的圖表
3. 點擊 **</> Code** 按鈕檢視原始碼
4. 點擊 **📊 Diagram** 按鈕切回圖表檢視
5. 點擊圖表區域進入全螢幕

## 全螢幕操作

- **滾輪**：放大或縮小
- **拖曳**：平移圖表
- **+/-**：工具列的縮放按鈕
- **⊙**：重設檢視
- **✕ / ESC**：關閉全螢幕

## 相容性與疑難排解

::: warning 注意

- **Firefox 限制**：由於環境限制，Firefox 內建 Mermaid 9.2.2 版本，暫不支援 **Timeline**、**Sankey** 等較新的圖表類型。
- **語法錯誤**：渲染失敗通常是因為 Gemini 輸出的程式碼有語法錯誤。我們正在收集問題案例（bad case），未來會透過更新，針對常見的生成錯誤自動修正。
  :::

<div align="center">
  <img src="/assets/mermaid-preview.png" alt="Mermaid 圖表渲染" style="max-width: 100%; border-radius: 8px;"/>
</div>
