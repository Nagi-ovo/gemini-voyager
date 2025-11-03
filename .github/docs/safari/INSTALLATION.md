# Safari Extension Installation Guide

English | [简体中文](INSTALLATION_ZH.md)

This guide explains how to install and test the Gemini Voyager extension for Safari.

## 前置要求

### 必需（用于生产发布）
- **macOS 11 (Big Sur) 或更高版本**
- **Xcode 12 或更高版本**
- **Safari 14 或更高版本**
- **Apple Developer 账号**（用于发布到 App Store）

### 可选（用于本地测试）
- 无需 Apple Developer 账号即可本地测试
- 需要启用 Safari 开发者模式

## 快速开始

### 1. 构建扩展

```bash
# 方法 A: 使用 bun 脚本
bun run build:safari

# 方法 B: 使用构建脚本（推荐）
./scripts/build-safari.sh
```

构建完成后，输出目录为 `dist_safari/`

### 2. 转换为 Safari App Extension

Safari 扩展需要转换为 Xcode 项目格式：

```bash
# 基本转换（创建 Xcode 项目）
xcrun safari-web-extension-converter dist_safari --app-name "Gemini Voyager"

# 仅用于 macOS（不包含 iOS）- 推荐
xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"

# 指定输出目录
xcrun safari-web-extension-converter dist_safari \
  --app-name "Gemini Voyager" \
  --bundle-identifier "com.yourcompany.gemini-voyager" \
  --project-location ./safari-build
```

**💡 提示**：转换后会在当前目录生成 `Gemini Voyager/` 文件夹，包含完整的 Xcode 项目。

### 3. 添加 Swift 原生代码（可选但推荐）

项目包含 Swift 原生代码用于增强 Safari 集成：

```bash
# 打开 Xcode 项目
open "Gemini Voyager/Gemini Voyager.xcodeproj"
```

在 Xcode 中：
1. 右键点击 **"Gemini Voyager Extension"** 目标
2. 选择 **Add Files to "Gemini Voyager Extension"...**
3. 导航到项目根目录的 `safari/` 文件夹
4. 选择 `App/` 和 `Models/` 文件夹
5. 勾选 **"Copy items if needed"**
6. 确保目标选择为 **"Gemini Voyager Extension"**

**包含的 Swift 文件**：
- `SafariWebExtensionHandler.swift` - 原生消息处理
- `SafariMessage.swift` - 消息类型定义

**为什么添加 Swift 代码？**
- 🔐 访问 macOS 钥匙串（未来功能）
- 📢 原生通知支持
- 📁 文件系统访问
- 🔄 设备间数据同步
- 🐛 更好的调试日志

详见 [`safari/README.md`](safari/README.md) 了解更多。

### 4. 配置和构建

1. 在 Xcode 中选择 **Signing & Capabilities**
2. 选择你的开发团队（Team）- 可以使用免费的个人团队
3. 确保 Bundle Identifier 唯一（如需要可修改）
4. 选择目标设备：**My Mac**
5. 点击 **Run** (⌘R) 按钮构建并运行
6. Safari 会自动打开并加载扩展

### 5. 在 Safari 中启用扩展

1. 打开 Safari 偏好设置 (Safari → Preferences)
2. 前往 **扩展** 标签页
3. 勾选 **Gemini Voyager** 启用扩展
4. 访问 [Gemini](https://gemini.google.com) 测试功能

## 开发模式

### 方式 1：使用 Nodemon（推荐）

实时监听文件变化并自动重新构建：

```bash
bun run dev:safari
```

每次文件修改后：
1. 等待自动构建完成
2. 在 Xcode 中重新运行 (⌘R)
3. Safari 会重新加载扩展

### 方式 2：手动构建

```bash
# 修改代码后
bun run build:safari

# 在 Xcode 中重新运行
```

## 常见问题

### Q: 转换命令失败，提示 "command not found"

**A:** 确保已安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

### Q: Safari 中看不到扩展

**A:** 检查以下几点：
1. Safari 偏好设置 → 高级 → 勾选"在菜单栏中显示开发菜单"
2. 开发 → 允许未签名的扩展
3. 重启 Safari

### Q: 扩展加载后不工作

**A:** 
1. 打开 Safari 开发菜单 → Web Inspector
2. 查看控制台错误信息
3. 确认 manifest 权限配置正确
4. 检查 `webextension-polyfill` 是否正常工作

### Q: 需要 Apple Developer 账号吗？

**A:** 
- **本地测试**：不需要，可以使用"允许未签名的扩展"功能
- **App Store 发布**：需要 Apple Developer 账号（$99/年）

### Q: 如何调试扩展？

**A:**
1. 在 Safari 中打开扩展所在的页面
2. 右键点击页面 → 检查元素
3. 在控制台中可以看到扩展的日志
4. 或使用 Safari 开发菜单 → Web Extension Background Pages

## 与 Chrome/Firefox 的区别

### API 兼容性
- ✅ 使用 `webextension-polyfill` 实现跨浏览器兼容
- ✅ 基本 API（storage, tabs, runtime）完全兼容
- ⚠️ 某些高级 API 可能不支持

### Manifest 差异
- Safari 支持 Manifest V2 和 V3
- 本项目使用 Manifest V3
- Background scripts 配置略有不同

### 打包方式
- Chrome: ZIP 文件
- Firefox: XPI 文件
- **Safari: Xcode App 项目**（最大区别）

## 发布到 App Store

1. **准备签名**
   - 在 Xcode 中配置 App ID
   - 添加开发者证书

2. **创建 Archive**
   - Product → Archive
   - 等待构建完成

3. **上传到 App Store Connect**
   - Window → Organizer
   - 选择 Archive → Distribute App
   - 选择 App Store Connect
   - 按提示上传

4. **提交审核**
   - 访问 [App Store Connect](https://appstoreconnect.apple.com)
   - 填写应用信息
   - 提交审核

## 构建脚本说明

### build:safari
仅构建扩展文件到 `dist_safari/`

### scripts/build-safari.sh
构建扩展并显示转换说明

### 完整构建流程
```bash
# 1. 清理旧构建
rm -rf dist_safari/

# 2. 构建新版本
bun run build:safari

# 3. 转换为 Safari 扩展
xcrun safari-web-extension-converter dist_safari \
  --app-name "Gemini Voyager" \
  --macos-only

# 4. 在 Xcode 中打开
open "Gemini Voyager/Gemini Voyager.xcodeproj"
```

## 相关资源

- [Safari Web Extensions 官方文档](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [Converting a Web Extension for Safari](https://developer.apple.com/documentation/safariservices/safari_web_extensions/converting_a_web_extension_for_safari)
- [WebExtension API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)

## 技术支持

如遇到问题，请：
1. 查看 [GitHub Issues](https://github.com/Nagi-ovo/gemini-voyager/issues)
2. 提交新 Issue 并附上：
   - Safari 版本
   - macOS 版本
   - 错误日志
   - 复现步骤

