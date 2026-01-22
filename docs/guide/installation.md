# 安装

选一条路。
> ⚠️ 提示词管理器是唯一支持 Gemini 企业版的功能。

## 1. 极简（Chrome 应用店）
Chrome, Edge, Brave, Opera 用户首选。
最简单，自动更新，无忧无虑。

[<img src="https://img.shields.io/badge/Chrome_应用店-前往下载-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="从 Chrome 网上应用店安装" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol)

1. 点上面按钮。
2. 点 **添加至 Chrome**。
3. 搞定。

## 2. 手动（抢鲜版）
应用店审核慢。如果你追求最新功能，走这条路。

**Chrome / Edge / Brave / Opera：**
1. 去 [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下最新的 `gemini-voyager-chrome-vX.Y.Z.zip`。
2. 解压。
3. 打开扩展页 (`chrome://extensions`)。
4. 开 **开发者模式** (右上角)。
5. 点 **加载已解压的扩展程序**，选刚才的文件夹。

## 3. Firefox

**方法一：Firefox Add-ons 商店（推荐）**

[![从 Firefox Add-ons 安装](https://img.shields.io/badge/Firefox_Add--ons-前往下载-FF7139?style=for-the-badge&logo=firefox&logoColor=white)](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

最简单的方式。从官方商店安装，自动更新。

**方法二：XPI 文件（手动安装）**
1. 去 [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下最新的 `gemini-voyager-firefox-vX.Y.Z.xpi`。
2. 打开扩展管理页 (`about:addons`)。
3. 把下载的 `.xpi` 文件拖进去安装（或者点右上角齿轮 ⚙️ -> **从文件安装附加组件**）。

> 💡 XPI 文件已获 Mozilla 官方签名，可在所有 Firefox 版本中永久安装。

## 4. Safari (macOS)
1. 去 [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下 `gemini-voyager-safari-vX.Y.Z.zip`。
2. 解压。
3. 终端跑这行命令 (得有 Xcode)：
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. Xcode 里运行。
5. Safari 设置 > 扩展里打开。

---
*想贡献代码？开发者请移步 [贡献指南](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md)。*
