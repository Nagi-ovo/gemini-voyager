# ChatGPT 本地桥

「ChatGPT · 本地桥」是 Voyager 的官方插件，默认关闭。

打开并配对之后，Voyager 会把一组 ChatGPT 页面操作开放给这台电脑上的本地程序。程序提出要做什么，Voyager 在自己打开的标签页里，用你浏览器里已经登录的那个 ChatGPT 去做。ChatGPT 看到的，就是你浏览器里一次普通的对话。

## 开放了哪些操作

- 打开一个对话：新对话，或者已有的对话
- 选择模型：只在聊天模式下选，不会把 ChatGPT 切到「工作」模式
- 发送提示，可以带附件
- 等待回复，并读出来
- 读取已有对话的最新回复
- 列出、新建项目
- 列出、上传、删除项目里的文件（删除立即生效，无法恢复）

## 它守的规矩

**只在本机。** 桥只通过 `127.0.0.1` 和本机程序通信，而且要先配对。

**用自己的标签页。** 每个任务在 Voyager 打开的 ChatGPT 标签页里进行，用完关掉。

**一次一个任务。** 同一时间只跑一个任务。

**登录和人机验证交给你。** 如果 ChatGPT 要求登录或人机验证，桥会停下来告诉你，不会绕过。

**带上套餐。** 每个结果都会附上你的 ChatGPT 套餐（`Pro Lite ($100)`、`Pro ($200)` 等），以页面最近一次报告的为准。

**浏览器。** 已在 Chrome 中测试。Edge 和 Firefox 版的 Voyager 也带这个桥；Safari 版没有。

## 参考用法：Voyager CLI

[Voyager CLI](https://github.com/voyager-crew/voyager-cli)（npm 包 `@voyager-crew/cli`，命令 `voyager`）是基于这些操作写的参考客户端：在终端里向 ChatGPT 提问，或者交给你的 coding agent 去问。

### 三步接上

1. 安装命令行（需要 Node.js 20.3 或更高版本）：

   ```sh
   npm install -g @voyager-crew/cli
   ```

2. 在 Voyager 弹窗里进入 **插件**，打开 **ChatGPT · 本地桥**，并允许访问 chatgpt.com。
3. 配对一次：

   ```sh
   voyager pair
   ```

   把它显示的 8 位配对码填进弹窗里「本地桥接」的设置。

### 几个例子

```sh
voyager ask "解释一下这段报错" --attach crash.log
voyager ask --chat <链接|id> "边界情况呢？"         # 在已有对话里接着问
voyager read <链接|id>                             # 保存某个对话的最新回答
voyager project upload "论文" ./thesis             # 把文件放进项目，项目里的对话都能读到
voyager ask --project "论文" "论证最薄弱的地方在哪？"
```

回答存成 `response.md`，默认用聊天模式下的 GPT-6 Pro。

很长的回答怎么等、每个退出码的意思、全部命令，见 [CLI 的 README](https://github.com/voyager-crew/voyager-cli/blob/main/README_ZH.md)。给 Claude Code、Codex 等 agent 用的说明在 [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md)。

## 须知与免责

- Voyager 和 Voyager CLI 是社区开源项目，与 OpenAI 无关，也没有得到 OpenAI 的认可。
- 本地桥会在你自己登录的浏览器里自动操作 ChatGPT 网页版。OpenAI 的[使用条款](https://openai.com/policies/terms-of-use/)限制以自动或程序化的方式提取输出，使用前请自行判断是否符合条款；账号因此受到的任何限制，由你自己承担。
- 同类工具也是这样处理的：例如 [oracle](https://github.com/steipete/oracle) 把浏览器模式作为需要主动开启的实验功能，并建议在意风险的人改用 API。需要有保障的用法，请使用 OpenAI API。
- 本地桥是给你在自己电脑上、为自己方便而用的：只连你自己的账号，不要拿它对外提供服务、共享账号或转卖额度，也只用于合法用途。
