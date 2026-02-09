# Changelog

## v1.2.2 Release Notes

> 本次更新带来了全新的导出体验与自定义选项，并优化了语言切换的实时响应性与系统稳定性。
> This update introduces a brand new export experience with more customization options, and optimizes real-time responsiveness for language switching and overall system stability.

### 🍎 For Safari Users (致 Safari 用户)

> **Safari 插件商店即将到来！ / Safari Extension Store is coming soon!**

---

### ✨ New Features (新增功能)

- **Export Experience Overhaul (导出功能全面升级)**
  - New dropdown menu supporting message selection, image export, and Deep Research documents. Added font size options for PDF/Image exports.
  - 全新的下拉式导出菜单，支持消息勾选、图片导出及 Deep Research 文档。新增 PDF/图片导出的字体大小调节功能。

- **Dynamic UI Refresh (动态界面刷新)**
  - Content script UI now updates instantly when switching languages without needing a page refresh.
  - 切换语言后，界面文本将实时更新，无需手动刷新页面。

---

### 🐛 Fixes & Improvements (修复与优化)

- **Timeline Stability (时间轴稳定性)**: Added robust null checks to prevent potential runtime errors during operations and cleanup. 增加了完善的空值检查，修复了部分情况下时间轴操作导致的运行时错误。
- **Export Polishing (导出细节优化)**: Refined warning messages and UI layout in the export dialog for better clarity. 优化了导出对话框的警告描述与布局展示。
- **Safari & Meta (底层优化)**: Optimized Safari extension build configurations and shortened descriptions across all locales for store compliance. 优化了 Safari 插件构建配置，并精简了全球语言版本的描述信息以符合商店规范。

---

## 📥 Installation

- **Chrome**: `gemini-voyager-chrome-v1.2.2.zip`
- **Firefox**: `gemini-voyager-firefox-v1.2.2.xpi`
- **Safari**: `gemini-voyager-safari-v1.2.2.zip`
- 🍎 For Safari Users (致 Safari 用户)
  > **Safari 插件商店即将到来！ / Safari Extension Store is coming soon!**

---

## v1.2.1 Release Notes

> 本次更新主要致力于提升多浏览器兼容性（尤其是 Safari 和 Firefox），并带来了韩语支持与多项体验优化。
> This update focuses on improving cross-browser compatibility (especially for Safari and Firefox), introducing Korean language support, and various UX enhancements.

### 🍎 For Safari Users (致 Safari 用户)

> **Safari 插件商店即将到来！ / Safari Extension Store is coming soon!**

---

### ✨ New Features (新增功能)

- **Korean Language Support (韩语支持)**
  - Added full localization and documentation for Korean users.
  - 全面新增韩语界面翻译及文档支持。

- **Folder Spacing Control (文件夹间距调节)**
  - You can now customize the spacing density of the folder list to your preference.
  - 现在你可以根据喜好自定义文件夹列表的间距密度。

- **Enhanced Export & Images (导出与图片增强)**
  - Improved image extraction logic for exports and added detailed format descriptions in the export dialog.
  - 优化了导出时的图片提取逻辑，并在导出弹窗中增加了更详细的格式说明。

---

### 🐛 Fixes & Improvements (修复与优化)

- **Safari Compatibility (Safari 兼容性)**: Adjusted UI and features specifically for Safari, disabling incompatible modules (like Watermark Removal and Cloud Sync) to ensure a stable experience while strictly following App Store guidelines. 针对 Safari 进行了大量 UI 和功能调整，禁用了水印移除和云同步等不兼容模块，以确保稳定体验并严格遵守 App Store 审核规范。
- **Firefox Polish (Firefox 优化)**: Fixed conversation icon alignment issues and improved image fetching reliability. 修复了对话图标对齐问题，并提升了图片加载的稳定性。
- **Mermaid Diagrams (Mermaid 图表)**: Updated the rendering engine and fixed the copy button overlapping with the toolbar. 升级了渲染引擎，并修复了复制按钮遮挡工具栏的问题。(#250, #253)
- **Sync Reliability (同步稳定性)**: Quick Sync now includes prompts and starred messages, with better status feedback. 快速同步现在包含提示词 (Prompts) 和星标消息，并提供了更清晰的状态反馈。
- **Markdown Rendering (Markdown 渲染)**: Refined the bold text fix to strictly avoid affecting code blocks and math formulas. 优化了加粗文本的修复逻辑，确保绝不影响代码块和数学公式的显示。

## 📥 Installation

- **Chrome**: `gemini-voyager-chrome-v1.2.1.zip`
- **Firefox**: `gemini-voyager-firefox-v1.2.1.xpi`
- **Safari**: `gemini-voyager-safari-v1.2.1.zip`
- 🍎 For Safari Users (致 Safari 用户)
  > **Safari 插件商店即将到来！ / Safari Extension Store is coming soon!**
