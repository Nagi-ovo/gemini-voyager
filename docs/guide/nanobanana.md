# Image Refinement（去水印）

::: tip Safari 支持
自 v1.6.0 起，**Image Refinement** 可以直接在 Safari 中使用，包括下载全尺寸的无水印图片。Chrome、Edge、Firefox 和 Safari 现在共享同一套内置流程。
:::

**AI 图片，保持纯净。**

Gemini™ 生成的图片默认带有可见水印。这样设计本是出于安全考虑，但在某些创作场景中，你可能需要一张完全干净的画面。

## 无损还原

Image Refinement 使用 **反向 Alpha 混合（Reverse Alpha Blending）** 算法。

- **不是 AI 重绘**：传统的去水印方法通常借助 AI 对区域进行“涂抹”，会破坏像素细节。
- **像素级精确**：我们通过数学计算，精确移除叠加在图片上的半透明水印层，还原 100% 的原始像素。
- **零质量损失**：处理后的图片在非水印区域与原图完全一致。

## 如何使用

打开 Voyager 弹窗，找到 **Image Refinement 选项**。两个开关默认都是关闭的，需要手动打开：

- **下载时去除水印**（推荐）：点击 Gemini 的下载按钮时，保存的文件会去除水印。下载按钮上会出现一个小小的 🍌 标记，表示该功能已生效；按钮本身仍然是 Gemini 原生的按钮。
- **预览时去除水印**（不稳定）：同时清理屏幕上显示的图片。处理速度较慢，图片在处理期间可能会短暂闪烁。

## Gemini 内置选项

Gemini 正在推出自己的可见水印开关：**设置 → Media watermark → Off**。如果你的账号中有这个选项，建议使用它，并关闭 Voyager 的去水印功能，因为 Gemini 的选项更可靠。Voyager 会提示你一次该选项的存在，并在你最近生成的图片已经没有水印时告诉你。如果暂时找不到这个开关，继续使用 Voyager 即可。无论采用哪种方式，SynthID 和 C2PA 元数据都会保留。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Image Refinement 演示" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 致谢

本功能基于 [journey-ad (Jad)](https://github.com/journey-ad) 的 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 项目，该项目是 [allenk](https://github.com/allenk) 的 [原始 C++ 实现](https://github.com/allenk/GeminiWatermarkTool) 的 JavaScript 移植版。感谢他们对社区的贡献。🧡
保留的 MIT 许可声明见 [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md)。

## 隐私与安全

所有去水印处理都在你的 **浏览器本地** 完成。图片不会上传到任何第三方服务器，保护你的隐私和创作安全。
