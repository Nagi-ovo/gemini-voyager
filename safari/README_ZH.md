# Safari 原生扩展代码

[English](README.md) | 简体中文

本目录包含 Safari 扩展的原生 Swift 代码，用于实现更深层次的 macOS 集成和原生功能。

## 📁 目录结构

```
safari/
├── App/
│   └── SafariWebExtensionHandler.swift  # 主消息处理器
├── Models/
│   └── SafariMessage.swift              # 消息类型定义
└── Resources/
    └── example-native-messaging.js      # JavaScript 使用示例
```

## 🔧 工作原理

当你使用 `xcrun safari-web-extension-converter` 转换扩展时，Xcode 会：
1. 创建一个新的 macOS 应用程序项目
2. 可以手动将这些 Swift 文件链接到项目中
3. 处理 JavaScript 和 Swift 之间的原生消息传递

## 📬 原生消息 API

### 从 JavaScript 发送到 Swift

```javascript
// 发送消息到原生 Swift 代码
browser.runtime.sendNativeMessage('ping', {}, (response) => {
  if (response.success) {
    console.log('原生响应：', response.data);
  }
});

// 获取版本信息
browser.runtime.sendNativeMessage('getVersion', {}, (response) => {
  console.log('版本：', response.data.version);
  console.log('平台：', response.data.platform);
});
```

### 可用操作

| 操作 | 说明 | 返回值 |
|------|------|--------|
| `ping` | 健康检查 | `{ status: "ok", message: "pong" }` |
| `getVersion` | 获取扩展信息 | `{ version, build, platform }` |
| `syncStorage` | 同步存储（未来） | `{ synced: false }` |

## 🚀 当前功能

### ✅ 已实现

- **健康检查**：`ping` 操作用于验证原生消息是否工作
- **版本信息**：获取扩展版本和平台信息
- **统一日志**：使用 `os.log` 进行调试

### 🔮 未来可能性

Swift 代码为以下功能提供了基础：

- **钥匙串集成**：安全存储敏感数据
- **原生通知**：macOS 通知中心集成
- **文件系统访问**：使用原生文件选择器导出/导入
- **共享容器**：在多设备的 Safari 之间同步
- **后台任务**：在 Swift 中运行长时间操作

## 🛠️ 使用方法

### 步骤 1：构建 Web 扩展

```bash
bun run build:safari
```

### 步骤 2：转换为 Safari 扩展

```bash
xcrun safari-web-extension-converter dist_safari \
  --macos-only \
  --app-name "Gemini Voyager"
```

### 步骤 3：添加 Swift 文件到 Xcode

1. 打开 `Gemini Voyager/Gemini Voyager.xcodeproj`
2. 右键点击 "Gemini Voyager Extension" 目标
3. 添加文件 → 选择 `safari/` 目录中的文件
4. 确保勾选 "Copy items if needed"
5. 选择 "Gemini Voyager Extension" 目标

### 步骤 4：构建并运行

在 Xcode 中按 ⌘R 构建并运行扩展。

## 🔍 调试原生代码

### 查看日志

```bash
# 从 Safari 扩展实时查看日志
log stream --predicate 'subsystem == "com.gemini-voyager.safari"' --level debug
```

### 常见问题

**Q: "Module 'SafariServices' not found"**
- A: 确保文件添加到 "Gemini Voyager Extension" 目标，而不是主应用目标

**Q: 原生消息不工作**
- A: 验证 `Info.plist` 中 `SafariWebExtensionHandler` 设置为主类

**Q: Swift 文件未包含在构建中**
- A: 检查 Xcode 检查器中的目标成员资格

## 📚 资源

- [Safari Web Extensions 文档](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [Safari 中的原生消息](https://developer.apple.com/documentation/safariservices/safari_web_extensions/messaging_between_the_app_and_javascript_in_a_safari_web_extension)
- [os.log 文档](https://developer.apple.com/documentation/os/logging)

## 🤝 贡献

添加新的原生功能时：

1. 在 `SafariMessage.swift` 中定义操作
2. 在 `SafariWebExtensionHandler.swift` 中实现处理器
3. 在 web 扩展中添加相应的 JavaScript 代码
4. 用使用示例更新本 README

## 📝 许可证

与主项目相同（MIT）。
