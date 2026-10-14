# 外掛貢獻說明

Voyager 的外掛系統優先支援宣告式外掛：用 `plugin.json` 描述外掛資訊與 DOM 操作，再用 CSS 描述樣式。外掛本身不執行遠端 JavaScript，而是由 Voyager 內建的外掛引擎解讀這些資料。

這讓外掛更容易審查與維護。如果你想貢獻外掛，建議先從這條路徑開始。

## 只給自己用：本機外掛

只需要在自己瀏覽器中使用的外掛，不必走這套流程。把它做成本機外掛，再於彈出視窗中匯入即可：不需要 Issue、不需要 PR，也不需要 clone 儲存庫。[撰寫你自己的外掛](/zh_TW/guide/write-a-plugin) 說明了三種建立方式，包括 `create-voyager-plugin` 檢查工具與給程式代理使用的 skill。

## 建議流程

1. 先確認它適合做成外掛：閱讀寬度、排版修正、主題微調、隱藏或標記頁面元素、簡單的網站適配，通常都適合宣告式外掛。
2. 先在 Voyager 主倉庫提交 Issue，說明它解決的問題、目標網站，以及和現有外掛相比的差異；等待維護者明確同意方案後再開始實作和提交 PR。
3. 使用 `plugin.json` 撰寫外掛中繼資料、匹配網站和貢獻內容。
4. 將樣式放進同目錄的 `style.css`，再由 `plugin.json` 的 `contributes.styles` 引用。
5. 本地測試後提交 PR，並附上測試頁面、截圖或錄影。維護者會依外掛成熟度決定是否進入官方 catalog。

## 目錄結構

官方內建外掛都放在 `src/features/plugins/catalog/` 下面，一個外掛平台一個目錄：

```
src/features/plugins/catalog/
  marketplace.json                        文件站外掛市集讀取的索引
  sites/<site>/site.json                  網站適配器（資料形式）
  sites/<site>/plugins/<id>/plugin.json   一個宣告式外掛
  sites/<site>/plugins/<id>/style.css     它的樣式
  sites/<site>/plugins/<id>/README.md     它修了什麼、為什麼這樣修
```

尋找流程是自動的：`catalog/sites/index.ts` 用 `import.meta.glob` 找出每個 `site.json` 和每個 `plugin.json`，所以新增網站或外掛就是新增檔案，沒有對照表需要維護。

`marketplace.json` 不是那張對照表，它只是文件站外掛市集讀取的索引；有測試確保它和自動尋找的結果一致，所以新外掛也要在裡面加一筆，`source` 寫 catalog 相對路徑，例如 `sites/deepseek/plugins/reading-width/plugin.json`。`sites/gemini/` 和 `sites/aistudio/` 下的外掛是例外：它們隨 Voyager 一起發布，不列入 `marketplace.json`。

外掛的 `matches` 必須落在所屬網站的 `matches` 範圍內；越界的外掛會讓建置失敗。

## 語義選擇器鍵

`site.json` 把一組固定的語義鍵對應到網站自己的 CSS 選擇器。這組詞彙定義在 `src/features/plugins/sites/semanticKeys.ts`，`site.json` 只能使用表內的鍵，用了表外的鍵會被拒絕。

- `userTurn`：使用者訊息容器。
- `assistantTurn`：助手訊息容器。
- `thinkingBlock`：助手回覆裡的思考段落。
- `codeBlock`：算繪後的程式碼區塊。
- `composer`：使用者輸入框。
- `sidebar`：對話列表或導覽列。
- `sidePanel`：次要面板，例如 artifacts 或 canvas。
- `headerActions`：對話頁右上角的操作區。
- `scrollContainer`：負責捲動對話的元素。
- `composerRoot`：輸入框及其操作按鈕所在的容器。
- `sendButton`：傳送按鈕；有些網站只在輸入框有內容時才顯示它。

網站只需要宣告它真正能提供的鍵。外掛以 `{ "kind": "semantic", "key": "userTurn" }` 當作 DOM 操作的 `target` 來引用語義鍵，而不是寫死選擇器，這樣網站改版時只要改 `site.json` 一個檔案。

`conversationIdPattern` 是 `site.json` 裡的另一個欄位，不是選擇器：它是比對 URL 路徑的正規表示式，第一個擷取群組就是對話 id，例如 `^/chat/([^/?#]+)`。

## 新增平台

新增一個聊天網站，分為兩個獨立的層次：

1. **網站適配器**，即 `catalog/sites/<site>/site.json`，告訴 Voyager 如何辨識這個網站，並找到它的使用者訊息、助理訊息、輸入框、側邊欄與主題標記。
2. **外掛**，位於 `catalog/sites/<site>/plugins/<id>/`，用來解決該網站上某一個面向使用者的問題，例如閱讀寬度或轉譯修正。

`site.json` 包含 `id`（與其目錄名相同）、`label`、`matches`、`selectors`、`theme`、`brandColor`、`capabilities`，以及選填的 `conversationIdPattern` 與 `turnKeyAttributes`。`turnKeyAttributes` 指定當頁面重新轉譯使用者訊息時，用來保持其身分識別的屬性。送出追蹤（供資料夾活動與時間軸時間戳記使用）只會在有設定它的網站上執行，並同時需要 `composer`、`userTurn` 與 `conversationIdPattern`。`src/features/plugins/sites/siteAdapterData.ts` 中的 `validateSiteAdapterData` 會驗證它，而 `bun run catalog:build` 會在發布前驗證每個網站與外掛。

`site.json` 就是網站適配器本身，只是寫成了資料。目前的外掛平台是 ChatGPT、Claude 和 DeepSeek。Gemini 和 AI Studio 是 Voyager 的原生介面，同樣有各自的 `site.json`（`catalog/sites/gemini/`、`catalog/sites/aistudio/`），但它隨擴充功能打包，不會發布到遠端目錄；`sites/adapters/` 下的 `gemini.ts`、`aistudio.ts`、`claude.ts`、`chatgpt.ts`、`deepseek.ts` 現在都只是 `site.json` 的一行外殼，要改就改 JSON，不要改 TypeScript。發布的分網站目錄也帶上了網站資料，所以 `site.json` 裡的選擇器修正不必發新版本就能送到使用者手上。全新的網站仍然需要發新版本，因為它還需要隨套件發布主機權限與內容腳本註冊。

以 DeepSeek 這類新平台為例，適配器的工作應聚焦於平台契約。請在同一個完整的變更中提交 `site.json`、必要的選擇器測試，以及說明支援範圍所需的最少文件。網站註冊表會直接從檔案中取得新適配器，因此不需要修改任何註冊清單。不要為每個外掛都新增一個網站。

適配器被接受後，後續的外掛可以各自以獨立、聚焦的變更提交。如果多個變更彼此相依，使用堆疊式 PR 鏈會很有用：後一個分支以前一個分支為基礎，每個 PR 只顯示自己增量的功能。整條鏈仍須遵守相同的範圍原則：每個 PR 只解決一個明確的使用者目標，並附上必要的測試與清理。

網站支援不需要模型 API 整合。新平台不要加入靜態內容腳本或必要的主機權限；僅供外掛使用的網站，請使用既有的選用權限與動態註冊流程。

選用權限與動態註冊流程取決於瀏覽器版本。Chrome 與 Edge 支援擴充功能所使用的流程。Firefox 需要 128 或更新版本才能使用選用主機權限，Safari 需要 16.4 或更新版本才能使用動態內容腳本註冊。在較舊的受支援瀏覽器版本上，彈出視窗可能會正確地拒絕為自訂網站啟用外掛，因為所需 API 無法提供持久的授權。請不要為了繞過這個限制而加入範圍過大的靜態主機權限，除非維護者同意。

## 外掛粒度

外掛應該以「使用者想解決的問題」為邊界，而不是機械地按平台拆分。

catalog 裡的外掛屬於單一網站資料夾，它的每個 `matches` 都必須落在該資料夾 `site.json` 的範圍內（否則 `bun run plugin:check` 會失敗），所以同一個外掛不能同時覆蓋 Claude 和 ChatGPT。如果同一個功能適用多個平台，例如「閱讀寬度」「翻頁體驗」「程式碼區塊排版」，就在每個網站資料夾各做一個外掛（例如 `sites/claude/plugins/reading-width` 和 `sites/chatgpt/plugins/reading-width`），並讓名稱、設定和說明保持一致。

但如果不同平台需要完全不同的設定、DOM 邏輯或使用者文案，拆成多個外掛會更清楚。不要為了「一個外掛管所有事」把無關功能硬塞在一起；一個外掛最好只解決一個明確問題。

簡單判斷：

- 同一個使用者目標、同一組設定、只是網站選擇器不同：每個網站資料夾各做一個外掛，名稱與設定保持一致。
- 同一個主題但每個平台體驗差異很大：可以拆開，但名稱和說明保持關聯。
- 功能目標不同：不要合併。

## 避免重複外掛

提交前請先看外掛市集和已有官方外掛。如果已經有一個好用的外掛，優先為它提交改進 PR，而不是再做一個類似外掛。

重複外掛只有在有明顯提升時才值得接受，例如：

- 覆蓋了原外掛不支援的重要平台。
- 修復了原外掛長期無法解決的相容性問題。
- 有明顯更好的效能、可存取性或維護性。
- 提供了不同但足夠清楚的使用者體驗，而不只是換名字或微調樣式。

這樣外掛市集會更乾淨，使用者也更容易選擇。

## 最小範例

不用從空目錄開始：`bun run plugin:new <id-segment> --site <site>` 會產生 `catalog/sites/<site>/plugins/<id-segment>/`，裡面有 `plugin.json`、`style.css` 和 `README.md`，並順手往 `marketplace.json` 追加對應條目。它產生的只是起點，不代表已經通過審核；你要填的清單長這樣：

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

`$schema` 這行是可選的，只服務於編輯器：它指向清單的 JSON Schema，讓編輯器邊寫邊驗證和補完。`site.json` 也有自己的一份，位址是 `https://voyager.nagi.fun/site.schema.json`。

`style.css` 可以像普通 CSS 一樣撰寫，但建議所有外掛樣式都掛在自己的 `gv-plugin-*` 類別下面：

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## Manifest 注意事項

- `id` 使用反向網域或作者前綴，例如 `your-name.reading-width`，避免和其他外掛衝突。
- `matches` 盡量收窄，只匹配外掛真正需要生效的網站。
- `matches` 只有在所屬網站的 `site.json` 全部涵蓋時，才能列出多個主機（例如 chatgpt.com 和 chat.openai.com）；要支援其他網站，請在該網站的資料夾新增外掛。
- `category` 建議使用 `render-fix`、`theme`、`layout`、`readability`、`productivity`、`integration` 或 `other`。
- `engine` 寫清楚需要的外掛引擎版本。官方外掛可參考目前目錄中的範例。
- `i18n` 推薦補齊中文、英文和其他常用語言的名稱、描述、設定項文案。

## CSS 與資源限制

宣告式外掛會被當作不可信輸入驗證，所以請保持資源自包含：

- 不要使用 `@import`。
- 不要引用外鏈圖片、外部字體或遠端 CSS。
- 可以使用普通 CSS、自訂屬性和 Voyager 提供的設定值替換。
- 類別名稱請使用 `gv-plugin-` 前綴，避免污染宿主網站或 Voyager 自身樣式。

如果外掛需要使用者設定，建議先使用數字型設定；例如閱讀寬度外掛可以用設定值寫入 CSS 變數，再由樣式消費。

## DOM 操作邊界

目前宣告式外掛支援這些操作：

- `addClass`：給目標元素添加類別名稱。
- `setAttribute`：設定屬性。
- `setStyle`：設定行內樣式或 CSS 變數。值的結尾可加上 `!important`，以該優先順序套用；較舊的 Voyager 版本會捨棄這類值，因此若外掛依賴它，請將 `engine` 設為 `>=1.9.0`。`margin` 之類的簡寫會逐個長屬性追蹤，因此關閉某個外掛時，不會清除另一個外掛的 `margin-top`。
- `hide`：隱藏目標元素。

目標可以是 CSS 選擇器，也可以是上面列出的語義鍵，寫成 `{ "kind": "semantic", "key": "userTurn" }`。語義鍵通常更穩定，但需要目前網站適配器宣告了這個鍵。

宣告式操作必須可撤銷、可重複執行。不要依賴一次性的頁面狀態，也不要假設頁面 DOM 永遠不變。

### 原語

有些行為沒辦法只用 CSS 和可撤銷的 DOM 修改描述出來。原語是隨 Voyager 一起打包的第一方程式碼，清單可以透過 `native` 操作按名稱呼叫它：

```json
{
  "engine": ">=1.3.0",
  "requires": { "handlers": ["formulaCopy"] },
  "contributes": {
    "domOps": [{ "op": "native", "handler": "formulaCopy", "params": {} }]
  }
}
```

清單只負責挑一個原語並給它設定，不提供邏輯；`params` 會先由該原語驗證，然後才會執行。

用到原語的外掛要遵守兩條規則：

- 外掛匹配的每個網站都必須宣告該原語讀取的語意鍵（例如 `mermaid` 讀取 `assistantTurn` 和 `codeBlock`）。`requires.handlers` 可寫可不寫：`native` 操作本身就隱含了它用到的原語。
- `engine` 至少要寫到首次提供該原語的引擎版本。`formulaCopy` 從引擎 1.3.0 開始提供，所以用到它的外掛寫 `">=1.3.0"`。寫低了 `bun run catalog:build` 會失敗，因為舊版 Voyager 那時會回報缺少 handler，而不是提示使用者升級。

原語只增不改：新參數一定是可選的，破壞性變更會換一個新名字。

有行為變化的外掛還可以寫一行 `changelog`，popup 會把它顯示在版本號旁邊。翻譯放在 `i18n.<locale>.changelog`，和 `name`、`description` 並列。

## 什麼時候不適合做成普通外掛

如果功能必須執行 JavaScript、攔截請求、讀寫 Voyager 內部資料，或依賴複雜的執行期邏輯，它就不適合作為普通宣告式外掛提交。

這類功能請先開 Issue 說明需求。確實需要內建能力時，我們會考慮把它做成 Voyager 主倉庫裡的 builtin/native 外掛，例如 Formula Copy。

## PR 前檢查

先跑 `bun run plugin:check <外掛目錄>`，並把輸出貼進 PR。它會一次列出所有問題：清單和 CSS、`matches` 是否越出網站範圍、原語、語義鍵、十種語言的翻譯，以及 README；CI 也會對每個內建外掛跑同一套檢查。

- 外掛預設關閉，使用者需要自己啟用。
- 已檢查沒有功能幾乎相同的現有外掛；如果有，優先改進現有外掛。
- 在目標網站的淺色和深色主題都測試過。
- `matches` 沒有覆蓋無關網站。
- 沒有遠端資源引用。
- 外掛目錄包含 `plugin.json`、必要的 CSS 檔案和簡短 README。
- 官方外掛的目錄位於 `catalog/sites/<site>/plugins/<id>/`，`matches` 落在網站 `matches` 範圍內，且 `catalog/marketplace.json` 有對應條目（Gemini 和 AI Studio 的外掛隨 Voyager 發布，不在此限）。
- PR 描述裡寫清楚測試頁面、截圖或錄影，以及可能影響的頁面區域。

保持簡單、克制、可撤銷。一個外掛只解決一個明確問題，通常會更容易合併和維護。
