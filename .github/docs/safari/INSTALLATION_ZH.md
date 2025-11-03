# Safari 扩展安装指南

本指南说明如何为 Safari 浏览器安装和测试 Gemini Voyager 扩展。

## 前置要求

### 必需
- **macOS 11 (Big Sur) 或更高版本**
- **Xcode Command Line Tools**
- **Safari 14 或更高版本**

### 可选
- **Apple Developer 账号**（仅用于 App Store 发布，本地测试不需要）

## 快速开始

### 1. 下载扩展

从 [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下载最新的 `gemini-voyager-safari-vX.Y.Z.zip` 文件。

### 2. 解压文件

```bash
unzip gemini-voyager-safari-vX.Y.Z.zip
```

这将创建一个 `dist_safari/` 文件夹，包含所有扩展文件。

### 3. 转换为 Safari 扩展

Safari 扩展需要通过 Xcode 包装。使用苹果的转换工具：

```bash
xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
```

这个命令会：
- 创建一个 `Gemini Voyager/` 文件夹
- 生成完整的 Xcode 项目
- 自动配置所需的设置

**💡 提示**：如果提示 `xcrun: command not found`，请先安装 Xcode Command Line Tools：
```bash
xcode-select --install
```

### 4. 打开并运行 Xcode 项目

```bash
open "Gemini Voyager/Gemini Voyager.xcodeproj"
```

在 Xcode 中：
1. 选择 **Signing & Capabilities** 标签
2. 在 **Team** 下拉菜单中选择你的账号（可以使用免费的个人账号）
3. 选择运行目标为 **My Mac**
4. 点击运行按钮 ▶️ 或按 **⌘R**

Safari 会自动打开并加载扩展。

### 5. 在 Safari 中启用扩展

运行后：
1. 打开 **Safari → 设置**（或偏好设置）
2. 前往 **扩展** 标签页
3. 勾选 **Gemini Voyager** 启用扩展
4. 访问 [Gemini](https://gemini.google.com) 测试功能

## 开发者选项：添加 Swift 原生代码

项目包含原生 Swift 代码，用于增强 Safari 集成。这是**可选的**，但推荐添加以获得更好的功能。

### 添加步骤

1. 在 Xcode 中打开项目
2. 右键点击 **"Gemini Voyager Extension"** 目标
3. 选择 **Add Files to "Gemini Voyager Extension"...**
4. 导航到解压后的源代码目录中的 `safari/` 文件夹
5. 选择 `App/` 和 `Models/` 文件夹
6. 勾选 **"Copy items if needed"**
7. 确保目标选择为 **"Gemini Voyager Extension"**

### Swift 文件说明

- `SafariWebExtensionHandler.swift` - 原生消息处理器
- `SafariMessage.swift` - 类型安全的消息定义

### 功能支持

添加 Swift 代码后，扩展将支持：
- 🔐 访问 macOS 钥匙串（未来功能）
- 📢 原生通知支持
- 📁 文件系统访问
- 🔄 iCloud 数据同步
- 🐛 更详细的调试日志

详见 [`safari/README.md`](../../../safari/README.md) 了解更多。

## 常见问题

### Q: Safari 中看不到扩展

**A:** 检查以下几点：
1. Safari → 设置 → 高级 → 勾选"在菜单栏中显示'开发'菜单"
2. 开发 → 允许未签名的扩展
3. 重启 Safari

### Q: 需要 Apple Developer 账号吗？

**A:**
- **本地测试**：不需要，可以使用"允许未签名的扩展"功能
- **分享给他人**：需要，或者让他们自己构建
- **App Store 发布**：需要 Apple Developer 账号（$99/年）

### Q: 转换命令失败，提示 "command not found"

**A:** 安装 Xcode Command Line Tools：
```bash
xcode-select --install
```

### Q: 扩展加载后不工作

**A:**
1. 打开 Safari 开发菜单 → Web Extension Background Pages
2. 选择 Gemini Voyager 查看日志
3. 检查控制台是否有错误信息

### Q: 如何调试扩展？

**A:**

**查看扩展日志**：
```bash
# 实时查看原生代码日志
log stream --predicate 'subsystem == "com.gemini-voyager.safari"' --level debug
```

**调试网页内容**：
1. 在 Gemini 页面右键 → 检查元素
2. 在控制台中查看扩展日志

## 与 Chrome/Firefox 的区别

### 安装方式
- **Chrome/Firefox**: 直接从浏览器扩展商店安装，或加载解压后的文件夹
- **Safari**: 需要通过 Xcode 转换和运行

### API 兼容性
- ✅ 使用 `webextension-polyfill` 实现跨浏览器兼容
- ✅ 基本 API（storage, tabs, runtime）完全兼容
- ⚠️ 某些高级 API 可能不支持

### 性能
- Safari 扩展与原生集成，性能更好
- 可以访问 macOS 系统级功能

## 卸载

### 移除扩展

1. Safari → 设置 → 扩展
2. 取消勾选 Gemini Voyager
3. 在 Finder 中删除 Gemini Voyager.app（通常在应用程序文件夹）

### 清理构建文件

```bash
rm -rf "Gemini Voyager"
rm -rf dist_safari
```

## 相关资源

- [Safari Web Extensions 官方文档](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [Converting a Web Extension for Safari](https://developer.apple.com/documentation/safariservices/safari_web_extensions/converting_a_web_extension_for_safari)
- [WebExtension API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [GitHub 仓库](https://github.com/Nagi-ovo/gemini-voyager)

## 技术支持

如遇到问题：
1. 查看 [GitHub Issues](https://github.com/Nagi-ovo/gemini-voyager/issues)
2. 提交新 Issue 并附上：
   - Safari 版本
   - macOS 版本
   - 错误日志
   - 复现步骤
