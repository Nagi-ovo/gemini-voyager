# Safari 扩展安装指南

[English](INSTALLATION.md) | 简体中文

在 Safari 上安装 Gemini Voyager 的简单指南。

## 系统要求

- **macOS 11+**
- **Safari 14+**
- **Xcode Command Line Tools**（运行 `xcode-select --install` 安装）

**注意：** 本地使用无需 Apple Developer 账号！

## 安装步骤

### 1. 下载

从 [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下载最新的 `gemini-voyager-safari-vX.Y.Z.zip`。

### 2. 解压

```bash
unzip gemini-voyager-safari-vX.Y.Z.zip
```

会得到一个 `dist_safari/` 文件夹。

### 3. 转换为 Safari 格式

Safari 需要将扩展转换为 Xcode 项目：

```bash
xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
```

这会创建一个包含 Xcode 项目的 `Gemini Voyager/` 文件夹。

**💡 提示：** 如果提示 `xcrun: command not found`，请先安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

### 4. 在 Xcode 中打开并运行

```bash
open "Gemini Voyager/Gemini Voyager.xcodeproj"
```

在 Xcode 中：

1. 选择 **Signing & Capabilities** 标签
2. 选择你的 Team（免费个人账号即可）
3. 设置目标为 **My Mac**
4. 点击 ▶️ 或按 **⌘R** 运行

Safari 会自动打开并加载扩展。

### 5. 在 Safari 中启用

运行后：

1. 打开 **Safari → 设置**（或偏好设置）
2. 前往 **扩展** 标签页
3. 勾选 **Gemini Voyager** 启用
4. 访问 [Gemini](https://gemini.google.com) 测试

完成！🎉

## 常见问题

### Safari 中看不到扩展

1. Safari → 设置 → 高级 → 勾选"在菜单栏中显示'开发'菜单"
2. 开发 → 允许未签名的扩展
3. 重启 Safari

### 需要调试？

- **查看日志：** Safari → 开发 → Web Extension Background Pages → Gemini Voyager
- **检查页面：** 在 Gemini 页面右键 → 检查元素

### 需要 Apple Developer 账号吗？

- **个人使用：** 不需要，使用"允许未签名的扩展"即可
- **分享给他人：** 他们需要自己构建，或者你需要 Developer 账号
- **发布到 App Store：** 需要（$99/年）

## 开发者

想从源代码构建或参与开发？查看 [Safari 开发指南](../../../safari/README.md) 了解：

- 从源代码构建
- 开发工作流
- 添加 Swift 原生代码
- 高级调试

## 卸载

1. Safari → 设置 → 扩展 → 取消勾选 Gemini Voyager
2. 从应用程序文件夹删除该应用
3. 清理：`rm -rf "Gemini Voyager" dist_safari`

---

**需要帮助？** 在 [GitHub](https://github.com/Nagi-ovo/gemini-voyager/issues) 提交 Issue
