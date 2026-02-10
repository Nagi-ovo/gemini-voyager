# 记忆搬运：上下文同步（实验性）

**不同次元，丝滑共享**

在网页端推演逻辑，在 IDE 里落地代码。 Gemini Voyager 打通次元壁，让你的 IDE 瞬间拥有网页端的“思维过程”。

## 告别反复横跳

开发者最烦的事：在网页上聊透了方案，回到 VS Code/Trae/Cursor 却要像面对陌生人一样重新解释需求。 由于额度和响应速度，网页端是“大脑”，IDE 是“手”。 Voyager 让它们共用一个灵魂。

## 极简三步，同频呼吸

1. **安装并唤醒桥接器**：
   安装 **CoBridge** 插件。它是连接网页与本地 IDE 的核心桥梁。
   - **[前往插件市场安装](https://open-vsx.org/extension/windfall/co-bridge)**

   ![CoBridge扩展](/assets/CoBridge-extension.png)

   安装完成后，点击右侧图标并启动服务器。
   ![CoBridge服务器开启](/assets/CoBridge-on.png)

2. **握手对接**：
   - 在 Voyager 设置中开启“上下文同步”。
   - 对齐端口号。看到 “IDE Online”，说明它们已经连上了。

   ![上下文同步面板](/assets/context-sync-console.png)

3. **一键同步**：点一下 **"Sync to IDE"**。无论是复杂的**数据表格**，还是直观的**参考图片**，都能瞬间瞬移到你的 IDE 中。

   ![同步完成](/assets/sync-done.png)

## 落地生根

同步完成后，你的 IDE 根目录会多出一个 `.cobridge/AI_CONTEXT.md`。 无论是 Trae、Cursor 还是 Copilot，它们会通过各自的 Rule 文件自动读取这份“记忆”。

```
your-project/
├── .cobridge/
│   ├── images/
│   │   ├── context_img_1_1.png
│   │   └── context_img_1_2.png
│   └── AI_CONTEXT.md
├── .github/
│   └── copilot-instructions.md
├── .gitignore
├── .traerules
└── .cursorrules
```

## 它的原则

- **零污染**：CoBridge 自动操作 `.gitignore`，不会把你这些私密对话推到 Git 仓库里。
- **懂行**：全 Markdown 格式，IDE 里的 AI 读起来就像读说明书一样顺畅。
- **小贴士**：如果对话太久远，先用【时间线】向上划一下，让网页把记忆“想起来”，再同步效果更佳。

---

## 立刻起航

**思维已在云端就绪，现在，让它在本地落地生根。**

- **[安装 CoBridge 插件](https://open-vsx.org/extension/windfall/co-bridge)**：找到你的次元传送门，一键开启“同频呼吸”。
- **[访问 GitHub 仓库](https://github.com/Winddfall/CoBridge)**：深入了解 CoBridge 的底层逻辑，或者为这个“同步灵魂”的项目点个 Star。

> **大模型从此不再失忆，上手即战。**
