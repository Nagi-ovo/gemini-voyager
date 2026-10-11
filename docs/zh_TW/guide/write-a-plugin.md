# 撰寫自己的外掛

本機外掛是你為自己做的外掛：它能改變 Gemini、AI Studio、ChatGPT、Claude 或 DeepSeek 的外觀與版面，只存在你的瀏覽器裡，不需要發 PR，也不需要 Voyager 的原始碼。

和所有 Voyager 外掛一樣，它是宣告式的：一份 `plugin.json` 清單加上 CSS，本身不執行任何程式碼。Voyager 會在匯入時檢查它、套用它的修改，關閉時再把所有修改全部還原。匯入的外掛預設是關閉的，你可以先看過一遍再開啟。

## 三種做法

### 用一句話描述，交給任何 AI 來寫

1. 打開想要改造的網站，打開 Voyager popup，找到「本機外掛」卡片（在 Gemini 和 AI Studio 上，它是設定裡的最後一項）。
2. 選擇「用一句話改造介面」，寫下一句話（例如「讓我的訊息窄一點，並隱藏側邊欄」），再選擇「產生提示詞」。
3. 自己把提示詞複製到任何 AI 對話裡，再把它的完整回覆貼回來，選擇「檢查回覆」。
4. Voyager 會用白話說明這個外掛改了什麼。匯入之後，到外掛清單裡把它開啟。

Voyager 不會把提示詞送到任何地方：要用哪個 AI 由你決定，文字也由你自己來回搬。

### 交給程式設計 Agent

如果你在用程式設計 Agent（Claude Code、Codex、Cursor 等），把 Voyager 的外掛 skill 給它：

```text
https://voyager.nagi.fun/skills/write-voyager-plugin/SKILL.md
```

在「本機外掛」卡片裡打開「用一句話改造介面」，就會看到「複製 skill 連結」按鈕。這個 skill 收錄了完整的規範：清單欄位、每個網站宣告了哪些東西、可用的原語，以及外掛做不到的事。告訴 Agent 你想要的修改，它會建立資料夾、寫好 `plugin.json` 和 `style.css`，並在離線狀態下完成檢查。接著在 popup 裡選擇「匯入檔案」，選取這兩個檔案就行了。

想讓 Agent 一直帶著這個 skill，可以把檔案存成 Agent skills 資料夾下的 `write-voyager-plugin/SKILL.md`（Claude Code 是 `~/.claude/skills/`）。

### 自己動手寫

需要 Node.js 18 或更新版本：

```sh
npx create-voyager-plugin@latest init my-plugin --site claude
# 編輯 my-plugin/plugin.json 和 my-plugin/style.css
npx create-voyager-plugin@latest check my-plugin
```

`init` 會產生一份已經能通過檢查的 `plugin.json` 和 `style.css`，另外附上一份寫有該網站規則的 `AGENTS.md`。`--site` 可以填 `gemini`、`aistudio`、`chatgpt`、`claude` 或 `deepseek`。

`check` 會離線執行和 popup 匯入時完全相同的檢查。外掛能順利匯入時以結束代碼 0 結束，否則每個問題輸出一行 `path: message`。加上 `--json` 可以取得機器可讀的輸出。

## 外掛能做什麼

- 加入 CSS，作用範圍限定在外掛替頁面加上的 `gv-` class 之下。
- 加入 class、設定安全的屬性或行內樣式、隱藏元素。目標可以是網站宣告的語義鍵（`userTurn`、`assistantTurn`、`composer` 等），也可以是 CSS 選擇器。
- 在 popup 裡提供設定：開關、滑桿和下拉選單，設定值會透過 `{{key}}` 帶進 CSS。
- 在 ChatGPT、Claude 和 DeepSeek 上，啟用 Voyager 的原語（公式複製、時間軸、Mermaid 圖表等），並替 Voyager 自己的介面換色。

## 外掛做不到什麼

外掛不能執行 JavaScript，不能回應點擊或按鍵，不能從網路載入任何東西（字型、圖片、樣式表），不能讀取或改寫訊息內容，也不能在其他網站上執行。如果需求牽涉到這些，撰寫材料會讓 AI 直接說明，並做出最接近、又真的能實現的版本。

## 匯入時檢查的規則

除了共通的清單檢查（見[外掛貢獻說明](./plugin-contribution.md)），本機外掛還必須：

- 只匹配 Voyager 支援的網站範圍內的 URL；
- 只使用每個匹配網站都有宣告的語義鍵；
- 每個 `addClass` 只加一個 class，而且以 `gv-` 開頭；
- 只使用 boolean、number 或 select 設定（string 和 color 目前在 popup 裡還沒有對應的控制項）；
- 在 Gemini 和 AI Studio 上不使用 `theme`；原語只能用該網站開放的：Gemini 上是 `formulaCopy` 和 `vimInput`，AI Studio 上是 `formulaCopy`。它們與 Voyager 內建的「公式複製」「輸入框 Vim 模式」是同一套程式碼，同一頁面上兩者只會執行一個：頁面剛載入、或兩者都沒在執行時，內建開關優先；之後誰已經在執行就繼續執行，另一方顯示為暫停。關掉其中一個，功能就交給另一個。

翻譯（`i18n`）是選填的。

## 分享

本機外掛只存在你的瀏覽器裡；想搬到別的地方用，就在外掛清單裡匯出它的 JSON。如果它對大家都有幫助，可以提議收進官方外掛目錄，流程請見[外掛貢獻說明](./plugin-contribution.md)。
