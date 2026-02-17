# NanoBanana 選項

::: warning 瀏覽器相容性
目前 **NanoBanana** 去浮水印功能由於瀏覽器 API 限制，**暫不支持 Safari 瀏覽器**。如果您需要使用此功能，建議使用 **Chrome** 或 **Firefox**。

Safari 用戶可以將下載的圖片上傳到 [banana.ovo.re](https://banana.ovo.re/) 等工具網站進行手動去除（但由於 Gemini 圖片尺寸的多樣性，不能保證每張圖片都能成功還原）。
:::

**AI 圖片，本該純淨。**

Gemini 生成的圖片默認帶有可見的水印。雖然這是出於安全考慮，但在某些創作場景下，你可能需要一張完全乾淨的底稿。

## 無損還原

NanoBanana 採用的是 **反向 Alpha 混合算法 (Reverse Alpha Blending)**。

- **非 AI 重繪**：傳統的去水印往往使用 AI 塗抹，會破壞圖片細節。
- **像素級精度**：我們通過數學計算，將疊加在像素上的水印透明層精確移除，還原出 100% 原始的像素點。
- **零質量損失**：處理前後的圖片在非水印區域完全一致。

## 如何使用

1. **開啟功能**：在 Gemini Voyager 設置面板最後方找到 「NanoBanana 選項」，開啟 「去除 NanoBanana 水印」。
2. **自動觸發**：此後你生成的每一張圖片，我們都會在後台自動完成去水印處理。
3. **直接下載**：
   - 懸停在處理後的圖片上，你會看到一個 🍌 按鈕。
   - **🍌 按鈕已完全替代**了原生的下載按鈕，點擊即可直接下載 100% 無水印的圖片。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="NanoBanana 示例" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 特別鳴謝

本功能基於 [journey-ad (Jad)](https://github.com/journey-ad) 開發的 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 項目。該項目是 [allenk](https://github.com/allenk) 開發的 [GeminiWatermarkTool C++ 版本](https://github.com/allenk/GeminiWatermarkTool) 的 JavaScript 移植版。感謝原作者們對開源社區的貢獻。🧡

## 隱私與安全

所有的去水印處理均在你的 **瀏覽器本地** 完成。圖片不會被上傳到任何第三方伺服器，保護你的隱私和創作安全。
