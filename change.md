# Changelog

### Chrome 开发流程优化 - 2026-01-19
#### 修改内容：
- 新增文件：`scripts/launch-chrome-dev.js`
- 修改文件：`package.json` (新增 `dev:chrome-open` 命令)
- 修改文件：`.gitignore` (添加 `.chrome-dev-data/`)

#### 变更逻辑：
新增 `bun run dev:chrome-open` 命令，实现一键启动 Chrome 开发环境：
1. 自动检测系统 Chrome 路径
2. 清理使用相同 user-data-dir 的残留 Chrome 进程
3. 启动 Vite 编译（通过 nodemon 监听文件变化）
4. 编译完成后自动启动 Chrome，使用隔离的用户数据目录
5. 自动打开 Gemini 主页

首次运行时需要手动在 chrome://extensions 开启开发者模式并加载扩展，后续运行会自动记住设置。
