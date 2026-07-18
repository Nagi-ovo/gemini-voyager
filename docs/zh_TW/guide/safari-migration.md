# Safari 擴充功能遷移指南

::: warning 需要手動操作一次
從 **v1.6.0** 起，Safari 宿主 App 由「**Gemini Voyager**」更名為「**Voyager**」。macOS 以 App 名稱辨識程式，所以直接安裝新版會與舊 App 並存，可能出現擴充功能重複或行為混亂。依下面幾步換一次即可，之後自動更新照常。
:::

## 你的資料不會遺失

App 的 Bundle ID 沒有改變，資料夾、靈感庫、雲端同步以及所有設定都會保留。這一步只是替換 App 本體，不會動到資料。

## 遷移步驟

1. **完全結束 Safari**（在 Safari 中按 `⌘Q`，而非只關閉視窗）。
2. 開啟「**Finder → 應用程式**」，把舊的「**Gemini Voyager.app**」拖到垃圾桶。
3. 開啟新下載的 DMG，把裡面的「**Voyager.app**」拖進「**應用程式**」。
4. 重新開啟 Safari →「**設定 → 擴充功能**」，勾選「**Voyager Extension**」。

## 兩件別做

- ❌ **不要同時保留兩個 App**。舊的「Gemini Voyager.app」不刪，兩個擴充功能會互相衝突。
- ❌ **不要在 Safari 的「擴充功能」中點舊擴充功能的「解除安裝」**。那會指回舊 App，反而更亂。直接依上面第 2 步把舊 App 拖進垃圾桶即可。

## 之後

換完這一次，日後 Safari 版本會透過內建的自動更新（Sparkle）升級新的「Voyager」，不必再手動換 App。

有問題歡迎到 [GitHub Issues](https://github.com/Nagi-ovo/voyager/issues) 回報。
