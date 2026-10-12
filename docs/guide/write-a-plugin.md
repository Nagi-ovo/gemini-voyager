# 编写自己的插件

本地插件是你给自己做的插件：它改变 Gemini、AI Studio、ChatGPT、Claude 或 DeepSeek 的外观和布局，只存在于你的浏览器里，不需要提 PR，也不需要 Voyager 的源码。

和所有 Voyager 插件一样，它是声明式的：一个 `plugin.json` 清单加上 CSS，本身不运行任何代码。Voyager 在导入时检查它、应用它的改动，关掉时撤销全部改动。导入的插件默认是关闭的，你可以先看一遍再打开。

## 三种做法

### 用一句话描述，交给任意 AI 来写

1. 打开想要改造的网站，打开 Voyager popup，找到「本地插件」卡片（在 Gemini 和 AI Studio 上，它是设置里的最后一项）。
2. 选择「用一句话改造界面」，写一句话（例如「把我的消息变窄，并隐藏侧边栏」），再选择「生成提示词」。
3. 自己把提示词复制到任意 AI 对话里，再把它的完整回复粘贴回来，选择「检查回复」。
4. Voyager 会用大白话说明这个插件改了什么。导入后，在插件列表里打开它。

Voyager 不会把提示词发到任何地方：用哪个 AI 由你决定，文字也由你来回搬运。

### 交给编程 Agent

如果你在用编程 Agent（Claude Code、Codex、Cursor 等），把 Voyager 的插件 skill 给它：

```text
https://voyager.nagi.fun/skills/write-voyager-plugin/SKILL.md
```

在「本地插件」卡片里打开「用一句话改造界面」，就能看到「复制 skill 链接」按钮。这个 skill 包含完整的约定：清单字段、每个网站声明了什么、可用的原语，以及插件做不到的事。告诉 Agent 你想要的改动，它会生成目录、写好 `plugin.json` 和 `style.css`，并离线检查。之后在 popup 里选择「导入文件」，选中这两个文件即可。

想让 Agent 一直带着这个 skill，可以把文件保存为 Agent skills 目录下的 `write-voyager-plugin/SKILL.md`（Claude Code 是 `~/.claude/skills/`）。

### 自己动手写

需要 Node.js 18 或更新版本：

```sh
npx create-voyager-plugin@latest init my-plugin --site claude
# 编辑 my-plugin/plugin.json 和 my-plugin/style.css
npx create-voyager-plugin@latest check my-plugin
```

`init` 会写出一个已经能通过检查的 `plugin.json` 和 `style.css`，外加一份写有该网站规则的 `AGENTS.md`。`--site` 可选 `gemini`、`aistudio`、`chatgpt`、`claude` 或 `deepseek`。

`check` 离线运行和 popup 导入完全相同的检查。插件能导入时退出码为 0，否则每个问题输出一行 `path: message`。加 `--json` 可得到机器可读的输出。

## 插件能做什么

- 添加 CSS，作用域限定在插件给页面加上的 `gv-` 类名下。
- 添加类名、设置安全的属性或内联样式、隐藏元素。目标可以是网站声明的语义锚点（`userTurn`、`assistantTurn`、`composer` 等），也可以是 CSS 选择器。
- 在 popup 里提供设置：开关、滑块和下拉框，设置值通过 `{{key}}` 写进 CSS。
- 在 ChatGPT、Claude 和 DeepSeek 上，启用 Voyager 的原语（公式复制、时间轴、Mermaid 图表等），并给 Voyager 自己的界面换色。

## 插件做不到什么

插件不能运行 JavaScript，不能响应点击或按键，不能从网络加载任何东西（字体、图片、样式表），不能读取或改写消息内容，也不能在其他网站上运行。如果需求涉及这些，写作材料会让 AI 直接说明，并做出最接近、能实现的版本。

## 导入时检查的规则

除了通用的清单检查（见[插件贡献说明](./plugin-contribution.md)），本地插件还必须：

- 只匹配 Voyager 支持的网站范围内的 URL；
- 只使用每个匹配网站都声明了的语义锚点；
- 每个 `addClass` 只加一个类名，并以 `gv-` 开头；
- 只使用 boolean、number 或 select 设置（string 和 color 目前在 popup 里还没有对应控件）；
- 在 Gemini 和 AI Studio 上不使用 `theme`；原语只能用该站点放开的：Gemini 上是 `formulaCopy`、`vimInput`、`userLatex`、`codeCollapse`、`mermaid`、`wavedrom` 和 `echarts`, `sendShortcut`, `draftSave`，AI Studio 上是 `formulaCopy`、`sendShortcut`。它们与 Voyager 自带的对应设置是同一套代码。`formulaCopy` 和 `vimInput`（「公式复制」「输入框 Vim 模式」）在同一页面上，自带设置和插件只运行其中一个：页面刚加载、或两者都没在运行时，自带开关优先；之后谁已经在运行就继续运行，另一方显示为暂停。关掉其中一个，功能就交给另一个。其余几个按元素逐个认领，可以和自带设置同时运行：对方已经处理的行或代码块留给对方。

翻译（`i18n`）是可选的。

## 分享

本地插件只存在于你的浏览器里；需要换到别处时，在插件列表里导出它的 JSON。如果它对大家都有用，可以提议收进官方插件目录，流程见[插件贡献说明](./plugin-contribution.md)。

发送快捷键插件每页只能运行一个；后启用的会显示冲突。可选 `mode`（sinceEngine `next`）为 `ctrlEnterSends`（默认）或 `enterSends`。输入法确认键不会触发发送。Gemini/AI Studio 要等对应功能迁移后才开放。

Gemini 现在允许 `sendShortcut` 替代官方 Ctrl+Enter 发送；关闭官方开关后启用本地插件。只支持 `ctrlEnterSends`，Enterprise 不运行。公开的 `composerRoot` 区分主框和编辑框，`sendButton` 不包含停止按钮。

AI Studio 上使用 `sendShortcut` 时必须设置 `params.mode: "enterSends"`。关闭官方 Enter 发送开关后，本地插件可以接管；Ctrl/Cmd+Enter 换行，Shift/Alt+Enter 由宿主处理。

Gemini 的 `draftSave` 与官方草稿保存共用 `gvDraft_<完整 pathname>`，保留 `/u/N` 和 Gem 路径。关闭插件会保留已保存的草稿；同页多个插件可以共同使用这些记录。卸载前会尽力保存最后输入，浏览器关闭时不能保证异步存储完成。
