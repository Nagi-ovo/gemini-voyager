# Safari 开发指南

[English](README.md) | 简体中文

为 Safari 构建和扩展 Gemini Voyager 的开发者指南。

> [!TIP]
> **想要进行安装？** 你现在可以直接从 [最新发布页](https://github.com/Nagi-ovo/gemini-voyager/releases/latest) 下载预签名的应用。只需下载 `.dmg` 并按提示安装即可。

## 快速开始

### 从源代码构建

```bash
# 安装依赖
bun install

# 为 Safari 构建
bun run build:safari
```

这会创建一个包含扩展文件的 `dist_safari/` 文件夹。

### 转换并运行

```bash
# 转换为 Safari 格式
xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"

# 在 Xcode 中打开
open "Gemini Voyager/Gemini Voyager.xcodeproj"
```

在 Xcode 中：

1. 选择 **Signing & Capabilities** → 选择你的 Team
2. 设置目标为 **My Mac**
3. 按 **⌘R** 构建并运行

## 开发工作流

### 文件变更自动重载

```bash
bun run dev:safari
```

这会监听文件变更并自动重新构建。每次重新构建后：

1. 在 Xcode 中按 **⌘R** 重新加载
2. Safari 会刷新扩展

### 手动构建

```bash
# 修改代码后
bun run build:safari

# 然后在 Xcode 中重新构建（⌘R）
```

## 添加 Swift 原生代码（可选）

[<img src="https://devin.ai/assets/askdeepwiki.png" alt="Ask DeepWiki" height="20"/>](https://deepwiki.com/Nagi-ovo/gemini-voyager)

本项目包含用于原生 macOS 功能的 Swift 代码。添加它是**可选的**，但推荐使用。

### 包含的文件

```
safari/
├── App/
│   └── SafariWebExtensionHandler.swift  # 原生消息处理器
└── Models/
    └── SafariMessage.swift              # 消息定义
```

### 如何添加

1. 打开 Xcode 项目
2. 右键点击 **"Gemini Voyager Extension"** 目标
3. 选择 **Add Files to "Gemini Voyager Extension"...**
4. 导航到 `safari/App/` 和 `safari/Models/`
5. 勾选 **"Copy items if needed"**
6. 确保目标是 **"Gemini Voyager Extension"**

### 原生功能

添加后，你可以：

- 访问 macOS 钥匙串（未来）
- 使用原生通知
- 通过原生选择器访问文件系统
- 通过 iCloud 同步（未来）
- 增强的调试日志

### 原生消息 API

[<img src="https://devin.ai/assets/askdeepwiki.png" alt="Ask DeepWiki" height="20"/>](https://deepwiki.com/Nagi-ovo/gemini-voyager)

**从 JavaScript 调用：**

```javascript
// 健康检查
browser.runtime.sendNativeMessage({ action: 'ping' }, (response) => {
  console.log(response); // { success: true, data: { status: "ok", message: "pong" } }
});

// 获取版本
browser.runtime.sendNativeMessage({ action: 'getVersion' }, (response) => {
  console.log(response.data); // { version: "1.0.0", platform: "macOS" }
});
```

**可用操作：**

- `ping` - 健康检查
- `getVersion` - 获取扩展版本信息
- `syncStorage` - 同步存储（未来功能的占位符）

## 调试

### 查看扩展日志

**Web 控制台：**

- Safari → 开发 → Web Extension Background Pages → Gemini Voyager

**原生日志：**

```bash
log stream --predicate 'subsystem == "com.gemini-voyager.safari"' --level debug
```

### 常见问题

**"Module 'SafariServices' not found"**

- 确保 Swift 文件添加到 "Gemini Voyager Extension" 目标，而不是主应用

**原生消息不工作**

- 检查 `Info.plist` 是否将 `SafariWebExtensionHandler` 设置为主类

**Swift 文件未编译**

- 在 Xcode 文件检查器中验证目标成员资格

## 构建分发版本

### 创建存档

1. 在 Xcode 中选择 Product → Archive
2. Window → Organizer
3. 选择存档 → Distribute App
4. 按提示导出

### 发布到 App Store

需要：

- Apple Developer 账号（$99/年）
- App Store Connect 设置
- 应用审核提交

详见 [Apple 官方指南](https://developer.apple.com/documentation/safariservices/safari_web_extensions/distributing_your_safari_web_extension)。

## 项目结构

[<img src="https://devin.ai/assets/askdeepwiki.png" alt="Ask DeepWiki" height="20"/>](https://deepwiki.com/Nagi-ovo/gemini-voyager)

```
├── dist_safari/              # 构建的扩展（已忽略）
├── safari/                   # 原生 Swift 代码
│   ├── App/                 # 扩展处理器
│   ├── Models/              # 数据模型
│   └── Resources/           # 示例代码
├── src/                     # 主扩展源代码
└── vite.config.safari.ts    # Safari 构建配置
```

## 构建命令

```bash
bun run build:safari   # 生产构建
bun run dev:safari     # 开发模式（自动重载）
bun run build:all      # 为所有浏览器构建
```

## 更新提醒配置

默认情况下，Safari 版本的更新提醒是**禁用的**，以避免与 App Store 自动更新冲突。

如需启用更新提醒（用于手动分发）：

```bash
ENABLE_SAFARI_UPDATE_CHECK=true bun run build:safari
```

**注意**：仅在手动分发扩展时启用此功能（非 App Store 分发）。App Store 版本应使用默认设置（禁用），以依赖自动更新。

## 已知限制

由于 Safari 的技术架构和安全限制，以下功能目前在 Safari 版本中不可用：

- **(a) Nano Banana 水印去除**：暂不支持对 Gemini 生成进行图片水印识别与去除。
- **(b) 图片导出**：暂不支持直接导出为图片（包括在对话导出功能中）。**建议**：改用 **PDF 导出**。

## 资源

- [Safari Web Extensions 文档](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [原生消息指南](https://developer.apple.com/documentation/safariservices/safari_web_extensions/messaging_between_the_app_and_javascript_in_a_safari_web_extension)
- [为 Safari 转换扩展](https://developer.apple.com/documentation/safariservices/safari_web_extensions/converting_a_web_extension_for_safari)

## 贡献

查看 [CONTRIBUTING.md](../.github/CONTRIBUTING.md) 了解贡献指南。

添加原生功能时：

1. 在 `SafariMessage.swift` 中定义操作
2. 在 `SafariWebExtensionHandler.swift` 中实现处理器
3. 在 web 扩展中添加 JavaScript API
4. 在本 README 中记录
