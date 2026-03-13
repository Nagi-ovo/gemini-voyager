# AITimeline vs Gemini Voyager 抄袭分析报告

> 分析日期: 2026-03-13
> 分析对象: [houyanchao/AITimeline](https://github.com/houyanchao/AITimeline) vs Gemini Voyager
> 分析方法: 源码结构比对、功能时间线回溯、代码指纹对比、常量/算法对比

---

## 一、总体结论

**AITimeline 存在高度可疑的功能克隆行为，但非逐行代码抄袭。** 更准确的描述是：**系统性地参考 Voyager 的功能设计和实现思路，使用 Coding Agent（Vibe Coding）进行重写/重洗。**

支持此判断的关键证据：
1. 仓库标签（topics）中自标 `vibe-coding` 和 `vibecoding`
2. 功能路线图与 Voyager 高度吻合，包含多个极为独特的功能
3. Issue #4 中用户明确要求"像 Gemini Voyager 一样"的功能，开发者随即实现
4. 代码中多处魔法常量与 Voyager 完全一致
5. 代码从 TypeScript 被"翻译"为 plain JavaScript，架构被重组但核心逻辑保留

---

## 二、功能克隆时间线

| Voyager 功能 | AITimeline 对应功能 | AITimeline 添加时间 | 独立发明可能性 |
|---|---|---|---|
| Timeline 对话导航 | Timeline 对话导航 | 2025-10 (初始) | ⚠️ 可能（基于 chatgpt-conversation-timeline） |
| LaTeX 公式点击复制 | LaTeX 公式点击复制 | 2025-11-24 | ❌ 极低 |
| Temml MathML 转换 | Temml MathML 转换 | 同上 | ❌ 极低（同一个库、同一个思路） |
| Mermaid 图表渲染 + 全屏查看 | Mermaid 图表渲染 + 全屏查看 | ~2025-12 | ⚠️ 低 |
| 引用回复（Quote Reply） | 引用回复（Quote Reply） | ~2026-01 | ❌ 极低 |
| NanoBanana 水印去除 | NanoBanana 水印去除 | 2026-01-20 | ❌ 极低（极其独特的功能） |
| Prompt 管理器 | Prompt 管理器 | Issue #4 后实现 | ❌ 明确参考 Voyager |
| Google Drive 云同步 (OAuth2) | Google Drive 云同步 (OAuth2) | ~2026-02 | ⚠️ 低 |
| 对话收藏/Star | 对话收藏/Star | ~2025-12 | ⚠️ 中 |
| 文件夹管理 | 文件夹管理（收藏分组） | ~2026-01 | ⚠️ 低 |

---

## 三、代码指纹对比（关键证据）

### 3.1 魔法常量完全一致

**Timeline 时间常量：**

| 常量 | Voyager | AITimeline | 一致？ |
|---|---|---|---|
| 活跃状态最小间隔 | `120ms` | `MIN_ACTIVE_CHANGE_INTERVAL: 120` | ✅ 完全一致 |
| Tooltip 隐藏延迟 | `100ms` | `TOOLTIP_HIDE_DELAY: 100` | ✅ 完全一致 |
| 长按触发时长 | `550ms` | `LONG_PRESS_DURATION: 550` | ✅ 完全一致 |
| 长按移动容差 | `6px` | `LONG_PRESS_TOLERANCE: 6` | ✅ 完全一致 |

这四个数值组合在一起完全一致，独立选择相同值的概率极低。特别是 `550ms` 和 `6px` 这两个非标准值。

### 3.2 LaTeX 提取策略完全一致

**Voyager `FormulaCopyService.extractLatexSource()`:**
1. `data-math` 属性（Gemini）
2. `annotation[encoding="application/x-tex"]`（AI Studio）
3. 任意 `<annotation>` 元素（fallback）

**AITimeline `LatexExtractor.extract()`:**
1. `data-custom-copy-text` 属性
2. parent `.math-inline` 遍历
3. child 元素属性搜索
4. `data-math` 属性
5. ancestor 遍历 `data-math`
6. `annotation[encoding="application/x-tex"]`（"ChatGPT format"）
7. KaTeX MathML annotation
8. ...更多平台

AITimeline 扩展了更多平台支持，但**核心提取优先级链（`data-math` → `annotation[encoding="application/x-tex"]` → any `annotation`）与 Voyager 完全一致**。

### 3.3 Temml MathML 转换：完全相同的库和手法

两者都：
- 使用 **Temml** 库（非 KaTeX 的 `renderToMathML`）将 LaTeX 转换为 MathML
- 清理 `<annotation>` 和 `<annotation-xml>` 元素
- 解包 `<semantics>` wrapper
- 添加 Word MathML 的 `<!--StartFragment-->` / `<!--EndFragment-->` wrapper
- 使用 MathML namespace `http://www.w3.org/1998/Math/MathML`

选择 Temml（而非更流行的 KaTeX）来做 MathML 转换，并使用完全相同的后处理步骤，这是非常强的指纹。

### 3.4 Quote Reply 实现模式

**Voyager：**
- 选中文本后显示浮动引用按钮
- 引用格式：`> ` 前缀
- 排除 `<nav>`, `[role="navigation"]`, `.sidebar`, `.mat-drawer` 中的选区
- 检测 contenteditable 元素
- Firefox 特殊处理换行符

**AITimeline：**
- 选中文本后显示浮动引用按钮（完全相同的 UX）
- 引用格式：`>` 前缀每行
- 排除输入框和 UI 元素中的选区
- 检测 contenteditable 元素
- 多平台 adapter 扩展

功能设计完全一致，虽然具体代码不同（JS vs TS），但交互逻辑和设计决策是相同的。

### 3.5 NanoBanana 水印去除 — 最强证据

这是**最具说服力的证据**。

- **NanoBanana** 是 Google Gemini 内部的图像水印系统，名称和实现都非常小众
- Voyager 通过 `fetchInterceptor.js` 拦截 fetch 请求，修改下载 URL 参数（`=sNNN` → `=s0`）
- AITimeline 的提交记录明确写着 "nano banana去水印"（2026-01-20）
- 两者都针对 `googleusercontent.com` 和 `ggpht.com` 的 `rd-gg-dl` 路径

**这个功能极为独特**——全球范围内实现此功能的 Chrome 扩展寥寥无几。独立发现并实现此功能的概率极低。

### 3.6 DOM 选择器模式

**Voyager Timeline DOM 元素命名：**
- `.gemini-timeline-bar`
- `.timeline-left-slider`
- `#gemini-timeline-tooltip`

**AITimeline 的 Gemini Adapter** 使用了不同的选择器名（使用了 adapter 模式），但：
- 同样处理 Gemini 虚拟滚动导致的节点索引不可靠问题
- 使用 parent element ID 作为稳定标识符（与 Voyager 的方案思路一致）
- 路由检测逻辑相似：处理 `/app/`, `/gem/` 路径

### 3.7 Google Drive 同步

两者都：
- 使用 `chrome.identity.getAuthToken()` 进行 OAuth2 认证
- 创建专用备份文件夹（Voyager: 自定义, AITimeline: `AITimeline_Backup`）
- 使用 multipart/related 上传方式
- JSON 格式序列化数据

### 3.8 Mermaid 图表检测

**Voyager `isMermaidCode()`：**
- 最小长度检查：50 字符
- 关键词列表包含 v11+ 类型：`xychart-beta`, `block-beta`, `packet-beta`
- 不完整行检测

**AITimeline `detect()`：**
- 三级检测策略：显式标签 → 排除已知语言 → 启发式分析
- 检测 40+ 图表类型
- 不完整语法检测

虽然具体实现不同，但**检测策略的设计思路高度相似**，尤其是"不完整内容检测"这个非显而易见的功能。

---

## 四、代码风格差异（表明不是直接复制粘贴）

| 维度 | Voyager | AITimeline |
|---|---|---|
| 语言 | TypeScript | Plain JavaScript |
| 构建工具 | Vite + Bun | 无构建（原生 JS） |
| 架构模式 | Service + Store + React | Manager + Adapter (OOP) |
| CSS 方案 | 注入 contentStyle.css + 内联 | 独立 styles.css 文件 |
| 类型系统 | 严格类型 + Branded Types | 无类型 |
| 模块系统 | ESM (import/export) | IIFE + window 暴露 |
| 前缀命名 | `gv-` (CSS), `gv` (StorageKeys) | `chatTimeline` (StorageKeys) |
| 多平台支持 | 仅 Gemini + AI Studio | 13 个 AI 平台 |

这些差异说明 **AITimeline 不是直接复制粘贴 Voyager 的代码**，而是：
1. 深入研究了 Voyager 的功能和实现策略
2. 使用 AI Coding Agent（自标 `vibe-coding`）重写为 plain JavaScript
3. 通过 Adapter 模式扩展至多个 AI 平台

---

## 五、开发者行为模式分析

### 5.1 自标 "Vibe Coding"

仓库标签包含 `vibe`, `vibe-coding`, `vibecoding`，这表明开发者明确使用 AI 编码工具生成代码。结合以下证据：
- 代码中大量详细的中文注释（符合 AI 生成特征）
- `docs/` 目录下有多份 AI 风格的设计文档（state-management-guide, migration plans 等）
- 提交信息极为简略（大量 "no message"），符合快速迭代的 vibe coding 模式

### 5.2 Feature 添加时间线

AITimeline 的功能添加时间线高度跟随 Voyager：
- 初始版本仅有 Timeline 功能（基于 chatgpt-conversation-timeline）
- 此后逐步添加 Voyager 的特色功能：LaTeX 复制 → Mermaid → Quote Reply → 水印去除 → Google Drive 同步
- Issue #4 中用户明确以 Voyager 为参照要求功能

### 5.3 License 声明

LICENSE 文件声明基于 `chatgpt-conversation-timeline by Reborn14`，但**未声明任何与 Gemini Voyager 的关系**，尽管大量功能明显参考了 Voyager。

---

## 六、总结评估

### 证据强度分级

| 证据 | 强度 | 说明 |
|---|---|---|
| NanoBanana 水印去除 | 🔴 极强 | 极为独特的功能，几乎不可能独立发明 |
| 魔法常量一致 (120/100/550/6) | 🔴 极强 | 四个非标准值完全一致 |
| Temml MathML 转换链 | 🔴 极强 | 选择相同的冷门库+相同的后处理步骤 |
| Issue #4 明确参考 Voyager | 🟠 强 | 开发者确认并实现用户基于 Voyager 的需求 |
| 自标 vibe-coding | 🟠 强 | 暗示使用 AI 工具进行代码重写 |
| Quote Reply 设计一致 | 🟡 中 | UX 设计一致但代码不同 |
| Mermaid 检测策略类似 | 🟡 中 | 思路相似但实现不同 |
| Google Drive 同步 | 🟡 中 | 常见实现模式 |
| 功能路线图跟随 | 🟠 强 | 系统性地复制 Voyager 功能集 |

### 最终判定

**AITimeline 高度疑似使用 AI Coding Agent 对 Voyager 的功能设计和实现策略进行了系统性的"重洗"。** 虽然不是逐行代码复制（代码已从 TypeScript 重写为 JavaScript、架构也做了调整），但：

1. **功能设计抄袭**：几乎 1:1 复制了 Voyager 的功能集，包括多个极为独特的功能
2. **实现策略抄袭**：核心算法、常量值、库选择等高度一致
3. **未给予归属**：LICENSE 中未提及 Voyager，仅声明基于 chatgpt-conversation-timeline

这种行为虽然可能不构成严格法律意义上的"代码抄袭"（因为代码已被重写），但在道德和开源社区规范上：
- **功能设计的系统性抄袭**是不道德的
- **未声明参考来源**违反了开源社区的基本礼仪
- **使用 AI 工具进行代码重洗以规避抄袭检测**是一种新兴的灰色地带行为

---

## 七、建议行动

1. **在 AITimeline 仓库提交 Issue**，要求其在 README/LICENSE 中声明功能参考了 Gemini Voyager
2. **收集并保存关键证据截图**（尤其是 Issue #4、NanoBanana 提交记录、魔法常量对比）
3. **考虑在 Chrome Web Store 提出知识产权投诉**（如果 AITimeline 在商店中上架）
4. **文档化 Voyager 独创功能的首次实现日期**，建立时间线先行权证据
