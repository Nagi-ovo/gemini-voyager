# 安裝

::: info 最新消息
🍎 **Safari 原生擴充功能已推出！** 完全免費，支援一鍵安裝。
:::

請選擇安裝方式。

> ⚠️ 注意：提示詞管理器是唯一支援 Gemini™ 企業版的功能。

## 1. 擴充功能商店（推薦）

最簡單的方式，更新會自動完成。

**Chrome / Edge / Brave / Opera / Vivaldi：**

[<img src="https://img.shields.io/badge/Chrome_線上應用程式商店-前往下載-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="從 Chrome 線上應用程式商店安裝" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=zh_tw)

**Microsoft Edge：**

[<img src="https://img.shields.io/badge/Microsoft_Edge-前往下載-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="從 Microsoft Edge 增益集安裝" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Edge 使用者**：Voyager 仍會在 [Edge 增益集](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne) 上持續維護，特別適合需要在行動裝置或平板上使用 Edge 的使用者。如果審核延遲，Chrome 線上應用程式商店版與 GitHub 手動安裝套件仍可使用。

**Firefox：**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-前往下載-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="從 Firefox 附加元件安裝" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. 手動安裝（搶先體驗最新功能）

商店審核可能需要一些時間。如果你想立即使用最新版本，請採用手動安裝。

**Chrome / Edge / Brave / Opera：**

1. 前往 [GitHub Releases](https://github.com/voyager-crew/voyager/releases)，下載最新的 `voyager-chrome-vX.Y.Z.zip`。
2. 解壓縮檔案。
3. 開啟瀏覽器的擴充功能頁面（`chrome://extensions`）。
4. 開啟右上角的 **開發人員模式**。
5. 點擊 **載入未封裝項目**，選擇剛才解壓縮的資料夾。

**Firefox：**

1. 前往 [Releases](https://github.com/voyager-crew/voyager/releases)，下載最新的 `voyager-firefox-vX.Y.Z.xpi`。
2. 開啟附加元件管理員（`about:addons`）。
3. 將 `.xpi` 檔案拖放進去即可安裝（或點擊齒輪 ⚙️ -> **從檔案安裝附加元件**）。

> 💡 XPI 檔案已通過 Mozilla 官方簽署，可在所有 Firefox 版本中永久安裝。

## 3. Safari（macOS）

Safari 現在支援直接發布！請下載已預先簽署的 App：

::: warning 從 `Gemini Voyager.app` 升級
目前的 App 名稱已改為 `Voyager.app`。由於 macOS 不會取代檔名不同的 App，請勿同時保留兩個版本。

1. 在舊版擴充功能中，開啟你使用的 Gemini 與 AI Studio 分頁，然後執行 **雲端同步 > 上傳到雲端**。如果你使用醒目標示同步，請在上傳前啟用醒目標示同步。
2. 將提示詞庫匯出為本機 JSON 檔案，作為獨立的備份。
3. 結束 Safari 與舊版的 App。
4. 將 `/Applications/Gemini Voyager.app` 移到垃圾桶。請不要按 Safari 的 **卸載** 按鈕，也不要清除 Safari 擴充功能資料、網站資料或容器。
5. 將 `Voyager.app` 複製到 `/Applications`，先開啟一次，如果系統提示，再在 Safari 中啟用 Voyager。
6. 確認你的資料夾、提示詞、設定與星號標記項目都還在。如果有遺失，請使用 **從雲端下載合併**，或匯入提示詞的 JSON 檔案。

Voyager 會保留既有的 App 與擴充功能套件識別碼，因此 macOS 與 Safari 仍會把它視為同一個產品。這些備份步驟是為較舊的手動安裝版本所做的預防措施。
:::

1. 下載 <SafariDownloadLink>最新的 Safari 版本（.dmg）</SafariDownloadLink>。
2. 雙擊開啟，並依照提示完成安裝。
3. 雙擊啟動 App。
4. 在 **Safari 設定 > 延伸功能** 中啟用擴充功能。

> 💡 Safari 版本現在已直接簽署發布，不再需要 Xcode 轉換！
>
> ✅ **Safari 正式支援**：自 v1.6.0 起，支援浮水印移除、圖片匯出、Google 雲端硬碟 / iCloud 同步、回應完成通知與 Sparkle 自動更新。

---

_想參與開發嗎？開發者請參閱 [貢獻指南](https://github.com/voyager-crew/voyager/blob/main/.github/CONTRIBUTING.md)。_
