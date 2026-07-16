# Safari 开发指南

[English](README.md) | 简体中文

为 Safari 构建和扩展 Voyager 的开发者指南。

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

## macOS App 与 Swift 扩展

不需要手动添加。仓库中的 Xcode 工程已经包含 macOS App 和 Swift Safari 扩展。Sparkle 在 App 中负责自动更新；Swift 扩展负责回答完成系统通知。

### 原生消息 API

[<img src="https://devin.ai/assets/askdeepwiki.png" alt="Ask DeepWiki" height="20"/>](https://deepwiki.com/Nagi-ovo/gemini-voyager)

**从 JavaScript 调用：**

```javascript
const response = await browser.runtime.sendNativeMessage(
  'com.yourCompany.Gemini-Voyager',
  { action: 'ping' },
);
```

**可用操作：**

- `ping` - 健康检查
- `requestNotificationPermission` - 请求 macOS 通知权限
- `showNotification` - 显示回答完成系统通知

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

## 直装版自动更新

直装版由 macOS 容器 App 内的 Sparkle 负责更新。原有 JavaScript 提醒默认保留，让旧版本用户能发现第一个支持 Sparkle 的 DMG。

如需构建 App Store 版本，关闭直装更新提醒：

```bash
ENABLE_SAFARI_UPDATE_CHECK=false bun run build:safari
```

Sparkle 会在容器 App 运行时检查更新；用户也可以从 App 菜单选择 **Check for Updates…**。

## 已知限制

由于 Safari 的技术架构和安全限制，以下功能目前在 Safari 版本中不可用：

- **(a) Nano Banana 水印去除**：暂不支持对 Gemini™ 生成进行图片水印识别与去除。
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
