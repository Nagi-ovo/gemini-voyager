# 安装

::: info 新闻
🍎 **Safari 浏览器原生插件已推出！** 现在支持一键安装并完全免费。
:::

选一条路。

> ⚠️ 提示词管理器是唯一支持 Gemini™ 企业版的功能。

## 1. 官方商店（推荐）

最简单的方式，支持自动更新。

**Chrome / Edge / Brave / Opera / Vivaldi：**

[<img src="https://img.shields.io/badge/Chrome_应用店-前往下载-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="从 Chrome 网上应用店安装" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=zh)

**Microsoft Edge：**

[<img src="https://img.shields.io/badge/Microsoft_Edge-前往下载-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="从 Microsoft Edge Add-ons 安装" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Edge 用户**：考虑到移动端和平板用户需求，Voyager 会继续维护并发布 [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne) 版本。若商店审核延迟，仍可临时使用 Chrome 应用店版本或 GitHub 手动包。

**Firefox：**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-前往下载-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="从 Firefox Add-ons 安装" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. 手动（抢鲜版）

应用店审核慢。如果你追求最新功能，走这条路。

**Chrome / Edge / Brave / Opera：**

1. 去 [GitHub Releases](https://github.com/Nagi-ovo/voyager/releases) 下最新的 `voyager-chrome-vX.Y.Z.zip`。
2. 解压。
3. 打开扩展页 (`chrome://extensions`)。
4. 开 **开发者模式** (右上角)。
5. 点 **加载已解压的扩展程序**，选刚才的文件夹。

**Firefox：**

1. 去 [Releases](https://github.com/Nagi-ovo/voyager/releases) 下最新的 `voyager-firefox-vX.Y.Z.xpi`。
2. 打开扩展管理页 (`about:addons`)。
3. 把下载的 `.xpi` 文件拖进去安装（或者点右上角齿轮 ⚙️ -> **从文件安装附加组件**）。

> 💡 XPI 文件已获 Mozilla 官方签名，可在所有 Firefox 版本中永久安装。

## 3. Safari (macOS)

Safari 现在支持直接分发！下载预签名的应用：

::: warning 从 `Gemini Voyager.app` 升级
Safari 容器 App 现已改名为 `Voyager.app`。由于 macOS 不会自动替换文件名不同的 App，请不要同时保留两个版本。

1. 在旧版扩展中打开你使用的 Gemini 和 AI Studio 页面，然后执行 **云同步 > 上传到云端**。如果你使用高亮同步，请先开启高亮云同步。
2. 另外把提示词库导出为本地 JSON，作为独立备份。
3. 完全退出 Safari 和旧版容器 App。
4. 将 `/Applications/Gemini Voyager.app` 移到废纸篓。不要点击 Safari 的“卸载”，也不要清除 Safari 扩展数据、网站数据或容器。
5. 将 `Voyager.app` 拖入 `/Applications`，打开一次；如果 Safari 提示，再重新启用 Voyager。
6. 检查文件夹、提示词、设置和星标。若有缺失，使用 **下载并合并**，或导入提示词 JSON。

Voyager 会继续沿用原有的 App 与扩展 bundle identifier，因此 macOS 和 Safari 仍会把它识别为同一个产品。以上备份步骤主要用于保护较早的手动安装版本。
:::

1. 下载 <SafariDownloadLink>最新 Safari 版本 (.dmg)</SafariDownloadLink>。
2. 双击打开后按提示安装应用。
3. 双击启动应用。
4. 在 **Safari 设置 > 扩展** 中启用。

> 💡 Safari 版本现已直接签名分发——不再需要 Xcode 转换！
>
> ⚠️ **已知限制**：由于 Safari 特性，(a) 水印去除 (b) 图片导出（推荐用 PDF）暂不支持。

---

_想贡献代码？开发者请移步 [贡献指南](https://github.com/Nagi-ovo/voyager/blob/main/.github/CONTRIBUTING.md)。_
