# Mermaid 图表渲染

自动将 Mermaid 代码渲染为可视化图表。

## 功能介绍

当 Gemini™ 输出 Mermaid 代码块（流程图、时序图、甘特图等）时，Voyager 会自动检测并将其渲染为交互式图表。

### 主要特性

- **自动检测**：支持 `graph`、`flowchart`、`sequenceDiagram`、`gantt`、`pie`、`classDiagram` 以及所有主流 Mermaid 图表类型
- **切换视图**：一键在渲染后的图表与源代码之间切换
- **全屏模式**：点击图表进入全屏，支持缩放和拖拽平移
- **深色模式**：自动适配页面主题

## 开启或关闭

Mermaid 渲染在 Gemini 上默认开启。如需关闭，请打开 Voyager 弹窗，在 **通用选项** 下关闭 **启用 Mermaid 图表渲染**。AI Studio 上不提供此功能。

## 使用方法

1. 让 Gemini 生成任意 Mermaid 图表代码
2. 代码块会自动替换为渲染后的图表
3. 点击 **</> Code** 按钮查看源代码
4. 点击 **📊 Diagram** 按钮切回图表视图
5. 点击图表区域进入全屏

## 全屏操作

- **滚轮**：放大或缩小
- **拖拽**：平移图表
- **+/-**：工具栏上的缩放按钮
- **⊙**：重置视图
- **✕ / ESC**：退出全屏

## 兼容性与故障排除

::: warning 注意

- **Firefox 限制**：由于环境限制，Firefox 内置 Mermaid 9.2.2 版本，不支持 **Timeline**、**Sankey** 等新特性。
- **语法错误**：渲染失败通常是因为 Gemini 输出的代码存在语法错误。我们正在收集典型的错误案例（Bad Case），后续版本将针对常见的生成错误加入自动修补。
  :::

<div align="center">
  <img src="/assets/mermaid-preview.png" alt="Mermaid 图表渲染" style="max-width: 100%; border-radius: 8px;"/>
</div>
