# Safari 扩展安装指南

[English](INSTALLATION.md) | 简体中文

在 Safari 上安装 Voyager 的简单指南。

## 系统要求

- **macOS 11+**
- **Safari 15.4+**

## 安装步骤

### 1. 下载

从 [GitHub Releases](https://github.com/Nagi-ovo/voyager/releases) 下载最新的 `voyager-vX.Y.Z.dmg`。

### 2. 安装

双击打开 `.dmg` 文件并按提示安装应用。

### 3. 在 Safari 中启用

1. 打开 **Safari → 设置**（或偏好设置）
2. 前往 **扩展** 标签页
3. 勾选 **Voyager** 启用
4. 访问 [Gemini](https://gemini.google.com) 测试

完成！🎉

## 常见问题

### Safari 中看不到扩展

1. Safari → 设置 → 高级 → 勾选"在菜单栏中显示'开发'菜单"
2. 开发 → 允许未签名的扩展
3. 重启 Safari

## 开发者

先构建 Web 扩展，再打开仓库中的 Xcode 工程：

```bash
bun i
bun run build:safari
open "Voyager/Voyager.xcodeproj"
```

实际使用的 Swift 文件都在 `Voyager/` 中，不需要再手动添加另一套 Swift 文件。

## 卸载

1. Safari → 设置 → 扩展 → 取消勾选 Voyager
2. 从应用程序文件夹删除该应用

---

**需要帮助？** 在 [GitHub](https://github.com/Nagi-ovo/voyager/issues) 提交 Issue
