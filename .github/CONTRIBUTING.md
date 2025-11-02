# Contributing

Thanks for your interest in contributing! A few quick guidelines:

- Use Node 20+ and bun 10+.
- Before sending a PR, run:
  - `bun run lint`
  - `bun run typecheck`
  - `bun run build`
- Keep changes focused and small. Explain the user impact in the PR description.
- Match the existing code style. Prefer readable names and early returns.

## Development

- Install deps: `bun install`
- Dev build (Chrome): `bun run dev`
- Production build (Chrome): `bun run build`

## Project scope

This extension adds a timeline UI to Gemini conversations. Out of scope: site scraping, network interception, account automation.

---

# 贡献指南

感谢你有兴趣参与贡献！以下是一些快速指南：

- 使用 Node 20+ 和 bun 10+。
- 在提交 PR 前，请运行：
  - `bun run lint`
  - `bun run typecheck`
  - `bun run build`
- 保持改动集中且小巧。在 PR 描述中说明对用户的影响。
- 匹配现有代码风格。优先使用可读的命名和提前返回。

## 开发

- 安装依赖：`bun install`
- 开发构建（Chrome）：`bun run dev`
- 生产构建（Chrome）：`bun run build`

## 项目范围

该扩展为 Gemini 对话添加时间线 UI。不在范围内的内容包括：网站爬取、网络拦截、账户自动化。

---

## Adding Gem Support

To add support for a new Gem (official Google Gems or custom Gems):

1. Open `src/pages/content/folder/gemConfig.ts`
2. Add a new entry to the `GEM_CONFIG` array:

```typescript
{
  id: 'your-gem-id',           // The ID as it appears in URLs (/gem/your-gem-id/...)
  name: 'Your Gem Name',       // Display name
  icon: 'material_icon_name',  // Google Material Symbols icon name
}
```

### Finding the Gem ID

- Open a conversation with the Gem
- Check the URL: `https://gemini.google.com/app/gem/[GEM_ID]/...`
- Use this ID in the configuration

### Choosing an Icon

Icons should be valid [Google Material Symbols](https://fonts.google.com/icons) icon names. Common examples:
- `auto_stories` - Learning Coach
- `lightbulb` - Brainstorm Buddy
- `work` - Career Guide
- `code` - Coding Partner

### Example

```typescript
export const GEM_CONFIG: GemConfig[] = [
  // ... existing entries ...
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    icon: 'analytics',
  },
];
```

---

## 添加 Gem 支持

如需为新 Gem（官方 Google Gems 或自定义 Gems）添加支持：

1. 打开 `src/pages/content/folder/gemConfig.ts`
2. 在 `GEM_CONFIG` 数组中添加新条目：

```typescript
{
  id: 'your-gem-id',           // URL 中显示的 ID (/gem/your-gem-id/...)
  name: 'Your Gem Name',       // 显示名称
  icon: 'material_icon_name',  // Google Material Symbols 图标名称
}
```

### 查找 Gem ID

- 打开与该 Gem 的对话
- 检查 URL：`https://gemini.google.com/app/gem/[GEM_ID]/...`
- 在配置中使用此 ID

### 选择图标

图标应为有效的 [Google Material Symbols](https://fonts.google.com/icons) 图标名称。常见示例：
- `auto_stories` - 学习教练
- `lightbulb` - 头脑风暴伙伴
- `work` - 职业指导
- `code` - 编程伙伴

### 示例

```typescript
export const GEM_CONFIG: GemConfig[] = [
  // ... 现有条目 ...
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    icon: 'analytics',
  },
];
```

---

## License

By contributing, you agree your contributions are licensed under the MIT license of this repo.

## 许可

提交贡献即表示你同意你的贡献采用本仓库的 MIT 许可证。
