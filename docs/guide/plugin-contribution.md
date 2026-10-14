# 插件贡献指南

Voyager 的插件系统围绕声明式插件设计：在 `plugin.json` 中描述插件元数据和 DOM 操作，在 CSS 中描述视觉变化。插件不运行远程 JavaScript，而是由 Voyager 内置的插件引擎解释这些清单和样式。

这样做便于审查和维护。如果你想贡献插件，请先从这里开始。

## 只给自己用：本地插件

如果一个插件只需要在你自己的浏览器里使用，就不必走这套流程。把它做成本地插件，然后在弹窗中导入即可：无需提交 Issue，无需提交 PR，也无需检出仓库。[编写自己的插件](./write-a-plugin.md) 介绍了三种制作方式，包括 `create-voyager-plugin` 检查工具，以及供编程 Agent 使用的 skill。

## 推荐流程

1. 先确认这个想法适合做成插件。阅读宽度、排版修复、主题微调、隐藏或标记页面元素，以及简单的站点适配，通常都是合适的候选。
2. 先在 Voyager 仓库中提交 Issue，说明要解决的问题、目标网站，以及与现有插件的区别；等维护者明确同意方案后，再开始编码并提交 PR。
3. 使用 `plugin.json` 填写元数据、站点匹配规则、设置项和贡献内容。
4. 将样式放在同一插件目录下的 `style.css` 中，并通过 `contributes.styles` 引用它。
5. 在本地测试，并在 PR 中附上测试页面、截图或简短录屏。维护者会决定它是否符合进入官方目录的条件。

## 目录结构

官方内置插件位于 `src/features/plugins/catalog/` 下，每个插件平台对应一个目录：

```
src/features/plugins/catalog/
  marketplace.json                        文档站插件市场读取的索引
  sites/<site>/site.json                  站点适配器（以数据形式描述）
  sites/<site>/plugins/<id>/plugin.json   一个声明式插件
  sites/<site>/plugins/<id>/style.css     它的样式
  sites/<site>/plugins/<id>/README.md     它修复了什么，以及为什么这样修
```

插件发现是自动完成的：`catalog/sites/index.ts` 通过 `import.meta.glob` 找出每一个 `site.json` 和 `plugin.json`，因此新增站点或插件只需要新增文件，无需维护任何映射表。

`marketplace.json` 并不是映射表，它只是文档站插件市场读取的索引。测试会确保它与自动发现的结果保持一致，因此新插件还需要在其中添加一条记录。其 `source` 字段填写相对于 catalog 的路径，例如 `sites/deepseek/plugins/reading-width/plugin.json`。位于 `sites/gemini/` 和 `sites/aistudio/` 下的插件是例外：它们随 Voyager 一起打包，不会出现在 `marketplace.json` 中。

插件的 `matches` 必须落在所属站点的 `matches` 范围之内；超出范围的插件会导致构建失败。

## 语义选择器键

`site.json` 将一组固定的语义键映射为站点自己的 CSS 选择器。这套词表定义在 `src/features/plugins/sites/semanticKeys.ts` 中；`site.json` 只能使用表中的键，使用表外的键会被拒绝。

- `userTurn`：用户消息容器。
- `assistantTurn`：助手消息容器。
- `thinkingBlock`：助手回复中的思考段落。
- `codeBlock`：渲染后的代码块。
- `composer`：用户输入的提示框。
- `sidebar`：对话列表或导航栏。
- `sidePanel`：次级面板，例如 Artifacts 或 Canvas。
- `headerActions`：对话页面右上角的操作区域。
- `scrollContainer`：负责滚动对话内容的元素。
- `composerRoot`：提示框及其操作按钮所在的容器。
- `sendButton`：发送按钮；有些站点只在输入框有内容时才显示它。

站点只需声明它实际能提供的键。插件通过 `{ "kind": "semantic", "key": "userTurn" }` 作为 DOM 操作的 `target` 引用语义键，而不是直接写死选择器。这样，站点改版时只需修改 `site.json` 一个文件。

`conversationIdPattern` 是 `site.json` 中与选择器分开的另一个字段：它是一个针对 URL 路径的正则表达式，第一个捕获组即为对话 ID，例如 `^/chat/([^/?#]+)`。

## 新增平台

新增一个聊天网站分为两个相互独立的层次：

1. **站点适配器**，即 `catalog/sites/<site>/site.json`，它告诉 Voyager 如何识别该网站，并找到用户消息、助手消息、输入框、侧边栏和主题标记。
2. **插件**，位于 `catalog/sites/<site>/plugins/<id>/` 下，用于解决该网站上某个面向用户的具体问题，例如阅读宽度或渲染修复。

`site.json` 包含 `id`（与目录名相同）、`label`、`matches`、`selectors`、`theme`、`brandColor`、`capabilities`，以及可选的 `conversationIdPattern` 和 `turnKeyAttributes`。`turnKeyAttributes` 指定在页面重新渲染用户消息时，用于保持其身份的属性。发送追踪（用于文件夹的 Activity 和时间线时间戳）只会在设置了该字段、`composer`、`userTurn` 和 `conversationIdPattern` 的站点上运行。`src/features/plugins/sites/siteAdapterData.ts` 中的 `validateSiteAdapterData` 负责校验它；`bun run catalog:build` 会在发布前校验每个站点和插件。

每个插件平台都是数据。目前的站点有 ChatGPT、Claude 和 DeepSeek。Gemini 和 AI Studio 是 Voyager 的原生界面，同样有各自的 `site.json`（`catalog/sites/gemini/` 和 `catalog/sites/aistudio/`），但它随扩展打包，不会发布到远程目录。`sites/adapters/` 下的 `gemini.ts`、`aistudio.ts`、`claude.ts`、`chatgpt.ts` 和 `deepseek.ts` 现在都只是 `site.json` 的单行包装，要修改就改 JSON，不要改 TypeScript。

已发布的分站点目录同样包含站点数据，因此 `site.json` 中的选择器修复无需发布扩展版本即可送达用户。全新的站点仍然需要扩展本身的支持，因为它还需要随包提供的主机权限和 content script 注册。

对于 DeepSeek 这样的新平台，请让适配器工作专注于平台契约本身。将 `site.json`、必要的选择器测试，以及解释该支持所需的最少文档，放在同一个完整的变更中。站点注册表会直接从文件中识别新适配器，因此无需编辑任何注册列表。不要为每个插件都新增一个站点。

适配器通过审核后，后续插件可以作为独立的、聚焦的变更单独提交。如果多个变更彼此依赖，可以使用堆叠 PR 链：每个后续分支基于前一个分支，每个 PR 只展示自己增量的功能。整条链仍应遵循同样的范围原则：每个 PR 只对应一个明确的用户目标，并附带必要的测试和清理。

站点支持不需要模型 API 集成。不要为新平台添加静态 content script 或必需的主机权限；对于仅插件的站点，请使用现有的可选权限与动态注册流程。

可选权限与动态注册路径依赖于浏览器版本：Chrome 和 Edge 支持扩展所使用的流程；Firefox 需要 128 或更高版本才能使用可选主机权限；Safari 需要 16.4 或更高版本才能进行动态 content script 注册。在较旧的受支持浏览器版本上，弹窗可能会正确地拒绝为自定义站点启用插件，因为所需的 API 无法提供持久授权。不要通过添加宽泛的静态主机权限来绕过此限制，除非得到维护者的批准。

## 插件粒度

插件应该以它要解决的用户问题为边界，而不是机械地按平台拆分。

官方目录中的插件属于单个站点文件夹，它的每个 `matches` 都必须落在该文件夹 `site.json` 的范围内（否则 `bun run plugin:check` 会失败），因此一个插件无法同时覆盖 Claude 和 ChatGPT。如果同一功能适用于多个平台，例如阅读宽度、页面导航或代码块排版，应在每个站点文件夹中各提供一个插件（例如 `sites/claude/plugins/reading-width` 和 `sites/chatgpt/plugins/reading-width`），并保持它们的名称、设置和说明一致。

如果各个平台需要截然不同的设置、DOM 逻辑或面向用户的文案，拆分成多个插件会更清晰。不要为了让一个插件“覆盖一切”而把无关的行为硬塞在一起；一个插件最好只解决一个明确的问题。

简单判断标准：

- 用户目标相同、设置相同，只是站点选择器不同：每个站点文件夹各提供一个插件，名称和设置保持一致。
- 主题相同，但各平台的行为差异很大：可以拆分，但名称和说明要保持关联。
- 功能目标不同：不要合并。

## 避免重复插件

提交前，请先查看插件市场和现有的官方插件。如果已经有一个好用的插件，优先为它提交改进，而不是再做一个类似的插件。

重复插件只有在有明显改进时才值得接受，例如：

- 支持了原插件未覆盖的重要平台。
- 修复了原插件无法解决的兼容性问题。
- 在性能、可访问性或可维护性方面明显更优。
- 提供了不同且有意义的用户体验，而不只是换个名字或稍微改了样式。

这样可以保持插件市场整洁，也便于用户做出选择。

## 最小示例

建议从脚手架开始，而不是从空目录开始：运行 `bun run plugin:new <id-segment> --site <site>`，会生成 `catalog/sites/<site>/plugins/<id-segment>/`，其中包含 `plugin.json`、`style.css` 和 `README.md`，并自动在 `marketplace.json` 中追加对应条目。生成的内容只是一个起点，并不代表已通过审核。你需要填写的清单结构如下：

```json
{
  "$schema": "https://voyager.nagi.fun/plugin.schema.json",
  "id": "your-name.example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "A short description of what this plugin improves.",
  "author": "your-name",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://claude.ai/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "domOps": [
      {
        "op": "addClass",
        "target": "body",
        "className": "gv-plugin-example"
      }
    ]
  }
}
```

`$schema` 这一行是可选的，仅供编辑器使用：它指向清单的 JSON Schema，使编辑器在你输入时进行校验并提供补全。`site.json` 也有自己的 Schema，地址为 `https://voyager.nagi.fun/site.schema.json`。

`style.css` 可以使用普通 CSS，但插件样式应当限定在你自己的 `gv-plugin-*` 类之下：

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## Manifest 注意事项

- `id` 请使用反向域名或作者前缀，例如 `your-name.reading-width`，以避免冲突。
- `matches` 尽量收窄，只匹配插件真正需要运行的网站。
- 只有当所属站点的 `site.json` 覆盖了全部主机时，`matches` 才能列出多个主机（例如 chatgpt.com 和 chat.openai.com）；如需支持其他站点，请在该站点的文件夹中添加插件。
- 推荐的 `category` 取值：`render-fix`、`theme`、`layout`、`readability`、`productivity`、`integration` 或 `other`。
- 将 `engine` 设为所需的插件引擎版本。可以参考官方插件作为示例。
- 尽可能为中文、英文及其他常用语言添加 `i18n`。

## CSS 与资源限制

声明式插件会被当作不可信输入进行校验，因此请保持资源自包含：

- 不要使用 `@import`。
- 不要引用外部图片、外部字体或远程 CSS。
- 可以使用普通 CSS、自定义属性以及 Voyager 的设置值替换。
- 插件类名请使用 `gv-plugin-` 前缀，以避免样式泄漏到宿主网站或 Voyager 自身。

如果插件需要设置项，建议优先使用数值型设置。例如，阅读宽度类插件可以把设置值写入 CSS 变量，再由样式读取使用。

## DOM 操作的边界

声明式插件目前支持以下操作：

- `addClass`：为目标元素添加类名。
- `setAttribute`：设置属性。
- `setStyle`：设置内联样式或 CSS 变量。值以 `!important` 结尾时会以该优先级应用；旧版本的 Voyager 会丢弃这样的值，因此如果插件依赖它，请将 `engine` 设为 `>=1.9.0`。`margin` 之类的简写属性按各自的长属性分别记录，因此关闭某个插件时，不会清除另一个插件设置的 `margin-top`。
- `hide`：隐藏目标元素。

目标可以是 CSS 选择器，也可以是上文列出的语义键，写法为 `{ "kind": "semantic", "key": "userTurn" }`。语义键通常更稳定，但要求当前站点适配器已声明该键。

声明式操作必须可以撤销，并且可以安全地重复执行。不要依赖一次性的页面状态，也不要假设页面 DOM 永远不会变化。

### 原语

有些行为无法仅用 CSS 和可撤销的 DOM 修改来描述。**原语**是随 Voyager 一起打包的第一方代码，清单可以通过 `native` 操作按名称调用它：

```json
{
  "engine": ">=1.3.0",
  "requires": { "handlers": ["formulaCopy"] },
  "contributes": {
    "domOps": [{ "op": "native", "handler": "formulaCopy", "params": {} }]
  }
}
```

清单只负责选择一个原语并为其配置参数，不提供任何逻辑。`params` 会先由该原语校验，然后才会执行。

使用原语的插件需要遵守两条规则：

- 插件匹配的每个站点都必须声明该原语所读取的语义键（例如 `mermaid` 会读取 `assistantTurn` 和 `codeBlock`）。`requires.handlers` 可以省略：`native` 操作本身已经隐含了它所使用的原语。
- `engine` 至少要写成首次提供该原语的引擎版本。`formulaCopy` 从引擎 1.3.0 开始提供，因此使用它的插件应写 `">=1.3.0"`。如果写得更低，`bun run catalog:build` 会失败，因为旧版 Voyager 会报告缺少 handler，而不是提示用户升级。

原语只增不改：新增参数必须是可选的，破坏性变更则使用新名称。

对于会改变行为的插件，还可以添加一行 `changelog`，弹窗会将它显示在版本号旁边。译文放在 `i18n.<locale>.changelog` 下，与 `name` 和 `description` 并列。

## 不适合做成普通插件的情况

如果某项功能必须执行 JavaScript、拦截网络请求、读写 Voyager 的内部数据，或依赖复杂的运行时逻辑，它就不适合作为普通的声明式插件提交。

请先提交 Issue 描述需求。如果确实需要内置能力，我们可能会考虑将其实现为 Voyager 主仓库中的 builtin/native 插件，就像 Formula Copy 那样。

## 提交 PR 之前

运行 `bun run plugin:check <插件目录>`，并把输出粘贴到 PR 中。它会一次性列出所有问题，涵盖清单和 CSS、站点范围（`matches` 是否越界）、原语、语义键、十种语言的译文以及 README。CI 也会对每个内置插件运行同样的检查。

- 插件默认关闭，需要用户自行启用。
- 已确认没有功能几乎相同的现有插件；如果有，应优先改进现有插件。
- 已在目标网站上测试过浅色和深色两种主题。
- `matches` 没有覆盖无关的网站。
- 没有引用远程资源。
- 插件目录包含 `plugin.json`、所需的 CSS 文件以及简短的 README。
- 对于官方插件，目录位于 `catalog/sites/<site>/plugins/<id>/` 下，`matches` 落在站点的 `matches` 范围内，并且 `catalog/marketplace.json` 中已有对应条目（Gemini 和 AI Studio 插件随 Voyager 一起发布，不需要此条目）。
- PR 描述中写明测试页面、截图或录屏，以及可能受影响的页面区域。

保持简单、聚焦、可撤销。一个只解决一个明确问题的插件，通常更容易被合并和维护。
