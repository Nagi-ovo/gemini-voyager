# Mermaid 图表渲染

自动将 Mermaid 代码渲染为可视化图表。

## 功能介绍

当 Gemini 输出 Mermaid 代码块时（如流程图、时序图、甘特图等），Voyager 会自动检测并渲染为交互式图表。

### 主要特性

- **自动检测**：支持 `graph`、`flowchart`、`sequenceDiagram`、`gantt`、`pie`、`classDiagram` 等所有主流 Mermaid 图表类型
- **一键切换**：通过按钮在渲染图表和源代码之间自由切换
- **全屏查看**：点击图表进入全屏模式，支持滚轮缩放和拖拽平移
- **深色模式**：自动适配页面主题

## 使用方法

1. 让 Gemini 生成任意 Mermaid 图表代码
2. 代码块会自动替换为渲染后的图表
3. 点击 **</> Code** 按钮查看原始代码
4. 点击 **📊 Diagram** 按钮切回图表视图
5. 点击图表区域进入全屏查看

## 全屏模式操作

- **滚轮**：缩放图表
- **拖拽**：移动图表位置
- **+/-**：工具栏缩放按钮
- **⊙**：重置视图
- **✕ / ESC**：关闭全屏

<div align="center">
  <img src="/assets/mermaid-preview.png" alt="Mermaid 图表渲染" style="max-width: 100%; border-radius: 8px;"/>
</div>
