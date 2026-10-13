# 文件夹，本该如此

为什么整理 AI 对话这么难？
我们解决了。为你的思路打造一套文件系统。

<div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; margin-bottom: 40px;">
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>Gemini™</b></p>
    <img src="/assets/gemini-folders.png" alt="Gemini 文件夹" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>AI Studio</b></p>
    <img src="/assets/aistudio-folders.png" alt="AI Studio 文件夹" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

## 整理的直觉

手感对了，一切就顺了。

- **拖拽**：拿起一个对话，放进文件夹。操作有实感。
- **嵌套层级**：项目下面可以有子项目，文件夹里还能再建文件夹。按你自己的方式组织结构。
- **文件夹间距**：可以把纵向密度从紧凑调到宽松。
  > _注：在 Mac Safari 上，调整可能不会实时生效，刷新页面即可看到效果。_
- **跨设备同步**：在电脑上整理好，再通过 [云同步](/guide/cloud-sync) 在笔记本上看到同样的文件夹。

## 实用技巧

- **多选**：长按对话项进入多选模式，然后一次选中多个对话并整体移动。
- **重命名**：双击任意文件夹即可重命名。
- **图标**：我们会自动识别 Gem 的类型（编程、创意等），并配上对应的图标。你无需任何操作。

## 平台功能差异

### 通用功能

- **基础管理**：拖拽、重命名、多选。
- **智能识别**：自动识别对话类型并分配图标。
- **嵌套层级**：支持文件夹嵌套。
- **云同步**：通过 [云同步](/guide/cloud-sync) 备份并同步你的文件夹结构。

#### 隐藏已归档对话

对话归入文件夹后，就算是"处理完了"，但默认情况下它仍然会占用主列表的位置。在扩展弹窗中打开 **文件夹选项**，开启 **隐藏已归档对话**，主列表就只会显示仍在进行中的对话。这样你的 AI 对话就能真正做到收件箱清零。

- 你第一次把对话归入文件夹时，Voyager 会在文件夹区域弹出一张小卡片，可以一键开启此功能。关闭卡片后，它不会再打扰你。
- 已归档的对话 **永远不会被删除**，仍然可以在对应文件夹中完整访问。
- 在 AI Studio 上，已归档的对话会改为从 Library 表格中隐藏。Gemini 和 AI Studio 各自保留独立的设置。
- 随时可以在弹窗中切换开关。

### Gemini 专属功能

#### 自定义颜色

点击文件夹图标即可自定义颜色。可以从 7 种默认颜色中选择，也可以使用取色器选择任意自定义颜色。

<img src="/assets/folder-color.png" alt="文件夹颜色" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### 账号隔离

人像图标用于临时只显示当前 Google 账号的对话，默认关闭。文件夹选项中的 Hard Isolation 更进一步，会按账号隔离文件夹和云同步数据。开启 Hard Isolation 后，人像筛选已经没有意义，因此会自动隐藏。

<img src="/assets/current-user-only.png" alt="账号隔离" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### AI 自动整理

对话太多，懒得一个个分类？交给 Gemini 来想。

一键复制当前的对话结构，粘贴给 Gemini，它就会生成一份可直接导入的文件夹方案，立即完成整理。

**第一步：复制对话结构**

在扩展弹窗的文件夹区域底部，点击 **AI 整理** 按钮。它会自动收集所有未归类的对话和现有的文件夹结构，生成一段提示词并复制到剪贴板。

<img src="/assets/ai-auto-folder.png" alt="AI 整理按钮" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**第二步：让 Gemini 整理**

将剪贴板内容粘贴到 Gemini 对话中。它会分析你的对话标题，并输出一份 JSON 格式的文件夹方案。

**第三步：导入结果**

点击文件夹面板菜单中的 **导入文件夹**，选择 **或直接粘贴 JSON**，将 Gemini 返回的 JSON 粘贴进去，然后点击 **导入**。

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="导入菜单" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="粘贴 JSON 导入" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **增量合并**：默认使用“与现有文件夹合并”策略，只会添加新的文件夹和归类，不会打乱你已有的整理结果。
- **多语言**：提示词会使用你设置的语言，文件夹名称也会以该语言生成。

#### 文件夹即项目

想让新对话自带一个轻量的项目预设？把任意文件夹变成项目即可。
这个设计参考了 Claude Projects，但 Voyager 采用了更轻量的实现方式：基于文件夹的首条消息指令加自动归档，而不是共享上下文的工作区。

1. 在扩展弹窗中开启 `启用文件夹作为项目`。
2. 右键某个文件夹，选择 `设置指令` 或 `编辑指令`。
3. 打开一个新的 Gemini 对话，在输入框旁的文件夹选择器中选中该文件夹。
4. 发送第一条消息。

接下来会发生：

- 第一次发送后，该对话会自动归入这个文件夹。
- 如果文件夹设置了指令，Voyager 只会在第一次发送时附加这些指令。
- 如果文件夹没有设置指令，它仍然可以作为快速归档的入口。
- 同一文件夹中的对话 **不会** 共享记忆，也不会自动读取彼此的内容。
- 草稿自动保存只会保留你输入的正文，隐藏的指令不会被写回输入框。

### AI Studio 专属功能

- **侧边栏调整**：拖动即可调整侧边栏宽度。
- **Library 集成**：可以直接从 Library 拖拽项目到文件夹中。

### ChatGPT

文件夹也以内置插件的形式提供给 ChatGPT。你可以在 ChatGPT 侧边栏中看到文件夹区域，同时还有同样的悬浮面板。在对话的菜单中选择 **移动到文件夹**，或将对话行拖到文件夹上，即可完成归档。导入、导出和 Activity 视图在这里同样可用。可以在弹窗的 **插件** 区域中开启或关闭该功能。
