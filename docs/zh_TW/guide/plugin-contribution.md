# 外掛貢獻指南

Voyager 的外掛系統以宣告式外掛為核心：在 `plugin.json` 中描述外掛的中繼資料與 DOM 操作，再用 CSS 描述視覺上的修改。外掛不會執行遠端 JavaScript；Voyager 內建的外掛引擎會解讀清單與樣式。

這讓外掛更容易審查與維護。如果你想貢獻外掛，請先從這裡開始。

## 只給自己用：本機外掛

只需要在自己瀏覽器中使用的外掛，不必走這套流程。把它做成本機外掛，再於彈出視窗中匯入即可：不需要 Issue、不需要 PR，也不需要 clone 儲存庫。[撰寫你自己的外掛](/zh_TW/guide/write-a-plugin) 說明了三種建立方式，包括 `create-voyager-plugin` 檢查工具與給程式代理使用的 skill。

## 建議流程

1. 先確認這個點子適合做成外掛：閱讀寬度、版面修正、主題微調、隱藏或標記頁面元素，以及簡單的網站適配，通常都是很適合的候選。
2. 先在 Voyager 儲存庫開一個 Issue，說明問題、目標網站，以及它與現有外掛的差異；在維護者明確同意之前，不要開始寫程式或提交 PR。
3. 用 `plugin.json` 填寫中繼資料、網站匹配、設定與貢獻內容。
4. 把樣式放在同一個外掛目錄的 `style.css` 中，再從 `contributes.styles` 引用它。
5. 在本機測試，並在 PR 中附上測試頁面、截圖或簡短錄影。是否能進入官方目錄，由維護者決定。

## 目錄結構

官方內建的外掛位於 `src/features/plugins/catalog/`，每個外掛平台各佔一個目錄：

```
src/features/plugins/catalog/
  marketplace.json                        外掛市集讀取的索引（文件站使用）
  sites/<site>/site.json                  網站適配器（以資料形式表示）
  sites/<site>/plugins/<id>/plugin.json   一個宣告式外掛
  sites/<site>/plugins/<id>/style.css     外掛的樣式
  sites/<site>/plugins/<id>/README.md     外掛修正了什麼，以及為何這樣修
```

探索流程是自動的：`catalog/sites/index.ts` 會用 `import.meta.glob` 找出每個 `site.json` 與每個 `plugin.json`，因此新增網站或外掛只需要新增檔案，不需要修改任何對照表。

`marketplace.json` 不是那張對照表，它只是文件站外掛市集讀取的索引。測試會確保它與自動探索的結果一致，因此新外掛也需要在其中新增一筆。它的 `source` 是 catalog 相對路徑，例如 `sites/deepseek/plugins/reading-width/plugin.json`。`sites/gemini/` 與 `sites/aistudio/` 下的外掛是例外：它們隨 Voyager 一起發布，不會列在 `marketplace.json` 中。

外掛的 `matches` 必須落在它所在網站的 `matches` 範圍之內。超出範圍的外掛會讓建置失敗。

## 語意選擇器鍵

`site.json` 會把一組固定的語意鍵對應到各網站專屬的 CSS 選擇器。這組詞彙定義在 `src/features/plugins/sites/semanticKeys.ts` 中；`site.json` 只能使用此清單中的鍵，遇到未知的鍵會被拒絕。

- `userTurn`：使用者訊息的容器。
- `assistantTurn`：助理訊息的容器。
- `thinkingBlock`：助理回覆中的推理段落。
- `codeBlock`：算繪後的程式碼區塊。
- `composer`：使用者輸入提示詞的輸入框。
- `sidebar`：對話列表或導覽列。
- `sidePanel`：次要面板，例如 artifacts 或 canvas。
- `headerActions`：對話視圖右上角的操作按鈕群。
- `scrollContainer`：負責捲動對話的元素。
- `composerRoot`：輸入框與其操作按鈕所在的容器。
- `sendButton`：傳送提示詞的按鈕；有些網站只在提示詞非空時才顯示它。

網站只需要宣告它實際能提供的鍵。外掛若要引用語意鍵，可在 DOM 操作的 `target` 中使用 `{ "kind": "semantic", "key": "userTurn" }`，而不是直接寫原始選擇器。如此一來，網站改版時只需修改 `site.json` 這一個檔案。

`conversationIdPattern` 是 `site.json` 的獨立欄位，而不是選擇器：它是對 URL 路徑做比對的正規表示式，第一個擷取群組就是對話 ID，例如 `^/chat/([^/?#]+)`。

## 新增平台

新增一個聊天網站，分為兩個獨立的層次：

1. **網站適配器**，即 `catalog/sites/<site>/site.json`，告訴 Voyager 如何辨識這個網站，並找到它的使用者訊息、助理訊息、輸入框、側邊欄與主題標記。
2. **外掛**，位於 `catalog/sites/<site>/plugins/<id>/`，用來解決該網站上某一個面向使用者的問題，例如閱讀寬度或轉譯修正。

`site.json` 包含 `id`（與其目錄名相同）、`label`、`matches`、`selectors`、`theme`、`brandColor`、`capabilities`，以及選填的 `conversationIdPattern` 與 `turnKeyAttributes`。`turnKeyAttributes` 指定當頁面重新轉譯使用者訊息時，用來保持其身分識別的屬性。送出追蹤（供資料夾活動與時間軸時間戳記使用）只會在有設定它的網站上執行，並同時需要 `composer`、`userTurn` 與 `conversationIdPattern`。`src/features/plugins/sites/siteAdapterData.ts` 中的 `validateSiteAdapterData` 會驗證它，而 `bun run catalog:build` 會在發布前驗證每個網站與外掛。

每個外掛平台都是資料。目前的網站有 ChatGPT、Claude 與 DeepSeek。Gemini 與 AI Studio 是 Voyager 的原生介面，同樣有各自的 `site.json`（`catalog/sites/gemini/` 與 `catalog/sites/aistudio/`），但它們隨擴充功能套件一起打包，永遠不會發布到遠端目錄。`adapters/gemini.ts`、`aistudio.ts`、`claude.ts`、`chatgpt.ts` 與 `deepseek.ts` 這五個適配器都只是 `site.json` 的單行外殼：要修改時請編輯 JSON，而不是 TypeScript。

發布的各網站目錄也包含網站資料，因此 `site.json` 中的選擇器修正不需要發布擴充功能新版本，就能送到使用者手上。全新的網站仍然需要擴充功能版本，因為它還需要隨套件發布主機權限與內容腳本註冊。

以 DeepSeek 這類新平台為例，適配器的工作應聚焦於平台契約。請在同一個完整的變更中提交 `site.json`、必要的選擇器測試，以及說明支援範圍所需的最少文件。網站註冊表會直接從檔案中取得新適配器，因此不需要修改任何註冊清單。不要為每個外掛都新增一個網站。

適配器被接受後，後續的外掛可以各自以獨立、聚焦的變更提交。如果多個變更彼此相依，使用堆疊式 PR 鏈會很有用：後一個分支以前一個分支為基礎，每個 PR 只顯示自己增量的功能。整條鏈仍須遵守相同的範圍原則：每個 PR 只解決一個明確的使用者目標，並附上必要的測試與清理。

網站支援不需要模型 API 整合。新平台不要加入靜態內容腳本或必要的主機權限；僅供外掛使用的網站，請使用既有的選用權限與動態註冊流程。

選用權限與動態註冊流程取決於瀏覽器版本。Chrome 與 Edge 支援擴充功能所使用的流程。Firefox 需要 128 或更新版本才能使用選用主機權限，Safari 需要 16.4 或更新版本才能使用動態內容腳本註冊。在較舊的受支援瀏覽器版本上，彈出視窗可能會正確地拒絕為自訂網站啟用外掛，因為所需 API 無法提供持久的授權。請不要為了繞過這個限制而加入範圍過大的靜態主機權限，除非維護者同意。

## 外掛範圍

外掛應以它所解決的使用者問題來界定範圍，而不是機械地依平台拆分。

catalog 中的外掛只屬於單一網站資料夾，而且它的每一個 `matches` 都必須被該資料夾的 `site.json` 涵蓋（否則 `bun run plugin:check` 會失敗），因此同一個外掛無法同時涵蓋 Claude 與 ChatGPT。如果同一項功能適用於多個平台，例如閱讀寬度、頁面導覽或程式碼區塊版面，請在每個網站資料夾各提供一個外掛（例如 `sites/claude/plugins/reading-width` 與 `sites/chatgpt/plugins/reading-width`），並讓它們的名稱、設定與說明保持一致。

如果每個平台需要截然不同的設定、DOM 邏輯或使用者介面文案，分成多個外掛會更清楚。不要為了讓一個外掛「什麼都能做」，而把不相關的行為硬塞在一起；一個外掛應該只解決一個明確的問題。

快速判斷原則：

- 同一個使用者目標、同一組設定，只有選擇器不同：每個網站資料夾各做一個外掛，名稱與設定保持一致。
- 同一個主題，但各平台的行為差異很大：可以拆開，但名稱與說明要保持關聯。
- 目標不同：不要合併。

## 避免重複外掛

提交之前，請先查看外掛市集與現有的官方外掛。如果已經有一個好用的外掛，請改進它，而不是再做一個類似的。

只有在具備明確改進時，重複的外掛才值得接受，例如：

- 支援原外掛未涵蓋的重要平台。
- 修正原外掛無法解決的相容性問題。
- 效能、無障礙或可維護性明顯更好。
- 提供不同且有意義的使用體驗，而不只是改個名字或稍微調整樣式。

這樣可以讓外掛市集保持整潔，也方便使用者選擇。

## 最小範例

請從範本開始，不要從空目錄開始：執行 `bun run plugin:new <id-segment> --site <site>` 會在 `catalog/sites/<site>/plugins/<id-segment>/` 建立 `plugin.json`、`style.css` 與 `README.md`，並自動在 `marketplace.json` 中加入對應條目。產生的內容只是起點，不代表已通過審查；你需要填寫的清單格式如下：

```json
{
  "$schema": "https://voyager.nagi.fun/plugin.schema.json",
  "id": "your-name.example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "A short description of what this plugin improves.",
  "author": "your-name",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://claude.ai/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "domOps": [
      {
        "op": "addClass",
        "target": "body",
        "className": "gv-plugin-example"
      }
    ]
  }
}
```

`$schema` 這一行是選填的，只供編輯器使用：它指向清單的 JSON Schema，讓編輯器在你輸入時進行驗證與自動補全。`site.json` 也有自己的 Schema，位於 `https://voyager.nagi.fun/site.schema.json`。

`style.css` 可以使用一般的 CSS，但外掛樣式應該都放在你自己的 `gv-plugin-*` 類別之下：

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## 清單注意事項

- `id` 請使用反向網域或作者前綴，例如 `your-name.reading-width`，以避免衝突。
- `matches` 請盡量縮小範圍，只匹配外掛真正需要運作的網站。
- 只有當外掛所屬網站的 `site.json` 涵蓋多個主機時（例如 chatgpt.com 與 chat.openai.com），`matches` 才能列出多個主機；若要支援其他網站，請在該網站的資料夾中新增外掛。
- 建議的 `category` 值為 `render-fix`、`theme`、`layout`、`readability`、`productivity`、`integration` 或 `other`。
- 將 `engine` 設為你所需的外掛引擎版本。可以參考官方外掛作為範例。
- 如果可能，請為中文、英文及其他常用語言加上 `i18n`。

## CSS 與資源限制

宣告式外掛會被當成不受信任的輸入進行驗證，因此請讓資源保持自包含：

- 不要使用 `@import`。
- 不要引用遠端圖片、外部字型或遠端 CSS。
- 可以使用一般 CSS、自訂屬性，以及 Voyager 的設定值替換。
- 外掛的類別名稱請加上 `gv-plugin-` 前綴，避免樣式滲入宿主網站或 Voyager 本身。

如果外掛需要設定，請盡量先使用數值型設定。例如，閱讀寬度外掛可以把設定值寫入 CSS 變數，再由 CSS 取用。

## DOM 操作的邊界

宣告式外掛目前支援以下操作：

- `addClass`：為目標元素加上類別。
- `setAttribute`：設定屬性。
- `setStyle`：設定行內樣式或 CSS 變數。值的結尾可加上 `!important`，以該優先順序套用；較舊的 Voyager 版本會捨棄這類值，因此若外掛依賴它，請將 `engine` 設為 `>=next`。`margin` 之類的簡寫會逐個長屬性追蹤，因此關閉某個外掛時，不會清除另一個外掛的 `margin-top`。
- `hide`：隱藏目標元素。

目標可以是 CSS 選擇器，也可以是上述的語意鍵，寫成 `{ "kind": "semantic", "key": "userTurn" }`。語意鍵通常比較穩定，但前提是目前的網站適配器已宣告該鍵。

宣告式操作必須可以還原，並且可以安全地重複執行。不要依賴一次性的頁面狀態，也不要假設頁面 DOM 永遠不會改變。

### 原語

有些行為無法只用 CSS 與可還原的 DOM 修改來描述。原語是隨 Voyager 一起打包的第一方程式碼，清單可以透過 `native` 操作以名稱呼叫它：

```json
{
  "engine": ">=1.3.0",
  "requires": { "handlers": ["formulaCopy"] },
  "contributes": {
    "domOps": [{ "op": "native", "handler": "formulaCopy", "params": {} }]
  }
}
```

清單只負責選擇一個原語並進行設定，不提供任何邏輯。`params` 會在原語執行前先由該原語驗證。

任何使用原語的外掛都要遵守兩條規則：

- 外掛匹配的每個網站，都必須宣告該原語所讀取的語意鍵（例如 `mermaid` 會讀取 `assistantTurn` 與 `codeBlock`）。`requires.handlers` 可以省略：`native` 操作本身已隱含所用的原語。
- `engine` 至少要設為首次提供該原語的引擎版本。`formulaCopy` 從引擎 1.3.0 開始提供，因此使用它的外掛要寫 `">=1.3.0"`。若寫得更低，`bun run catalog:build` 會失敗，因為舊版 Voyager 會回報缺少處理函式，而不是提示使用者更新。

原語只會增加，不會改變既有行為：新參數一律是選填的，而破壞性變更會改用新名稱。

如果外掛的行為有所改變，還可以寫一行 `changelog`，彈出視窗會將它顯示在版本號旁。翻譯請放在 `i18n.<locale>.changelog` 下，與 `name`、`description` 並列。

## 何時不適合做成一般外掛

如果功能必須執行 JavaScript、攔截網路請求、讀寫 Voyager 的內部資料，或依賴複雜的執行期邏輯，它就不適合做成一般的宣告式外掛。

請先開 Issue 說明需求。若確實需要內建能力，我們可能會考慮把它實作為 Voyager 儲存庫中的內建／原生外掛，例如 Formula Copy。

## 提交 PR 之前

執行 `bun run plugin:check <外掛目錄>`，並把輸出貼到 PR 中。它會一次列出所有問題，涵蓋清單、CSS、網站範圍、原語、語意鍵、十種語言與 README；CI 也會對每個內建外掛執行同樣的檢查。

- 外掛預設為停用，由使用者自行啟用。
- 已確認沒有幾乎相同的現有外掛；如果有，請先改進現有的外掛。
- 已在目標網站的淺色與深色主題下測試。
- `matches` 沒有涵蓋無關的網站。
- 沒有任何遠端資源引用。
- 外掛目錄包含 `plugin.json`、必要的 CSS 檔案與簡短的 README。
- 若是官方外掛，目錄位於 `catalog/sites/<site>/plugins/<id>/` 之下，`matches` 落在網站的 `matches` 範圍內，且 `catalog/marketplace.json` 已列出它（Gemini 與 AI Studio 的外掛隨 Voyager 發布，不在此限）。
- PR 說明中寫明測試頁面、截圖或錄影，以及受影響的頁面區域。

請保持簡單、聚焦、可還原。只解決一個明確問題的外掛，會更容易被合併與維護。
