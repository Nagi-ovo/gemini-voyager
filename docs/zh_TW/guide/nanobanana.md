# Image Refinement（去除浮水印）

::: tip Safari 支援
自 v1.6.0 起，**Image Refinement** 可直接在 Safari 使用，並支援下載全尺寸的無浮水印圖片。Chrome、Edge、Firefox 與 Safari 現在使用相同的內建流程。
:::

**AI 圖片，本該純淨。**

Gemini 生成的圖片默認帶有可見的水印。雖然這是出於安全考慮，但在某些創作場景下，你可能需要一張完全乾淨的底稿。

## 無損還原

Image Refinement 採用的是 **反向 Alpha 混合算法 (Reverse Alpha Blending)**。

- **非 AI 重繪**：傳統的去水印往往使用 AI 塗抹，會破壞圖片細節。
- **像素級精度**：我們通過數學計算，將疊加在像素上的水印透明層精確移除，還原出 100% 原始的像素點。
- **零質量損失**：處理前後的圖片在非水印區域完全一致。

## 如何使用

打開 Voyager 彈窗，在 **匯出與圖片** 中開啟你需要的開關。兩個開關預設都是關閉的：

- **下載時移除浮水印**（推薦）：點擊 Gemini 的下載按鈕時，儲存的檔案會去掉浮水印。下載按鈕上會出現一個小小的 🍌 標記，表示功能已生效；按鈕本身仍是 Gemini 原生的。
- **預覽時移除浮水印**（標有 **實驗性**）：連畫面上顯示的圖片也一併處理。速度較慢，圖片在處理時可能短暫閃爍。

關閉下載去浮水印後，之後的下載不再移除浮水印；關閉前已開始處理的下載會依開始時的設定完成，不會因切換開關重複儲存。關閉預覽去浮水印會還原 Voyager 替換過、且仍顯示其處理結果的原圖；Gemini 後來更換過的圖片不會被覆寫。

## Gemini 內建選項

Gemini 正在推出自己的可見浮水印開關：**設定 → Media watermark → Off**。如果你的帳號已經有這個選項，建議直接使用，並關閉 Voyager 的去浮水印；Gemini 官方方案更穩定。Voyager 會顯示一次性提示說明此事，並在你最近生成的圖片已沒有浮水印時告訴你。如果暫時找不到這個開關，請繼續使用 Voyager。無論使用哪種方式，SynthID 與 C2PA 中繼資料都會保留。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Image Refinement 示例" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 特別鳴謝

本功能基於 [journey-ad (Jad)](https://github.com/journey-ad) 開發的 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 項目。該項目是 [allenk](https://github.com/allenk) 開發的 [GeminiWatermarkTool C++ 版本](https://github.com/allenk/GeminiWatermarkTool) 的 JavaScript 移植版。感謝原作者們對開源社區的貢獻。🧡
相關第三方 MIT 聲明見 [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md)。

## 隱私與安全

所有的去水印處理均在你的 **瀏覽器本地** 完成。圖片不會被上傳到任何第三方伺服器，保護你的隱私和創作安全。
