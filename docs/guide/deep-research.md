# Deep Research 导出

导出 Deep Research 生成的最终报告，或将其完整的“思考”过程保存为 Markdown 文件。

## 1. 报告导出（PDF / 图片）

Deep Research 生成的报告可以导出为排版精美的 PDF，或者便于分享的单张图片（也支持 Markdown 和 JSON 格式）。打开报告的 **分享和导出** 菜单，选择 **保存报告**。

![报告导出](/assets/deep-research-report-export.png)

## 2. 思考过程导出（Markdown）

除了最终报告，你还可以导出 Deep Research 对话中完整的“思考”内容。

### 功能特点

- **一键导出**：报告的 **分享和导出** 菜单中会出现下载选项。
- **结构化格式**：按原始顺序保留思考阶段、思考条目和研究网站。
- **可读的标题**：章节标题使用英文；如果 Voyager 设置为其他语言，每个标题都会在英文旁边显示该语言。
- **自动命名**：文件名带有时间戳，便于整理（例如 `deep-research-thinking-20240128-153045.md`）。

### 使用方法

1. 在 Gemini™ 上打开一段 Deep Research 对话。
2. 点击报告的 **分享和导出** 按钮。
3. 选择 **下载 Thinking 内容**。
4. Markdown 文件会自动下载。

![Deep Research 思考内容导出](/assets/deepresearch_download_thinking.png)

### 导出文件格式

导出的 Markdown 文件包含：

- **标题**：对话标题。
- **元数据**：导出时间和思考阶段总数。
- **思考阶段**：每个阶段包含：
  - 思考条目（包含标题和内容）
  - 研究网站（包含链接和标题）

#### 示例结构

```markdown
# Deep Research Conversation Title

**Exported At:** 2025-12-28 17:25:35
**Total Phases:** 3

---

## Thinking Phase 1

### Thought Title 1

Thought content...

### Thought Title 2

Thought content...

#### Researched Websites

- [domain.com](https://example.com) - Page Title
- [another.com](https://another.com) - Another Title

---

## Thinking Phase 2

...
```

## 隐私保护

所有提取和格式化操作都 100% 在浏览器本地完成，不会向任何外部服务器发送数据。
