# Browser Loading and Smoke Testing / 浏览器加载与冒烟测试

This is the source of truth for browser verification in Voyager pull requests and releases. The PR owns the required evidence; the author may ask a maintainer with the required browser or macOS environment to complete a missing check.

本文档是 Voyager Pull Request 与发布版浏览器验证的权威参考。验证责任属于整个 PR；贡献者缺少相应浏览器或 macOS 环境时，可以请具备环境的维护者补测。

## Evidence levels / 证据等级

Never report a higher level than was actually proven. A build is not evidence that an extension loaded, and a loaded extension is not evidence that the feature works.

不得报告高于实际完成情况的等级。构建成功不代表扩展已加载，扩展已加载也不代表功能可用。

1. **Build / 构建**: the command succeeds and the expected artifact exists. / 命令成功，且预期产物存在。
2. **Loaded / 已加载**: the browser shows that exact artifact once, enabled, with no manifest or loading error. / 浏览器中仅出现一次该产物、处于启用状态，且没有清单或加载错误。
3. **Live behavior / 实际行为**: after reloading the target tab, the changed workflow visibly works and existing state remains intact. / 重载目标页面后，变更流程可见地工作，且原有状态未受损。

`Not run`, an AI inference, or a passing unit test must not be recorded as `Loaded` or `Live behavior`.

`未运行`、AI 推断或单元测试通过，均不得记为 `已加载` 或 `实际行为`。

## Risk matrix / 风险分级矩阵

| Level / 等级 | Typical changes / 常见改动                                                                                                                                                                   | Required before the PR is ready / PR 就绪前必须完成                                                                                                                                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R0**       | Documentation, comments, test-only changes with no runtime effect / 文档、注释、无运行时影响的纯测试改动                                                                                     | Relevant CI checks; browser rows may be `N/A` with a reason / 相关 CI；浏览器项可写明理由后标记 `N/A`                                                                                                                                                                                                                                       |
| **R1**       | Pure logic with no browser API or visible behavior change / 不涉及浏览器 API 或可见行为的纯逻辑                                                                                              | Relevant tests, typecheck, lint, and all four production builds / 相关测试、类型检查、Lint 与四浏览器生产构建                                                                                                                                                                                                                               |
| **R2**       | Popup, content script, background, shared CSS, manifest, storage behavior, or plugin runtime / 弹窗、内容脚本、后台、共享 CSS、清单、存储行为或插件运行时                                    | R1 plus Chrome and Firefox `Loaded` + `Live behavior`; test Edge separately for Chromium/manifest/permission/package changes; Safari-facing changes need the appropriate Safari route before merge / R1，并完成 Chrome、Firefox 加载与实际行为；Chromium、清单、权限或打包改动需单独实测 Edge；影响 Safari 的改动合并前须走对应 Safari 路径 |
| **R3**       | Browser-specific code, permissions, native messaging, Swift, signing, packaging, release, or official plugin changes / 浏览器专属代码、权限、原生消息、Swift、签名、打包、发布或官方插件改动 | Target browser `Loaded` + `Live behavior`, unaffected-browser builds, and any feature-specific regression check. Release candidates and cross-browser official plugins require all supported browsers / 目标浏览器加载与实际行为、其余浏览器构建，以及功能专属回归检查；发布候选与跨浏览器官方插件须覆盖全部受支持浏览器                    |

If a required environment is unavailable, record `Needs <browser> test`, assign an owner, and leave the check incomplete. Do not label an untested browser as unsupported merely from code inspection.

如果缺少必需环境，应记录 `Needs <browser> test`、指定补测人，并保持检查未完成。不得仅凭代码检查就把未测试浏览器标记为不支持。

These are review requirements, currently enforced by authors and reviewers through the PR evidence table. Automated builds do not certify `Loaded` or `Live behavior`.

这些是通过 PR 证据表由作者与审阅者执行的评审要求；自动构建不能证明 `已加载` 或 `实际行为`。

## Build and load procedures / 构建与加载步骤

Run the command for the artifact you will report. `bun run build:all` currently builds Chrome, Firefox, and Safari only; it is not Edge evidence.

必须运行与所报告产物相对应的命令。当前 `bun run build:all` 只构建 Chrome、Firefox 与 Safari，不能作为 Edge 证据。

### Chrome

```bash
# Routine development watcher / 日常开发监听
bun run dev:chrome
# Artifact / 产物: dist_chrome_dev

# Production verification / 生产构建验证
bun run build:chrome
# Artifact / 产物: dist_chrome
```

1. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the artifact directory above. / 打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，并选中上述产物目录。
2. After a rebuild, click **Reload** on Voyager, then reload the affected Gemini, AI Studio, ChatGPT, or Claude tab. / 重新构建后，在 Voyager 卡片点击“重新加载”，再刷新受影响的目标站点页面。
3. `bun run dev:chrome-open` may launch an isolated Chrome profile and reload the extension automatically, but the live workflow still needs manual verification. / 也可使用 `bun run dev:chrome-open` 启动隔离的 Chrome 配置并自动重载扩展，但仍须人工验证实际流程。

### Edge

```bash
bun run build:edge
# Artifacts / 产物:
#   dist_edge
#   voyager-edge-v<package-version>.zip
```

1. Open `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist_edge`. / 打开 `edge://extensions`，启用开发人员模式，选择“加载解压缩的扩展”，并选中 `dist_edge`。
2. After rebuilding, reload the extension card and the affected target tab. / 重新构建后，重载扩展卡片与受影响页面。
3. Chrome evidence does not replace Edge evidence when the change touches Chromium-only APIs, permissions, manifest generation, the removed `key` field, or store packaging. / 改动涉及 Chromium 专属 API、权限、清单生成、被移除的 `key` 字段或商店打包时，Chrome 证据不能代替 Edge 证据。

### Firefox

```bash
# Production verification / 生产构建验证
bun run build:firefox
# Artifact / 产物: dist_firefox

# Optional watcher; it writes the same directory and does not reload Firefox
# 可选监听；写入同一目录，但不会自动重载 Firefox
bun run dev:firefox
```

1. Open `about:debugging#/runtime/this-firefox`. / 打开 `about:debugging#/runtime/this-firefox`。
2. Choose **Load Temporary Add-on...** and select `dist_firefox/manifest.json`. / 选择“临时载入附加组件”，并选中 `dist_firefox/manifest.json`。
3. After rebuilding, click **Reload** for Voyager in `about:debugging`, then reload the affected target tab. / 重新构建后，在 `about:debugging` 中重载 Voyager，再刷新受影响页面。
4. A temporary add-on is removed when Firefox exits; load it again for the next session. / Firefox 退出后会移除临时附加组件，下次测试需重新加载。

### Safari: WebExtension route / Safari：Web 扩展路径

Use this default route for TypeScript, React, CSS, manifest, popup, content-script, background, or bundled-asset changes that do not require native messaging.

不需要原生消息的 TypeScript、React、CSS、清单、弹窗、内容脚本、后台或打包资源改动，默认使用此路径。

```bash
bun run build:safari
# Artifact / 产物: dist_safari
# The command also verifies Xcode resource wiring / 同时验证 Xcode 资源连接
```

1. In **Safari Settings > Developer > Temporary Extensions**, click **Reload** if Voyager is present; otherwise choose **Add Temporary Extension...** and select `dist_safari`. / 在“Safari 设置 > 开发者 > 临时扩展”中，已有 Voyager 时点击“重新加载”；否则选择“添加临时扩展”并选中 `dist_safari`。
2. Confirm exactly one intended Voyager entry is enabled. / 确认仅有一个预期的 Voyager 条目且已启用。
3. Reload the affected target tab once, reopen the toolbar popup, and test the changed behavior. / 刷新受影响页面一次，重新打开工具栏弹窗并验证改动。

Temporary extensions are for web-layer testing only. They cannot validate iCloud sync, Safari Google Drive authorization, native notifications, or any `browser.runtime.sendNativeMessage` flow.

临时扩展只验证 Web 层，不能验证 iCloud 同步、Safari Google Drive 授权、原生通知或任何 `browser.runtime.sendNativeMessage` 流程。

### Safari: Native route / Safari：原生路径

Use this route for Swift, entitlements, native messaging, app/extension integration, iCloud, native Google Drive authorization, and native notifications.

Swift、Entitlements、原生消息、App/扩展集成、iCloud、原生 Google Drive 授权及原生通知必须使用此路径。

```bash
bun run build:safari

xcodebuild \
  -project "Voyager/Voyager.xcodeproj" \
  -scheme "Voyager" \
  -configuration Debug \
  -destination "platform=macOS,arch=$(uname -m)" \
  -derivedDataPath .build/safari-native-test-derived \
  -clonedSourcePackagesDirPath .build/sparkle-source-packages \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build
```

1. Run the **Debug** containing app from Xcode. / 从 Xcode 运行 **Debug** 容器 App。
2. Before testing, inspect the active process and registration paths: / 测试前检查活动进程与注册路径：

   ```bash
   CURRENT_APP="$PWD/.build/safari-native-test-derived/Build/Products/Debug/Voyager.app"
   ps -axo pid=,command= | rg '/(Gemini Voyager|Voyager)\.app/Contents/MacOS/'
   pluginkit -m -A -D -v -i com.yourCompany.Gemini-Voyager.Extension
   ```

3. Require at most one current Voyager process and exactly one enabled extension path inside `$CURRENT_APP`; stop and diagnose duplicates before testing. / 当前 Voyager 进程最多一个，且启用的扩展路径必须唯一并位于 `$CURRENT_APP` 内；存在重复项时应停止并先诊断。
4. Exercise the native action and its corresponding web behavior. A successful Xcode build or visible notification alone is insufficient. / 必须同时验证原生动作与对应 Web 行为；仅 Xcode 构建成功或通知可见不算通过。

Do not delete Safari containers, preferences, storage, or permissions to fix a stale build. Do not replace or unregister an app in `/Applications` during routine PR testing.

不得通过删除 Safari 容器、偏好设置、存储或权限来处理缓存问题。常规 PR 测试不得替换或注销 `/Applications` 中的 App。

### Safari: Release route / Safari：发布路径

Use this route only for signing, notarization, packaging, Sparkle, migration, or release-candidate validation.

仅签名、公证、打包、Sparkle、迁移或发布候选验证使用此路径。

1. Use the notarized CI artifact `voyager-vX.Y.Z.dmg`; do not treat an unsigned local Release build as release evidence. / 使用 CI 生成并已公证的 `voyager-vX.Y.Z.dmg`；未签名的本地 Release 构建不能作为发布证据。
2. On an approved test Mac, install the DMG, enable Voyager in **Safari Settings > Extensions**, and confirm there is exactly one intended entry. / 在获准的测试 Mac 上安装 DMG，在“Safari 设置 > 扩展”中启用 Voyager，并确认只有一个预期条目。
3. Run the baseline smoke plus every changed native flow, then verify launch, update/migration behavior when in scope. / 执行统一冒烟与所有改动的原生流程；涉及启动、更新或迁移时一并验证。

## Baseline smoke / 统一冒烟检查

For every required browser, record the highest evidence level and check:

每个必测浏览器都应记录最高证据等级，并检查：

- The expected artifact is loaded once, enabled, and has no manifest/load error. / 预期产物只加载一次、已启用，且无清单或加载错误。
- The Voyager popup opens; the changed control or status is visible when applicable. / Voyager 弹窗可打开；适用时能看到改动的控件或状态。
- After reloading the target tab, the primary changed workflow succeeds on every affected site. / 刷新目标页后，主要改动流程在每个受影响站点均成功。
- Popup, background/service-worker, and page consoles show no new relevant error. / 弹窗、后台或 Service Worker、页面控制台无新增相关错误。
- Reloading the extension and page does not duplicate UI, listeners, styles, or notifications. / 重载扩展与页面不会重复注入 UI、监听器、样式或通知。
- Existing settings, cards, folders, and other stored data remain intact. / 原有设置、卡片、文件夹及其他存储数据保持完整。
- No unexpected permission prompt appears; `<all_urls>` remains optional. / 不出现意外权限提示；`<all_urls>` 仍为可选权限。
- Visual changes are checked in light and dark themes; account-scoped changes preserve `/u/<index>/...` when applicable. / 视觉改动检查浅色与深色主题；涉及账号范围时保留 `/u/<index>/...`。

Use the feature-specific checks in `.github/docs/REGRESSION_NOTES.md` when the changed area has a recorded regression.

改动区域存在历史回归记录时，还须执行 `.github/docs/REGRESSION_NOTES.md` 中对应的专项检查。

## PR evidence / PR 证据格式

Paste a table like this into the PR. Use one row per browser; do not hide missing coverage behind a combined “Chrome/Edge” row.

在 PR 中粘贴如下表格。每个浏览器独立一行，不得用合并的“Chrome/Edge”条目掩盖缺失覆盖。

```markdown
Commit tested: <full-or-short-sha>

| Browser / version | OS       | Command -> artifact                       | Highest level | Scenario and result              | Evidence               |
| ----------------- | -------- | ----------------------------------------- | ------------- | -------------------------------- | ---------------------- |
| Chrome 000        | OS 00    | `bun run build:chrome` -> `dist_chrome`   | Live behavior | <workflow>: Pass                 | <screenshot/video/log> |
| Edge 000          | OS 00    | `bun run build:edge` -> `dist_edge`       | Loaded        | Enabled; no load error: Pass     | <evidence>             |
| Firefox 000       | OS 00    | `bun run build:firefox` -> `dist_firefox` | Not run       | Needs Firefox test; owner: @name | —                      |
| Safari 00         | macOS 00 | `bun run build:safari` -> `dist_safari`   | N/A           | Docs-only change                 | —                      |
```

For UI or behavior changes, attach a screenshot or recording after verification. Redact account data, conversation text, tokens, signing identities, and full native-notification handoff URLs.

UI 或行为改动应附验证后的截图或录屏。必须遮盖账号数据、对话内容、令牌、签名身份及完整的原生通知跳转 URL。

## Official plugin checks / 官方插件额外检查

Changes under `src/features/plugins/catalog/`, bundled catalog mappings, or builtin/native plugins are **R3**.

`src/features/plugins/catalog/`、Bundled Catalog 映射或 Builtin/Native 插件改动均属于 **R3**。

- Verify the plugin appears exactly once in Plugin Manager from the intended bundled source, including with the remote marketplace unavailable. / 确认插件从预期的内置来源在插件管理器中只出现一次；远程市场不可用时仍可加载。
- Confirm it ships disabled by default unless an existing migration explicitly says otherwise. / 除非已有迁移明确规定，否则确认插件默认关闭。
- Enable, disable, re-enable, and reload the target tab; state must persist and CSS, UI, listeners, and native handlers must mount and tear down without duplication. For an installed build, reopen the browser too; for a temporary Firefox or Safari extension, reopen the browser, reload the same temporary artifact, and then verify state. / 依次启用、禁用、再次启用并刷新目标页；状态应持久化，CSS、UI、监听器与原生处理器挂载和清理时不得重复。已安装版本还须重启浏览器；Firefox 或 Safari 临时扩展则在重启后重新加载同一临时产物，再验证状态。
- Test every declared target site and confirm unrelated sites are unchanged. Builtin JS plugins must verify both start and stop paths. / 测试所有声明的目标站点，并确认无关站点不受影响；Builtin JS 插件须同时验证 start 与 stop 路径。
- Check visual CSS plugins in light and dark themes at narrow and wide layouts. / 视觉 CSS 插件须在浅色、深色主题及窄、宽布局下检查。
- Do not grant a plugin direct `<all_urls>` access; custom-site access must remain an explicit optional user grant. / 不得给插件直接授予 `<all_urls>`；自定义站点访问必须保持为用户显式授予的可选权限。
- Before merge, collect `Live behavior` evidence on Chrome, Edge, Firefox, and Safari for every browser the plugin supports. Missing hardware may be covered by another contributor, but it may not be marked passed. / 合并前，插件支持的 Chrome、Edge、Firefox 与 Safari 均须收集实际行为证据；缺少设备时可由其他贡献者补测，但不得提前标记通过。
