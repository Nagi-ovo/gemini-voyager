# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Fix: Timeline duplicate selection & Fork text leaking into summaries

## Context

Issue #319 reports two bugs that are **still present** despite earlier fixes from Oct 2025:

1. **Duplicate selection**: When multiple user turns have identical text (e.g. "好的，继续执行下一步"), clicking one timeline marker highlights ALL markers with the same text. The root cause is `ensureTurnId()` (manager.ts:952-965) generates marker IDs using only `hashString(text)`...

### Prompt 2

提交

