---
name: update-safari-extension
description: Safely build, reload, install, and verify Voyager's Safari web extension without disturbing extension storage, permissions, or the user's signed app. Use for Safari UI or runtime testing, refreshing dist_safari after TypeScript or CSS changes, testing Swift or native messaging changes, diagnosing stale Safari resources, or validating a signed direct-distribution build.
---

# Update Safari Extension

Use the least invasive route that can test the change. Treat a successful build and a successful live Safari check as separate evidence.

## 1. Inspect before changing Safari

1. Run `git status --short --branch` and preserve unrelated work.
2. Identify the runtime route, not only the source language:
   - TypeScript, React, CSS, manifest, or bundled assets that stay inside the web extension: use the temporary-extension route.
   - Any feature that calls `browser.runtime.sendNativeMessage`, plus Swift, entitlements, Sparkle, signing, or packaging: use the containing-app route.
3. Inspect Safari Settings > Developer/Extensions before touching registration. Record whether Voyager is temporary or app-installed and whether it is enabled.
4. Do not replace `/Applications/Voyager.app`, change signing, or modify provisioning profiles unless the user explicitly asks to test the signed app. Treat `/Applications/Gemini Voyager.app` as a legacy installation path and never remove it automatically.

## 2. Default route: web-extension changes

1. Run:

   ```sh
   bun run build:safari
   ```

   This builds `dist_safari` and runs the repository's Safari resource verification.

2. In Safari Settings > Developer > Temporary Extensions:
   - If Voyager is already listed, click **Reload**.
   - If it is absent, choose **Add Temporary Extension…** and select `dist_safari`.
3. Reload the target Gemini, AI Studio, ChatGPT, or Claude tab once so its content script is current.
4. Open the Voyager popup and test the changed behavior.

Temporary extensions are the normal local UI-development path. Safari removes them after 24 hours or when Safari quits; re-add `dist_safari` instead of converting the test into a signed installation.

Do not use this route to validate native messaging. A temporary extension cannot launch Voyager's containing-app handler, so iCloud sync, Safari Google Drive authorization, and native notifications require the native route even when the calling code is TypeScript.

## 3. Native route: Swift or app integration

1. Run `bun run build:safari` first so the Xcode resources are current.
2. Build the tracked Xcode project with Apple Development signing. Allow Xcode to refresh the local development profile and register the current Mac when needed:

   ```sh
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

3. Before opening the app, make sure macOS will not route the extension or custom URL to an older development copy:

   ```sh
   CURRENT_APP="$PWD/.build/safari-native-test-derived/Build/Products/Debug/Voyager.app"
   ps -axo pid=,command= | rg '/(Gemini Voyager|Voyager)\.app/Contents/MacOS/'
   pluginkit -m -A -D -v -i com.yourCompany.Gemini-Voyager.Extension
   ```

   The expected result is one current `Voyager.app` process at most and exactly one enabled extension path inside `$CURRENT_APP`. If an old app under a known `.build` or DerivedData directory appears, quit only that development process, unregister that exact stale app path, and register the current app again:

   ```sh
   LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
   "$LSREGISTER" -u "<exact-known-stale-development-app-path>"
   "$LSREGISTER" -f "$CURRENT_APP"
   ```

   Re-run both read-only checks before continuing. Never bulk-reset LaunchServices, and never unregister or remove an app in `/Applications` without explicit permission.

4. Run the Debug containing app from Xcode when the change needs native messaging or app/extension interaction. Apple documents Product > Build as the normal macOS extension update path and Product > Run for installing the containing app.
5. Use the Debug app explicitly. Do not test an unnotarized Developer ID Release build in Safari; release validation must use the notarized CI artifact.
6. Confirm Safari still shows exactly the intended Voyager entry and that it remains enabled. Test the native action and the corresponding web behavior.

For first-time Safari Google Drive authorization, click **Connect Google Drive** in the extension popup. That user gesture opens the containing app through its custom URL scheme; Google Sign-In then continues in the user's default browser. Return to Safari and run the sync action again. Do not try to launch the containing app from `SafariWebExtensionHandler` with `NSExtensionContext.open`; the Safari extension point may reject it even though native messaging itself is healthy.

Use `scripts/build-safari-release.sh` only for a release or explicit signed-distribution test. Do not use release installation as the routine CSS/TypeScript refresh loop.

## 4. Runtime verification checklist

Report the highest tier actually proven:

1. **Build:** `bun run build:safari` passes.
2. **Artifact:** the expected JS/CSS/resource exists in `dist_safari` and the Xcode bundle wiring check passes.
3. **Loaded:** Safari shows the intended temporary or containing-app extension, enabled once, without an unexpected duplicate.
4. **Live behavior:** the popup/page visibly shows the changed UI or behavior after reloading the target tab.
5. **State safety:** pre-existing cards/settings remain visible; do not interpret a missing card as successful loading.

For a popup-only change, capture or inspect the popup after reload. For a content-script change, reload the website before testing. For a background/native change, close and reopen the popup after the extension update.

A popup opened as a standalone tab is useful for native-transport testing, but it has no Gemini source-tab account scope. Do not use that setup to validate successful highlight sync or other source-tab-scoped behavior; it is only suitable for checking that optional account-scoped data is skipped without blocking the base sync. Validate actual highlight upload or restore from the toolbar popup over a freshly reloaded Gemini tab.

Safari may dismiss a toolbar popover before an accessibility-driven button click reaches the web content. Do not record that dismissal as a product failure or a successful action. Use the standalone page only for non-scoped transport/fallback checks; use a real click in the toolbar popover for account-scoped behavior.

## 5. Recovery and guardrails

- Never use `pluginkit -r`, `pluginkit -a`, or manual unregister/register as a normal reload method. These are recovery tools for switching an exact old app/extension path to an exact new one while Safari is closed. Afterward, verify that exactly one intended plugin path is active.
- Never delete Safari extension containers, preferences, storage, or permissions to fix a stale build.
- Never change the bundle identifier or version merely to defeat development caching.
- Never print or commit signing identities, provisioning-profile contents, Keychain data, Apple account details, notarization credentials, or CI secret values. Refer only to environment-variable names already documented by the repository.
- Keep generated apps, archives, DerivedData, and signed release artifacts out of the commit unless the repository explicitly tracks that artifact.
- Avoid launching copies from Archives, backup folders, mounted disk images, or old DerivedData. Multiple apps with the same bundle identifier can produce duplicate Safari rows or make the custom URL scheme open the wrong containing app.
- When native launch or custom URL routing is wrong, first inspect LaunchServices and `pluginkit` read-only. Unregister only known stale app paths; never delete app data, extension containers, preferences, or permissions.
- If clicking a native notification opens an old updates/status window or reports **Safari Extension Unavailable**, inspect the launched process path first. This usually means LaunchServices selected a stale containing-app copy; it is not evidence that the notification bridge or the repository rename failed.
- If a reload looks stale, first verify the built asset, use Safari's own **Reload** control, reload the target tab, and reopen the popup.
- If a feature disappears, stop. Preserve the installed app and extension data, return to the previously working extension route, and verify the feature before continuing.
- Use `pluginkit -mAvvv -p com.apple.Safari.web-extension` only as read-only diagnosis. Prefer exact app paths over display names or bundle identifiers when several development copies exist. Escalate to targeted registration changes only with explicit user approval and a recovery plan.

Do not claim that Safari loaded the latest build unless the live behavior or a build-specific visible marker was checked in Safari.
