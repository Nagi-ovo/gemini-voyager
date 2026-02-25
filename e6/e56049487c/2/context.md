# Session Context

## User Prompts

### Prompt 1

请web search 查找最佳实践，当前是否有能将 release 中的 package 自动更新到 chrome extension 和 edge addons 的 workflow / script? 我目前是已经支持了自动更新 firefox addons

### Prompt 2

这些方案安全吗？使用人数多吗？

### Prompt 3

这样的话，我还有什么需要额外补充的 secrets 吗？我应该分别去哪里获取？

### Prompt 4

相关代码已经实现了吗？

### Prompt 5

嗯

### Prompt 6

CHROME_REFRESH_TOKEN 是我要在开发机上运行一次就可以的吗？不会改变吗

### Prompt 7

jessezhang@Jesses-MacBook-Air gemini-voyager % npx gcp-refresh-token
Need to install the following packages:
gcp-refresh-token@0.9.2
Ok to proceed? (y) y

npm warn deprecated google-p12-pem@4.0.1: Package is no longer maintained
🛑 Error: key.json is missing one or more of the required fields: client_id, client_secret, redirect_uris
    at q (file:///Users/jessezhang/.REDACTED.js:26:2083)
    at p (file:///Users/jessezhang/.np...

### Prompt 8

jessezhang@Jesses-MacBook-Air gemini-voyager % npx gcp-refresh-token 
🛑 TypeError: Cannot read properties of undefined (reading 'client_id')
    at file:///Users/jessezhang/.REDACTED.js:26:2072
    at Array.some (<anonymous>)
    at q (file:///Users/jessezhang/.REDACTED.js:26:2052)
    at p (file:///Users/jessezhang/.npm/_npx/c78850d96cd6b1d6/node_modules/gcp...

### Prompt 9

但这个就是网页应用，我都用了好久这个 client 了

### Prompt 10

算了，不要发布到 Chrome 商店了，只弄 Edge 吧，相关逻辑去掉

### Prompt 11

release.yml 里有静态错误

### Prompt 12

Context access might be invalid: EDGE_ACCESS_TOKEN_URL

### Prompt 13

改用 https://github.com/marketplace/actions/publish-edge-add-on 支持 v1.1 api 的，不需要这个 ID 了应该

### Prompt 14

最后 release 页面我不希望有 edge 的打包

