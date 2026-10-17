# Popup 官方插件列表设计

状态：Batch 1–8 已完成（见 §4.4）；`featureOwners.ts` 里的每个 Gemini / AI Studio 官方插件都已是某张主题卡里的一行（Batch 8 把单张 Plugins 卡拆成八张主题卡，选项直接显示在行下），插件站也不再有第二个开关或卡片：Visual effects 和 timeline rail 的选项都在该站插件卡的行里。下文 §1 记录的是迁移前的基线 `main@754c03c2`。Codex 复审结论 "implement after changes"，本版已吸收全部 P2/P3。

**目标**：每个可选功能都是官方插件，用户只在 popup 的插件列表里开关它。核心数据功能（文件夹、Prompt Manager、云同步、对话导出、备份、账号隔离）保持 native，保留各自卡片。

**一句话方案**：列表行读 popup 已有的那份 live sync 快照，用已有的 effective resolver 解析；唯一新增的机制是写入路径（legacy 绑定写旧 sync 键，其余写 `gvPluginsState`）和一个按存储键结算的乐观覆盖层。迁移按整行分批移动，不复制任何用户数据。

---

## 1. 现状

### 1.1 各站点的 popup

| 站点                        | popup 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini                      | 搜索框（`src/pages/popup/Popup.tsx:235`）、健康提示、更新横幅、存储卡；之后是 21 个可排序 section，顺序存在 `gvPopupSectionOrder`（`src/pages/popup/utils/nativeSiteCapabilities.ts:5-28`，`src/pages/popup/hooks/usePopupSections.ts:168-186`）。`plugins` section id 存在但永远隐藏（`usePopupSections.ts:122`）。本地插件单独一个折叠 section（`Popup.tsx:474-487`），只显示本地 id（`src/pages/popup/components/NativeLocalPluginsSection.tsx:30`）。 |
| AI Studio                   | 同一界面，经白名单裁剪（`nativeSiteCapabilities.ts:39-57`）；顶部有总开关卡（`Popup.tsx:261-290`），关闭时页面卸载所有插件（`src/features/plugins/runtime/surfaceSwitch.ts:1-9`）。                                                                                                                                                                                                                                                                       |
| ChatGPT / Claude / DeepSeek | 插件站模式（`src/pages/popup/utils/siteMode.ts:22-34`），无搜索框。`PluginSiteSettings` 里一个 `PluginManager` 混列官方、目录和本地插件，下接导入面板（`src/pages/popup/components/PluginSiteSettings.tsx:41-90`）。有 rail 的站点另显示 Timeline 卡和快捷键卡（`Popup.tsx:183-194`、`:334-355`、`:411-413`）。                                                                                                                                           |

`PluginManager` 的通用控件只读写 `gvPluginsState`（`src/pages/popup/components/usePluginPreferences.ts:20-34`、`:69-99`；`src/pages/popup/utils/pluginEnablement.ts:98-108`），而 legacy 绑定的官方插件忽略那里的条目（`src/features/plugins/storage/legacySettingBindings.ts:5-10`）。所以只去掉本地过滤，列表上的开关不会生效。

旧卡片只在打开时批量读一次，不跟随存储变化（`src/pages/popup/hooks/usePopupSettingsHydration.ts:57-74`）。同一个开关出现在两处时，另一处会过期，因此过渡期不能有重复开关。

### 1.2 已迁功能今天在哪里开关

`featureOwners.ts` 现有 27 个 feature、28 个站点条目（`src/features/plugins/sites/featureOwners.ts`）；Formula Copy 在 Gemini、AI Studio 各一条。下表路径省略 `src/pages/popup/`。

| 功能（`voyager.…`）                                                                                                             | 现在的开关                                                            | 高级控件 / 特殊流程                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timeline                                                                                                                        | `components/TimelineSettingsCard.tsx:70`                              | 样式、滚动模式、隐藏容器、可拖动、固定预览、层级、重置位置、收藏历史（`:80-229`）；消息时间（`:183`）是另一个未迁功能                                    |
| Prevent auto-scroll                                                                                                             | `TimelineSettingsCard.tsx:161`                                        | 无                                                                                                                                                       |
| Draft save、Ctrl+Enter（G）/ Enter（A）、Safari Enter fix（仅 Safari，`:162`）、Vim、Input collapse                             | `components/InputSettingsCard.tsx:185`、`:122`、`:162`、`:100`、`:49` | Input collapse 的"有内容也可折叠"子开关，仅开启时显示（`:76-99`）                                                                                        |
| Formula copy（G + A）                                                                                                           | `components/FormulaCopySettings.tsx:46`                               | 格式单选（`:69-95`）、范围说明（`:45`）；两站共用一个开关和一个格式（`hooks/useFormulaCopyPopupSettings.ts:7-8`）                                        |
| Chat width、Chat font size、Chat line height、Edit input width                                                                  | `components/PopupLayoutSettings.tsx:172`、`:189`、`:206`、`:231`      | 滑块；宽度类"开关未存过时跟随自定义宽度"（`hooks/usePopupLayoutSettings.ts:22-31`）                                                                      |
| Mermaid、WaveDrom、ECharts、Code collapse、User LaTeX、Quote reply、Usage status、Hide input halo、Default model、Research pack | `components/GeneralSettingsCard.tsx:101-222`                          | Halo 是反向键：`true` 隐藏光晕，即功能开启（`legacySettingBindings.ts:147-152`）                                                                         |
| Highlight                                                                                                                       | `GeneralSettingsCard.tsx:151`                                         | "时间线标记"子开关（`:158`，默认开），运行时自己 live 读这个键（`src/pages/content/highlight/highlightAction.ts:57-61`）                                 |
| Response notification                                                                                                           | `GeneralSettingsCard.tsx:166`                                         | 权限流程：Chrome 首个 await 前交出意图，Firefox 权限请求必须是首个 await，Safari 走 native app（`hooks/useGeneralPopupSettings.ts:119-157`、`:228-274`） |
| Fork                                                                                                                            | `components/FolderSettingsCard.tsx:123-133`（核心卡里）               | 无                                                                                                                                                       |
| Prompt history                                                                                                                  | `components/PromptManagerSettingsCard.tsx:65-75`（核心卡里）          | 无                                                                                                                                                       |

"定位设置"提示也指向这些卡片：本地插件被官方插件挡住时，`pluginBlockedNote` 说出官方插件所在的卡片和开关名（`components/pluginBlockedNote.ts:63-82`，经 `components/officialFeatureSetting.ts:16-26`）。旧行下的"被本地插件暂停"说明由 `OfficialFeatureStatus` 提供（`Popup.tsx:200-208`）。Coachmark 不指向 popup 卡片。

---

## 2. 目标 UX

### 2.1 原则

- 一个功能一个开关，开关就是那一行；不在任何卡片里留第二个。
- 顺序固定，开关不会让行移动。
- 行在开启前保持精简：设置和选项只在开启时出现，直接显示在行下（Batch 8 起不再有 Options 按钮）。
- 靠搜索而不是嵌套：每个主题是一张普通卡片，标题和其他卡片同一种 `CardTitle`，不可折叠；不加图标、计数或标签。
- 行显示的是**保存的偏好**，不是当前页面的运行状态（见 §3.1）。页面实际状态只通过 tab 回报的状态说明体现（暂停、等待）。

### 2.2 Gemini

```
┌──────────────────────────────────────────┐
│ Voyager                     ☾  🎨  🌐     │ ← 顶部固定：半透明背景 + 模糊，
│ [ 🔍 搜索设置，比如“宽度”“时间线”     ]  │   底部一条细线
│ 云同步  版面  侧栏  时间线  内容  图表 … │ ← 目录：一行纯文字链接，可横向滚动；
├──────────────────────────────────────────┤   搜索时隐藏
│ ┌ 云同步 ──────────────────────────────┐ │
│ ┌ 存储 ────────────────────────────────┐ │
│ ┌ 页面版面 ─────────────────────── ▲▼ ┐ │
│ │ 对话区域宽度                   [●━]  │ │
│ │ 按屏幕宽度的比例加宽对话区域…        │ │
│ │ 对话区域宽度                    70%  │ │ ← 开启时选项直接在行下
│ │ 窄 ├────────●──────┤ 宽              │ │
│ │ 隐藏输入框光晕                 [━○]  │ │
│ └──────────────────────────────────────┘ │
│ ┌ 侧栏 ┐ ┌ 时间线 ┐ ┌ 回答内容 ┐ ┌ 图表 ┐ │
│ ┌ 导出与图片 ┐ ┌ 输入 ┐ ┌ 对话管理 ┐     │
│ ┌ 本地插件 ────────────────────────  ▾ ┐ │
│ ┌ 文件夹 / 提示词 / 快捷键 / 通用 …    ┐ │
│                                          │
│ ┃ 已关闭「Mermaid 图表」        撤销 ┃   │ ← 用户拨动行开关后 4 秒的撤销提示
└──────────────────────────────────────────┘
```

**主题卡**来自 popup 内的可信表（registry 的 `topic`，`OFFICIAL_PLUGIN_TOPICS`），不来自 manifest（所有官方 manifest 的 `category` 只有 `readability`/`productivity`，且文档插件表也读它）。每个主题是一个独立的 popup section（`OFFICIAL_PLUGIN_TOPIC_IDS`），所以能各自排序、在搜索中各自隐藏、被目录定位。卡内顺序固定：

| 主题卡（目录名）   | Gemini 的行                                                                                                 | AI Studio 的行 |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | -------------- |
| 页面版面（版面）   | Chat width、Chat font size、Chat line height、Edit input width、Hide input halo、Visual effects             | Visual effects |
| 侧栏               | Sidebar width、Auto-hide、Full hide、Recent Gems（置灰）                                                    | Sidebar width  |
| 时间线             | Timeline、Message timestamps、Prevent auto-scroll、Highlight                                                | —              |
| 回答内容（内容）   | Code collapse、User LaTeX、Formula copy、Markdown fix                                                       | Formula copy   |
| 图表               | Mermaid、WaveDrom、ECharts                                                                                  | —              |
| 导出与图片（导出） | Canvas copy、Deep Research export、Watermark download、Watermark preview                                    | —              |
| 输入               | Ctrl/Cmd+Enter、Safari Enter fix（仅 Safari）、Vim、Input collapse、Prompt history、Draft save、Quote reply | Enter send     |
| 对话管理（对话）   | Fork、Batch delete、Default model、Research pack、Usage status、Response notification、Context Sync         | Batch delete   |

没有行的主题卡不渲染，也不占排序位置。插件站（Claude、ChatGPT 等）不变：Visual effects 仍是该站插件卡里的一行（§2.4）。

按当前 registry 计（含置灰的 Recent Gems）：Gemini 39 行（非 Safari 38 行），AI Studio 5 行（Visual effects、Sidebar width、Formula copy、Enter send、Batch delete）。以 `officialPluginRegistry.ts` 为准。

**一行包含**：

```
名称  [实验性]                            [开关]
manifest 的一句话描述（本地化）
<状态说明：仅暂停 / 等待时>
<选项：仅开启时，行下整宽显示（manifest 设置、滑块、自定义面板）>
```

- 名称和描述一律用 manifest（`displayName` 去掉 `Gemini ·` 前缀，`components/PluginIdentity.tsx:61-63`）；旧卡片标签只作搜索词。
- Gemini / AI Studio 的打包官方插件（`isPackagedOfficialPluginId`，`featureOwners.ts`）不显示来源块：版本、来源标签、主页、changelog、"已更新"徽标（`PluginIdentity.tsx:209-275`）。它们只随 Voyager 一起更新。`voyager.chatgpt-*` 等插件站 builtin 保留来源块。
- 状态说明复用 `blockedPluginNote`，`conflictKey: 'officialFeaturePausedByLocal'`（与 `OfficialFeatureStatus.tsx:34-40` 一致）。
- `pluginsTitle` 和 `pluginsNativeDescription` 不再显示，只作为每张主题卡的搜索词保留：记得旧 Plugins 卡的搜索仍会列出全部主题卡。

**搜索**：打 "光晕"、"字号"、"ruler" 时只显示命中的行和它们所在的主题卡，没有命中行的卡片隐藏；主题卡标题（任何语言）命中时列出整张卡。行开启时选项照常显示在行下，关闭时只显示行。搜索期间目录隐藏。

**撤销**：用户拨动主题卡里某行的开关后，popup 底部出现 4 秒的 `role="status"` 提示「已关闭「名称」 · 撤销」，指针悬停或焦点在提示内时不自动关闭（两者分开记录），提示带着焦点关闭时焦点回到被拨动的开关。拨动时记下这次写入涉及的每个键在 popup 里显示的原值和是否存在，撤销经同一条写入路径原样写回：Visual effects 回到原来的 Rain 等选择而不是默认的 Snow，原本没有的键再次删除（`writePopupSyncChangesChecked` 把 `undefined` 当作删除），只有旧 `WATERMARK_REMOVER_ENABLED` 的水印状态也能还原；通知行经它自己的权限流程拨回。这些键在拨动后又被改动（行下选项、别的窗口、恢复备份）时提示立即撤回，避免撤销覆盖更新的选择。滑块、分段和面板里的选项不提示。不用页面的 `createToaster`：它的位置为宿主页面让位，主题跟随宿主页面而不是 popup。

### 2.3 AI Studio

总开关卡留在顶部，优先于所有行（`surfaceSwitch.ts:1-9`）；关闭期间行仍可编辑，与今天的卡片一致。插件卡在 Batch 2 出现 Enter send，Batch 4 出现 Formula copy（选项里写明"同时作用于 Gemini 和 AI Studio"）。没有任何行时整张卡隐藏。

### 2.4 ChatGPT / Claude / DeepSeek

这些站点的官方插件没有 legacy 绑定，列表已能开关。Batch 7 起每个功能只有一处：

- **Timeline rail**：Claude、ChatGPT 的 rail 是 `timelineManifest` builtin，DeepSeek 的是 catalog 插件，自定义站点可能是本地插件；它们都不在 `OFFICIAL_PLUGIN_IDS` 里，所以不做成官方行，而是让 rail 自己的插件行承载选项。`PluginManager` 的 `timelineRail` 在 `useCatalogTimelineSettings` 选中的那条 rail 的行下面挂一个 Options 折叠面板（`CatalogTimelineOptions`，和 Gemini 的 Timeline 面板同一套 `TimelineOptions`）；行开关就是 rail 的唯一开关。和 Gemini 不同，rail 关闭时面板也在：收藏库和消息时间是共享偏好，在这些站点没有别的入口，所以保持可用；样式、层级和重置位置描述的是一条没画出来的 rail，按 `TimelineOptions` 既有的关闭规则显示为禁用、保留已存的值。样式和层级只在 `DEDICATED_TIMELINE_SOURCES`（官方来源）把它们从行内设置里拿走时才进面板，本地 rail 继续用自己的控件，不会出现两个样式选择。`TimelineSettingsCard` 和 `'timeline'` section 删除。
- **消息时间**：在能记录发送时间的站点（目前是 ChatGPT），它是 rail 面板里的显示选项。键仍是 `gvShowMessageTimestamps`，与 Gemini 的 Message timestamps 行共用，这是有意的：同一个人对"显示消息时间"只有一个偏好。
- **Visual effects**：`voyager.visual-effects` 匹配所有 http(s) 页面。插件站在插件卡顶部列出同一个 `OfficialPluginListRow`（`PluginSiteOfficialRows`），读写同一组键；`PluginManager` 继续跳过这个 id。只有 Voyager 能在该站运行时才列出（`canUseVisualEffects`）：Prompt Manager 覆盖该站，或某个开启的插件（主动开启或默认开启，比如 ChatGPT folders）已拿到该站的 host 权限（`useSitePluginRuns`，授权或撤销后即时重查），因为在那之前没有内容脚本能放特效。chrome:// 等不匹配任何 manifest 的页面在回退设置里照样列出这一行：它是一个共享选择，下一个能运行它的页面就会生效。`VisualEffectPicker` 卡片、`useVisualEffectPopupSettings` 和 `'visualEffect'` section 删除，`visualEffectOff` 文案随之移除。行和运行时一样用 `resolveVisualEffect` 读值：`{gvVisualEffect:'off', gvSnowEffect:true}` 显示为关（任何字符串都优先于旧的雪花布尔值），旧卡片在这种组合下显示 Snow，与页面实际不符。

### 2.5 本地插件

本地插件继续单独一个折叠的"本地插件" section（`NativeLocalPluginsSection.tsx:23-62`），保留完整身份信息、"本地"标签和审核语义（`pluginEnablement.ts:98-108`）。默认顺序把它放在插件卡正下方。已经保存过顺序的用户，`localPlugins` 留在原位（只有新 section 按默认前驱插入，`usePopupSections.ts:47-55`），这是保留用户顺序的正常结果。

### 2.6 留在非插件卡片的内容（Gemini 终态）

云同步与存储；文件夹（不含 Fork）、文件夹间距与缩进；Prompt Manager（不含 Prompt history）；快捷键；通用（常驻导出栏、远程公告及其权限按钮、更新日志徽标、已禁用的标签标题行）；AI Studio 另有总开关。Context Sync、NanoBanana、视觉效果和其余布局滑块在各自迁移前保留卡片（现均已成行，见 §4.4）。

### 2.7 无障碍与 RTL

- 行开关 `aria-label` 为插件名，`aria-describedby` 指向描述；组是带标题的 `section`，行是列表项。
- 行下的选项是 `role="group"`，`aria-label` 带插件名（每个唯一）。搜索过滤掉当前焦点所在的行时，焦点保持在搜索框（过滤由输入触发，焦点本来就在搜索框）。
- 目录是 `<nav aria-label="跳到">` 里的 `<button>`，有可见焦点环；滚动时给目标卡片留出固定标题栏的高度，`prefers-reduced-motion` 时不做平滑滚动。选中后焦点移到目标卡片的标题（`tabindex=-1`，`preventScroll`），键盘从那里继续。目录行尾有渐隐遮罩（RTL 时在左侧）。主题卡内的行之间不画分隔线，只靠间距。阿拉伯语下目录和撤销提示镜像。
- 分段选择（Timeline 样式、滚动模式）：迁入面板时改为 `role="radiogroup"`/`radio` + `aria-checked`，或按钮加 `aria-pressed`；不再只靠颜色表达选中。
- Arabic RTL：行和面板只用 logical 属性（`ps-*`、`ms-*`、`text-start`）。Timeline 现在用物理 `left` 计算浮动高亮（`TimelineSettingsCard.tsx:85`、`:111`），迁入时改为直接给选中按钮画背景，去掉位置计算。

---

## 3. 架构

### 3.1 唯一的 live 快照与读取

```
 gvPluginsState (local) ─┐
 legacy sync 键 ─────────┤ usePopupPlugins：pluginState + legacySettings
                         │ （先订阅后读取，live；唯一持有者）
                         ▼
   effectivePluginView(manifest, state, legacy)        ← 唯一 resolver
     enabled  = resolveEffectiveEnabled(state, legacy, id)    legacySettingBindings.ts:248
     settings = legacyBoundSettings(id, legacy)               legacySnapshotFeed.ts:161
                ?? resolveEffectiveSettings(manifest, state)  legacySettingBindings.ts:269
                         │
        ┌────────────────┼──────────────────────┐
     诊断导出        插件列表的行、面板、     PluginHost 用同样的函数
 (usePopupPlugins    通知 override           （isPluginWanted，
  .ts:90-111)                                 legacySnapshotFeed.ts:144-167）
```

- **一个持有者**：`usePopupPlugins` 已经以"先订阅、后读取"维护 `legacySettings`（`usePopupPlugins.ts:198-219`），它是唯一的 live 快照。行、面板和通知 override 的持久值全部来自它。快照的键集合是 `legacyBindingKeys()` 加上 registry 声明的面板键（面板键只给 UI 读，不进 runtime value binding）。
- **旧 hook 只保留动作**：权限流程、按钮动作和瞬时状态（如通知请求进行中）。不再保留它们自己的持久值副本，因为那份副本一次性读取，restore 后会过期（`useFormulaCopyPopupSettings.ts:40`、`useTimelinePopupSettings.ts:48`）。这同时修掉一个迁移回归：如果通知的 hydration 默认值被删掉，Safari 会把已存的 `true` 显示成关（`useGeneralPopupSettings.ts:120`、`:205`），改为从快照读之后不再依赖那份默认值。
- **保存的偏好，不是页面状态**：popup 调 resolver 时不传 `wasChangedLive`，所以它不猜页面历史。页面可能因 live 变化而不同：例如页面首读宽度 70、开关缺失，之后外部只写入宽度 90，popup 推导为开，当前页仍为关（`src/core/utils/chatAppearanceValues.ts` 的派生规则）；数值键被删除时，页面保留最后的值，popup 回到默认值。诊断导出早已把这类值标为 storage-derived（`usePopupPlugins.ts:94-98`）。测试只断言行等于保存的偏好，不断言页面状态。

### 3.2 写入

| 写入                                | 绑定的 id（`legacyBindingFor`）                                                   | 未绑定的 id                 |
| ----------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| 开关                                | `legacyEnableWrite(id, next)`（`legacySettingBindings.ts:281-285`），经严格写入器 | `setPluginEnabled`，不变    |
| 有 value binding 的 manifest 设置   | 新增 `legacyValueWrite(id, key, value)`：`{ [legacyKey]: normalize(value) }`      | `setPluginSetting(s)`，不变 |
| 没有 value binding 的 manifest 设置 | 不允许（registry 契约测试失败）                                                   | —                           |
| 面板拥有的键                        | 面板动作直接写该键                                                                | —                           |

- **严格写入器**：`writePopupSyncStorage` 会吞掉失败，callback fallback 也不检查 `runtime.lastError`（`src/pages/popup/utils/popupStorage.ts:4-18`）。新增 `writePopupSyncStorageChecked`，返回成功与否；原函数改为调用它，行为不变。
- **乐观覆盖层**按存储键和写入 revision 管理，由写入结果和最新快照共同结算，不只等 change event：
  1. 写入失败：清除覆盖，显示快照（真实值）。
  2. 写入成功且快照已等于写入值（包括 no-op 写入，不会有 event）：清除。
  3. 写入成功、快照还是旧值：保留，直到该键的下一次快照变化；那时无论等于写入值，还是外部写入了别的值，都清除（快照优先）。
  4. 同一个键又有新写入：revision 递增，旧写入的结算被忽略（迟到的旧写入不会覆盖新状态）。

  外部 restore 与本地未结算写入冲突时，最新快照胜出。

- **开关路由**：`pluginEnablement.ts` 的 `persistEnabled` 和两处回滚（`:152`、`:167`）统一经 `writeEnabled(plugin, enabled)`，绑定 id 写旧键。绑定 id 不会触发主机权限提示：静态注入站点上 `pluginToOriginPatternsForActiveUrl` 返回 `[]`（`src/features/plugins/runtime/siteRegistration.ts:108`），`pluginApiPermissions` 只认 ChatGPT 通知 id（`pluginEnablement.ts:70-75`）。
- **滑块在提交时立即保存**：pointer 或键盘提交（`onValueCommit`）时写入，拖动中只改本地草稿，与现在的 `WidthSlider.tsx:59-62` 一致。不用"200 ms 防抖 + 关闭时 flush"：popup 关闭时不会执行 React cleanup（`src/pages/popup/index.tsx` 关闭时不调用 `root.unmount()`），flush 不可靠。
- **不变量**：列表从不为绑定 id 写 `gvPluginsState`，也不复制任何值进去，保持 `legacySettingBindings.ts:5-10` 承诺的"恢复顺序无关"。

### 3.3 行的控件怎么声明

| 控件类型                                                                    | 声明方式                                                                                                    | 例子                                                                                                                                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 运行时作为插件设置接收的标量（handler 有 `updateSettings`，或可以接受重启） | manifest `contributes.settings` + value binding，由 `PluginSettings` 行内渲染；boolean 立即写，数值提交时写 | Chat / Edit input width、字号、行高（`legacyValueBindings.ts`）；`collapseWhenNotEmpty`（`geminiInputCollapseManifest.ts:80-89`，用 `messageKeys` 保持旧文案） |
| 运行时自己读存储的值、schema 表达不了的枚举、跨站说明、动作按钮             | popup registry 里的自定义面板，放在"选项"后                                                                 | Timeline、Formula copy 格式与范围说明、Highlight 时间线标记                                                                                                    |
| 不是普通写入的开启流程（权限）                                              | registry 里的控制 override                                                                                  | Response notification                                                                                                                                          |

Highlight 标记做成面板而不是 value binding：运行时自己 live 读这个键（`highlightAction.ts:57-61`），handler 没有 `updateSettings`（`src/pages/content/pluginNativeRegistration.ts`），绑定后每次切换都会推送设置变化，引擎默认整套销毁再激活（`src/features/plugins/runtime/declarativeEngine.ts:351-358`）。Timeline 同理。

**Registry**：`src/pages/popup/officialPlugins/officialPluginRegistry.ts`，纯数据，是唯一知道 popup 呈现方式的地方。字段以该文件的 `OfficialPluginEntry` 为准（主题卡 `topic`、`searchKeys` / `searchAliases`、`formerSectionTitle`、`experimental`、`eligible`、`usageHint`、`panel` / `inlinePanel`、`control`、`requires`、`enableWrite`、`sliders`）；`eligible` 与 `usageHint` 收到的是同文件的 `OfficialPluginContext`（目前只有 `isSafariBrowser`），不再是早期草案里的 `OfficialPluginEnv`。

数组顺序就是卡内显示顺序。面板组件放在 `officialPluginPanels.tsx`，从行拿 `enabled`，从快照拿持久值，从旧 hook 拿动作。

### 3.4 三个特例

- **Timeline**：面板 = `TimelineSettingsCard.tsx:80-229` 去掉开关行、Prevent auto-scroll（独立插件）和消息时间（独立功能）；保留重置位置和收藏历史。Timeline 关闭时，收藏历史仍可从 存储 → 管理 → 高亮 进入（`Popup.tsx:217-226`）。
- **Formula copy**：两个 id 共用一个面板（格式单选 + 范围说明）；两站共用开关和格式（`legacySettingBindings.ts:131-141`），在 AI Studio 关掉 Gemini 也会关，说明里写明。
- **Response notification**：override 从快照读 `enabled`，开关时**同步**调用原流程，不在前面插任何 await：Firefox 权限请求仍是首个 await（`useGeneralPopupSettings.ts:250-251`），Chrome 保留后台意图交接（`:247-249`），Safari 保留 native 权限路径（`:230-234`）和 Safari 文案。请求进行中的瞬时状态仍由 hook 持有。

### 3.5 浏览器差异

- Safari：Safari Enter fix 只在 `eligible` 为真时列出（今天只在 Safari 显示，`InputSettingsCard.tsx:162`），绑定的 `derive` 也检查 `isSafari()`。图标用 `lucide-react`，不新增 Material Symbols。
- Firefox：权限请求前不能有 await（`pluginEnablement.ts:134-136`）；绑定 id 的开关不请求权限。
- Chrome / Edge：权限提示期间 popup 可能关闭；通知 override 已先持久化意图。

### 3.6 搜索与定位

- **搜索目标**：`usePopupSections` 接收动态条目 `<topicId>:<pluginId>`，以及每张有行的主题卡一个 section 条目（`pluginsTitle`、`pluginsNativeDescription` 和主题标题；不含较短的目录名，以免“Chats”之类的词把整张卡拉进常见搜索），只为实际列出的行生成（与行使用同一资格判断）。语料 = manifest 所有语言的名称和描述 + registry `searchKeys` / `searchAliases`，经 `buildSettingsSearchCorpus`（`src/pages/popup/utils/settingsSearch.ts:85-90`）。旧条目的 `keys` 和别名原样搬进 registry，旧查询继续命中。
- **Section**（Batch 8 起）：八个主题 id 替换单个 `officialPlugins`，默认紧跟 `cloudSync`；已存顺序里的 `officialPlugins` 在读取时原地展开成八个主题 id，移动过 Plugins 卡的用户保留原位置。没有行的主题不可见，排序时被跳过。AI Studio 白名单逐个列出八个主题。以下是 Batch 1 时的记录：新 id `officialPlugins` 替换永远隐藏的 `plugins`，默认放在 `localPlugins` 前。已存顺序不需要迁移：新 id 插在默认前驱之后（`usePopupSections.ts:47-55`），不存在的 id 在读取时被丢弃（`:112-116`）。之后删除各功能 section id 同样安全。AI Studio 白名单加 `officialPlugins: true`；没有行时卡片隐藏。
- **Batch 5 的 Timeline section**：Gemini 上 `timeline` 同时移除可见性、搜索目标和排序占位，否则"上移"会与不可见的 Timeline 交换，残留搜索目标还会让"无结果"不显示。插件站 rail 的 Timeline 卡改用独立的显示条件，不再借 Gemini 的 section。消息时间迁走时，搜索谓词一起迁。
- **定位提示**：旧 `LOCATIONS` 与 `officialFeatureSetting.ts` 已移除；`pluginBlockedNote.ts` 的 `officialSwitch` 现在通过 registry 找到官方插件，用 manifest 行名加该行所在主题卡的标题（`officialPluginTopic(entry.topic).title`）指向那一行。保留十语种 `pluginBlockedByOfficialSetting`，`src/pages/popup/components/pluginBlockedNote.ts:86` 仍用它说明应关闭哪一行；它不再指向旧设置卡片。
- **从页面定位**：默认模型失败提示会打开 popup（`src/pages/content/defaultModel/autoApply.ts:221-247`）。建议在 `gv.openPopup` 前把插件名写入 local 的 `gvPopupSettingsSearchQuery`，popup 打开时已经过滤到那一行（`usePopupSections.ts:82-99` 会恢复它）。

### 3.7 备份、恢复、云同步

- 旧键在 `chrome.storage.sync`，随设置备份和 Drive 设置文件走。列表 live 跟随，打开 popup 时恢复也会立即更新行。
- `gvPluginsState` 有自己的 Drive 文件（`src/core/services/SettingsBackupService.ts:467-471`）；对绑定 id 既被忽略也从不写入，两份文件以任何顺序恢复都不会矛盾。
- **原有限制（不是本次迁移引入，已修，见本条后记）**：设置备份导出时给缺失的键补默认值（`BACKUPABLE_SYNC_SETTINGS_DEFAULTS`，`SettingsBackupService.ts:40-140`），恢复时写回。补的值和 binding 对缺失的解读不一致时，恢复会改变偏好：
  - `CHAT_WIDTH_ENABLED` / `EDIT_INPUT_WIDTH_ENABLED` 补 `false`：开关缺失但宽度已自定义（派生为开）的用户，恢复后变关。
  - `HIGHLIGHT_ENABLED` 补 `true`，binding 是"只有 true 才开"：从未开过的用户恢复后变开。

  Registry 契约测试为每个列出的 id 检查"备份默认值经 binding 读取 = 缺失时的读取"。Batch 1 的 13 项全部一致。Batch 3、4 加入上述 id 时测试会失败，届时二选一：修备份（缺失保持缺失），或在测试里显式记录为已知限制。建议修备份，单独一个提交。

  后记（04cea801）：已修备份。`loadBackupableSyncSettings` 遇到缺失的、带 `derive` 的绑定键时，只要静态默认值会改变页面当前的实际读取，就导出派生后的有效值，宽度开关不再在恢复后变关。Highlight 不会遇到缺失：background 首次运行就写入该键（`migrateOptionalHighlightSetting`）。

- 本设计不新增存储键（Batch 8 起选项随开关显示，没有展开状态）。没有旧键的新功能，按 §7.12 加默认开启的 sync 键 + 绑定，于是 Gemini / AI Studio 官方插件全部以 sync 为准，`gvPluginsState` 只服务本地插件和插件站。

---

## 4. 26 项（含 Edit input width 共 27 项）的迁移

### 4.1 每批的规则

- 一批移动**整行**：加 registry 条目，同时删除旧行、旧 hook 状态、`*_STORAGE_DEFAULTS` 键、旧搜索条目、`LOCATIONS` 条目，以及因此变空的 section，全部在一个提交里。同一个键在一个 popup 里永远只有一个开关。
- 升级时不写任何东西，用户的键保持原样。
- 运行时代码不动（这些功能已经以插件运行），每批只改 popup。
- 依赖：只有 Batch 1 阻塞后续的运行时迁移；Batch 2–5 可以与运行时迁移交错进行。Batch 5（Timeline）排在消息时间完成运行时迁移之后，让那一行只搬一次。

### 4.2 顺序

| 批次                                         | 移动                                                                                                                                                                                                                  | 从 popup 删除                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. 列表 + 简单开关**（13）                 | 基础设施（§3.1、§3.2 的开关写入与覆盖层、§3.6）+ Mermaid、WaveDrom、ECharts、Code collapse、User LaTeX、Quote reply、Usage status、Hide halo、Default model、Research pack、Prevent auto-scroll、Fork、Prompt history | General 卡 10 行（保留导出栏、Highlight 及标记、通知、公告、更新日志、标签标题）；`useWaveDromPopupSettings.ts`、`useEchartsPopupSettings.ts`；共享 Timeline 卡里的 Prevent auto-scroll（rail 从不提供它，`useCatalogTimelineSettings.ts:152-153`）；文件夹卡的 Fork；Prompt Manager 卡的 Prompt history；`LOCATIONS.promptHistory` |
| **2. 输入**（6）                             | Input collapse（子开关行内，需 boolean 立即写 + `legacyValueWrite`）、Vim、Ctrl+Enter（G）、Enter send（A）、Safari fix（`eligible`）、Draft save                                                                     | 整个 `InputSettingsCard.tsx` 和 `useInputPopupSettings.ts`；`inputCollapse` section 及其 AI Studio 白名单项；三处 `OfficialFeatureStatus`（`Popup.tsx:424-430`）                                                                                                                                                                    |
| **3. 外观滑块**（4）                         | Chat width、字号、行高与段距、Edit input width（manifest 设置 + 提交时写）                                                                                                                                            | 四个 section、它们的 `VALUE_BADGE_SECTION_IDS` 条目、`usePopupLayoutSettings.ts` 里对应的调节器和开关                                                                                                                                                                                                                               |
| **4. 面板与流程**（4 个 id，Gemini 上 3 行） | Formula copy G + A（面板）、Highlight（标记面板）、Response notification（override）                                                                                                                                  | `FormulaCopySettings.tsx`、`useFormulaCopyPopupSettings.ts`、`formulaCopy` section、`Popup.tsx:195-212`；General 卡的 Highlight、标记、通知行                                                                                                                                                                                       |
| **5. Timeline**（1）                         | Timeline（面板，含 §2.7 的 a11y/RTL 修正）                                                                                                                                                                            | Gemini 的 Timeline 卡及其 section 可见性、搜索目标、排序占位；插件站 rail 卡改独立显示条件                                                                                                                                                                                                                                          |

### 4.3 测试

每批扩展同一张表驱动的 popup 测试（Gemini；适用时加 AI Studio）：

- **缺失 / false / true**：每个移动的 id，行的开关等于保存的偏好 `resolveEffectiveEnabled(state, legacy, id)`。反向的 halo（`true` = 开）、Input collapse 缺失 = 关、宽度派生单独断言。
- **写入形状**：开关只写旧 sync 载荷（例如 `{ gvMermaidEnabled: false }`），不调用 `setPluginEnabled`，`gvPluginsState` 不变。
- **覆盖层**：no-op 写入、写入失败、迟到的旧写入、写入未结算时外部恢复，四种情况都显示正确值。
- **搜索连续性**：旧查询仍命中（Batch 1："光晕"找到 Hide input halo、"代码块"找到 Code collapse；Batch 3："字号"找到字号）。
- **已存顺序**：含已删除 section id 的顺序能正常读取，其余 section 相对顺序不变。
- **Registry 契约**（静态契约测试，AGENTS.md 允许）：每个 id 是打包官方 id 且只出现一次；绑定 id 的每个 manifest 设置都有 value binding，否则必须有面板；备份默认值的缺失语义一致（§3.7）。Batch 5 后所有 Gemini / AI Studio owner 都有条目。
- **旧测试**：有价值的断言随控件迁移（`GeneralSettingsCard.test.tsx`、`FolderSettingsCard.test.tsx`、`PromptManagerSettingsCard.test.tsx`、`TimelineSettingsCard.test.tsx`、各 hook 测试、`usePopupSections.test.tsx` 等），只删除为已删代码存在的测试。

每批都是 popup UI 变化，另需在 dev 构建上实测（Gemini 和 AI Studio，亮色、暗色、Arabic），最终树跑 `verify:pr`。

### 4.4 进度

| 批次 | 状态   | 备注                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3  | 已完成 |                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4    | 已完成 | Formula copy（G + A）、Highlight、Response notification；随后迁入的 Canvas copy、Gems sidebar（数量 0 = 隐藏列表）、Context Sync（卡片成为面板，同步请求由 `Popup` 持有）、Deep Research export、Markdown fix、Visual effects（Gemini / AI Studio 一行；其他站点的卡片在 Batch 7 也改成行）也已成行                                                                                                        |
| 5    | 已完成 | Timeline 成为"对话"组的一行，选项（样式、滚动模式、隐藏容器、可拖动、固定预览、层级、重置位置、收藏历史）在它的面板里，分段选择改为 `radiogroup`、不再用 `left` 计算（§2.7）；Message timestamps 单独一行。AI Studio sidebar width 成行（未存开关时跟随文件夹开关，宽度写入不再顺带写开关）。`officialFeatureSetting.ts` 随最后一个 `LOCATIONS` 条目删除                                                   |
| 6    | 已完成 | Batch delete（G + A）成为"对话"组的一行，默认开；文件夹开关关掉时开关置灰，行下提示去 Folder Options → Enable folder feature 打开（`requires`）。NanoBanana 两行放进"内容"组而非 §2 表里的"对话"组（它处理的是回复里的图片），Preview 行用 Experimental 徽标代替原来的 Unstable；任一开关都写两个拆分键并清掉旧的共享键（`enableWrite`，取代 `useWatermarkPopupSettings`）。NanoBanana 卡片和 section 删除 |
| 7    | 已完成 | §2.4 的跟进：插件站 rail 的选项成为它插件行下的 Options 面板（rail 关闭时收藏库和消息时间仍可用，其余显示为禁用），消息时间是其中一项；Visual effects 在插件站插件卡里成行，chrome:// 等页面在回退设置里也有这一行。`TimelineSettingsCard`、`VisualEffectPicker` 卡片及 `'timeline'`、`'visualEffect'` section 删除，旧排序里的这两个槽位按惯例丢弃                                                        |
| 8    | 已完成 | 单张 Plugins 卡拆成八张主题卡（§2.2），标题用普通 `CardTitle`；选项在开启时直接显示在行下，Options 按钮删除；标题栏和搜索框固定在顶部，搜索框下方是纯文字目录；行开关拨动后有 4 秒撤销提示。已存顺序里的 `officialPlugins` 原地展开；被官方插件挡住的本地插件提示改为指向主题卡。插件站 rail 的 Options 面板不变                                                                                           |

---

## 5. 以后每项迁移的步骤

**运行时**：按 `GEMINI_PLUGIN_PLATFORM_PLAN.md` §7.12 的"后续迁移模板"执行，此处不重复。

**Popup**（本设计让这一部分变成机械步骤）：

1. 在 `src/pages/popup/officialPlugins/officialPluginRegistry.ts` 加条目：主题卡、位置、从 `utils/popupSettingsSearchIndex.ts` 搬来的 `searchKeys` / `searchAliases`（含旧 section 标题键）；按 §3.3 需要时才加 `eligible`、`experimental`、`panel`、`control` 等字段（完整字段见该文件的 `OfficialPluginEntry`）。
2. 需要时在 `officialPluginPanels.tsx` 加面板：复用旧卡片 JSX，`enabled` 从行来，持久值从快照来，按 §2.7 补 a11y/RTL。
3. 删除旧界面：卡片行或 `wrapSection` 调用、hook 状态、`*_STORAGE_DEFAULTS` 键、`nativeSiteCapabilities.ts` 的 section id / AI Studio 白名单 / `VALUE_BADGE_SECTION_IDS`、搜索条目；旧 `officialFeatureSetting.ts` 已随 `LOCATIONS` 清空删除，无需新增定位表。
4. 文案：只删除仅被已删行使用、且没有作为 `searchKeys` 或 manifest `messageKeys` 保留的键，10 个语言一起删；`bun run i18n:check`。
5. 测试：把 id 加进 缺失 / false / true 表，迁移卡片测试的断言；契约测试负责其余。
6. 文档：该功能 guide 的所有语言版本写明 popup 的「**主题卡标题** → **manifest 行名**」，两者都使用各语言实际文案。

**已完成示例：Edit input width**（`voyager.gemini-edit-input-width`）。运行时在 §7.12 8-1 完成，popup 随 Batch 3 迁入「外观」组。Registry 保留原 section 标题、搜索词和 `widthPercent` 滑块，开关与数值分别经 `legacyEnableWrite`、`legacyValueWrite` 写原键；旧卡片控件、hook 状态和 section 已移除。备份默认值对缺失开关的影响已按 §3.7 后记修复。

其余列出的功能也已完成：Auto-hide / Full hide 两行共用一个 controller；Gems sidebar 因 Gemini 新版侧栏将 Gems 收入「更多」菜单而暂不显示，popup 行置灰并显示为关闭；旧 Gems hider 停止启动，模块和 `gvGemsHidden` 保留；AI Studio sidebar width 使用独立开关键，缺失时跟随文件夹开关；Visual effects 通过 enum binding 保留跨站共享选择，每个站点各一行（Batch 7 起插件站也是）；Context Sync 的端口、状态和同步按钮在行下的面板里，面板进入视口后才开始探测本地服务器（旧卡片在 popup 打开且功能开启时就轮询，现在面板不用点 Options 就显示，因此改为可见时才探测）；NanoBanana 两行沿用 `src/core/utils/watermarkSettings.ts` 的 resolver。插件站 rail 的选项已在 Batch 7 挂到 rail 的插件行下（§2.4）。

---

## 6. 已定事项与剩余问题

| #   | 问题                                                 | 结论                                                                            |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Gemini 现在 26 行，下一波后约 38 行                  | **已做**（Batch 8）：八张主题卡 + 目录 + 搜索；不做可折叠组                     |
| 2   | 行名用 manifest 名还是旧卡片标签                     | **已定**：一律用 manifest 名；旧标签作搜索词                                    |
| 3   | 选项只在开启时出现，旧 Timeline 卡关闭时显示禁用控件 | Gemini 只在开启时出现，收藏历史另有入口；插件站 rail 关闭时面板仍在，收藏库可用 |
| 4   | Timeline 卡拆掉后消息时间放哪里                      | **已定**：不临时放 General；Batch 5 排在消息时间运行时迁移之后，那一行只搬一次  |
| 5   | Formula copy 两站共用一个开关                        | 保持共用，面板里写明范围；分站开关是另一个产品决定                              |
| 6   | 快捷键与 Timeline 相关                               | 保持独立卡片：全局生效，也驱动插件站 rail                                       |
| 7   | 插件站 rail 在行旁边另有 Timeline 卡                 | **已做**（Batch 7）：卡片删除，选项在 rail 插件行的 Options 里                  |
| 8   | 选项展开状态要不要持久化                             | 不需要（Batch 8）：选项随开关显示，没有展开状态                                 |
| 9   | Visual effects 跨站                                  | **已做**（Batch 7）：每个站点各一行，绑定同一个键；卡片删除                     |
| 10  | 降级                                                 | 天然安全：不搬数据，旧版本读同样的键                                            |
| 11  | 备份补默认值改变缺失语义                             | **已修**（04cea801）：缺失的派生开关按有效值导出，见 §3.7                       |
| 12  | 从页面定位                                           | 只给默认模型失败提示做搜索词交接；Prompt Manager 的"打开设置"指向核心卡，不需要 |
