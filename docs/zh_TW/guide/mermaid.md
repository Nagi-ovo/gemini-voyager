# Mermaid 圖表渲染

自動將 Mermaid 代碼渲染為可視化圖表。

## 功能介紹

當 Gemini 輸出 Mermaid 代碼塊時（如流程圖、時序圖、甘特圖等），Voyager 會自動檢測並渲染為交互式圖表。

### 主要特性

- **自動檢測**：支持 `graph`、`flowchart`、`sequenceDiagram`、`gantt`、`pie`、`classDiagram` 等所有主流 Mermaid 圖表類型
- **一鍵切換**：通過按鈕在渲染圖表和原始碼之間自由切換
- **全屏查看**：點擊圖表進入全屏模式，支持滾輪縮放和拖拽平移
- **深色模式**：自動適配頁面主題

## 使用方法

1. 讓 Gemini 生成任意 Mermaid 圖表代碼
2. 代碼塊會自動替換為渲染後的圖表
3. 點擊 **</> Code** 按鈕查看原始代碼
4. 點擊 **📊 Diagram** 按鈕切回圖表視圖
5. 點擊圖表區域進入全屏查看

## 全屏模式操作

- **滾輪**：縮放圖表
- **拖拽**：移動圖表位置
- **+/-**：工具欄縮放按鈕
- **⊙**：重置視圖
- **✕ / ESC**：關閉全屏

## 相容性與故障排除

::: warning 說明

- **Firefox 限制**：由於環境限制，Firefox 使用 9.2.2 版本，暫不支援 **Timeline**、**Sankey** 等新特性。
- **語法錯誤**：渲染失敗通常是因為 Gemini 生成的代碼有語法錯誤。我們正在收集 Bad Case，後續將透過補丁自動修復常見的生成錯誤。
  :::

<div align="center">
  <img src="/assets/mermaid-preview.png" alt="Mermaid 圖表渲染" style="max-width: 100%; border-radius: 8px;"/>
</div>
