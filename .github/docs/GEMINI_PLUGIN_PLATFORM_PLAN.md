# Gemini / AI Studio 插件化架构与迁移报告

日期：2026-10-11。状态：实施中。阶段 1 已实现（分支 `feat/gemini-plugin-platform`），阶段 2 进行中；§5.3 暂按“推荐”列执行，实际取舍与偏差见 §7。

**结论：值得做，但应迁移“功能的运行所有权”，不要同时重写实现、搬迁用户数据和重做全部设置界面。** Gemini、AI Studio 可以成为与 ChatGPT/Claude/DeepSeek 使用同一 PluginHost、同一原语契约的插件平台，同时继续采用静态注入、包内官方插件、零远端插件目录请求。文件夹、导出、云同步、账号与数据存储继续作为核心服务；需要统一开关时，再为其界面加第一方 builtin 外壳。

推荐先做 **Formula Copy → Vim Input → 简单外观功能**。`draftSave`、`quoteReply`、`sendShortcut` 虽已有原语，却不与 Gemini 当前行为等价，不应因“已有 handler”就排进最早一批。时间线已经共用 `TimelineEngine`，最后迁移的重点是保留 Gemini adapter、存储策略与页面级服务，再换启动入口，而不是再写一条时间线。

必须先有三项基础：**每个功能唯一运行者、旧设置键的统一绑定、官方与用户插件调用同一原语时的冲突仲裁**。每批切换保留旧数据格式，以随扩展发版的功能级 owner 表回退。建议首个可用里程碑约 **8–14 工程日**；覆盖主要适合插件化的功能约 **40–67 工程日**，加跨浏览器回归与未知风险余量后按 **50–90 工程日**规划。估算不包含把文件夹/导出/云同步重做为开放原语。

## 分析范围与证据口径

- 分析日期：2026-10-11。仓库：`/Users/jessezhang/Build/gemini-voyager`。分支按任务给定为 main；遵照要求，未执行任何 git 命令确认或变更状态。
- 本次只读源码、规则和设计文档；仅写本报告。未运行测试、构建、浏览器、网络核查，未修改仓库文件。下文验收项目均是未来实现时要做的工作，不是本次已经验证通过的结果。
- 完整路径相对仓库根目录，行号为本次读取位置；叙述中的 `verbs/` 是 `src/features/plugins/verbs/` 的简称，模块内文件简称承接其已给出的目录。“现状”是源码事实；“建议”“拟新增”是目标设计，不代表仓库已有该能力。
- 主要依据：`src/pages/content/index.tsx`、`nativeFeatures.ts`、`featureLifecycle.ts`、`src/features/plugins/README.md`、`.github/docs/PLUGIN_DISTRIBUTION_PLAN.md`、插件 runtime/verbs、popup hooks、设置备份与账号服务。

## 1. 现状盘点

### 1.1 实际上已经有一套共同宿主，差别在策略和启动路径

`index.tsx:516–533` 已在 Gemini、AI Studio 和插件站点启动 PluginHost。Gemini/AI Studio 并非完全绕过插件系统：用户 CSS/可逆 DOM 插件已能运行；自带功能则由另一条 native 启动链运行。

`nativeFeatures.ts:35` 只登记已遵守 `start → stop` 生命周期合同的模块，**不是完整功能清单**。`index.tsx:216–415` 仍直接启动布局、导出、渲染器、文件夹等模块。不能只迁完该注册表便宣称完成。

平台边界也不相同：

| 场景                           | 当前实际行为                                                                                  | 迁移必须保留的含义                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 普通 Gemini                    | 主要 native 功能集中于 `index.tsx:216–355`，图表/用户 LaTeX 于 `367–376`                      | 逐功能接管，不能突然变成默认全关的插件页                                                |
| AI Studio `.com` / `.cn`       | Prompt Manager、AI Studio 文件夹、文件夹间距、公式复制、AI Studio 发送模式                    | 没有 Gemini 的 timeline、draft、quote、图表渲染启动链；新增这些属于功能扩展，应另行决定 |
| Gemini Enterprise              | `index.tsx:201–213` 提前返回，仅保留 composer features 与 Prompt Manager panel 等既有基础能力 | 不因 `gemini` adapter matches 覆盖 Enterprise 就自动启动全部官方插件                    |
| 自定义网站条目覆盖 native host | `index.tsx:194–197` 提前进入 Prompt Manager coverage 路径                                     | 官方迁移功能要继承该抑制规则；不要扩大成禁止所有用户本地插件                            |
| AI Studio 总开关关闭           | native 主分支在 `379–394` 停止；PluginHost 经 `surfaceSwitch.ts` 实时卸载插件                 | Prompt Manager panel 在总开关检查前已经启动。其例外是现状；是否改成真正“全关”需产品决定 |

### 1.2 已有对应原语的功能

G = 普通 Gemini；A = AI Studio。下表“已有”表示代码可复用，并不表示功能已经对等。

| Native 功能                                                  | 平台与现有入口                                                                               | 原语与建议                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 公式复制                                                     | G/A；`src/pages/content/formulaCopyStartup.ts` → `src/features/formulaCopy/nativeFeature.ts` | `verbs/formulaCopy/`。共用 `FormulaCopyService`，最适合首批；保留 enable 和 format 的旧键，并解决 singleton owner                          |
| Vim 输入                                                     | G；`src/pages/content/chatInput/vimMode.ts`                                                  | `verbs/vimInput/` 已直接调用同一 `startInputVimMode`。首批，但需正确的 editable selector，禁止两个插件争用模块级状态                       |
| Ctrl/Cmd+Enter 发送、AI Studio Enter 发送、Safari Enter 修复 | G/A；`src/pages/content/sendBehavior/index.ts`                                               | `verbs/sendShortcut/` 仅覆盖主 composer 的 Ctrl/Cmd+Enter 模式。原生还有反向模式、Safari 修复、编辑框/弹窗覆盖及优先级；统一行为核心后迁移 |
| 草稿自动保存                                                 | G；`src/pages/content/draftSave/index.ts`、`draftStore.ts`                                   | `verbs/draftSave/` 共用存储工具，但 session/key/sanitize 策略不同。需保留 Gemini 完整 pathname 键与 Folder Project 指令清理，延后          |
| 引用回复                                                     | G；`src/pages/content/quoteReply/index.ts`                                                   | `verbs/quoteReply/` 仅 assistant 选区；native 支持 user/assistant，带 rendered quote styling，且与高亮共用工具栏。不能直接替换             |
| 时间线、搜索、星标入口、层级、轨道布局、时间戳               | G；`src/pages/content/timeline/index.ts` → `manager.ts` → `GeminiTimelineAdapter.ts`         | `verbs/turnNavigator/` 已用共享 `TimelineEngine`，但使用 catalog adapter/storage。保留 Gemini policy，只改激活入口；后期完成               |
| 长代码块折叠                                                 | G；`src/pages/content/codeBlockCollapse/index.ts`                                            | `verbs/codeCollapse/` 共用 engine；native 默认展开，原语默认折叠，现契约没有初始折叠设置。需兼容参数/站点策略与 Gemini toolbar anchors     |
| Mermaid                                                      | G；`src/pages/content/mermaid/index.ts`                                                      | `verbs/mermaid/` 共用 renderer，扫描/toolbar/lifecycle 外壳不同；原语目前 `lightExport:false`，不能损失 Gemini 导出图像能力                |
| WaveDrom                                                     | G；`src/pages/content/wavedrom/index.ts`                                                     | `verbs/wavedrom/` 共用 renderer/fullscreen；核验主题、导出、异步卸载                                                                       |
| ECharts                                                      | G；`src/pages/content/echarts/index.ts`                                                      | `verbs/echarts/` 共用 renderer；核验流式重试、resize、主题、导出                                                                           |
| 用户消息 LaTeX                                               | G；`src/pages/content/userLatex/index.ts`                                                    | `verbs/userLatex/` 复用 render/restore；保留 `data-user-latex-original`，导出、时间线和发送跟踪依赖原始文本                                |

这组中的真实优先级是：**Formula Copy、Vim → 用户 LaTeX/代码折叠/图表 → 完整发送逻辑、草稿 → 引用与高亮、时间线**。前三批内仍应逐项验收，不把多个 renderer 的 DOM 改动合成一次大替换。

### 1.3 可抽新原语、可声明式化或适合 builtin 的功能

“builtin”指随扩展打包、以固定第一方 ID 绑定可信 JS 的插件外壳；不等于向用户插件公开任意服务访问。

| Native 功能                  | 入口（均为 `src/pages/content/` 下）                  | 推荐归类与边界                                                                                                          |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 输入框折叠                   | `inputCollapse/index.ts`                              | 可抽 `composerCollapse` 类新原语；先 builtin 亦可。Prompt Manager 依赖展开/光标 API，不能只改 CSS                       |
| 输入历史                     | `promptHistory/index.ts`                              | 可抽 composer history 原语；存储仍由明确的 core policy 管理，保留发送检测和作用域                                       |
| 回答完成通知                 | `responseNotification/index.ts`                       | 首先 builtin；未来可抽通用 completion detector。MAIN-world observer、后台通知权限、Safari native notification 保留 core |
| 聊天宽度                     | `chatWidth/index.ts`                                  | 声明式 appearance 插件候选，沿用启用键和数值语义，避免误扩宽 user bubble                                                |
| 聊天字号                     | `chatFontSize/index.ts`                               | 声明式 appearance 插件候选；独立设置，不强并入一个总开关                                                                |
| 行高                         | `chatLineHeight/index.ts`                             | 声明式 appearance 插件候选                                                                                              |
| 段落间距                     | `chatParagraphSpacing/index.ts`                       | appearance 设置；当前共用 `CHAT_LINE_HEIGHT_ENABLED`，不能无意改变其联动                                                |
| 编辑输入框宽度               | `editInputWidth/index.ts`                             | appearance/builtin；主 composer 与编辑框分开处理                                                                        |
| 侧栏宽度                     | `sidebarWidth/index.ts`                               | builtin 优先；现有拖动、测量/居中逻辑不只是 CSS                                                                         |
| 侧栏自动隐藏/完全隐藏        | `sidebarAutoHide/index.ts`                            | builtin；后续有跨站需求再抽原语，保留 hover intent 与侧栏协作                                                           |
| 输入框光晕隐藏               | `inputHaloHider/index.ts`                             | 小型声明式插件，是首批外观样板；先补完整 stop                                                                           |
| 隐藏原生 Gems                | `gemsHider/index.ts`                                  | Gemini builtin 优先；现有展开/隐藏策略复杂，不能用单个 hide selector 代替                                               |
| Gems 侧栏、固定、最近使用    | `gemsSidebar/index.ts`                                | Gemini builtin；cache、pin、MRU 保持既有持久化与账号/路由行为，停用不清数据                                             |
| 用量状态                     | `usageStatus/index.ts`                                | Gemini builtin；账号缓存与采集流程不是 `counterBadge` 的等价物                                                          |
| 默认模型、收藏模型、自动应用 | `defaultModel/modelLocker.ts`                         | Gemini builtin；auto-apply=false 不意味着模型收藏整个功能关闭                                                           |
| Markdown 渲染修补            | `markdownPatcher/index.ts`                            | Gemini builtin compatibility fix；没有跨站需求时不新造公共原语                                                          |
| 防自动滚动                   | `preventAutoScroll/index.ts`                          | builtin + core MAIN-world bridge；保留与发送设置的协作与初始化次序                                                      |
| 去水印预览/下载              | `watermarkRemover/index.ts`                           | builtin UI/运行控制 + core worker/native/image pipeline；不是用户 JSON 能任意配置的通用原语                             |
| 对话分叉                     | `fork/index.ts`                                       | Gemini builtin；现已有 toggle lifecycle，复用原实现和 export/history/navigation 服务                                    |
| Research Pack                | `researchPack/index.ts`                               | builtin UI；后台存储、跨站传递和账号协议保留 core                                                                       |
| 高亮、批注、时间线刻度       | `highlight/manager.ts`，由 `quoteReply/index.ts` 启动 | builtin actions + core annotation store；先抽唯一 selection toolbar 服务，后续才评估开放 annotation 原语                |
| 雪/雨/樱花视觉效果           | `visualEffects/index.ts`                              | 可选 platform-neutral builtin cosmetic plugin；需拆掉只启动一次的全局状态并提供 stop，不应进入子框架重复绘制            |

以上除视觉效果跨站运行外，主要是 G 功能。AI Studio 不应因为新建 site.json 就继承整张表的默认开启项。

### 1.4 保留 core 的能力及注册表中的基础设施

| 能力                                                     | 入口                                                                                                                 | 为什么保留；允许的外壳                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 文件夹、会话整理、搜索/归档/排序、批量操作               | G：`src/pages/content/folder/index.ts`；A：`folder/aistudio.ts`；逻辑：`src/features/folder/`                        | 数据 schema、迁移、账号、后台同步、导航不做公共原语。可以以后为界面加 builtin，但不重写 repository                                |
| Folder Project                                           | `src/pages/content/folderProject/index.ts`                                                                           | 依赖文件夹、首次发送指令注入/撤销和会话归属；保留为 folder core 的配套能力                                                        |
| 文件夹间距/条目字号/树形表现                             | `folderSpacing/index.ts`、`folderItemFontSize/index.ts`，树形实现随 folder                                           | 可保留 folder 设置或加 appearance 外壳；G/A 间距键独立，不能混用                                                                  |
| 对话导出                                                 | `src/pages/content/export/index.ts`、`src/features/export/`                                                          | 格式、抓取、图片/PDF、安全与浏览器兼容留 core；借鉴 ChatGPT export builtin 包 UI 即可                                             |
| Canvas 导出、Deep Research 导出                          | `canvasExport/index.ts`、`deepResearch/index.ts`                                                                     | 作为 export integrations 保留；iframe、转换、资源链另验，不拆成任意 manifest 指令                                                 |
| IDE Context Sync                                         | `contextSync/index.ts`                                                                                               | 跨进程/外部集成 service 留 core；可单独加 builtin 开关，不开放任意连接能力                                                        |
| Prompt Manager、Prompt Library、slash、提示插入等        | `prompt/promptManagerEngine.ts`、`prompt/resolvePromptSiteAdapter.ts`、`src/features/prompt/`                        | 跨站共享库/备份留 core；panel/composer 可包装 builtin。保留 Gemini 默认 panel、slash 行为与 AI Studio 不启用 slash 的实际能力边界 |
| 云同步、备份与恢复                                       | `src/core/services/GoogleDriveSyncService.ts`、`GoogleDrive*.ts`、`SettingsBackupService.ts`、`DataBackupService.ts` | 不应由一个普通页面插件拥有；继续后台/服务层单一写入者与现有协议                                                                   |
| 账号上下文桥与隔离                                       | `src/pages/content/accountContext/index.ts`、`src/core/services/AccountIsolationService.ts`                          | Saved Library/云同步不能依赖“文件夹插件开着”；独立于可选功能                                                                      |
| Saved Library、星标、时间线层级/高亮存储                 | `src/features/savedLibrary/`、`src/features/timeline/`、`src/pages/content/highlight/`                               | UI 可插件化，持久化、hydration、merge、账号策略不交给用户 manifest                                                                |
| scheme/主题桥与全局品牌色                                | `src/pages/content/platformTheme/scheme.ts`、`platformTheme/index.ts`                                                | 在任何界面挂载前就要生效；主题覆盖许可独立于能否调用原语                                                                          |
| Native health                                            | `src/pages/content/nativeHealth/index.ts`                                                                            | 保留观测基础，逐步并入插件诊断；不要复制每个模块的观察器再“监控”一次                                                              |
| 存储配额提示                                             | `src/pages/content/storageQuotaWarning/index.ts`                                                                     | 用户数据基础设施，非普通插件                                                                                                      |
| 远端公告                                                 | `src/pages/content/remoteAnnouncements/index.ts`                                                                     | 独立产品服务与开关；不与零目录请求承诺混淆                                                                                        |
| Edge 最终版本提示                                        | `src/pages/content/edgeFinalVersionNotice/index.ts`                                                                  | 发布渠道行为，留 shell                                                                                                            |
| Changelog、去水印通知、coachmarks                        | `changelog/index.ts`、`watermarkNativeNotice/index.ts`、`coachmark/`、`postChangelogFlow.ts`                         | 保留 changelog → notice → guides 的协调顺序；feature guide 跟随对应功能可用状态                                                   |
| KaTeX config、content-script handoff、扩展上下文异常处理 | `katexConfig/index.ts`、`contentScriptHandoff.ts`、`index.tsx`                                                       | 属于宿主生命周期，不能随某个公式/渲染插件停用而移除                                                                               |

`NATIVE_FEATURES.chatGptJump` 只在 ChatGPT 有效，`researchPackReceiver` 只在 ChatGPT/Claude 有效，虽登记在 native 表中，**不是 Gemini/AI Studio 待转换的自带功能**。其入口分别为 `chatGptJump/index.ts`、`researchPack/receiver.ts`，继续保留跨站服务边界。

## 2. 目标架构

### 2.1 使用现有 PluginHost，拆开四类政策

推荐结构如下，新增部分均是包内 TypeScript policy，不能被远端或本地 manifest 覆写：

```text
静态 manifest / 已授权站点注册
               │
               v
Page core：scheme、account、route、共享 stores、MAIN-world/background bridges
               │                         ▲
               v                         │ 受限的服务调用
SiteRegistry ← site.json + packaged site behavior/storage policy
               │
官方包内 manifests + local manifests     旧设置绑定 / gvPluginsState
               │                              │
               └──────────► PluginHost ◄───────┘
                              │
                    能力检查 + owner/资源仲裁
                              │
                DeclarativeEngine + PluginScope
                    │                    │
                公开 verbs         固定 ID 的 builtin handlers
                    └──────► 共用 feature 实现

仅允许远端目录的 host → background catalog refresh → cache
Gemini / AI Studio 不进入这条远端链路
```

当前 `nativeSurfaces.ts` / `NATIVE_SITE_IDS` 将至少四项政策捆在一起：静态注入、禁止 native op、禁止插件品牌覆盖、禁止远端目录。目标应明确分开：

| 维度                   | Gemini / AI Studio 目标                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| 功能执行               | 使用共同 PluginHost，按 feature 渐进接管；残留 core/legacy 由独立入口运行 |
| 注入和 host permission | 继续静态声明，沿用现有权限，不重复动态注册                                |
| 远端目录               | 永久保留当前 `false`，除非未来单独改变产品承诺；本次不改变                |
| 品牌色                 | 默认沿用 Voyager/user accent；先继续禁止插件 `theme.brand` 覆盖           |
| 总闸与页面范围         | 保留 AI Studio master、Enterprise、custom coverage、top-frame 等独立条件  |

可拟新增 `src/features/plugins/sites/hostPolicy.ts` 集中包内 host 政策；`nativeSurfaces.ts` 在迁移期作为兼容转发层。不要直接删除 native id 集合后逐处修报错：`siteRegistration`、popup、远端 source、authoring 和 content 分支都在依赖它。

### 2.2 Gemini / AI Studio 的 site.json 应承担什么

拟新增：

- `src/features/plugins/catalog/sites/gemini/site.json`
- `src/features/plugins/catalog/sites/aistudio/site.json`
- 对应 `plugins/<feature>/plugin.json`、必要样式和说明；复杂功能仍可在 `builtin/` 提供可信外壳。

保留 `id: gemini/aistudio`，不要为了“迁移完成”改 site ID。旧 TS adapter 变为 JSON 的薄导出，默认注册表去掉重复注册。`catalog/sites/index.ts` 已有 glob discovery，但构建、CLI disk loader、schema、marketplace 索引和检查都需要一起核对。

现有两站 adapter 只有 `userTurn`、`assistantTurn`、`composer`、`sidebar` 四类 selector，均无 `conversationIdPattern` 与 `turnKeyAttributes`。Gemini 的 composer 还是容器候选，而 `core/services/composer/index.ts:67` 的 `findComposer` 要求匹配实际可编辑元素。新 JSON 不能机械照抄再启用原语，应按消费方合同补充主 editable、composerRoot、sendButton、codeBlock、scrollContainer 等真正需要的锚点。

有两项需要避免过度统一：

1. **普通 semantic 与 Gemini 特殊 turn policy 不同。** `core/gemini/turnSelectors.ts` 保留多个有不同含义/顺序的列表；timeline 取首个匹配项，highlight 依次收集，chat width 又刻意排除部分容器。首期 site.json 成为通用 adapter 的唯一来源，但该特殊 helper 继续服务 native/Gemini behavior adapter，不把所有列表压成一个 `userTurn` 字符串。当前同义的 adapter 字段用对等测试检查；后续确有必要时才设计有序 selector profile 的数据契约，并统一其源，不长期手工维护两套同义表。
2. **URL ID 不是完整账号/存储策略。** `conversationIdPattern` 只提取会话，不允许 manifest 配置任意 storage prefix、账号 ID 或迁移函数。原语需要账号/数据策略时，由经过验证的当前 host/site 选择包内 policy；输入 JSON 只能控制已公开、安全且有界的功能参数。

新增普通 Gemini 的 feature manifests 不应直接复用覆盖 `business.gemini.google` 的宽 matches 来启用全部功能。adapter 可以识别这些页面，官方功能的 eligibility 还必须保留 Enterprise 检测与原启动范围。AI Studio 两个域名使用同一 site adapter，但应保留现有各数据服务的跨域/账号规则，不凭 site ID 相同就合并数据。

### 2.3 同一份实现，替换生命周期外壳

长期关系应为：**官方插件、本地用户插件调用同一原语；原语调用同一共享 feature 实现；Gemini 特有行为由可信 adapter/policy 提供。** 不是每个平台各复制一份 engine，也不是 native 与 plugin 同时开启后靠 DOM class 避免重复。

- Formula Copy、Vim 已经接近此结构，优先更换 enable/生命周期外壳。
- 草稿把 session 与 key/sanitize/account policy 分开，Gemini 继续读写原键；catalog 站点保持现契约。
- 发送逻辑抽出一个共享实现，保留 Gemini、AI Studio、Safari 的模式与覆盖范围。`sendShortcut` 已发布/将发布的默认语义不能被改成另一种行为；用兼容的可选参数，确有破坏性变化则新 handler 名称。
- 图表、LaTeX、代码折叠复用 renderer/engine，统一扫描与 teardown 时保留各平台默认与导出合同。
- `turnNavigator` 在 Gemini 选择 `GeminiTimelineAdapter` / `GeminiTimelineStorage`；其他站点继续 catalog adapter。不允许用户通过参数指定“假装另一个平台”从而访问其存储。
- 引用与高亮先抽唯一的 selection-toolbar owner，Quote 与 Highlight 作为独立 action 注册。只关闭 Quote 时，Highlight 及其工具栏仍能工作。

`builtin` 与 `native op` 是两条已有机制：`pluginNativeRegistration.ts:20–33` 用固定 ID 绑定 ChatGPT export/handoff/folders；`verbs/*` 按 handler 名公开可复用能力。官方 catalog JSON 也能调用 `native` op，但可执行代码始终随扩展发版。此次无需引入 `scripted`、远端 JS 或新的服务框架。

原语契约延续现有演进规则：已发布参数不改类型、不变成必填；新能力/可选参数标 `sinceEngine: 'next'`，相应包内 manifest 声明正确 engine floor，发布时由既有 bump 流程落为具体版本，本地导入使用具体版本。破坏性语义另起 handler；同步 CLI/schema/authoring 和十语种文案，不把旧客户端接收了新参数但静默无效当成兼容。

### 2.4 功能 owner、能力放行与冲突仲裁

拟新增包内迁移表，以 `(site, feature)` 指定 `legacy` 或 `plugin` owner，并列出对应官方 ID、旧设置 binding 和允许的公开 handlers。每个 feature 切换时，两条启动路径读取同一项决定；owner 在本页初始化时固定，跨阶段回退通过扩展版本/新页面生效。

必须满足：

- owner=plugin 时，旧 native starter 不启动；用户把官方插件关掉时，**不能自动启动 legacy 作为 fallback**。
- 不在 async mount 失败后立即偷偷启动 legacy。未确认新 scope 完全退出时自动 fallback 可能产生双实例；应报告失败，必要时下个版本切回 owner。
- 每个转换后的组件提供完整且幂等的 stop；初始 async 读取与用户操作并发时，以最新操作为准；被取消的启动不能重新挂 UI。
- native `featureLifecycle.ts` 只负责 page/toggle，不自动覆盖 account change、route change、sidebar remount。那些 lifetime 必须继续保留。

**开放 local native ops 前，必须解决跨插件重复调用。** 现有 `DeclarativeEngine.active` 只按 plugin ID 去重；不同 ID 调同一 handler 会各自 activate。Formula Copy 的 singleton generation、Vim 的模块级变量都不是多 owner 协议，后者卸载可能影响前者。

推荐第一版采用小型、明确的资源仲裁：

| 能力                                                               | 默认策略                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 公式复制、Vim、发送键、草稿、时间线、Quote action、同一种 renderer | 每个 document/已定义目标范围只允许一个 owner；claims 由包内 handler 元数据推导，manifest 不能虚报以绕开 |
| Quote 与 Highlight 的共享工具栏                                    | 一个服务 owner，两个独立 action/设置；不能为了互斥而让两功能互相禁用                                    |
| 独立 badge 或不同目标的可组合能力                                  | 只有实现已证明安全、目标 ownership 明确时允许多实例；不凭“它看起来很轻”默认放行                         |

推荐冲突 UX：新启用的冲突插件不接管，显示冲突来源；用户先关闭现有官方功能再启用本地替代。恢复/启动时出现多个选择，采用稳定优先级：残留 legacy 占位优先，其次官方，最后本地 ID 排序；不按异步完成顺序抢占。被阻挡插件保留用户 enabled 意愿，显示明确的 blocked/conflict 状态，不谎报 mounted。所有原语请求先预检，复合插件出现冲突时整项不激活，避免一半生效。此处是建议的新能力，当前状态机尚无该状态。

仲裁还需真正等待释放：`PluginScope.dispose()` 返回异步屏障，但 `declarativeEngine.ts:407–423` 的 unmount 当前是 fire-and-forget；不能在其返回后就认定旧 owner 已退出。需新增可等待的释放路径/资源 lease 队列，覆盖切换、移除、设置重启和 scope 中迟到的 startup。

迁移期按站点、handler 能力放行：尚未完成数据/生命周期兼容的 handler 继续禁用；已完成者可被官方和用户调用。不存在 native 对手的新能力也要经过 adapter/安全验收后加入 allowlist。同步修改 import validator、LocalPluginSource 读时检查、真实 host 的 runtime gate、authoring/CLI 公共合同。多站点 manifest 必须对每个目标站都合法，不能以另一个站点支持为由绕过 Gemini 限制。

### 2.5 Popup 设置与默认启用

**首期不搬设置，只换读写入口。** 为迁移后的官方插件建立包内、固定 ID 的 legacy setting binding：popup、PluginHost、状态诊断共用同一份 effective enabled/settings 解析。对应 scalar settings 可以用插件控件呈现，但真实读写仍指向现有 sync key。绑定只能来自可信代码，用户 manifest 不能声明要读写某个旧键。

| 功能/设置                            | 保留的真实来源                                                                     | 映射方式                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formula Copy                         | `gvFormulaCopyEnabled`、`gvFormulaCopyFormat`                                      | 开关读旧 bool；格式保留 latex/unicodemath/no-dollar/notion。当前 primitive 本身不读 `context.settings`，service 监听旧 format key，不能只新增 JSON setting           |
| Vim                                  | `gvInputVimMode`                                                                   | 缺省 false；plugin owner 调共享 runtime，旧 enable listener 不再成为第二个 owner                                                                                     |
| 三种发送行为                         | `gvCtrlEnterSend`、`gvAIStudioEnterSend`、`gvSafariEnterFix`                       | 保留独立开关、平台范围与模式优先级，不压成一个模糊 enabled                                                                                                           |
| 草稿                                 | `gvDraftAutoSave`                                                                  | 缺省 false；开关停行为，保留草稿记录                                                                                                                                 |
| Mermaid / WaveDrom / ECharts / Quote | `gvMermaidEnabled`、`gvWaveDromEnabled`、`gvEchartsEnabled`、`gvQuoteReplyEnabled` | 保留原缺省开启与用户显式 false                                                                                                                                       |
| Timeline                             | 参数继续 `geminiTimeline*`；新增启用状态单独存 `gvPluginsState`                    | 保留完整高级控件；`hide container` 不等于 engine disabled。第 6 阶段明确新增默认 true 的官方插件总开关，让用户能关闭官方 rail 后启用本地替代；不伪称它对应某个旧开关 |
| 聊天外观、文件夹外观                 | `StorageKeys` 中既有 key/enable 与值                                               | 逐项保留数值、单位、联动和 shared scope，不合并独立开关                                                                                                              |
| AI Studio 总闸                       | `gvAIStudioEnabled`                                                                | 缺省 true；优先于每项 plugin enabled，关闭不批量改写子功能选择                                                                                                       |
| 本地用户插件、新增且无旧键功能       | `chrome.storage.local` 的 `gvPluginsState`                                         | 沿用现有 plugin state/后台写入锁；用户导入默认关闭                                                                                                                   |

不要复用 `voyager.formula-copy` 等现有跨 ChatGPT/Claude ID 直接扩大 matches，避免用户在另一站的选择改变 Gemini。建议新建稳定的站点官方 ID；Formula Copy 等旧键原本跨 G/A 共用时，新 ID 初期仍绑定同一个旧键，保持当前语义。以后“各站独立开关”是单独的产品/数据迁移，不是免费获得的重构结果。

**旧 enable binding 只控制对应官方 ID，不是该 handler 的全局禁令。** 本地原语按自身 `gvPluginsState` 决定激活，不能在共享 runtime 里再次读取旧 enable=false 将其关掉，否则“先关官方、再启本地”永远无法完成。共享实现接收已解析的运行参数；旧 enable listener 留在官方兼容外壳。Formula Copy 的格式第一版仍继承旧共享 format，并向用户说明；没有实现独立格式参数前，不在 local setting 中显示假生效的选择。将来若支持本地独立参数，只注入本次运行，不写旧共享键。关闭 Gemini 官方公式也会关闭 AI Studio 官方公式，这是保留旧共享键的实际结果，popup 应说明其影响范围。

对 Timeline 等**原本没有总开关**的功能，新增默认开启的插件 enable 属于 additive 状态，可存标准 plugin map；原有参数仍以旧键为权威。迁移期 legacy wrapper 也读取这个新总开关，使包内 owner 回退保持用户选择。若降级到改造前完全不识别该开关的历史版本，新增加的“关闭整项”选择无法被该版本执行，会恢复它原本的常驻行为；既有参数和数据仍完整。应在回退记录中注明，不能承诺历史版本理解新产品能力。

默认值解析：有旧 enable 的官方功能先尊重旧键中的有效显式值，包括 false；无值才使用该功能当前生产启动路径的默认。原本常驻、迁移时才新增总开关的官方功能则尊重 plugin map 的显式 bool，缺失才默认开启；其他全新功能另定默认，本地导入仍默认关闭。等初始 hydration 完成再决定 default-on 功能是否挂载，防止旧 false 用户短暂看到按钮/监听器。订阅要先于初始读取，或有 revision/touched guard，不能让晚到读取覆盖刚发生的操作。

当前 `pluginDefaults.ts:13` 仅 `voyager.chatgpt-folders` 默认开启，README/注释中“全部 builtin 默认关闭”已经不是完整事实。迁移后的官方默认不能仅靠往此集合添加 ID：那会忽略旧设置。

Popup 推荐保持用户熟悉的分组与高级设置入口，逐项将底层改成插件 binding，并显示来源/状态；在全部需要的区域都有去处之前，不把 Gemini/AI Studio 一刀切到 plugin-only page。颜色 palette、快捷键数组、位置对象等超出当前 plugin setting 的 scalar 形状，保留定制控件，比本次扩建一个完整表单 DSL 更稳。

## 3. 迁移顺序：每阶段可独立发布、可回退

每阶段都在上一阶段稳定树上完成；未完成的后续阶段不影响当前版本可用。表中工作量包含相应代码、回归与集成，不把一次全量重构假装成多次独立发布。

| 阶段                         | 可交付结果与主要文件                                                                                                                                                                                                          | 放行标准                                                                                                                     | 回退                                                                                                | 工程日 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| 1. 拆政策、建立兼容边界      | 新 site.json/薄 adapter；拆 static injection/remote policy/feature eligibility；设置 binding 和 owner 表；补首批 feature 的可重入 lifecycle。主要涉及 `sites/`、`runtime/`、`storage/`、`index.tsx`、popup、catalog publisher | 原 native 功能不变；Gemini/A 零目录请求；所有既有设置/范围保持；adapter 对等测试；不能用通用 userTurn 改写 timeline 特殊顺序 | 保持全 legacy owner；新增基础可留在包内不使用，数据未搬迁                                           | 4–7    |
| 2. 完成第一批真实插件接管    | Formula Copy（G/A）→ Vim（G）→ input halo 小样板；加跨 ID 资源仲裁、可等待释放、blocked 状态；只放开已验收 handler                                                                                                            | 旧开关/格式生效，只有一个实例，反复 enable/disable、页面更新后无孤儿；local 替代能启用，冲突能解释；AI Studio master 正常    | 按 feature 切回 legacy owner，同时关闭该 host 上相应新能力；用户 local enabled/设置保留但报告不可用 | 4–7    |
| 3. 外观与成熟渲染核心        | 聊天宽度/字号/行距、userLatex、codeCollapse，再逐个 Mermaid/WaveDrom/ECharts；无需移动用户业务数据                                                                                                                            | 保留默认展开/显示策略、light/dark、流式行为、原文、导出图像/代码、卸载还原；库按需加载                                       | 单项 owner 回退；保留原设置与公共 renderer                                                          | 5–8    |
| 4. 输入链和草稿              | 共享 send service 的三种模式；inputCollapse、promptHistory；draft 的可信 key/sanitize policy；相应逐项开放原语                                                                                                                | IME/上传/主输入/编辑输入/Safari；首次发送换路由、跨账号、Folder Project；无草稿键迁移且停用不删数据                          | 回旧 lifecycle 即读到原数据；已开放的本地 handler 对旧版本显示能力限制                              | 8–12   |
| 5. Gemini 专属 builtin       | 默认模型、Gems hider/sidebar、usage、markdown patcher、fork、Research Pack；视觉效果如纳入范围一并提供可卸载外壳                                                                                                              | 同一 service、同一数据、scope 关闭无残留；导出/跳转/通知依赖保持；不顺手创造通用原语                                         | 单项回 legacy owner；基础服务与 stores 不停止                                                       | 6–10   |
| 6. 高耦合 UI 与跨 world 能力 | Quote/Highlight 共用 toolbar；timeline 换 owner 且保留 Gemini adapter/storage；拆 page services lifetime；防滚动、完成通知、去水印的 builtin 控制与原有桥接                                                                   | 星标/批注/层级/时间戳/alias 全对等，多账号延迟写不串号；停 timeline 不停其他使用者；Safari 静态 MAIN-world hooks 完整        | 保留旧 wrapper 到观察期结束；回 owner，无逆向业务数据迁移；此批按功能拆发布                         | 10–18  |
| 7. 收口与删除旧启动分支      | 已迁功能全部由插件运行；popup 去掉重复入口；authoring/公共 schema/文档/CLI 一致；仅删除已无生产调用的 wrapper 与纯旧接线测试                                                                                                  | 旧备份/旧设置继续可读；真实行为测试迁随责任；全平台 gates 完成；记录哪些 core 永久保留                                       | 本阶段前保留的 wrapper 给出回退窗口；删除后回退以兼容旧键的前一稳定扩展版本为主                     | 3–5    |

合计约 40–67 工程日。并行可以缩短外观/renderer 与 builtin 的开发时间，但 site policy、settings binding、composer、timeline/storage 不宜多人同时改同一入口。按一名熟悉项目的维护者，加约 25%–35% 风险余量，按 50–90 工程日、约 10–18 个全职开发周估计；商店审核和观察期另算。

**最小有价值范围是完成阶段 1–2。** 到这里 Gemini 已有自己的站点描述、官方功能真实由 PluginHost 接管、用户能用已验收原语，而且无需碰草稿/星标迁移。只允许用户 native ops、仍保留全部同名 native 启动不是可接受的最小版本。

最后迁 timeline 的原因是作用域和关闭语义复杂，不是缺一个通用 UI。`timeline/index.ts:44–46` 当前 stop 会停止 `historyTimestampStore` 和 `keyboardShortcutService`；把它原封不动用作“插件关闭”会影响页面中仍需要这些服务的功能。必须先拆 page service lifetime 与 rail activation lifetime。

每批回退都随包内 owner policy 生效；Gemini 零远端目录请求意味着不能依赖远端 kill switch/选择器热更新来救火。不得为了让新插件生效自动执行 full reload；对需要整页重开的版本变化展示状态即可，正常会话导航保持 SPA。

## 4. 必须守住的约束

### 4.1 用户数据、storage key、备份与降级

首期设定“只迁执行、不迁业务数据”为可验证边界：

| 数据                                                      | 必须保留的合同                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 旧 sync 设置                                              | 原 key、storage area、默认缺失语义、显式 false、枚举值；sync-backed 设置仍被 `SettingsBackupService` 处理                                          |
| Plugin 状态                                               | `gvPluginsState` 继续 local；content 通过后台写请求和现有锁修改，不能整 map 自行 read-modify-write                                                 |
| Gemini 草稿                                               | `gvDraft_<完整 pathname>`、内容/时间戳/path 格式、`stripInstructionBlock`、原有数量清理策略；停用不清草稿                                          |
| 星标与 Library                                            | 保留后台单一写入者、canonical identity、hydration readiness、账号注记与当前读策略；不重新导入已退休页面星标数组                                    |
| Timeline 层级/位置/时间戳                                 | Gemini 继续 `geminiTimeline*`、原账号 scoped hierarchy、legacy localStorage adoption/镜像、history timestamp policy；不改写为 catalog 的 blob/文件 |
| 高亮/批注、folders、Gems、prompts、fork/research transfer | 保留现有 service/store 和序列化，插件停用只移除 UI/监听，不删除记录或 pending 数据操作                                                             |

草稿 catalog 原语用 `gvDraft:<site>:conv:<id>` / `:new`，明确不按账号隔离。给 site.json 加一个剥掉 `/u/N/` 的 regex 不够：会令不同账号的新聊天共用键，也读不到旧草稿。第一版直接注入 Gemini 旧 policy，不做 copy-and-delete。原生草稿按 pathname 区分槽位也不等于强账号身份隔离；继承现状时应明确这一局限，若要升级为 email/account 级隔离必须另做迁移，不在重构中暗改。

旧个性化设置与插件状态有不同云文件：`gemini-voyager-settings.json` 与 `gemini-voyager-plugins.json`。`cloudRestore.ts` 按步骤恢复，跨文件不原子；双主写会使恢复顺序决定最终设置。推荐 binding 层直接以旧 key 为权威，不在新 plugin state 同时保存一份有效开关。未知/旧官方 ID 状态不能反向覆盖 legacy binding；新功能和 local 插件仍走标准 map。

若未来决定 `gvPluginsState` 成为这些功能的权威来源，应另出迁移方案：schema/version 标记、幂等写入、明确各字段优先级、旧备份/新备份/部分恢复失败、两设备新旧扩展混用、降级镜像与保留期。现有 entries 没有逐字段时间戳，不能用“最后更新者胜”一句话掩盖无法判定的问题。

保持本地插件恢复边界：云端可以关闭本地插件，不能把本设备尚未审阅/已关闭的导入版本重新启用（`pluginState.ts` 的 restore clamp）。无论 Gemini 是否开放原语，这条都继续生效。

### 4.2 Zero-request：执行平台统一，不等于分发通道统一

当前强约束来自 `.github/docs/PLUGIN_DISTRIBUTION_PLAN.md` D14：Gemini/AI Studio 不进远端目录。目标保持 **零插件目录请求**，不是“页面不发任何网络请求”；公告、用户云同步、已有集成另有各自规则。

需要保留并补齐四层：

1. **后台硬拒绝**：`hostCatalogRefresh.ts:130–137` 先校验 host，之后才处理 force；手动刷新也不得越过 Gemini/A denylist。
2. **读取和请求方拒绝**：`hostCatalogPolicy.ts:66–82`、`HostCatalogSource.ts:77–81`、PluginHost/popup 继续不请求、不读取这些 host 的 remote cache、不接受 site override/kill switch。旧缓存存在也不参与合并。
3. **发布侧明确排除**：`scripts/lib/buildPluginCatalog.ts:185–219` 当前会为所有 catalog plugins 的 concrete host 生成文件。新增 Gemini/A catalog 目录后，要根据包内 distribution policy 排除远端 host 文件，同时仍校验、打包这些 manifests。仅藏 popup 更新按钮不构成保证。
4. **自动化合同**：页面启动、打开 popup、显式开启官方插件、启用本地插件、force message、缓存事件、AI Studio 开关切换，四个 Google host 均断言 catalog fetch 为零。fake successful cache 不能覆盖 bundled adapter/功能列表。

无需新增 API key、第三方账号或外部服务。Gemini/A 官方插件和 selector 修复随扩展版本交付，是保留承诺的明确代价。在线目录设置在其他平台继续有效；Gemini/A 不展示暗示可在线更新本站功能的操作。

### 4.3 `/u/<index>/`、账号隔离与导航

- 区分 **canonical conversation identity** 与 **真实导航 URL**。`conversationIdentity.ts` 可以归一到 `gemini:conv:id`，并不授权去掉导航中的 `/u/N/`；还须覆盖 `/u/N/gem/<gemId>/<conversationId>`。
- `/u/N` 是可能被不同 email 重用的会话槽，不是永久账号。沿用 `AccountIsolationService` 的 email 优先、路由 fallback、profile map 和 `buildScopedStorageKey`，不以 pluginId/siteId 代替账号。
- account bridge 永远在可选插件之外。route/account 切换时，旧异步读取/草稿恢复/高亮定位必须失效；已经接受的数据写操作保留捕获的源 scope，按既有 owner 排队完成，不能写进新账号。
- Gemini 默认导航先 native in-app link，之后 History API/router events；不能为了插件重挂载调用 `location.assign/href/reload`。
- 时间线 DOM-window 的 `u-N` turn id 不等于全会话历史编号；保留 `GeminiTimelineStorage` 的已验证 aliases。插件化不重解释旧星标/层级。
- 不将所有产品数据都改成“按账号过滤”来追求表面统一：Saved Library 当前 account annotation 与读取策略有自己的合同，按现行为保持。需要更强隔离的改动单列。

### 4.4 Safari / Firefox、资源与权限

依据当前仓库配置，而非历史假设：

- Safari `vite.config.safari.ts:86–88` 标明 15.4 floor；现有动态注册另有版本限制。Gemini/A 继续静态注入，可避免把原本可用的功能挂到新增 optional grant 能力上。
- Safari 的 fetch、usage、history、response completion、prevent-auto-scroll、KaTeX hooks 在 `document_start` 以 MAIN world 静态注入，一 entry 一文件。不能变成插件运行时插 `<script>`，否则初始化时机/CSP 路径都变了。开关控制桥的消费/行为，桥的注入仍归 core。
- Safari native messaging、图片导出/去水印、通知、Drive 现有桥保留，不能添加基于过时认识的整站 skip。
- Firefox 当前 floor 115；optional host permission 流程在旧版本受限。保留 Google host 静态权限，并保留 Mermaid legacy alias 和现有 polyfill/后台路径。
- `AccountIsolationService` 中 Firefox 锁相关后台 fallback 保留，不在原语内再造页面写入者。
- 不新增 `<all_urls>`、远端 JS、`userScripts` 依赖。新增 public 资源通过 build 生成 dist，Safari 顶层资源登记到 Xcode project；不手改 dist。

### 4.5 性能与生命周期

native 入口当前对后台标签页延迟 3–8 秒，重功能按 idle slice 让步；PluginHost 却在更早阶段启动。把默认开启功能直接交给 Host，会绕过原有调度。需要为官方功能保留 equivalent startup scheduling，或提供包内 activation priority/budget；不让所有 renderer、timeline、folders 在恢复几十个标签页时同时初始化。

首期测量并守住以下行为预算，而不是先造全局 observer 框架：

- disabled 的 optional 功能无活跃 DOM observer/定时扫描；必要的 settings subscription 可保留。
- 公式、Vim、发送、草稿等每个资源只有一个 owner；计数监听器/observer 在关→开循环后回到基线。
- Gemini 流式无关 DOM 变化不反复进行 composer layout lookup；保持 draft 现有节流回归。
- timeline 继续合并 scroll/resize/layout 工作，保留 virtualized navigation、异步取消和 rail 手动滚动位置。
- renderer 重库继续 lazy import；不要把 schema/contract 验证引入 DOM 实现依赖。
- body childList 观察、插件数、manifest 解析和 eager registry 对启动开销分别测量；目标相对当前版本无显著退化，性能阈值由实测基线制定，不虚构毫秒承诺。

现有生命周期缺口必须按转换模块补：`preventAutoScroll`、`contextSync` 有缺少 stop 的监听路径，`visualEffects` 有 once 状态，AI Studio folder 的 start 不是可直接拿来当 disposer 的函数。`markdownPatcher` 虽返回 cleanup，入口未使用；DefaultModelManager 有 destroy，但入口仅 init。它们说明需要生命周期工作，不足以断言现有功能日常全部失效。

## 5. 风险、未知点与需要 Jesse 拍板的决定

### 5.1 已有证据的风险，按严重性排序

| 风险                        | 具体触发                                                                                           | 处理                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| P0 数据错域/不可见          | generic draft/timeline policy 接管 Gemini，旧键不读、账号槽丢失、catalog bucket 替代 Gemini bucket | 共享实现但保留 Gemini data policy；业务键零迁移                        |
| P0 双实例或卸载误伤         | 官方默认功能 + local plugin 同时调用 singleton；async stop 未完成即换 owner                        | resource claims、blocked 状态、awaitable teardown，放行前完成          |
| P0 设置丢失/恢复反转        | 旧 false 被默认开启覆盖，sync/local 双写，Drive 两文件恢复顺序互相覆盖                             | old-key authoritative binding，统一 effective resolver，不做无版本双写 |
| P1 零请求承诺破坏           | 删除 native 分类后 host 自动进入远端；publisher 自动产出 Gemini host 文件                          | 将分发策略独立固化，后台/读取/发布/测试四层守卫                        |
| P1 功能暗降级               | Quote 仅 assistant、代码默认折叠、send 丢 Safari/AI Studio 行为、图表失去 export                   | feature parity checklist；差异变产品决策，不伪装纯内部重构             |
| P1 页面范围扩大             | Enterprise/custom coverage/AI Studio 被新默认 manifests 绕过                                       | 继承 feature eligibility；新增支持单独验收                             |
| P1 关闭可选 UI 停掉共享服务 | timeline stop 停 history/keyboard；关闭 folders 失去 account                                       | page core 与 feature scope 分离                                        |
| P1 Safari / Firefox 回归    | 改动态注册、晚注入 MAIN hook、丢 alias/后台 fallback                                               | 保留当前平台 wiring，真实浏览器验证后发布                              |
| P2 启动性能回退             | default-on PluginHost 越过原生延时，重复 observer/扫描                                             | 保留调度，测多标签恢复与长流式对话                                     |
| P2 长期两套真相             | JSON selector、legacy/helper、plugin settings 各自演进                                             | 语义相同者单源；特殊 policy 明确边界，兼容 resolver 统一               |

### 5.2 本次尚不能从只读源码确认的事项

1. Gemini/AI Studio 当前线上 DOM 的完整变体、editable/send/code/scroll anchors，及 Enterprise/custom route 的实际匹配结果；本次不碰浏览器，不能把旧 selector 推断当实测结论。
2. default-on 功能搬入 PluginHost 后的真实主线程/内存开销，尤其多标签恢复、超长会话与 Safari。
3. 现有默认来源有分歧：`SettingsBackupService.ts:97` 的 `HIGHLIGHT_ENABLED=true`，而生产入口 `index.tsx:265–296` 和 popup hydration 以 false 为默认。迁移应保持各已存在用户值和当前生产行为；修复备份默认本身要单独决定并测旧备份。
4. 去水印有旧单键向 preview/download 双键的继承逻辑，缺省又与历史版本不同。不能用一个新 plugin default 覆盖 `watermarkSettings.ts`。
5. “已有同名原语”能否在补 policy 后保持全部行为，不可仅从共享函数名判断。若某项只能通过大量参数模拟 Gemini，优先先用 builtin 外壳，等责任边界稳定再开放原语。

**最脆弱的前提**是：共享 feature core 能在不改变平台行为与数据归属的前提下被另一套生命周期驱动。若某项验证不成立，它继续保留 legacy 或包一层 builtin，不阻塞已完成的其他功能。计划不以一次迁完所有原语为前提。

### 5.3 Jesse 的决策清单（附推荐，报告无需等答案即可成立）

| 决定                               | 推荐                                                          | 选择另一方向的代价                                                               |
| ---------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| “普通插件平台”的完成定义           | 共同运行时/用户原语能力；允许 core 服务与固定 ID builtin 存在 | 若要求所有功能都变用户可编排原语，文件夹/导出/账号权限会把范围扩成另一项平台工程 |
| 首次发布范围                       | 阶段 1–2，Formula Copy/Vim + 小外观样板                       | 首发包含 draft/quote/timeline，反馈更慢、数据风险更集中                          |
| 旧键的寿命                         | 本项目期间长期为官方迁移功能的权威来源                        | 立即转 gvPluginsState 需额外数据迁移、云恢复协议、旧扩展降级设计                 |
| 两站设置是否独立                   | 先保留旧共享语义；站点插件 ID 独立但 binding 可共享           | 两个新值无法无损回写一个旧键，必须接受降级限制或另建产品规则                     |
| 官方与 local 冲突                  | 显式提示，用户关原功能再启用替代；稳定仲裁                    | 自动接管/自动恢复要求记住优先级、临时覆盖与恢复意图，复杂度和意外行为更多        |
| Popup 形态                         | 保留分组和复杂设置控件，统一底层 binding/状态                 | 一次改成纯插件长列表容易隐藏 core 功能与高级参数，增加 UX/i18n 范围              |
| Gemini/A theme.brand               | 暂保留 Voyager/user accent 优先及禁止覆盖                     | 放开要另定全局 accent、多个插件主题优先级和旧设置映射                            |
| AI Studio master 与新功能范围      | 保留 panel 现有例外，先只迁现有能力                           | 真正“全关”或给 A 新增 timeline/draft/quote 属于可见产品变化                      |
| 文件夹/导出 UI 是否也要 builtin 壳 | 作为后续可选范围，不作为核心迁移完成条件                      | 加壳仍要完整 teardown/重启/账号回归；粗估另加 8–15 日，不含重做后端              |

零目录请求、账号和旧数据兼容、正常导航不 full reload 是本任务已明确的约束，不作为待选择的默认放宽项。

### 5.4 与当前项目规则/设计记录的关系

`.github/docs/PLUGIN_DISTRIBUTION_PLAN.md` D14 的零目录请求继续成立；其 P2“Gemini/AI Studio 保持 TS adapter，因为是 native surface”的实现选择会被新 JSON adapter 取代，需要在实施时更新记录并解释“包内数据化”不等于远端分发。README、validator 注释和 authoring 的“所有 native op 禁止”也要同步改为能力政策。

AGENTS.md 要求 native module 在 `nativeFeatures.ts` 注册并返回 stop。尚未迁移的 native/core 模块继续遵守；已迁移者退出该表，改由 PluginScope 管理，不在两边各登记一次。该调整应在架构文档中明确，不把旧规则误读为必须双重启动。

这是明确超过 8 个文件、包含新共享 policy/binding/仲裁责任的重构。应按上述责任拆分文件，遵守现有 1000 行 file-size gate，不往 PluginHost、Popup 或 content index 持续堆分支。

## 6. 实施验收与交接

### 6.1 优先扩展的现有行为测试

| 场景           | 现有证据/测试入口                                                                                                                                                                                               | 新增或迁移的断言                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| owner/生命周期 | `src/pages/content/__tests__/nativeFeatureLifecycle.test.ts`、`src/features/plugins/runtime/PluginHost.test.ts`                                                                                                 | 单 owner、stop 幂等、未结束的 startup、快速 off/on、context invalidation、跨 ID 冲突释放                                                               |
| 零目录请求     | `src/features/plugins/remote/hostCatalogPolicy.test.ts`、同目录 `hostCatalogRefresh.test.ts`、`src/features/plugins/runtime/PluginHost.test.ts`、`src/pages/background/__tests__/pluginRuntimeMessages.test.ts` | 四 host 的 popup/page/force/显式启用/local/native op/缓存事件均无请求，fake cache 也不能覆盖                                                           |
| 注入与总闸     | `src/features/plugins/runtime/siteRegistration.test.ts`、同目录 `PluginHost.surfaceSwitch.test.ts`                                                                                                              | 无双注入、无需重复 grant、A off/on 保留子功能选择；Enterprise/custom coverage 保持                                                                     |
| 设置/恢复      | `src/core/services/__tests__/SettingsBackupService.test.ts`、popup hooks tests、plugin state tests                                                                                                              | 缺失/false/true/无效值、初读迟到、旧/新备份、partial failure、cloud 不启用未经审阅 local；官方 off 后 local 可独立运行；无旧总开关功能的新增状态与回退 |
| 草稿           | `src/pages/content/draftSave/__tests__/draftSave.test.ts`、同目录 `draftStore.test.ts`、`src/features/plugins/verbs/draftSave/draftSave.test.ts`                                                                | `/u/0` 与 `/u/1`、首条发送、导航前 debounce、非空 composer、指令清理、停用不删、原 scope 写入                                                          |
| 发送/输入      | `src/pages/content/sendBehavior/`、`src/pages/content/chatInput/`、对应 verbs tests                                                                                                                             | IME、Shift、Ctrl/Cmd、Safari priority、上传中、edit/modal、Quill 撤销、折叠 composer                                                                   |
| 引用/高亮      | `src/pages/content/quoteReply/__tests__/`、`src/pages/content/highlight/`                                                                                                                                       | Quote off/Highlight on；user+assistant parity、数学原文、单工具栏、键盘/选择范围、账号切换                                                             |
| 时间线/数据    | `src/pages/content/timeline/__tests__/GeminiTimelineStorageAccount.test.ts`、`src/features/timeline/` tests                                                                                                     | hierarchy/alias/星标失败读取、晚写、viewport replacement、account switch、timeline off 后共享服务仍可用                                                |
| 渲染/导出      | `src/features/plugins/verbs/`、原 content renderer 和 export tests                                                                                                                                              | 默认对等、流式完成/失败重试、原文保留、light export、off 后恢复、单 owner                                                                              |

断言观察到的行为和数据不变量，迁移有价值的旧测试；不要通过保留无生产调用的旧实现来满足原接线测试，也不要新写只钉函数名/文件内容的测试。资源注册、禁止远端执行等本来就是静态合同的检查例外。

### 6.2 每批代码最终树的验证与发布门槛

未来实现时，迭代按仓库要求运行 `bun run test:changed`、`bun run typecheck`、`bun run lint:check`；存储/行为改动完成后进行完整测试。最终贡献树执行一次 `lockf -k /tmp/voyager-verify.lock bun run verify:pr`，不并行跑多份全套。当前脚本包括 format/lint/typecheck/i18n/filesize/plugin checks、完整测试、三浏览器构建、CLI 与 docs build。这里列出命令用于交接，**本次未执行**。

还需分开安排真实 Chrome、Firefox、Safari 验收：

- Gemini 普通/新对话/Gem、`/u/N/`、Enterprise；AI Studio `.com/.cn`；既有 custom coverage；至少两个账号与多标签页。
- 旧用户显式关闭、从未设置、新安装、导入旧备份、联网/断网、总闸开关、快速插件启停、local 同原语替代、扩展更新后的旧页面 handoff。
- 光/暗/RTL、键盘、中文 IME、上传附件、流式响应、编辑消息、长会话、侧栏 remount、各种导出结果。
- 单独记录 catalog 网络零请求证据、默认功能启动耗时和观察器数量；Safari MAIN-world/native 路径与 Firefox 兼容路径不能由 jsdom 测试替代。

发布前提供每功能的“旧 owner → 新 owner、设置 binding、允许 handler、行为差异已消除/显式接受、回退版本”记录。先发布小批并保留 wrapper 观察窗口，再删除旧入口；不删除业务 legacy key 或数据服务。这样即使后续阶段停止，已迁部分也仍然是一套能使用、能解释、能回退的插件平台。

## 7. 实施记录

本节随实施更新，记录实际落地的边界、与上文设计的差异和回退方式。

### 7.1 采用的决定

§5.3 全部按“推荐”列执行。实施中另定：

- **冲突语义**：在位者保持资源，新冲突者 blocked；冷启动按“官方优先、同类按 ID 升序”。不做 live 抢占，与 §2.4 一致。
- **全站互斥范围**：只覆盖已证实的 singleton（`formulaCopy`、`vimInput`），其余 handler 维持可组合的现状；不引入“未列出即独占”。
- **legacy 启动路径**：阶段 2 不删除，只经同一个 owner gate 决定是否执行，阶段 7 再收口。§5.4“已迁移者退出 native 表”指收口结果，迁移期以 §3 的回退要求为准。
- **marketplace**：Gemini / AI Studio 官方插件暂不列入 `catalog/marketplace.json` 和文档商店。是否公开展示留给 Jesse 决定；公开前要先为这两站写对的启用说明。
- **AI Studio 总闸**：总闸关闭时官方公式仍获 admission，由 `surfaceSwitch` 决定是否运行，因此之后 off → on 能实时挂载。这是有意的小改进，不算“完全无行为变化”。

### 7.2 阶段 1 落地内容

| 责任           | 文件                                                                                            | 说明                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 包内 host 政策 | `src/features/plugins/sites/hostPolicy.ts`                                                      | 静态注入、远端目录（四个 Google host 永远拒绝）、theme、按 (site, handler) 的 native op 放行、catalog 数据协议；validator、runtime、siteRegistration、远端策略、主题、authoring 共用。`nativeSurfaces.ts` 只做转发 |
| owner 表       | `src/features/plugins/sites/featureOwners.ts`                                                   | 每个 `(site, feature)` 的 owner（`legacy` 或 `plugin`）、官方 ID、handlers、health 策略；native op 放行由该表推导。包内官方 ID 集合固定，不随 owner 变化                                                           |
| 旧设置 binding | `src/features/plugins/storage/legacySettingBindings.ts`                                         | 官方 ID 的 enabled 只读旧 sync 键，忽略 `gvPluginsState[id]`；effective settings 恒为 `{}`                                                                                                                         |
| 启动许可       | `src/features/plugins/runtime/officialAdmission.ts`、`src/pages/content/featureOwnerStartup.ts` | 官方功能只在原 legacy starter 的位置获准，因此继承 Enterprise、custom coverage、后台标签延迟和 idle 让步；初始化结束后关闭，未获准者为 denied                                                                      |
| 站点数据       | `catalog/sites/{gemini,aistudio}/site.json`                                                     | 与原 TS adapter 逐字对等（有对等测试）；`adapters/*.ts` 是薄导出；timeline 等继续读 `core/gemini/turnSelectors.ts` 的有序列表                                                                                      |
| 零请求         | `scripts/lib/buildPluginCatalog.ts`、后台 `sendTimeMessages.ts` / `catalogOutlineMessages.ts`   | 发布侧完整校验后跳过 Google host；Gemini 页不能写 catalog 数据协议                                                                                                                                                 |
| 生命周期       | `src/pages/content/inputHaloHider/index.ts`                                                     | 补齐 stop、disposed/revision guard，登记进 `nativeFeatures.ts`                                                                                                                                                     |

阶段 1 中四个条目的 owner 均为 `legacy`，运行行为与改动前一致。

### 7.3 每功能迁移记录

| 功能           | 站点      | 官方 ID                          | 旧 owner → 新 owner | 设置 binding                                                                             | 放开的 handler | 行为差异                                                    | 回退 |
| -------------- | --------- | -------------------------------- | ------------------- | ---------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- | ---- |
| 公式复制       | Gemini    | `voyager.gemini-formula-copy`    | legacy（阶段 1）    | `gvFormulaCopyEnabled`（`!== false`），格式仍读 `gvFormulaCopyFormat`；与 AI Studio 共享 | 无（阶段 1）   | 无                                                          | —    |
| 公式复制       | AI Studio | `voyager.aistudio-formula-copy`  | legacy（阶段 1）    | 同上（共享键）                                                                           | 无（阶段 1）   | 无                                                          | —    |
| Vim 输入       | Gemini    | `voyager.gemini-vim-input`       | legacy（阶段 1）    | `gvInputVimMode`（`=== true`）                                                           | 无（阶段 1）   | 无                                                          | —    |
| 隐藏输入框光晕 | Gemini    | `voyager.gemini-hide-input-halo` | legacy（阶段 1）    | `gvInputHaloHidden`（`=== true`）                                                        | 无（纯 CSS）   | 新增 teardown；先订阅后初读，修掉晚到初读覆盖实时变化的竞态 | —    |
