# Image Refinement（去水印）

::: tip Safari 支持
自 v1.6.0 起，**Image Refinement** 可直接在 Safari 使用，并支持下载全尺寸无水印图片。Chrome、Edge、Firefox 与 Safari 现在使用相同的内置流程。
:::

**AI 图片，本该纯净。**

Gemini 生成的图片默认带有可见的水印。虽然这是出于安全考虑，但在某些创作场景下，你可能需要一张完全干净的底稿。

## 无损还原

Image Refinement 采用的是 **反向 Alpha 混合算法 (Reverse Alpha Blending)**。

- **非 AI 重绘**：传统的去水印往往使用 AI 涂抹，会破坏图片细节。
- **像素级精度**：我们通过数学计算，将叠加在像素上的水印透明层精确移除，还原出 100% 原始的像素点。
- **零质量损失**：处理前后的图片在非水印区域完全一致。

## 如何使用

在 Voyager 设置面板的 **插件** 中打开你需要的开关。两个开关默认都是关闭的：

- **下载时去除水印**（推荐）：点击 Gemini 的下载按钮时，保存的文件会去除水印。下载按钮上会出现一个小小的 🍌 标记，表示该功能已生效；按钮本身仍然是 Gemini 原生的按钮。
- **预览时去除水印**（标有 **实验性**）：同时清理屏幕上显示的图片。处理速度较慢，图片在处理期间可能会短暂闪烁。

关闭下载去水印后，之后的下载不再去水印；关闭前已开始处理的下载会按开始时的设置完成，不会因切换开关重复保存。关闭预览去水印会恢复 Voyager 替换过、且仍显示其处理结果的原图；Gemini 后来更换过的图片不会被覆盖。

## Gemini 内置选项

Gemini 正在推出自己的可见水印开关：**设置 → Media watermark → Off**。如果你的账号中有这个选项，建议使用它，并关闭 Voyager 的去水印功能，因为 Gemini 的选项更可靠。Voyager 会提示你一次该选项的存在，并在你最近生成的图片已经没有水印时告诉你。如果暂时找不到这个开关，继续使用 Voyager 即可。无论采用哪种方式，SynthID 和 C2PA 元数据都会保留。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Image Refinement 示例" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 特别鸣谢

本功能基于 [journey-ad (Jad)](https://github.com/journey-ad) 开发的 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 项目。该项目是 [allenk](https://github.com/allenk) 开发的 [GeminiWatermarkTool C++ 版本](https://github.com/allenk/GeminiWatermarkTool) 的 JavaScript 移植版。感谢原作者们对开源社区的贡献。🧡
相关第三方 MIT 声明见 [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md)。

## 隐私与安全

所有的去水印处理均在你的 **浏览器本地** 完成。图片不会被上传到任何第三方服务器，保护你的隐私和创作安全。
