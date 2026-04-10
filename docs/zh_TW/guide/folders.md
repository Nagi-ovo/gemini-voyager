# 資料夾，本該如此

整理 AI 聊天記錄，以前怎麼那麼難？
我們修好了。給你的思緒，裝個檔案系統。

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

## 整理的直覺

手感對了，一切都對了。

- **拖拽**：抓起來，扔進去。真實物理回饋。
- **套娃**：大項目套小項目。無限層級，隨你怎麼。
- **間距**：自由調整側邊欄密度，從緊湊到寬鬆。
  > _注：Mac Safari 上的調整可能不是即時的，重新整理頁面即可生效。_
- **同步**：電腦上理好，筆記本上就能用。

## 絕招

- **多選**：長按對話項進入多選模式，批次操作，一次搞定。
- **改名**：雙擊資料夾，直接改。
- **識圖**：代碼、寫作、閒聊... 我們自動識別 Gem 類型，配上圖標。你只管用，剩下的交給我們。

## 平台特性差異

### 通用功能

- **基礎管理**：拖拽排序、重命名、多選操作。
- **智能識別**：自動識別對話類型並匹配圖標。
- **多級目錄**：支持資料夾嵌套，結構更深邃。
- **AI Studio 適配**：上述進階功能即將支持 AI Studio。
- **Google Drive 同步**：支持將資料夾結構同步到 Google Drive。

### Gemini 專屬增強

#### 自定義顏色

點擊資料夾圖標自定義顏色。內置 7 種默認配色，亦支持通過調色盤選取你的專屬色彩。

<img src="/assets/folder-color.png" alt="資料夾配色" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### 帳號隔離

點擊頂欄的「人像」圖標，即可自動屏蔽其他 Google 帳號的對話。在多帳號共用瀏覽器時，讓你的工作區保持純淨。

<img src="/assets/current-user-only.png" alt="帳號隔離模式" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### AI 自動整理

聊天太多，懶得分類？讓 Gemini 幫你動腦。

一鍵複製你現有的對話結構，貼進 Gemini，它就會生成一份可以直接匯入的資料夾方案——秒速整理。

**第一步：複製你的對話結構**

在擴充套件彈窗的資料夾區塊底部，點擊 **AI 整理** 按鈕。它會自動收集所有未歸類的對話和現有資料夾結構，生成提示詞並複製到剪貼簿。

<img src="/assets/ai-auto-folder.png" alt="AI Organize Button" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**第二步：讓 Gemini 來分類**

將剪貼簿內容貼進 Gemini 對話。它會分析你的聊天標題，然後輸出一份 JSON 資料夾方案。

**第三步：匯入結果**

在資料夾面板選單中點擊 **匯入資料夾**，選擇 **或直接貼上 JSON**，貼上 Gemini 回傳的 JSON，然後點擊 **匯入**。

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="Import Menu" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="Paste JSON Import" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **增量合併**：預設採用「合併」策略——只新增資料夾和分配，絕不破壞你現有的組織結構。
- **多語言支援**：提示詞會自動使用你設定的語言，資料夾名稱也會以該語言生成。

#### 資料夾即專案

想讓新對話自帶一套輕量「專案預設」？把任意資料夾變成專案即可。
這個設計參考了 Claude Projects，但 Voyager 採用的是更輕量的實作：基於資料夾的首輪指令 + 自動歸檔，而不是共享上下文工作區。

1. 在擴充功能彈窗中開啟 `啟用資料夾作為專案`。
2. 右鍵某個資料夾，選擇 `設定指令` 或 `編輯指令`。
3. 打開一個新的 Gemini 對話，在輸入框旁的資料夾選擇器裡選中它。
4. 傳送第一則訊息。

接下來會發生什麼：

- 首次傳送後，這個對話會自動歸入該資料夾。
- 如果資料夾設定了指令，Voyager 只會在第一次傳送時臨時附加這些指令。
- 如果資料夾沒有指令，它仍然可以作為一個快速歸檔入口。
- 同一資料夾下的對話 **不會** 共享記憶，也不會自動互相讀取內容。
- 草稿自動儲存只會保留你輸入的正文，不會把隱藏指令重新塞回輸入框。

### AI Studio 專屬增強

- **側邊欄調節**：鼠標拖拽邊緣，自由調整側邊欄寬度。
- **庫拖拽支持**：支持直接從 Library 列表中拖拽項目到資料夾。
