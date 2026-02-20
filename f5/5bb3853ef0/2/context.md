# Session Context

## User Prompts

### Prompt 1

当前所有还没有 push 到 remote 的改动会影响任何功能吗？还是仅仅只是修复了 ESLint 警告呢

### Prompt 2

用 vite 移除生产环境中的 console.log，不过必要的 console.warn 和 error 要保留，如果当前都是用的 console.log，请你将必要的调试信息改为error和warn，参考：
esbuild: {
    pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
  },

### Prompt 3

那我平时本地调试和发布github 打包 ci 里有什么需要注意的？怎么用

### Prompt 4

bun run build:chrome

### Prompt 5

注意 bun run format 会检查一些不应检查的路径，请优化配置

### Prompt 6

提交

