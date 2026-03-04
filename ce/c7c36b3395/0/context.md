# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: macOS 修饰键显示适配

## Context
扩展中涉及 Ctrl 键的功能（Ctrl+Enter 发送、Ctrl+I 展开输入框）在 macOS 上功能正常（代码已同时接受 `ctrlKey || metaKey`），但 UI 文案始终显示 "Ctrl"，macOS 用户应看到 "⌘"。此外 Ctrl+I 快捷键未在 UI 中提及，缺少可发现性。`formatShortcut()` 也需要在 macOS 上用符号（⌘/⌥/⌃/⇧）代替文字。

## Changes

### 1. 添加平台检测和修饰键工具函数
**File**: `src/core/utils/browser.ts`
- 新增 `isMac(): boolean` — 通过 `navigator.userAgent` / `navigator.platform` 检测 macOS
- 新增 `getModifierKey(): string` — macOS 返回 `'⌘'`，其他返回 `'Ctrl'`

### 2. 更新 `...

### Prompt 2

ctrl i 是否应该加在 popup 里指示?

### Prompt 3

好，vitepress 文档里没有的话也加上

### Prompt 4

bun run format 然后提交

