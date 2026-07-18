# Safari 插件迁移指南

::: warning 需要手动操作一次
从 **v1.6.0** 起，Safari 宿主 App 由「**Gemini Voyager**」更名为「**Voyager**」。macOS 按 App 名称识别程序，所以直接安装新版会和旧 App 并存，可能出现扩展重复或行为混乱。按下面几步换一次即可，之后自动更新照常。
:::

## 你的数据不会丢

App 的 Bundle ID 没有改变，文件夹、灵感库、云同步和所有设置都会保留。这一步只是替换 App 本体，不碰数据。

## 迁移步骤

1. **完全退出 Safari**（在 Safari 里按 `⌘Q`，不是只关窗口）。
2. 打开「**访达 → 应用程序**」，把旧的「**Gemini Voyager.app**」拖到废纸篓。
3. 打开新下载的 DMG，把里面的「**Voyager.app**」拖进「**应用程序**」。
4. 重新打开 Safari →「**设置 → 扩展**」，勾选「**Voyager Extension**」。

## 两个别做

- ❌ **不要同时保留两个 App**。旧的「Gemini Voyager.app」不删，两个扩展会互相打架。
- ❌ **不要在 Safari 的「扩展」里点旧扩展的「卸载」**。那会指回旧 App，反而更乱。直接按上面第 2 步把旧 App 拖进废纸篓就行。

## 之后

换完这一次，以后 Safari 版本会通过内置的自动更新（Sparkle）升级新的「Voyager」，不用再手动换 App。

有问题欢迎到 [GitHub Issues](https://github.com/Nagi-ovo/voyager/issues) 反馈。
