# DeepSeek Harness

DeepSeek 官方的开源编程 agent，运行在你自己的电脑上。

它提供网页界面，地址是 `localhost:3080`。

既然有网页界面，Voyager 就能接入它。

## 为什么能接入

Voyager 的提示词管理器不看域名，只看你添加过的网站。

本地地址同样是一个网站。

所以 DeepSeek Harness 和 Gemini、Claude、ChatGPT 没有区别，都是你的提示词可以跟随你过去的地方。

## 三步接入

### 1. 启动 DSH

```bash
npm i -g @deepseek-ai/dsh
dsh web
```

在浏览器中打开 `http://localhost:3080`。

### 2. 在弹窗中打开开关

![点击工具栏的拼图图标，再点 Voyager，然后在 localhost:3080 上开启提示词管理器](/assets/dsh-enable-steps-zh.png)

你已经在 `localhost:3080` 页面上，因此弹窗顶部会直接显示这个选项。打开开关并授予访问权限即可。

无需手动输入地址。

### 3. 刷新页面

页面右下角会出现悬浮按钮。

![在 DeepSeek Harness 中运行的提示词管理器](/assets/prompt-manager-deepseek-harness.png)

## 一个提示词库，处处可用

你不会为每个网站单独准备一个库，而是只有一个会跟随你的库。

你在 Gemini、Claude 或 ChatGPT 上保存的所有提示词，打开 DSH 时都已经在那里。反过来也一样：在 DSH 里写的提示词，回到 Gemini 时同样可以使用。

标签、收藏和搜索都是同一套。

![一个提示词库，覆盖每一个界面](/assets/one-prompt-library.png)

## 几点说明

**端口不是固定的。** DSH 仍处于开发者预览阶段，默认端口可能会变化。如果变了，只需把新端口也添加进去即可。

**只加载提示词管理器。** 在 DSH 这类自定义网站上，时间线、文件夹等功能不会启动。（在 DeepSeek 官方网站上，其中许多功能以官方插件的形式提供。）

**你的提示词不会离开这台电脑。** DSH 在本地运行，Voyager 的提示词库也在本地，整个链路不会有任何内容外传。

::: tip
同样的方法适用于任何本地 Web UI，例如 Open WebUI、LibreChat，或者你自己写的网页。填入地址，刷新页面，即可使用。
:::
