# Image Refinement（去除浮水印）

::: tip Safari 支援
自 v1.6.0 起，**Image Refinement** 可直接在 Safari 中使用，包括下載全尺寸、無浮水印的圖片。Chrome、Edge、Firefox 與 Safari 現在都使用相同的內建流程。
:::

**AI 圖片，本該純淨。**

Gemini 生成的圖片預設帶有可見的浮水印。這樣做是出於安全考量，但在某些創作情境下，你可能需要一張完全乾淨的底稿。

## 無損還原

Image Refinement 採用 **反向 Alpha 混合（Reverse Alpha Blending）** 演算法。

- **不是 AI 重繪**：傳統的去浮水印方式常用 AI 去塗抹區域，會破壞像素細節。
- **像素級精準**：我們以數學運算精確移除疊加在像素上的浮水印透明層，還原 100% 的原始像素。
- **零品質損失**：處理後的圖片在非浮水印區域與原圖完全相同。

## 如何使用

開啟 Voyager 彈出視窗，找到 **Image Refinement 選項**。兩個開關預設都是關閉的，需要你自行開啟：

- **下載時移除浮水印**（建議）：點擊 Gemini 的下載按鈕時，儲存的檔案會移除浮水印。下載按鈕上會出現一個小小的 🍌 標記，表示此功能已啟用；按鈕本身仍是 Gemini 原生的按鈕。
- **預覽時移除浮水印**（不穩定）：同時清除畫面上顯示的圖片。處理速度較慢，圖片在處理期間可能會短暫閃爍。

## Gemini 內建選項

Gemini 正在推出自己的可見浮水印開關：**設定 → Media watermark → Off**。如果你的帳號已有此選項，建議直接使用，並關閉 Voyager 的去浮水印功能；Gemini 的官方選項更穩定。Voyager 會顯示一次性的提示說明此事，並在你最近的圖片已經沒有浮水印時告訴你。如果暫時找不到此開關，請繼續使用 Voyager。無論使用哪種方式，SynthID 與 C2PA 中繼資料都會保留。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Image Refinement 示範" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 致謝

本功能基於 [journey-ad (Jad)](https://github.com/journey-ad) 開發的 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 專案。該專案是 [allenk](https://github.com/allenk) 所開發 [原始 C++ 版本](https://github.com/allenk/GeminiWatermarkTool) 的 JavaScript 移植版。感謝兩位作者對開源社群的貢獻。🧡
保留的第三方 MIT 聲明可見於 [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md)。

## 隱私與安全

所有去浮水印處理都在你的 **瀏覽器本機** 完成。你的圖片絕不會上傳到任何第三方伺服器，確保隱私與創作安全。
