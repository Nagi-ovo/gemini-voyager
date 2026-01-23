# 安装

选一条路。

> ⚠️ 提示词管理器是唯一支持 Gemini 企业版的功能。

## 1. 官方商店（推荐）

最简单的方式，支持自动更新。

**Chrome / Brave / Opera / Vivaldi：**

[<img src="https://img.shields.io/badge/Chrome_应用店-前往下载-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="从 Chrome 网上应用店安装" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol)

**Microsoft Edge：**

[<img src="https://img.shields.io/badge/Microsoft_Edge-前往下载-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="从 Microsoft Edge Add-ons 安装" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/gemini-voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

**Firefox：**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-前往下载-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="从 Firefox Add-ons 安装" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. 手动（抢鲜版）

应用店审核慢。如果你追求最新功能，走这条路。

**Chrome / Edge / Brave / Opera：**

1. 去 [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下最新的 `gemini-voyager-chrome-vX.Y.Z.zip`。
2. 解压。
3. 打开扩展页 (`chrome://extensions`)。
4. 开 **开发者模式** (右上角)。
5. 点 **加载已解压的扩展程序**，选刚才的文件夹。

**Firefox：**

1. 去 [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下最新的 `gemini-voyager-firefox-vX.Y.Z.xpi`。
2. 打开扩展管理页 (`about:addons`)。
3. 把下载的 `.xpi` 文件拖进去安装（或者点右上角齿轮 ⚙️ -> **从文件安装附加组件**）。

> 💡 XPI 文件已获 Mozilla 官方签名，可在所有 Firefox 版本中永久安装。

## 3. Safari (macOS)

1. 去 [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) 下 `gemini-voyager-safari-vX.Y.Z.zip`。
2. 解压。
3. 终端跑这行命令 (得有 Xcode)：
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. Xcode 里运行。
5. Safari 设置 > 扩展里打开。

---

_想贡献代码？开发者请移步 [贡献指南](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md)。_
