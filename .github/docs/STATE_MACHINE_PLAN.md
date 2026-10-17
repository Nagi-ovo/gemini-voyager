# 显式状态机：改造范围与插件路线

日期：2026-10-16；更新：2026-10-17。状态：阶段 A 已在 main 实现，并对 `verbs/`、`builtin/`、`src/pages/content/` 做过全量审计；之后两站批量删除迁移（`GEMINI_PLUGIN_PLATFORM_PLAN.md` §7.12 8-10）也用上了同一运行时，见 §3。阶段 B 未启动，启动条件见 §4。

**结论：先在包内 TypeScript 里给有生命周期的功能提供一套状态机运行时，并用四个真实模块验证（之后又有两站批量删除共六个）；暂不让插件 JSON 表达状态。** 这套运行时已经承担了「按状态拥有和清理效果、事件串行、过期回调失效」这些最难的部分。以后如果真要让插件用 JSON 组合有状态的行为（阶段 B），只需要把 JSON 转移表编译成同一个 `transition` 签名，再补齐来源感知和约束修订。scripted tier（`chrome.userScripts`）被 AMO 政策挡住，不作为状态化插件的出路。

## 1. 为什么做

状态分散在多个 boolean、timer 和可空字段里时，字段之间会出现非法组合，异步回调也可能在功能已经进入下一阶段后才回来。审计找到的四个模块都有这样的实际问题或修复历史：

| 模块                                                                                          | 问题                                                                                                                                                                                   | 证据                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/pages/content/export/exportSelectionSession.ts`                                          | 点 Export 后、`takeSelection` 前没有状态标记；第二次点击会再启动一次导出，可能误删第一次导出要用的截图区块，并让仍在运行的导出无法取消                                                 | `exportRun.ts:334-335`、`:415`、`:477`                   |
| `src/pages/content/defaultModel/autoApply.ts`                                                 | `setInterval` 的 async tick 会重叠，后一个 tick 撞上 `isLocked` 拿到 `'failed'`，把 #761 的连续拒绝计数清零                                                                            | `autoApply.ts:279`、`:355`；`modelPicker.ts:121`、`:127` |
| `src/features/plugins/verbs/draftSave/session.ts`                                             | `tryRestore` 依赖 6 个参数的守卫；重试耗尽和仍在重试无法区分                                                                                                                           | 修复提交 c6d9ffc7、7650c9e2、4ab72ee3、fd9ccfde          |
| `src/pages/content/responseNotification/run.ts`、`builtin/chatgptResponseNotification/run.ts` | 回退 toast、用户 stop、Gemini 的网络已处理标记都活在整个会话里：上一轮的 toast 会在下一轮弹出；ChatGPT 点 stop 后马上重发的回复不通知；Gemini 走过网络路径后，只靠页面检测的一轮被静默 | 两个站点 5 处零散的 reset；审计用 fixture 复现           |

审计后决定不改的：

| 模块                                               | 理由                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/timeline/TimelineNavigation.ts`      | `isScrolling`（程序滚动动画）和 `isNavigating`（导航队列锁）彼此正交，可以同时为真；已有 `scrollAnimationGeneration` 丢弃过期回调                                                                                                                                   |
| `src/pages/content/chatInput/vimMode.ts`           | 三个字段正交，由 `reconcileListener` 统一；模式 union 已在 `vimCommands.ts:16`                                                                                                                                                                                      |
| `src/features/plugins/runtime/PluginHost.ts`       | 已有 generation、opChain、ReleaseLedger，换成单一 phase 会丢信息                                                                                                                                                                                                    |
| `GoogleDriveSyncService`、`DataBackupService`      | `SyncState` 部分字段会持久化，属于受保护格式；备份服务是带版本号的写队列，不是阶段流程                                                                                                                                                                              |
| `src/features/folder/owner/`                       | 已是 command + 纯 reducer（`applyFolderOp.ts`），并由 background 作为唯一写入方                                                                                                                                                                                     |
| `src/features/plugins/verbs/` 其余 14 个 primitive | 只是挂载/拆除加去抖，或状态本就写在 DOM 属性上（`userLatex`）。最接近的 `codeBlockDiagram.draw()` 有 6 道 await 后检查，换成状态机只能删掉 2–3 道，其余要查 DOM 连接和跨 activation 的所有权                                                                        |
| `src/pages/content/` 其余 20 个模块                | 挂载/拆除、正交的开关，或已有 generation/revision 守卫。`sidebarAutoHide`、`timestamp` 的计时器每次事件都要重新计时，不适合                                                                                                                                         |
| `src/pages/content/researchPack/receiver.ts`       | 最接近改造：peek → 等 composer → claim → insert 的一次性流程。同类修复都在上线前同一天，之后两周没有复发，改造只省 30–40 行守卫。再出现「离开新对话页后迟到的 timer/promise 仍在动作」这类修复时，按 `peeking \| waitingComposer \| claiming \| ended{reason}` 改造 |
| `builtin/` 其余官方插件、`usageStatus`             | 句柄都由 `scope.effect` 管理；`chatgptTemporaryHandoff` 是三条正交的轴；`claudeUsage` 已退役                                                                                                                                                                        |

## 2. 运行时契约

实现：`src/features/plugins/runtime/stateMachine.ts`，测试：`stateMachine.test.ts`。放在 `pluginScope.ts` 旁边，因为每次进入一个状态都会创建一个 `PluginScope`，离开状态时由它负责清理。

```ts
const machine = startMachine<State, Event>(
  { id: 'export-selection', transition, effects: { confirming: (stay) => { … } } },
  { status: 'selecting', … },
);
```

- `transition(state, event)` 是纯函数，返回同一个对象表示忽略该事件。测试写成「状态 + 事件 → 状态」，不需要 DOM。
- `effects` 按 `status` 建表。进入某个状态时运行对应的 effect；它在 `stay.scope` 上注册的 timer、listener、DOM 和异步任务会在离开后全部拆除。
- 事件逐个按顺序处理。effect 或订阅者里调用的 `send` 会进入队列，不会重入。
- 离开状态的同时，该状态的 `stay.send` 失效、`stay.signal` 中止。过期的 timer、listener、promise 无法再推动状态机，模块不需要再手写 generation 计数。
- scope 里的清理函数随后按顺序执行，只有第一个在下一个状态的 effect 启动前完成。所以回调里如果不只是 `send`，还会写 DOM 或调用页面，要先检查 `stay.signal.aborted`。
- 只有 `status` 变化才会重启 effect。同一状态内的数据更新（比如尝试次数）不打断正在运行的 effect，effect 通过 `stay.state()` 读取最新数据。
- transition 抛错时丢弃该事件，effect 抛错时保留它已经注册的效果直到离开；两者都记日志，队列继续处理。
- `stop()` 结束当前状态，等到所有状态的效果都拆除后才 resolve，可以直接接到 `featureLifecycle` 的 stop 上。

使用原则：只给真正有阶段、会被打断的那条轴建状态机。彼此正交的维度（例如草稿的「恢复」「保存去抖」「发送意图」）不要强行合并成一个 union。

## 3. 阶段 A：已做的改造

| 模块                                                                            | 状态                                                                                                   | 修掉的问题                                                                                                                                                      | 关键测试                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 导出选择：`exportSelectionMachine.ts` + `exportSelectionSession.ts`（只管 DOM） | `selecting \| resolvingRoles{role} \| confirming \| exporting \| ended{reason}`                        | 等待截图权限期间第二次点 Export 不再启动第二次导出；点 Export 后选择被冻结；`onConfirm` 不取选择就返回时也会先移除 UI；刷新不再把已解析的 role 覆盖回 `unknown` | `second Export click during the permission wait does not start a second export`、`checkbox clicks after Export do not change the exported selection`、`done does not resolve while the selection bar is still mounted` |
| 默认模型锁定：`autoApplyMachine.ts` + `autoApply.ts`                            | `idle \| checking \| locking{attempt, failures, pick, model, thinking} \| satisfied \| gaveUp{reason}` | 改为上一个 tick 结束后才排下一个，tick 不再重叠，#761 的连续拒绝计数不会被清零；所有计数只在 transition 里改                                                    | `an overlapping lock tick does not reset the rejected-switch back-off`、`a slow menu does not let two lock ticks run at once`                                                                                          |
| 草稿恢复：`draftSessionMachine.ts` + `session.ts`                               | 每个对话一台：`waiting \| loading{touched} \| writing{retriesLeft} \| settled{outcome}`                | 6 参数守卫换成状态和 `touched` 事件；重试耗尽成为可区分的 `settled{exhausted}`。保存去抖和发送意图是正交的两条轴，保持原样                                      | `a late draft load does not refill a composer cleared after it started`、`exhausted restore retries leave the session settled`                                                                                         |
| 回复通知：`completionMachine.ts`，Gemini 与 ChatGPT 的 `run.ts` 共用            | 每轮生成一台：`streaming \| notifying \| deferred \| showing \| ended{reason}`                         | 开新一轮就停掉上一台，旧的回退 toast、stop 和网络已处理标记随之失效；删掉 `notifyEpoch`、两个 flush 函数和常驻 focus 监听。检测逻辑留在各自的 run 里            | `a deferred fallback toast does not fire once the next generation has started`、`a prompt sent right after stop is not silenced`、`a page-only generation after a network-owned one still notifies`                    |

阶段 A 之后接入的模块（8-10 批量删除）：

| 模块                                                     | 状态                                                    | 用途                                                                                                                       | 关键测试                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Gemini 批量删除：`batchDelete/geminiSelection.ts`        | `idle \| selecting \| confirming{ids} \| deleting{ids}` | 关闭插件时撤掉选择 UI 和尚未接受的确认；已接受的确认冻结目标集合，删除阶段独立于选择 UI 的卸载收尾；账号或页面变化作废确认 | `invalidates a confirmation when dragging makes another chat the only selected row`、`stops account scans after confirmation is cancelled` |
| AI Studio 批量删除：`folder/aistudioLibrarySelection.ts` | `idle \| selecting \| confirming \| deleting`           | 同上，用于 `/library` 行；确认与删除阶段监视路由和账号上下文                                                               | `folder/__tests__/aistudioLibraryBatchDeleteReload.test.ts`                                                                                |

`runtime.test.ts` 里「旧对话迟到的选择结果不能停掉新对话的循环」那条测试原来依赖 tick 重叠才出现第 3 次调用，现在改为先让新循环自己的选择返回，再断言循环仍在继续。

使用中发现的边界：运行时只在 `status` 变化时重启 effect。需要「同一状态重新计时」的场景（每次输入重启的去抖、重新布防的发送意图）不适合放进同一台机器；草稿恢复的做法是每个对话起一台新机器。

## 4. 阶段 B：插件 JSON 状态机（暂不启动）

做法：允许打包官方插件和用户本地导入插件声明 `states` / `events` / `transitions`；action 只能引用可逆的 `domOps` 和已有 primitive，guard 只能引用具名谓词。JSON 表编译成 §2 的 `transition` 签名，复用同一个运行时。

**启动条件（满足其一）**：

- 有具体的用户或作者需求，要求不发版就能组合现有积木做出带条件、多步骤的行为。2026-10-15 搜索 issue 和讨论没有这类需求，最接近的 #322（排队输入）已以 `NOT_PLANNED` 关闭。
- 三个以上官方 primitive 出现同构的状态流程，用数据描述比各写一份 TS 更清楚。

**前置工作（阶段 A 不会顺带完成）**：

1. 来源感知：`defaultSources.ts:229` 的 `listPluginManifests` 丢弃了 `sourceId`，`PluginHost.ts:673` 和 `declarativeEngine.mount` 都拿不到来源。需要把来源传到校验和挂载阶段。
2. 远程覆盖：远程目录在生产构建中默认开启（`vite.config.base.ts:67`），兼容的同 id 远程记录会替换打包版（`defaultSources.ts:115-117`），而 `validateManifest` 会静默丢弃未知字段（`manifest/validate.ts:633-650`）。带状态机的插件必须禁止被远程覆盖，否则状态机会悄悄消失。
3. 修订 `.github/docs/PLUGIN_DISTRIBUTION_PLAN.md` §11.2 的 C1，并同步本地导入 gate 的原则「the remote catalog's gate plus local-only rules, never a weaker one」（`local/validateLocalManifest.ts:5`）。
4. engine 改为按状态记账：现在 ledger 按插件释放（`declarativeEngine.ts:431-450`），`reapplyNow` 会重放全部 op（`:464-467`），health monitor 会把停在空闲态的插件误报为无效果（`:218`、`:310`）。
5. action 白名单只收可逆操作。允许 click、send、navigate 会破坏 `DomOperation` 的可逆契约（`types.ts:117-119`），与来源无关。

**政策判断**：

- Chrome：禁止的是「Building an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data」（https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements ）。打包的 JSON 随代码一起提交，问题不大；本地导入没有明确豁免，存在「full functionality … easily discernible from its submitted code」的解释风险。远程目录一律拒绝。
- Firefox AMO：要求「self-contained and not load remote code for execution」，审核即拒表里没有解释器条目（https://extensionworkshop.com/documentation/publish/add-on-policies/ ）。
- Safari：App Store Review Guidelines 2.5.2 禁止下载、安装、执行会引入或改变功能的代码，本地导入有解释空间，未验证。
- 先例：Automa（JSON workflow 导入，带条件和循环，MV3 在架）、UI.Vision RPA（宏支持 if/while）、uBO Lite（本地自定义过滤放开，远程收紧）。

## 5. 不走 scripted tier 的原因

- AMO 原文：「Usage of the `userScripts` API is allowed for user script managers only」，并且「cannot be used to extend or modify the functionality of the user script manager itself」。Voyager 不是脚本管理器。
- Chrome：只允许运行用户自己提供的脚本，不能通过目录分发第三方 JS。Chrome 138 起需要用户为每个扩展单独打开「Allow User Scripts」开关；Safari 没有等价 API。
- 能成立的只有「用户自行导入 JS，仅支持 Chrome/Edge」这一种形态，粗估 14–20 工程日，用户门槛高，目前没有需求证据。
- 顺带发现：`src/features/plugins/capabilities.ts:19` 在 content script 里检测 `chrome.userScripts`，而 content script 访问不到这个 API，所以检测结果恒为 false。目前 scripted 插件都会被跳过，没有实际影响，本轮不修。
  - 后记（703581ed）：已解决，`capabilities.ts` 已删除。
