# 撰寫自己的外掛

本機外掛是你為自己做的外掛：它能改變 Gemini、AI Studio、ChatGPT、Claude 或 DeepSeek 的外觀與版面，只存在你的瀏覽器中，不需要提交 PR，也不需要 Voyager 的原始碼。

和所有 Voyager 外掛一樣，它是宣告式的：一份 `plugin.json` 清單加上 CSS，本身不執行任何程式碼。Voyager 會在匯入時檢查它、套用它的修改，並在你關閉外掛時還原所有修改。匯入的外掛預設為關閉，你可以先檢視過一遍再開啟。

## 三種做法

### 用一句話描述，交給任何 AI 來寫

1. 打開你想改造的網站，開啟 Voyager 彈出視窗，找到 **本機外掛** 卡片（在 Gemini 與 AI Studio 上，它是設定中的最後一個項目）。
2. 選擇 **用一句話改造介面**，寫下一句話（例如「讓我的訊息窄一點，並隱藏側邊欄」），然後選擇 **產生提示詞**。
3. 自行將提示詞複製到任何 AI 對話中，再把它的完整回覆貼回來，選擇 **檢查回覆**。
4. Voyager 會用白話說明這個外掛會改變什麼。匯入後，在外掛清單中將它開啟即可。

Voyager 不會把提示詞傳送到任何地方：要用哪一個 AI 由你決定，文字也由你自己來回搬運。

### 交給程式設計 Agent

如果你正在使用程式設計 Agent（Claude Code、Codex、Cursor 等），請把 Voyager 的外掛 skill 提供給它：

```text
https://voyager.nagi.fun/skills/write-voyager-plugin/SKILL.md
```

在 **本機外掛** 卡片中打開 **用一句話改造介面**，就會看到 **複製 skill 連結** 按鈕。這個 skill 收錄了完整規範：清單欄位、每個網站宣告了哪些項目、可用的原語，以及外掛做不到的事。告訴 Agent 你想要的修改，它會建立資料夾、寫好 `plugin.json` 與 `style.css`，並在離線狀態下完成檢查。接著在彈出視窗中選擇 **匯入檔案**，選取這兩個檔案即可。

若想讓 Agent 持續使用這個 skill，請把檔案存成 Agent skills 資料夾中的 `write-voyager-plugin/SKILL.md`（Claude Code 為 `~/.claude/skills/`）。

### 自己動手寫

需要 Node.js 18 或更新版本：

```sh
npx create-voyager-plugin@latest init my-plugin --site claude
# 編輯 my-plugin/plugin.json 和 my-plugin/style.css
npx create-voyager-plugin@latest check my-plugin
```

`init` 會產生一份已能通過檢查的 `plugin.json` 與 `style.css`，另外附上一份寫有該網站規則的 `AGENTS.md`。`--site` 可以填入 `gemini`、`aistudio`、`chatgpt`、`claude` 或 `deepseek`。

`check` 會離線執行與彈出視窗匯入時完全相同的檢查。外掛可以順利匯入時以結束代碼 0 結束；否則會為每個問題輸出一行 `path: message`。加上 `--json` 可取得機器可讀的輸出。

## 外掛能做什麼

- 加入 CSS，作用範圍限定在外掛替頁面加上的 `gv-` class 之下。
- 加入 class、設定安全的屬性或行內樣式，或隱藏元素。目標可以是網站宣告的語意錨點（`userTurn`、`assistantTurn`、`composer` 等），也可以是 CSS 選擇器。
- 在彈出視窗中提供設定：開關、滑桿與下拉選單，設定值會透過 `{{key}}` 代入 CSS。
- 在 ChatGPT、Claude 與 DeepSeek 上，啟用 Voyager 的原語（公式複製、時間軸、Mermaid 圖表等），並替 Voyager 自己的介面換色。

## 外掛做不到什麼

外掛不能執行 JavaScript、不能回應點擊或按鍵、不能從網路載入任何東西（字型、圖片、樣式表）、不能讀取或改寫訊息內容，也不能在其他網站上執行。如果需求涉及上述任何一項，撰寫材料會讓 AI 直接說明，並做出最接近且真正能運作的版本。

## 匯入時檢查的規則

除了共通的清單檢查（見[外掛貢獻指南](/zh_TW/guide/plugin-contribution)），本機外掛還必須：

- 只匹配 Voyager 支援的網站範圍內的 URL；
- 只使用每個匹配網站都有宣告的語意錨點；
- 每個 `addClass` 只加一個 class，且以 `gv-` 開頭；
- 只使用 boolean、number 或 select 設定（string 與 color 目前在彈出視窗中還沒有對應的控制項）；
- 在 Gemini 與 AI Studio 上不使用 `theme`，且原語只能使用各網站開放的項目：Gemini 上為 `formulaCopy`、`vimInput`、`userLatex`、`codeCollapse`、`mermaid`、`wavedrom`、`echarts`、`sendShortcut`、`draftSave` 與 `turnNavigator`；AI Studio 上為 `formulaCopy` 與 `sendShortcut`。這些原語與 Voyager 內建的對應設定執行的是同一套程式碼。`formulaCopy` 與 `vimInput`（即「公式複製」與「輸入框 Vim 模式」）在同一個頁面中每次只會執行一個，由內建設定或外掛擇一。頁面剛載入時，或兩者都未執行時，內建開關優先；之後已在執行的那一方會繼續執行，另一方則顯示為暫停。關閉其中一方，即可把該功能交給另一方。`userLatex`、`codeCollapse`、`mermaid`、`wavedrom` 與 `echarts` 會逐一元素認領，可與內建設定同時執行：如果某一行或程式碼區塊已由另一方處理，就留給對方。

Gemini 個人版目前已支援本機 `turnNavigator`：設定 `params.dataBackend: "shared"` 與 `engine: ">=1.9.0"` 即可。它會讀寫與官方時間軸相同的星號標記與層級資料；對話、帳號與回合的識別參數則無法被覆寫。官方的 **顯示時間軸** 設定會與之衝突：請先關閉該官方設定，再啟用本機外掛。若要切回官方時間軸，請先停用本機外掛，再開啟官方設定。Business、Enterprise 與自訂網站的範圍暫不支援。

翻譯（`i18n`）為選填。

## 分享

本機外掛只存在於你的瀏覽器中。若要搬到其他地方使用，請在外掛清單中匯出它的 JSON。如果它對大家都有幫助，可以提議收錄到官方外掛目錄，流程請見[外掛貢獻指南](/zh_TW/guide/plugin-contribution)。

在所有網站上，每個頁面只會執行一個傳送快捷鍵外掛。當某個外掛已占用傳送模式時，另一個會顯示衝突並暫停。選填的 `mode`（需要 `"engine": ">=next"`，於 1.9.0 版發布）可為 `ctrlEnterSends`（預設）或 `enterSends`。輸入法確認鍵不會觸發傳送。Gemini 與 AI Studio 現在也開放此功能，支援的模式見下文。

Gemini 現在允許 `sendShortcut` 取代官方的 Ctrl+Enter 傳送功能：請先關閉官方開關，再啟用本機外掛。目前只支援 `ctrlEnterSends`，Enterprise 不會執行。`composerRoot` 涵蓋主要輸入框與編輯輸入框；`sendButton` 不包含停止按鈕。

在 AI Studio 上，`sendShortcut` 必須設定 `params.mode: "enterSends"`。關閉官方的 Enter 傳送開關後，本機外掛即可接管。Ctrl/Cmd+Enter 會換行；Shift/Alt+Enter 則交由網站處理。

在 Gemini 上，`draftSave` 與官方草稿共用 `gvDraft_<完整 pathname>` 紀錄，包括 `/u/N` 與 Gem 路由。停用後，已儲存的草稿會保留；同一頁面上的多個外掛可共用這些紀錄。頁面卸載時會盡力儲存最後一次輸入，但瀏覽器關閉時無法保證非同步儲存會完成。寫入與修剪僅在同一頁面內協調；在同一個 `/u/N` 槽位中更換電子郵件，仍會共用已儲存的草稿。
