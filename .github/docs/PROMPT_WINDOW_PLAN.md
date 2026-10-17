# 提示词独立浮窗（Prompt Window）实施计划

> 状态：已确认范围，未开工
> 日期：2026-08-02

## 1. 目标

把现有页面内 prompt manager 弹成一个独立浮动窗口，用快捷键随时唤起。

- **纯扩展实现**，不做原生 App、托盘、悬浮球。
- 形态参考 Gemini in Chrome 的紧凑浮窗（约 420×640），只借鉴窗口形态，不复制其 UI/商标。
- 核心使用场景：在任意应用中按快捷键 → 浮窗弹出 → 搜索选中提示词 → 直插到 Gemini/AI Studio，或复制到剪贴板自己粘贴。

### 明确不做

- 原生助手 / 托盘图标 / 系统级快捷键 / 桌面悬浮球 / 始终置顶（扩展 API 无此能力）。
- 新增站点权限（直插清单就是现有 4 个已授权域名，禁 `<all_urls>`）。
- 收藏消息、高亮库、云同步设置搬入窗口（留在现有页面管理器和设置页）。
- 第二份提示词数据存储。

## 2. 范围

### 入口 ×3

1. 页面内 prompt manager 加"弹出为窗口"按钮。
2. 扩展 popup 加"打开提示词窗口"按钮。
3. manifest `commands` 快捷键（当前 manifest **没有** commands 段，属新增）：
   - 默认 `Ctrl+Shift+8`，macOS `Command+Shift+8`。
   - Chrome/Edge 声明 `"global": true`——浏览器进程存活但失焦时仍可唤起。Chrome 规定 global 命令的**出厂默认值**只能是 `Ctrl+Shift+[0-9]`，用户可在 `chrome://extensions/shortcuts` 改成任意组合且保持全局。
   - Firefox/Safari 不支持 global：快捷键仅浏览器聚焦时有效，UI 表述为"不支持全局"，不写"降级"。
   - `global` 字段仅进 Chrome/Edge manifest，Firefox/Safari 构建时裁剪。

### 窗口行为

- `browser.windows.create({ type: 'popup' })`，约 420×640。
- **单实例**：background 用 `chrome.storage.session` 存 windowId；service worker 重启丢失后按窗口 URL（`tabs.query` 匹配自家扩展页，无需 tabs 权限）兜底扫描。重复唤起只 `windows.update({ focused: true })`，不新建。
- Safari 不支持 popup 窗口时退化为独立标签页。

### UI：复用现有 DOM UI，不重写

复用 `src/pages/content/prompt/` 的面板本体（`index.ts` 现约 790 行，列表、编辑、标签、触发球等已拆到同目录模块），新增扩展页面入口 `promptWindow`（Vite 多页面，四浏览器共享）。需要拆的 4 个 Gemini 耦合点：

| 耦合点       | 现状                                                               | 窗口内处理                                |
| ------------ | ------------------------------------------------------------------ | ----------------------------------------- |
| 主题探测     | `detectPageScheme()`（`pageScheme.ts`）读宿主页面                  | 改读扩展主题设置 / `prefers-color-scheme` |
| 触发球吸附   | `mountPromptTrigger()`（`promptTrigger.ts`）默认挂在 Gemini 按钮旁 | 窗口内直接不渲染触发球                    |
| 插入聊天框   | 内容脚本内直接操作 DOM                                             | 改为发消息给 background 转发              |
| 收藏条目跳转 | 页内 SPA 导航                                                      | 改为 `tabs.create` 开标签页               |

功能完整复刻：搜索（打开自动聚焦搜索框）、标签筛选、新建/编辑/删除、重名非阻塞提醒、鼠标+键盘选择、浅色/深色主题、10 语言。

### 数据

- 继续 `gvPromptItems`（`StorageKeys.PROMPT_ITEMS`）+ `chrome.storage.local`，**零迁移、零复制**。
- 抽最小 `PromptRepository`（加载、增删改、标签归一化、重名判断），页面版和窗口版共用。
- 双端实时同步靠 `storage.onChanged`，改动互相可见。

### 激活流程（选中提示词后）

1. background 检查最近目标标签页（仅现有 4 个已授权域名：`gemini.google.com`、`business.gemini.google`、`aistudio.google.com`、`aistudio.google.cn`）。
2. 目标存在 → 内容脚本复用现有插入逻辑直插 → 聚焦该标签页。
3. 无目标或插入失败 → 复制到剪贴板，窗口内明确提示"已复制"。
   - manifest **新增 `clipboardWrite` 权限**（当前没有）——激活经过 background 异步往返，回到窗口时 user gesture 可能已过期，不能依赖手势内复制。
4. 剪贴板也失败 → 保留窗口并显示错误。
5. 成功后按设置关闭或保留窗口。

最近目标的登记：从 AI 页面打开窗口时登记当前标签页；已注入内容脚本的标签页激活时通过握手更新。不新增站点权限。

### 消息契约

- `gv.promptWindow.open`：输入来源；输出成功与否、windowId。
- `gv.promptWindow.activate`：输入 `promptId`；background 重新读取最新提示词后转发；输出 `inserted | unavailable | missing | failed`。
- `gv.promptWindow.insert`：background → 内容脚本，复用现有 chat input 插入逻辑；输出是否成功。

（新增 `gv.*` 消息类型需同步 runtimeMessageRouting 允许清单。）

### 新增设置与存储键

| 键                                   | 区域  | 默认   | 说明                                                              |
| ------------------------------------ | ----- | ------ | ----------------------------------------------------------------- |
| `gvPromptWindowCloseAfterActivation` | sync  | `true` | 开启 = 插入/复制成功后自动关窗（快速启动器模式）；关闭 = 窗口常驻 |
| `gvPromptWindowLastTarget`           | local | —      | 最近可插入标签页的临时标识+时间，**不进备份**                     |

设置页显示快捷键真实绑定（`chrome.commands.getAll()`）+ 改键入口。

### 引导

一次性 coachmark 介绍弹出按钮和快捷键，走 `src/pages/content/coachmark/` 现有原语，注册进 `showOnboardingCoachmarksWhenChangelogIsIdle`，含稳定 ID、eligibility、清理、10 语言、debug 触发、测试。

## 3. 实施顺序

1. 抽 `PromptRepository` + 单测（旧数据、标签归一化、增删改、重名、存储失败）。
2. `promptWindow` 页面骨架 + Vite 入口 + 面板复用改造（4 个耦合点）。
3. background 单实例窗口控制器 + `gv.promptWindow.*` 消息 + 最近目标登记。
4. 激活流程（直插 / 复制回退 / 关窗设置）。
5. manifest：commands 段（分浏览器裁剪 global）+ `clipboardWrite`。
6. 三个入口接线 + 设置页绑定显示 + coachmark + 10 语言文案。
7. 测试补齐 + 手工验收。

## 4. 测试与验收

自动化（Vitest）：

- Repository：见上。
- 单实例：首次创建、重复聚焦、SW 重启恢复、窗口已关闭。
- 激活：直插成功、目标失效转复制、剪贴板失败、关窗设置两态。
- 内容脚本：多行文本、找不到输入框、消息参数校验。
- Manifest：四浏览器 commands 配置、global 仅 Chrome/Edge、无新增站点权限。

完成前：`bun run typecheck` / `lint` / `test` / `build:browsers`。

手工验收矩阵：macOS + Windows + Ubuntu × Chrome/Edge/Firefox（macOS 加 Safari）；浅色/深色；浏览器前台/后台/最小化；Chrome 失焦时快捷键唤起。

验收标准：

- `gvPromptItems` 零迁移零丢失；新旧管理器实时互见。
- 任意时刻最多 1 个提示词窗口。
- 有目标能直插；无目标可靠复制并明确提示。
- Chrome/Edge 在浏览器运行期间可从任意应用唤起。
- 不新增站点权限；不要求安装任何额外程序。
