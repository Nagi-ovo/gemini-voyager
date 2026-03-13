---
globs: ["src/**/*.ts", "src/**/*.tsx"]
---

# TypeScript Coding Standards

## DOs
- Prefer plain objects with interfaces/types for data structures
- Use `map`, `filter`, `reduce` for immutability
- Use `private`/`protected` in classes
- Use `unknown` + narrowing (Zod or custom guards) for type safety
- Use named exports: `export function X`
- Functional React: hooks at top level, strictly functional components

## DON'Ts
- **No `any` type.** Use `unknown` if you must, then narrow it.
- **No global variables** outside defined Services.
- **No `chrome.storage` in UI components** (`src/components/`, `src/pages/popup/`). Use `StorageService`.
- **No God Components.** Business logic belongs in `features/*/services/` or custom hooks, not UI files.
- **No magic strings.** Use constants or enums (StorageKeys, CSS classes).
- **No `console.log` in production.** Use `LoggerService` for critical info.

## Testing (Vitest + jsdom)
- Chrome `chrome` object is globally mocked in `src/tests/setup.ts`
- Mock specific storage: `(chrome.storage.sync.get as any).mockResolvedValue({ key: 'val' })`
- Run: `bun run test`, `bun run test <filename>`, `bun run test:coverage`
