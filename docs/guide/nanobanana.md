# NanoBanana 选项

::: warning 浏览器兼容性
目前 **NanoBanana** 去水印功能由于浏览器 API 限制，**暂不支持 Safari 浏览器**。如果您需要使用此功能，建议使用 **Chrome** 或 **Firefox**。

Safari 用户可以将下载的图片上传到 [banana.ovo.re](https://banana.ovo.re/) 等工具网站进行手动去除（但由于 Gemini 图片尺寸的多样性，不能保证每张图片都能成功还原）。
:::

**AI 图片，本该纯净。**

Gemini 生成的图片默认带有可见的水印。虽然这是出于安全考虑，但在某些创作场景下，你可能需要一张完全干净的底稿。

## 无损还原

NanoBanana 采用的是 **反向 Alpha 混合算法 (Reverse Alpha Blending)**。

- **非 AI 重绘**：传统的去水印往往使用 AI 涂抹，会破坏图片细节。
- **像素级精度**：我们通过数学计算，将叠加在像素上的水印透明层精确移除，还原出 100% 原始的像素点。
- **零质量损失**：处理前后的图片在非水印区域完全一致。

## 如何使用

1. **开启功能**：在 Gemini Voyager 设置面板最后方找到 “NanoBanana 选项”，开启 “去除 NanoBanana 水印”。
2. **自动触发**：此后你生成的每一张图片，我们都会在后台自动完成去水印处理。
3. **直接下载**：
   - 悬停在处理后的图片上，你会看到一个 🍌 按钮。
   - **🍌 按钮已完全替代**了原生的下载按钮，点击即可直接下载 100% 无水印的图片。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="NanoBanana 示例" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 特别鸣谢

本功能基于 [journey-ad (Jad)](https://github.com/journey-ad) 开发的 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 项目。该项目是 [allenk](https://github.com/allenk) 开发的 [GeminiWatermarkTool C++ 版本](https://github.com/allenk/GeminiWatermarkTool) 的 JavaScript 移植版。感谢原作者们对开源社区的贡献。🧡

## 隐私与安全

所有的去水印处理均在你的 **浏览器本地** 完成。图片不会被上传到任何第三方服务器，保护你的隐私和创作安全。
