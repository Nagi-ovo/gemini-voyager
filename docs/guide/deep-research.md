# Deep Research 导出

导出 Deep Research 生成的最终报告，或将其完整的“思考”过程保存为 Markdown 文件。

## 1. 报告导出 (PDF / 图片)

Deep Research 生成的报告支持导出为格式精美的 PDF 或方便分享的单张图片（同时也支持导出为 Markdown 和 JSON 格式）。

![报告导出](/assets/deep-research-report-export.png)

## 2. 思考过程导出 (Markdown)

除了最终报告，您还可以将对话中的完整“思考”内容一键导出。

### 功能特性

- **一键导出**: 点击分享和导出按钮即可下载
- **结构化格式**: 按原始顺序保留思考阶段、思考条目和研究网站
- **双语标题**: Markdown 文件包含英文和当前语言的双语章节标题
- **自动命名**: 文件使用时间戳命名,便于整理 (例如:`deep-research-thinking-20240128-153045.md`)

### 使用方法

1. 在 Gemini 上打开一个 Deep Research 对话
2. 点击对话的**分享和导出**按钮
3. 选择 "下载 Thinking 内容" (Download thinking content)
4. Markdown 文件将自动下载

![Deep Research 思考内容导出](/assets/deepresearch_download_thinking.png)

### 导出文件格式

导出的 Markdown 文件包含:

- **标题**: 对话标题
- **元数据**: 导出时间和思考阶段总数
- **思考阶段**: 每个阶段包含:
  - 思考条目 (包含标题和内容)
  - 研究网站 (包含链接和标题)

#### 示例结构

```markdown
# Deep Research 对话标题

**导出时间 / Exported At:** 2025-12-28 17:25:35
**总思考阶段 / Total Phases:** 3

---

## 思考阶段 1 / Thinking Phase 1

### 思考标题 1

思考内容...

### 思考标题 2

思考内容...

#### 研究网站 / Researched Websites

- [domain.com](https://example.com) - 页面标题
- [another.com](https://another.com) - 另一个标题

---

## 思考阶段 2 / Thinking Phase 2

...
```

## 隐私保护

所有提取和格式化操作都 100% 在浏览器本地完成。不会向外部服务器发送任何数据。
