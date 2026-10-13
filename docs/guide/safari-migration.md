# Safari 插件迁移指南

::: warning 需要手动操作一次
从 **v1.6.0** 起，Safari 宿主 App 由“**Gemini Voyager**”更名为“**Voyager**”。macOS 按 App 名称识别程序，因此直接安装新版会与旧 App 并存，可能导致扩展重复或行为异常。只需完成一次替换，之后自动更新会照常进行。
:::

## 你的数据是安全的

App 的 Bundle ID 没有改变。你的文件夹、提示词库、云同步以及所有设置都会保留。这一步只替换 App 本体，不会触及你的数据。

## 迁移步骤

1. **完全退出 Safari**（在 Safari 中按 `⌘Q`，而不只是关闭窗口）。
2. 打开 **访达 → 应用程序**，将旧的“**Gemini Voyager.app**”拖到废纸篓。
3. 打开刚下载的 DMG，将其中的“**Voyager.app**”拖入 **应用程序**。
4. 重新打开 Safari，进入 **设置 → 扩展**，启用“**Voyager Extension**”。

## 两件事不要做

- ❌ **不要同时保留两个 App**。如果旧的“Gemini Voyager.app”仍然存在，两个扩展会相互冲突。
- ❌ **不要在 Safari 的扩展设置中点击旧扩展的“卸载”**。这会指向旧 App，只会让情况更混乱。请按照第 2 步直接把旧 App 拖到废纸篓。

## 之后

完成这一次替换后，今后的 Safari 版本都会通过内置的自动更新器（Sparkle）更新为新的“Voyager”，无需再手动替换。

有问题？请到 [GitHub Issues](https://github.com/voyager-crew/voyager/issues) 告诉我们。
