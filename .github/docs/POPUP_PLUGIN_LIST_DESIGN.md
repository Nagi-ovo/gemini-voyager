# Popup 官方插件列表设计

状态：Batch 1 实施中，其余为方案。基线：`main@754c03c2`。Codex 复审结论 "implement after changes"，本版已吸收全部 P2/P3。

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
- 行在开启前保持精简：设置和 Options 只在开启时出现（与 `PluginManager.tsx:288-300` 一致）。
- 靠搜索而不是嵌套：组标题只是标题，不可折叠。
- 行显示的是**保存的偏好**，不是当前页面的运行状态（见 §3.1）。页面实际状态只通过 tab 回报的状态说明体现（暂停、等待）。

### 2.2 Gemini

```
┌──────────────────────────────────────────┐
│ [ 搜索设置…                           ]  │
│ ┌ 云同步 ──────────────────────────────┐ │
│ ┌ 插件 ───────────────────────────── ▲▼ ┐ │
│ │ 开关 Voyager 的各项功能。开启后显示  │ │
│ │ 对应选项。                           │ │
│ │ 外观                                 │ │
│ │ 对话区域宽度                   [●━]  │ │
│ │ 按屏幕宽度的比例加宽对话区域…        │ │
│ │ 窄 ├────────●──────┤ 宽        70    │ │
│ │ 内容                                 │ │
│ │ 公式复制                       [●━]  │ │
│ │ › 选项                               │ │
│ │ 对话                                 │ │
│ │ 时间线                         [●━]  │ │
│ │ ⏸ 本页已暂停：你的本地插件"My rail"  │ │
│ │   已在做这件事…                      │ │
│ │ › 选项                               │ │
│ └──────────────────────────────────────┘ │
│ ┌ 本地插件 ────────────────────────  ▾ ┐ │
│ ┌ 时间线 / 文件夹 / … 其余核心卡片     ┐ │
└──────────────────────────────────────────┘
```

**分组**来自 popup 内的可信表，不来自 manifest（所有官方 manifest 的 `category` 只有 `readability`/`productivity`，且文档插件表也读它）。组内顺序固定：

| 组   | 现在的行（Gemini）                                                                                                                | 以后加入                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 外观 | Hide input halo；Batch 3 起：Chat width、Chat font size、Line height、Edit input width                                            | Sidebar width、Auto-hide、Full hide、Gems sidebar、Visual effects  |
| 内容 | Code collapse、User LaTeX、Mermaid、WaveDrom、ECharts；Batch 4 起：Formula copy                                                   | Markdown fix、Canvas copy、Deep Research 菜单                      |
| 输入 | Prompt history、Quote reply；Batch 2 起：Input collapse、Ctrl+Enter、Safari fix、Vim、Draft save                                  | —                                                                  |
| 对话 | Prevent auto-scroll、Fork、Research pack、Default model、Usage status；Batch 4、5 起：Highlights、Response notification、Timeline | Message timestamps、Context Sync、Batch delete、NanoBanana（2 行） |

全部迁完后 Gemini 26 行（非 Safari 25 行），AI Studio 2 行。

**一行包含**：

```
名称  [实验性]                            [开关]
manifest 的一句话描述（本地化）
<状态说明：仅暂停 / 等待时>
<manifest 设置：仅开启时，行内>
› 选项   ← 仅开启且有自定义面板时
```

- 名称和描述一律用 manifest（`displayName` 去掉 `Gemini ·` 前缀，`components/PluginIdentity.tsx:61-63`）；旧卡片标签只作搜索词。
- Gemini / AI Studio 的打包官方插件（`isPackagedOfficialPluginId`，`featureOwners.ts`）不显示来源块：版本、来源标签、主页、changelog、"已更新"徽标（`PluginIdentity.tsx:209-275`）。它们只随 Voyager 一起更新。`voyager.chatgpt-*` 等插件站 builtin 保留来源块。
- 状态说明复用 `blockedPluginNote`，`conflictKey: 'officialFeaturePausedByLocal'`（与 `OfficialFeatureStatus.tsx:34-40` 一致）。
- 卡片描述新增一个键 `pluginsNativeDescription`（10 个语言）：现有 `pluginsDescription` 讲的是站点权限和 voyager.nagi.fun 更新，不适用于这里。

**搜索**：打 "光晕"、"字号"、"ruler" 时只显示插件卡里命中的行。命中有自定义面板的行时直接展开它的选项；行关闭时只显示行，不显示选项（"开启前不显示选项"优先）。

### 2.3 AI Studio

总开关卡留在顶部，优先于所有行（`surfaceSwitch.ts:1-9`）；关闭期间行仍可编辑，与今天的卡片一致。插件卡在 Batch 2 出现 Enter send，Batch 4 出现 Formula copy（选项里写明"同时作用于 Gemini 和 AI Studio"）。没有任何行时整张卡隐藏。

### 2.4 ChatGPT / Claude / DeepSeek

本项目不改。这些站点的官方插件没有 legacy 绑定，列表已能开关。Batch 5 之后的跟进：把 Timeline 面板也登记给这些 rail，删除 `dedicatedTimelineSettings` 和 `DEDICATED_TIMELINE_SOURCES`（`PluginManager.tsx:23-59`、`Popup.tsx:183-194`）。

### 2.5 本地插件

本地插件继续单独一个折叠的"本地插件" section（`NativeLocalPluginsSection.tsx:23-62`），保留完整身份信息、"本地"标签和审核语义（`pluginEnablement.ts:98-108`）。默认顺序把它放在插件卡正下方。已经保存过顺序的用户，`localPlugins` 留在原位（只有新 section 按默认前驱插入，`usePopupSections.ts:47-55`），这是保留用户顺序的正常结果。

### 2.6 留在非插件卡片的内容（Gemini 终态）

云同步与存储；文件夹（不含 Fork）、文件夹间距与缩进；Prompt Manager（不含 Prompt history）；快捷键；通用（常驻导出栏、远程公告及其权限按钮、更新日志徽标、已禁用的标签标题行）；AI Studio 另有总开关。Context Sync、NanoBanana、视觉效果和其余布局滑块在各自迁移前保留卡片。

### 2.7 无障碍与 RTL

- 行开关 `aria-label` 为插件名，`aria-describedby` 指向描述；组是带标题的 `section`，行是列表项。
- 选项按钮：可见名称"选项"，`aria-label` 带插件名（每个唯一），`aria-expanded`、`aria-controls` 指向面板 id。收起时焦点回到按钮；搜索过滤掉当前焦点所在的行时，焦点保持在搜索框（过滤由输入触发，焦点本来就在搜索框）。
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

**Registry**：`src/pages/popup/officialPlugins/officialPluginRegistry.ts`，纯数据，是唯一知道 popup 呈现方式的地方：

```ts
export interface OfficialPluginEntry {
  readonly id: string; // OFFICIAL_PLUGIN_IDS.*
  readonly group: OfficialPluginGroup; // 'appearance' | 'content' | 'input' | 'conversation'
  /** 从被退役的 popupSettingsSearchIndex 条目原样搬来，含旧 section 标题键。 */
  readonly searchKeys: readonly TranslationKey[];
  readonly searchAliases?: readonly string[];
  readonly experimental?: boolean;
  /** matches 之外的资格，如仅 Safari；搜索索引用同一判断。 */
  readonly eligible?: (env: OfficialPluginEnv) => boolean;
  readonly panel?: OfficialPanelId; // Batch 4 起
  readonly control?: OfficialControlId; // Batch 4 起
}
```

数组顺序就是组内显示顺序。面板组件放在 `officialPluginPanels.tsx`，从行拿 `enabled`，从快照拿持久值，从旧 hook 拿动作。

### 3.4 三个特例

- **Timeline**：面板 = `TimelineSettingsCard.tsx:80-229` 去掉开关行、Prevent auto-scroll（独立插件）和消息时间（独立功能）；保留重置位置和收藏历史。Timeline 关闭时，收藏历史仍可从 存储 → 管理 → 高亮 进入（`Popup.tsx:217-226`）。
- **Formula copy**：两个 id 共用一个面板（格式单选 + 范围说明）；两站共用开关和格式（`legacySettingBindings.ts:131-141`），在 AI Studio 关掉 Gemini 也会关，说明里写明。
- **Response notification**：override 从快照读 `enabled`，开关时**同步**调用原流程，不在前面插任何 await：Firefox 权限请求仍是首个 await（`useGeneralPopupSettings.ts:250-251`），Chrome 保留后台意图交接（`:247-249`），Safari 保留 native 权限路径（`:230-234`）和 Safari 文案。请求进行中的瞬时状态仍由 hook 持有。

### 3.5 浏览器差异

- Safari：Safari Enter fix 只在 `eligible` 为真时列出（今天只在 Safari 显示，`InputSettingsCard.tsx:162`），绑定的 `derive` 也检查 `isSafari()`。图标用 `lucide-react`，不新增 Material Symbols。
- Firefox：权限请求前不能有 await（`pluginEnablement.ts:134-136`）；绑定 id 的开关不请求权限。
- Chrome / Edge：权限提示期间 popup 可能关闭；通知 override 已先持久化意图。

### 3.6 搜索与定位

- **搜索目标**：`usePopupSections` 接收动态条目 `officialPlugins:<pluginId>`，只为实际列出的行生成（与行使用同一资格判断）。语料 = manifest 所有语言的名称和描述 + registry `searchKeys` / `searchAliases`，经 `buildSettingsSearchCorpus`（`src/pages/popup/utils/settingsSearch.ts:85-90`）。旧条目的 `keys` 和别名原样搬进 registry，旧查询继续命中。
- **Section**：新 id `officialPlugins` 替换永远隐藏的 `plugins`，默认放在 `localPlugins` 前。已存顺序不需要迁移：新 id 插在默认前驱之后（`usePopupSections.ts:47-55`），不存在的 id 在读取时被丢弃（`:112-116`）。之后删除各功能 section id 同样安全。AI Studio 白名单加 `officialPlugins: true`；没有行时卡片隐藏。
- **Batch 5 的 Timeline section**：Gemini 上 `timeline` 同时移除可见性、搜索目标和排序占位，否则"上移"会与不可见的 Timeline 交换，残留搜索目标还会让"无结果"不显示。插件站 rail 的 Timeline 卡改用独立的显示条件，不再借 Gemini 的 section。消息时间迁走时，搜索谓词一起迁。
- **定位提示**：每次迁移删掉对应的 `LOCATIONS` 条目，`pluginBlockedNote` 退回到 `pluginDisplayName`（`pluginBlockedNote.ts:73-75`），说出的是同一 popup 里看得到的行名。`LOCATIONS` 清空后删除该模块、10 个语言的 `pluginBlockedByOfficialSetting` 和 `OfficialFeatureStatus.tsx`。
- **从页面定位**：默认模型失败提示会打开 popup（`src/pages/content/defaultModel/autoApply.ts:221-247`）。建议在 `gv.openPopup` 前把插件名写入 local 的 `gvPopupSettingsSearchQuery`，popup 打开时已经过滤到那一行（`usePopupSections.ts:82-99` 会恢复它）。

### 3.7 备份、恢复、云同步

- 旧键在 `chrome.storage.sync`，随设置备份和 Drive 设置文件走。列表 live 跟随，打开 popup 时恢复也会立即更新行。
- `gvPluginsState` 有自己的 Drive 文件（`src/core/services/SettingsBackupService.ts:467-471`）；对绑定 id 既被忽略也从不写入，两份文件以任何顺序恢复都不会矛盾。
- **既有限制（不是本次迁移引入）**：设置备份导出时给缺失的键补默认值（`BACKUPABLE_SYNC_SETTINGS_DEFAULTS`，`SettingsBackupService.ts:40-140`），恢复时写回。补的值和 binding 对缺失的解读不一致时，恢复会改变偏好：
  - `CHAT_WIDTH_ENABLED` / `EDIT_INPUT_WIDTH_ENABLED` 补 `false`：开关缺失但宽度已自定义（派生为开）的用户，恢复后变关。
  - `HIGHLIGHT_ENABLED` 补 `true`，binding 是"只有 true 才开"：从未开过的用户恢复后变开。

  Registry 契约测试为每个列出的 id 检查"备份默认值经 binding 读取 = 缺失时的读取"。Batch 1 的 13 项全部一致。Batch 3、4 加入上述 id 时测试会失败，届时二选一：修备份（缺失保持缺失），或在测试里显式记录为已知限制。建议修备份，单独一个提交。

- 本设计不新增存储键（选项展开状态只在内存中）。没有旧键的新功能，按 §7.12 加默认开启的 sync 键 + 绑定，于是 Gemini / AI Studio 官方插件全部以 sync 为准，`gvPluginsState` 只服务本地插件和插件站。

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

---

## 5. 以后每项迁移的步骤

**运行时**：按 `GEMINI_PLUGIN_PLATFORM_PLAN.md` §7.12 的"后续迁移模板"执行，此处不重复。

**Popup**（本设计让这一部分变成机械步骤）：

1. 在 `src/pages/popup/officialPlugins/officialPluginRegistry.ts` 加条目：组、位置、从 `utils/popupSettingsSearchIndex.ts` 搬来的 `searchKeys` / `searchAliases`（含旧 section 标题键）；按 §3.3 需要时才加 `eligible`、`experimental`、`panel`、`control`。
2. 需要时在 `officialPluginPanels.tsx` 加面板：复用旧卡片 JSX，`enabled` 从行来，持久值从快照来，按 §2.7 补 a11y/RTL。
3. 删除旧界面：卡片行或 `wrapSection` 调用、hook 状态、`*_STORAGE_DEFAULTS` 键、`nativeSiteCapabilities.ts` 的 section id / AI Studio 白名单 / `VALUE_BADGE_SECTION_IDS`、搜索条目、`officialFeatureSetting.ts` 条目。
4. 文案：只删除仅被已删行使用、且没有作为 `searchKeys` 或 manifest `messageKeys` 保留的键，10 个语言一起删；`bun run i18n:check`。
5. 测试：把 id 加进 缺失 / false / true 表，迁移卡片测试的断言；契约测试负责其余。
6. 文档：该功能 guide 的所有语言版本改成"**插件** → **<名称>**"（现有措辞指向卡片，例如 `docs/en/guide/mermaid.md:18`、`send-behavior.md:23`、`timeline.md:20`、`:44`、`:93`）。

**示例：Edit input width**（`voyager.gemini-edit-input-width`）。运行时已在 §7.12 8-1 完成，只剩 popup 移动，随 Batch 3 与其他滑块一起：registry 加"外观"条目（`searchKeys` 来自 `popupSettingsSearchIndex.ts` 的 `editInputWidth` 条目）；manifest 已声明 `widthPercent`，value binding 已有（`legacyValueBindings.ts`），只需 `legacyValueWrite` 支持它；删除 `PopupLayoutSettings.tsx:232-247`、`usePopupLayoutSettings.ts` 里 edit input 的调节器和开关，以及 `editInputWidth` section id 和它的徽标条目；备份默认值 `EDIT_INPUT_WIDTH_ENABLED: false` 会被契约测试拦下（§3.7）。

其余待迁功能的要点（来自审计）：Auto-hide / Full hide 两行共用一个 controller；Gems sidebar 的 count 0 不能变成"开"；AI Studio sidebar width 需要新的开关键；Visual effects 需要枚举绑定，且跨站共享一个选择（届时再扩展 value binding 的类型）；Context Sync 是一个包含端口、状态和同步按钮的面板；NanoBanana 两行，沿用 `src/core/utils/watermarkSettings.ts` 的 resolver。

---

## 6. 已定事项与剩余问题

| #   | 问题                                                 | 结论                                                                            |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Gemini 现在 26 行，下一波后约 38 行                  | 分组 + 搜索足够；某组超过约 12 行时再考虑可折叠组                               |
| 2   | 行名用 manifest 名还是旧卡片标签                     | **已定**：一律用 manifest 名；旧标签作搜索词                                    |
| 3   | 选项只在开启时出现，旧 Timeline 卡关闭时显示禁用控件 | 只在开启时出现；收藏历史另有入口                                                |
| 4   | Timeline 卡拆掉后消息时间放哪里                      | **已定**：不临时放 General；Batch 5 排在消息时间运行时迁移之后，那一行只搬一次  |
| 5   | Formula copy 两站共用一个开关                        | 保持共用，面板里写明范围；分站开关是另一个产品决定                              |
| 6   | 快捷键与 Timeline 相关                               | 保持独立卡片：全局生效，也驱动插件站 rail                                       |
| 7   | 插件站 rail 在行旁边另有 Timeline 卡                 | Batch 5 之后跟进，登记同一面板                                                  |
| 8   | 选项展开状态要不要持久化                             | 暂不；滑块在行内，少用的面板默认收起                                            |
| 9   | Visual effects 跨站                                  | 迁移时在每个站点各列一行，绑定同一个键；在那之前保留卡片                        |
| 10  | 降级                                                 | 天然安全：不搬数据，旧版本读同样的键                                            |
| 11  | 备份补默认值改变缺失语义                             | 既有限制；建议在 Batch 3 前单独修                                               |
| 12  | 从页面定位                                           | 只给默认模型失败提示做搜索词交接；Prompt Manager 的"打开设置"指向核心卡，不需要 |
