# Image Refinement 選項

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

1. **開啟功能**：在 Voyager 設置面板最後方找到「Image Refinement 選項」，開啟「下載時去除浮水印」。
2. **自動觸發**：此後你生成的每一張圖片，我們都會在後台自動完成去水印處理。
3. **直接下載**：
   - 懸停在處理後的圖片上，你會看到一個 🍌 按鈕。
   - **🍌 按鈕已完全替代**了原生的下載按鈕，點擊即可直接下載 100% 無水印的圖片。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Image Refinement 示例" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 特別鳴謝

本功能基於 [journey-ad (Jad)](https://github.com/journey-ad) 開發的 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 項目。該項目是 [allenk](https://github.com/allenk) 開發的 [GeminiWatermarkTool C++ 版本](https://github.com/allenk/GeminiWatermarkTool) 的 JavaScript 移植版。感謝原作者們對開源社區的貢獻。🧡
相關第三方 MIT 聲明見 [THIRD_PARTY_NOTICES.md](https://github.com/Nagi-ovo/voyager/blob/main/THIRD_PARTY_NOTICES.md)。

## 隱私與安全

所有的去水印處理均在你的 **瀏覽器本地** 完成。圖片不會被上傳到任何第三方伺服器，保護你的隱私和創作安全。
