# 安裝

::: info 新聞
🍎 **Safari 瀏覽器原生外掛已推出！** 現在支援完全免費且一鍵安裝。
:::

選一條路。

> ⚠️ 提示詞管理器是唯一支持 Gemini™ 企業版的功能。

## 1. 官方商店（推薦）

最簡單的方式，支持自動更新。

**Chrome / Edge / Brave / Opera / Vivaldi：**

[<img src="https://img.shields.io/badge/Chrome_應用店-前往下載-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="從 Chrome 線上應用店安裝" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=zh_tw)

**Microsoft Edge：**

[<img src="https://img.shields.io/badge/Microsoft_Edge-前往下載-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="從 Microsoft Edge Add-ons 安裝" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Edge 使用者**：考量到行動端和平板使用者需求，Voyager 會繼續維護並發布 [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne) 版本。若商店審核延遲，仍可暫時使用 Chrome 商店版或 GitHub 手動包。

**Firefox：**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-前往下載-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="從 Firefox Add-ons 安裝" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. 手動（搶鮮版）

應用店審核慢。如果你追求最新功能，走這條路。

**Chrome / Edge / Brave / Opera：**

1. 去 [GitHub Releases](https://github.com/voyager-crew/voyager/releases) 下最新的 `voyager-chrome-vX.Y.Z.zip`。
2. 解壓。
3. 打開擴充功能頁 (`chrome://extensions`)。
4. 開 **開發人員模式** (右上角)。
5. 點 **載入未封裝項目**，選剛才的資料夾。

**Firefox：**

1. 去 [Releases](https://github.com/voyager-crew/voyager/releases) 下最新的 `voyager-firefox-vX.Y.Z.xpi`。
2. 打開擴充功能管理頁 (`about:addons`)。
3. 把下載的 `.xpi` 文件拖進去安裝（或者點右上角齒輪 ⚙️ -> **從檔案安裝附加元件**）。

> 💡 XPI 文件已獲 Mozilla 官方簽名，可在所有 Firefox 版本中永久安裝。

## 3. Safari (macOS)

Safari 現在支持直接分發！下載預簽名的應用：

::: warning 從 `Gemini Voyager.app` 升級
目前的 App 名稱已改為 `Voyager.app`。由於 macOS 不會取代檔名不同的 App，請勿同時保留兩個版本。

1. 在舊版擴充功能中，開啟你使用的 Gemini 與 AI Studio 分頁，然後執行 **雲端同步 > 上傳到雲端**。如果你使用醒目標示同步，請在上傳前啟用醒目標示同步。
2. 將提示詞庫匯出為本機 JSON 檔案，作為獨立的備份。
3. 結束 Safari 與舊版的 App。
4. 將 `/Applications/Gemini Voyager.app` 移到垃圾桶。請不要按 Safari 的 **解除安裝** 按鈕，也不要清除 Safari 擴充功能資料、網站資料或容器。
5. 將 `Voyager.app` 複製到 `/Applications`，先開啟一次，如果系統提示，再在 Safari 中啟用 Voyager。
6. 確認你的資料夾、提示詞、設定與星號標記項目都還在。如果有遺失，請使用 **從雲端下載合併**，或匯入提示詞的 JSON 檔案。

Voyager 會保留既有的 App 與擴充功能套件識別碼，因此 macOS 與 Safari 仍會把它視為同一個產品。這些備份步驟是為較舊的手動安裝版本所做的預防措施。
:::

1. 下載 <SafariDownloadLink>最新 Safari 版本 (.dmg)</SafariDownloadLink>。
2. 雙擊打開後按提示安裝應用。
3. 雙擊啟動應用。
4. 在 **Safari 設置 > 延伸功能** 中啟用。

> 💡 Safari 版本現已直接簽名分發——不再需要 Xcode 轉換！
>
> ✅ **Safari 正式支援**：自 v1.6.0 起，浮水印去除、圖片匯出、Google Drive / iCloud 同步、回覆完成通知與 Sparkle 自動更新均已支援。

---

_想貢獻代碼？開發者請移步 [貢獻指南](https://github.com/voyager-crew/voyager/blob/main/.github/CONTRIBUTING.md)。_
