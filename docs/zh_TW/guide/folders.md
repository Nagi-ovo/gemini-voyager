# 資料夾，本該如此

為什麼整理 AI 聊天記錄這麼困難？
我們解決了這個問題。我們為你的想法打造了一套檔案系統。

<div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; margin-bottom: 40px;">
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>Gemini™</b></p>
    <img src="/assets/gemini-folders.png" alt="Gemini 資料夾" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>AI Studio</b></p>
    <img src="/assets/aistudio-folders.png" alt="AI Studio 資料夾" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

## 整理的邏輯

用起來就是順手。

- **拖放**：拿起一則對話，放進資料夾。操作很直覺。
- **巢狀階層**：專案底下可以有子專案，資料夾裡還能再建資料夾。依照你的方式來組織。
- **資料夾間距**：調整垂直密度，從緊湊到寬鬆。
  > _註：在 Mac 的 Safari 上，調整可能不會即時生效，重新整理頁面即可看到效果。_
- **跨裝置同步**：在桌機上整理好，再透過 [雲端同步](/zh_TW/guide/cloud-sync) 在筆電上看到相同的資料夾。

## 實用技巧

- **多選**：長按對話進入多選模式，選取多則對話後一次全部移動。
- **重新命名**：雙擊任一資料夾即可重新命名。
- **圖示**：我們會自動偵測 Gem 類型（程式設計、創作等），並指派對應的圖示。你不需要做任何事。

## 各平台功能差異

### 共通功能

- **基本管理**：拖放、重新命名、多選。
- **智慧辨識**：自動偵測對話類型並指派圖示。
- **巢狀階層**：支援資料夾巢狀。
- **雲端同步**：透過 [雲端同步](/zh_TW/guide/cloud-sync) 備份並同步你的資料夾結構。

#### 隱藏已歸檔對話

對話一旦歸入資料夾，就等於「處理完了」，但預設情況下它仍會佔據主清單的空間。在擴充功能彈出視窗中打開 **資料夾選項**，開啟 **隱藏已歸檔對話**，主清單就只會顯示仍在進行中的對話。讓你的 AI 聊天收件匣真正清空。

- 第一次把對話歸入資料夾時，Voyager 會在資料夾區域顯示一張小卡片，讓你一鍵啟用此功能。關閉卡片後就不會再打擾你。
- 已歸檔的對話 **絕不會被刪除**，仍可完整存取於資料夾中。
- 在 AI Studio 上，已歸檔的對話會改為從 Library 表格中隱藏。Gemini 與 AI Studio 各自保有獨立的設定。
- 隨時可以在彈出視窗中切換。

### Gemini 專屬功能

#### 自訂顏色

點擊資料夾圖示即可自訂顏色。你可以從 7 種預設顏色中選擇，也可以使用色彩選擇器挑選任意顏色。

<img src="/assets/folder-color.png" alt="資料夾顏色" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### 帳號隔離

人像圖示會暫時只顯示目前 Google 帳號的對話，預設為關閉。資料夾選項中的 **啟用硬隔離（Hard Isolation）** 則更進一步，會依帳號分開儲存資料夾與雲端同步的資料。開啟硬隔離後，人像篩選就沒有必要，會自動隱藏。

<img src="/assets/current-user-only.png" alt="帳號隔離" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### AI 自動整理

對話太多，懶得分類？交給 Gemini 來想。

一鍵複製目前的對話結構，貼進 Gemini，它就會產生一份可以直接匯入的資料夾方案。

**步驟一：複製你的對話結構**

在擴充功能彈出視窗的資料夾區域底部，點擊 **AI 整理** 按鈕。它會自動收集所有尚未歸類的對話與現有的資料夾結構，產生提示詞並複製到剪貼簿。

<img src="/assets/ai-auto-folder.png" alt="AI 整理按鈕" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**步驟二：讓 Gemini 完成分類**

把剪貼簿內容貼進 Gemini 對話。它會分析你的對話標題，並輸出一份 JSON 格式的資料夾方案。

**步驟三：匯入結果**

在資料夾面板的選單中點擊 **匯入資料夾**，選擇 **或直接貼上 JSON**，貼上 Gemini 回傳的 JSON，然後點擊 **匯入**。

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="匯入選單" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="貼上 JSON 匯入" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **增量合併**：預設採用「與現有資料夾合併」策略，只會新增資料夾與對話歸屬，絕不會破壞你現有的整理結構。
- **多語言**：提示詞會使用你設定的語言，資料夾名稱也會以該語言產生。

#### 資料夾作為專案

想讓新對話自動套用一組輕量的專案預設？任何資料夾都可以變成專案。
這個概念參考了 Claude Projects，但 Voyager 採用的是更輕量的版本：以資料夾為單位的首則訊息指令，加上自動歸檔，而不是共用的上下文工作區。

1. 在擴充功能彈出視窗中開啟 `啟用資料夾作為專案`。
2. 右鍵點擊資料夾，選擇 `設定指令` 或 `編輯指令`。
3. 開啟新的 Gemini 對話，使用輸入框旁的資料夾選擇器選取該資料夾。
4. 傳送你的第一則訊息。

接下來會發生的事：

- 第一則訊息傳送後，此對話會自動歸入該資料夾。
- 如果資料夾設定了指令，Voyager 只會在第一次傳送時把這些指令附加在前面。
- 如果資料夾沒有指令，它仍可作為快速歸檔的捷徑。
- 同一資料夾中的對話 **不會** 共用記憶，也不會自動互相讀取。
- 草稿自動儲存只會保留你輸入的文字，隱藏的指令不會被還原到輸入框中。

### AI Studio 專屬功能

- **側邊欄調整**：拖曳即可調整側邊欄寬度。
- **Library 整合**：可以直接從 Library 把項目拖曳到資料夾中。

### ChatGPT

資料夾也以內建外掛的形式提供給 ChatGPT。你會在 ChatGPT 側邊欄中看到資料夾區域，並擁有同樣的浮動面板。在對話選單中選擇 **移動到資料夾**，或直接把對話列拖到資料夾上，即可歸檔。匯入、匯出與活動檢視在這裡同樣可用。你可以在彈出視窗的 **外掛** 區段中開啟或關閉此功能。
