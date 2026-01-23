> **🌐 Language / 语言**: [English](#contributing-to-gemini-voyager) | [中文](#贡献指南) | [Español](CONTRIBUTING_ES.md) | [Français](CONTRIBUTING_FR.md) | [日本語](CONTRIBUTING_JA.md)

---

# Contributing to Gemini Voyager

Thank you for considering contributing to Gemini Voyager! 🚀

This document provides guidelines and instructions for contributing. We welcome all contributions, whether it's bug fixes, new features, documentation improvements, or translations.

## 🚫 AI Policy

**We explicitly reject AI-generated PRs that have not been manually verified.**

While AI tools are great assistants, "lazy" copy-paste contributions waste maintainer time.
- **Low-quality AI PRs** will be closed immediately without discussion.
- **PRs without explanation** of the logic or missing necessary tests will be rejected.
- You must understand and take responsibility for every line of code you submit.

## Table of Contents

- [Getting Started](#getting-started)
- [Claiming an Issue](#claiming-an-issue)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Code Style](#code-style)
- [Adding Gem Support](#adding-gem-support)
- [License](#license)

---

## Getting Started

### Prerequisites

- **Node.js** 20+
- **Bun** 1.0+ (recommended) or pnpm/npm
- A Chromium-based browser for testing (Chrome, Edge, Brave, etc.)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Nagi-ovo/gemini-voyager.git
cd gemini-voyager

# Install dependencies
bun install

# Start development mode
bun run dev
```

---

## Claiming an Issue

To avoid duplicate work and coordinate contributions:

### 1. Check for Existing Work

Before starting, check if the issue is already assigned to someone by looking at the **Assignees** section.

### 2. Claim an Issue

Comment `/claim` on any unassigned issue to automatically assign yourself. A bot will confirm the assignment.

### 3. Unclaim if Needed

If you can no longer work on an issue, comment `/unclaim` to release it for others.

### 4. Contribution Checkbox

When creating issues, you can check the "I am willing to contribute code" checkbox to indicate your interest in implementing the feature or fix.

---

## Development Setup

### Install Dependencies

```bash
bun install
```

### Available Commands

| Command               | Description                                   |
| --------------------- | --------------------------------------------- |
| `bun run dev`         | Start Chrome development mode with hot reload |
| `bun run dev:firefox` | Start Firefox development mode                |
| `bun run dev:safari`  | Start Safari development mode (macOS only)    |
| `bun run build`       | Production build for Chrome                   |
| `bun run build:all`   | Production build for all browsers             |
| `bun run lint`        | Run ESLint with auto-fix                      |
| `bun run typecheck`   | Run TypeScript type checking                  |
| `bun run test`        | Run test suite                                |

### Loading the Extension

1. Run `bun run dev` to start the development build
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist_chrome` folder

---

## Making Changes

### Before You Start

1. **Create a branch** from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Keep changes focused** - one feature or fix per PR

### Pre-Commit Checklist

Before submitting, always run:

```bash
bun run lint       # Fix linting issues
bun run typecheck  # Check types
bun run build      # Verify build succeeds
bun run test       # Run tests
```

---

## Testing Strategy

We follow a "ROI-based" testing strategy: **Test Logic, Not DOM.**

1. **Must Have (Logic)**: Core services (Storage, Backup), Data parsers, and Utils. TDD is required here.
2. **Should Have (State)**: Complex UI state (e.g., Folder reducer).
3. **Skip (Fragile)**: Direct DOM manipulation (Content Scripts) and pure UI components. Use defensive programming instead.

---

## Submitting a Pull Request

### PR Guidelines

1. **Title**: Use a clear, descriptive title (e.g., "feat: add dark mode toggle" or "fix: timeline scroll sync")
2. **Description**: Explain what changes you made and why
3. **User Impact**: Describe how users will be affected
4. **Visual Proof (Strict)**: For ANY UI changes or new features, you **MUST** provide screenshots or screen recordings. **No screenshot = No review/reply.**
5. **Issue Reference**: Link related issues (e.g., "Closes #123")
6. **Tests & Logic**: PRs must include unit tests and a clear explanation of the logic. "Magic" fixes without context are not accepted.

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests

---

## Code Style

### General Guidelines

- **Prefer early returns** over nested conditionals
- **Use descriptive names** - avoid abbreviations
- **Avoid magic numbers** - use named constants
- **Match existing style** - consistency over preference

### TypeScript Conventions

- **PascalCase**: Classes, interfaces, types, enums, React components
- **camelCase**: Functions, variables, methods
- **UPPER_SNAKE_CASE**: Constants

### Import Order

1. React & React-related imports
2. Third-party libraries
3. Internal absolute imports (`@/...`)
4. Relative imports (`./...`)
5. Type-only imports

```typescript
import React, { useState } from 'react';
import { marked } from 'marked';

import { StorageService } from '@/core/services/StorageService';
import { Button } from '@/components/ui/Button';

import { parseData } from './parser';

import type { FolderData } from '@/core/types/folder';
```

---

## Adding Gem Support

To add support for a new Gem (official Google Gems or custom Gems):

1. Open `src/pages/content/folder/gemConfig.ts`
2. Add a new entry to the `GEM_CONFIG` array:

```typescript
{
  id: 'your-gem-id',           // From URL: /gem/your-gem-id/...
  name: 'Your Gem Name',       // Display name
  icon: 'material_icon_name',  // Google Material Symbols icon
}
```

### Finding the Gem ID

- Open a conversation with the Gem
- Check the URL: `https://gemini.google.com/app/gem/[GEM_ID]/...`
- Use the `[GEM_ID]` portion in your configuration

### Choosing an Icon

Use valid [Google Material Symbols](https://fonts.google.com/icons) icon names:

| Icon           | Use Case               |
| -------------- | ---------------------- |
| `auto_stories` | Learning, Education    |
| `lightbulb`    | Ideas, Brainstorming   |
| `work`         | Career, Professional   |
| `code`         | Programming, Technical |
| `analytics`    | Data, Analysis         |

---

## Project Scope

Gemini Voyager enhances the Gemini AI chat experience with:

- Timeline navigation
- Folder organization
- Prompt vault
- Chat export
- UI customization

**Out of scope**: Site scraping, network interception, account automation.

---

## Getting Help

- 💬 [GitHub Discussions](https://github.com/Nagi-ovo/gemini-voyager/discussions) - Ask questions
- 🐛 [Issues](https://github.com/Nagi-ovo/gemini-voyager/issues) - Report bugs
- 📖 [Documentation](https://gemini-voyager.vercel.app/) - Read the docs

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](../LICENSE).

---

# 贡献指南

感谢你考虑为 Gemini Voyager 做出贡献！🚀

本文档提供贡献的指南和说明。我们欢迎所有形式的贡献，无论是错误修复、新功能、文档改进还是翻译。

## 🚫 AI 政策

**本项目拒绝接受任何未经人工复核的 AI 生成的 PR。**

虽然 AI 是很好的辅助工具，但“懒惰”的复制粘贴贡献会浪费维护者的时间。
- **低质量的 AI PR** 如果发现，将直接关闭且不予讨论。
- **缺乏逻辑解释** 或缺少必要测试的 PR 将被拒绝。
- 你必须理解并对你提交的每一行代码负责。

## 目录

- [快速开始](#快速开始)
- [认领 Issue](#认领-issue)
- [开发环境设置](#开发环境设置)
- [进行更改](#进行更改)
- [提交 Pull Request](#提交-pull-request)
- [代码风格](#代码风格)
- [添加 Gem 支持](#添加-gem-支持)
- [许可证](#许可证)

---

## 快速开始

### 前置要求

- **Node.js** 20+
- **Bun** 1.0+（推荐）或 pnpm/npm
- 用于测试的 Chromium 内核浏览器（Chrome、Edge、Brave 等）

### 快速启动

```bash
# 克隆仓库
git clone https://github.com/Nagi-ovo/gemini-voyager.git
cd gemini-voyager

# 安装依赖
bun install

# 启动开发模式
bun run dev
```

---

## 认领 Issue

为避免重复工作并协调贡献：

### 1. 检查现有工作

在开始之前，检查 issue 的 **Assignees** 部分，确认是否已有人被分配。

### 2. 认领 Issue

在任何未分配的 issue 上评论 `/claim`，机器人将自动将你分配为负责人。

### 3. 取消认领

如果你无法继续处理某个 issue，评论 `/unclaim` 即可释放它供他人处理。

### 4. 贡献意愿复选框

创建 issue 时，你可以勾选"我愿意贡献代码"复选框，表明你有兴趣实现该功能或修复。

---

## 开发环境设置

### 安装依赖

```bash
bun install
```

### 可用命令

| 命令                  | 描述                             |
| --------------------- | -------------------------------- |
| `bun run dev`         | 启动 Chrome 开发模式（热重载）   |
| `bun run dev:firefox` | 启动 Firefox 开发模式            |
| `bun run dev:safari`  | 启动 Safari 开发模式（仅 macOS） |
| `bun run build`       | Chrome 生产构建                  |
| `bun run build:all`   | 所有浏览器生产构建               |
| `bun run lint`        | 运行 ESLint 并自动修复           |
| `bun run typecheck`   | 运行 TypeScript 类型检查         |
| `bun run test`        | 运行测试套件                     |

### 加载扩展

1. 运行 `bun run dev` 启动开发构建
2. 打开 Chrome，访问 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"，选择 `dist_chrome` 文件夹

---

## 进行更改

### 开始之前

1. **从 `main` 创建分支**：

   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/your-bug-fix
   ```

2. **保持更改集中** - 每个 PR 只包含一个功能或修复

### 提交前检查清单

提交前，请务必运行：

```bash
bun run lint       # 修复代码风格问题
bun run typecheck  # 检查类型
bun run build      # 验证构建成功
bun run test       # 运行测试
```

---

## 测试策略

我们遵循“基于 ROI”的测试策略：**测逻辑，不测 DOM。**

1. **必须测 (Logic)**：核心服务（Storage, Backup）、数据解析和工具函数。必须使用 TDD。
2. **建议测 (State)**：复杂的 UI 状态（如文件夹 Reducer）。
3. **跳过 (Fragile)**：直接 DOM 操作（Content Scripts）和纯 UI 组件。请使用防御性编程代替。

---

## 提交 Pull Request

### PR 指南

1. **标题**：使用清晰的描述性标题（如 "feat: add dark mode toggle" 或 "fix: timeline scroll sync"）
2. **描述**：解释你做了什么更改以及原因
3. **用户影响**：描述用户将如何受到影响
4. **可视化证据（严格）**：对于任何 UI 修改或新功能，**必须**提供截图或屏幕录制。**没有截图 = 不予审核/回复。**
5. **Issue 引用**：链接相关 issue（如 "Closes #123"）
6. **测试与逻辑**：PR 必须包含单元测试并清晰解释修改逻辑。不接受没有上下文的“魔法”修复。

### 提交信息格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` - 新功能
- `fix:` - 错误修复
- `docs:` - 文档更改
- `chore:` - 维护任务
- `refactor:` - 代码重构
- `test:` - 添加或更新测试

---

## 代码风格

### 通用指南

- **优先使用提前返回**而非嵌套条件
- **使用描述性名称** - 避免缩写
- **避免魔法数字** - 使用命名常量
- **匹配现有风格** - 一致性优于偏好

### TypeScript 约定

- **PascalCase**：类、接口、类型、枚举、React 组件
- **camelCase**：函数、变量、方法
- **UPPER_SNAKE_CASE**：常量

### 导入顺序

1. React 及相关导入
2. 第三方库
3. 内部绝对导入（`@/...`）
4. 相对导入（`./...`）
5. 仅类型导入

---

## 添加 Gem 支持

如需为新 Gem（官方 Google Gems 或自定义 Gems）添加支持：

1. 打开 `src/pages/content/folder/gemConfig.ts`
2. 在 `GEM_CONFIG` 数组中添加新条目：

```typescript
{
  id: 'your-gem-id',           // URL 中的 ID：/gem/your-gem-id/...
  name: 'Your Gem Name',       // 显示名称
  icon: 'material_icon_name',  // Google Material Symbols 图标
}
```

### 查找 Gem ID

- 打开与该 Gem 的对话
- 检查 URL：`https://gemini.google.com/app/gem/[GEM_ID]/...`
- 在配置中使用 `[GEM_ID]` 部分

### 选择图标

使用有效的 [Google Material Symbols](https://fonts.google.com/icons) 图标名称：

| 图标           | 用途           |
| -------------- | -------------- |
| `auto_stories` | 学习、教育     |
| `lightbulb`    | 创意、头脑风暴 |
| `work`         | 职业、专业     |
| `code`         | 编程、技术     |
| `analytics`    | 数据、分析     |

---

## 项目范围

Gemini Voyager 通过以下功能增强 Gemini AI 聊天体验：

- 时间线导航
- 文件夹组织
- 指令宝库
- 聊天导出
- UI 自定义

**不在范围内**：网站爬取、网络拦截、账户自动化。

---

## 获取帮助

- 💬 [GitHub Discussions](https://github.com/Nagi-ovo/gemini-voyager/discussions) - 提问
- 🐛 [Issues](https://github.com/Nagi-ovo/gemini-voyager/issues) - 报告错误
- 📖 [文档](https://gemini-voyager.vercel.app/) - 阅读文档

---

## 许可证

提交贡献即表示你同意你的贡献将采用 [MIT 许可证](../LICENSE)。
