# Safari DMG Sub-Workflow

Safari is the odd platform out: the extension ships as a **macOS app bundled inside a signed DMG**, not a webstore upload. This sub-workflow handles building that DMG and uploading it to the GitHub release.

Previously this lived as a standalone `safari-release` skill; it's now merged into the release skill so the full release flow has one owner.

## Prerequisites

- **Full Xcode.app** (not just Command Line Tools). Check with `xcodebuild -version` — if it fails with "requires Xcode, but active developer directory ... is a command line tools instance", bail out and tell the user to either install Xcode.app or defer the Safari DMG to a later machine.
- Apple Developer ID for signing (one-time setup on the machine).
- Sparkle EdDSA private key in macOS Keychain under account `Nagi-ovo` (one-time setup; Sparkle does not require an account).
- `create-dmg` installed (`brew install create-dmg`).
- `gh` authenticated to the repo.

## Steps

### 1. Read the target version

Get `VERSION` from `package.json`:

```bash
VERSION=$(node -e "console.log(require('./package.json').version)")
```

### 2. Verify the Xcode project version matches `package.json`

This should already have been synced back in **SKILL Step 2** (right after `bun run bump`). Verify it here — only fix if it's still stale (e.g. the release was interrupted before Step 2 finished).

The Xcode project's `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` drift from `package.json` because `bun run bump` only touches `package.json` + `manifest*.json`. Safari users see `MARKETING_VERSION` as the app version, so they must match before archiving.

Check current values in `Gemini Voyager/Gemini Voyager.xcodeproj/project.pbxproj`:

```bash
grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION" "Gemini Voyager/Gemini Voyager.xcodeproj/project.pbxproj" | sort -u
```

Expect 4 distinct lines. The main app + Extension targets (Debug + Release each, 8 occurrences total) share one version that must match `VERSION`. The two Tests targets (`Gemini-VoyagerTests`, `Gemini-VoyagerUITests`) use `MARKETING_VERSION = 1.0;` / `CURRENT_PROJECT_VERSION = 1;` — **do not touch these**, they're internal and unrelated.

If the main/extension version is stale (e.g. `1.4.0` when `package.json` says `1.4.2`), update both fields. Using the Edit tool with `replace_all` is safe because the Tests target values don't collide:

```
replace_all: "CURRENT_PROJECT_VERSION = {OLD};" → "CURRENT_PROJECT_VERSION = {NEW};"
replace_all: "MARKETING_VERSION = {OLD};" → "MARKETING_VERSION = {NEW};"
```

Verify afterwards — the sort -u output should show the new version alongside the untouched `1.0` / `1` Tests values.

If Xcode was already open, reopen it so the new build settings take effect (archives silently use the stale value otherwise).

### 3. Build Safari bundle with update-check enabled

```bash
ENABLE_SAFARI_UPDATE_CHECK=true bun run build:safari
```

The env var flips the extension to check for updates via the repo's release page (needed since there's no Safari Extensions Gallery for us). If the build fails, stop and report.

Verify the flag actually compiled into the Safari bundle before opening Xcode. The generated helper should return `true` for Safari update reminders:

```bash
node - <<'NODE'
const fs = require('fs');
const dir = 'dist_safari/assets';
const file = fs.readdirSync(dir).find((name) => name.startsWith('watermarkSettings-') && name.endsWith('.js'));
if (!file) throw new Error('Missing dist_safari/assets/watermarkSettings-*.js');
const source = fs.readFileSync(`${dir}/${file}`, 'utf8');
if (!source.includes('try{return!0}catch{return!1}')) {
  throw new Error('Safari update reminder is not enabled in the compiled bundle');
}
console.log(`Safari update reminder enabled in ${file}`);
NODE
```

If this fails, do not archive. Fix the Vite env injection first; otherwise the Safari release will ship without update reminders even though the build command included `ENABLE_SAFARI_UPDATE_CHECK=true`.

### 4. Verify bundle IDs and signing identity

Do this before archiving. Confirm the bundle IDs match what shipped users already have installed.

```bash
grep -E "PRODUCT_BUNDLE_IDENTIFIER|DEVELOPMENT_TEAM" "Gemini Voyager/Gemini Voyager.xcodeproj/project.pbxproj"
```

Expected bundle IDs — the **placeholder** `com.yourCompany` IDs, NOT `fun.nagi.*`:

- App: `com.yourCompany.Gemini-Voyager`
- Extension: `com.yourCompany.Gemini-Voyager.Extension`
- Team: `PJM828YBFJ`

⚠️ **Do NOT "clean up" these to `fun.nagi.voyager`.** Every shipped Safari build has used the `com.yourCompany.Gemini-Voyager` bundle ID, so existing users are installed under it. Changing the bundle ID changes the app identity — macOS then treats the new build as a *different* app and existing users cannot update in place (they'd end up with two copies). Backward-compat beats tidy IDs. If the project somehow shows `fun.nagi.voyager`, revert both the app and extension `PRODUCT_BUNDLE_IDENTIFIER` entries to the `com.yourCompany.Gemini-Voyager` / `.Extension` placeholders before archiving.

Confirm the Developer ID identity exists:

```bash
security find-identity -v -p codesigning
```

Expect `Developer ID Application: Zexi Zhang (PJM828YBFJ)`. If it isn't present, stop; the DMG can be built but won't be properly signed for distribution.

### 5. Archive and export from CLI

Use the `Any Mac` destination. In `xcodebuild`, that is `generic/platform=macOS`; it produces a universal app instead of binding the archive to the current machine.

```bash
ARCHIVE="/tmp/gemini-voyager-v${VERSION}.xcarchive"
DERIVED="/tmp/gemini-voyager-v${VERSION}-derived"

xcodebuild archive \
  -project "Gemini Voyager/Gemini Voyager.xcodeproj" \
  -scheme "Gemini Voyager" \
  -configuration Release \
  -destination 'generic/platform=macOS' \
  -archivePath "$ARCHIVE" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates
```

Export as a Developer ID app:

```bash
EXPORT="/tmp/gemini-voyager-v${VERSION}-export"
OPTIONS="/tmp/gemini-voyager-v${VERSION}-exportOptions.plist"

cat > "$OPTIONS" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>developer-id</string>
  <key>destination</key>
  <string>export</string>
  <key>teamID</key>
  <string>PJM828YBFJ</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>signingCertificate</key>
  <string>Developer ID Application</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>distributionBundleIdentifier</key>
  <string>com.yourCompany.Gemini-Voyager</string>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT" \
  -exportOptionsPlist "$OPTIONS" \
  -allowProvisioningUpdates
```

Replace the DMG source app with the exported app. Move the old app aside first; don't merge app bundles in place, because stale files can survive and invalidate signatures.

```bash
DEST="safari/Models/dmg_source/Gemini Voyager.app"
if [ -e "$DEST" ]; then
  mv "$DEST" "/tmp/gemini-voyager-v${VERSION}-old-dmg-source.app"
fi
cp -R "$EXPORT/Gemini Voyager.app" "safari/Models/dmg_source/"
```

### 6. Verify the exported app

```bash
APP="safari/Models/dmg_source/Gemini Voyager.app"

/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/PlugIns/Gemini Voyager Extension.appex/Contents/Info.plist"
lipo -info "$APP/Contents/MacOS/Gemini Voyager"
codesign --verify --deep --strict --verbose=2 "$APP"
node scripts/verify-release-privacy.mjs "$APP"
```

Expected:

- App bundle ID: `com.yourCompany.Gemini-Voyager`
- Extension bundle ID: `com.yourCompany.Gemini-Voyager.Extension`
- Version/build: `VERSION`
- Architectures: `x86_64 arm64`
- `codesign` says `valid on disk` and `satisfies its Designated Requirement`

In Codex sandboxed shells, `codesign` may falsely report `Authority=(unavailable)` / invalid signature because trust services are blocked. Re-run the same command with elevated/unsandboxed execution before treating it as a real signing failure.

`spctl --assess` may still report `Unnotarized Developer ID`; notarization is separate from the existing DMG flow. Don't claim notarization unless you ran `notarytool` and stapled the ticket.

### 7. Build the DMG

```bash
cd safari/Models && create-dmg \
  --volname "Gemini Voyager" \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "Gemini Voyager.app" 175 190 \
  --app-drop-link 425 190 \
  "voyager-v${VERSION}.dmg" \
  dmg_source
```

Icon position `175 190` and app-drop-link `425 190` match the prior releases' DMG layout. Don't invent new values — users who drag-install by muscle memory will expect the icon in roughly the same place.

Verify the DMG and packaged app:

```bash
hdiutil verify "safari/Models/voyager-v${VERSION}.dmg"

MOUNT=$(mktemp -d /tmp/gemini-voyager-dmg-mount.XXXXXX)
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT" "safari/Models/voyager-v${VERSION}.dmg"
codesign --verify --deep --strict --verbose=2 "$MOUNT/Gemini Voyager.app"
hdiutil detach "$MOUNT"
```

`create-dmg` and `hdiutil attach/verify` may require an unsandboxed shell because they need macOS disk image device access.

### 8. Notarize and staple (required — or Gatekeeper warns)

CLI `xcodebuild -exportArchive` (method=developer-id) signs but does **not** notarize. An un-notarized DMG makes users hit *"Apple could not verify 'Gemini Voyager.app' is free of malware"* on first open. Notarize before uploading. (Xcode's GUI "Distribute App → Direct Distribution" notarizes automatically — that was the old manual path; this replaces it headlessly.)

A `notarytool` keychain profile named `voyager-notary` is stored on the release machine. If it's missing, create it once — the maintainer runs this so the password never reaches the agent or the repo:

```bash
# one-time; app-specific password from appleid.apple.com → Sign-In and Security → App-Specific Passwords
xcrun notarytool store-credentials "voyager-notary" --apple-id <apple-id> --team-id PJM828YBFJ --password <app-specific-password>
```

Then submit → staple → rebuild:

```bash
# 1. submit the signed DMG; --wait blocks until Apple returns "status: Accepted" (~1-3 min)
xcrun notarytool submit "safari/Models/voyager-v${VERSION}.dmg" --keychain-profile "voyager-notary" --wait

# 2. staple the ticket to the APP (not just the DMG) so a copied-to-/Applications app passes offline
xcrun stapler staple "safari/Models/dmg_source/Gemini Voyager.app"
xcrun stapler validate "safari/Models/dmg_source/Gemini Voyager.app"

# 3. rebuild the DMG from the now-stapled app (same create-dmg command as step 7)
```

Submitting the DMG notarizes the enclosed app's cdhash, so you can staple the app directly afterwards — no separate app submission. `notarytool`/`stapler` need network + keychain access; run unsandboxed if the shell blocks keychain reads.

Verify before uploading — mount the rebuilt DMG and assess the app inside:

```bash
MOUNT=$(mktemp -d /tmp/gv-notary.XXXXXX)
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT" "safari/Models/voyager-v${VERSION}.dmg"
spctl -a -t exec -vvv "$MOUNT/Gemini Voyager.app"     # must say: accepted / source=Notarized Developer ID
xcrun stapler validate "$MOUNT/Gemini Voyager.app"    # must say: The validate action worked!
hdiutil detach "$MOUNT"
```

Only upload once `spctl` reports `Notarized Developer ID`. `spctl -t open` on the DMG itself may say "no usable signature" (create-dmg leaves the DMG unsigned) — that's fine; the stapled app inside is what Gatekeeper checks.

### 9. Generate the signed Sparkle feed

Generate the feed only from the final notarized DMG. The private key stays in Keychain; only its public signature is written to `appcast.xml`.

```bash
APPCAST="/tmp/appcast.xml"
scripts/generate-sparkle-appcast.sh \
  "safari/Models/voyager-v${VERSION}.dmg" \
  "v${VERSION}" \
  "$APPCAST"
xmllint --noout "$APPCAST"
grep -q 'sparkle:edSignature=' "$APPCAST"
node scripts/verify-release-privacy.mjs "$APPCAST"
```

If the signature is missing, stop. This normally means the packaged app does not contain `SUPublicEDKey`, or the Sparkle private key is unavailable in Keychain.

### 10. Upload to the GitHub release

```bash
gh release upload v${VERSION} \
  safari/Models/voyager-v${VERSION}.dmg \
  /tmp/appcast.xml \
  --clobber
```

`--clobber` overwrites existing release assets when re-signing or rebuilding.

### 11. Verify

```bash
gh release view v${VERSION} --json assets --jq '.assets[].name'
```

Confirm `voyager-v${VERSION}.dmg` and `appcast.xml` are in the list alongside the Chrome/Firefox assets.

## If Xcode isn't available on this machine

The release can still ship — Chrome/Firefox users won't block on it, and Edge users should install via the Chrome Web Store build. Tell the user:

> Xcode isn't installed here, so I can't build the Safari DMG. The release v{VERSION} is live for Chrome/Firefox; Edge users should install from the Chrome Web Store. When you're on a machine with Xcode.app, run:
>
> ```bash
> # sync Xcode project version to match package.json first (bun run bump doesn't touch pbxproj)
> # edit "Gemini Voyager/Gemini Voyager.xcodeproj/project.pbxproj":
> #   MARKETING_VERSION / CURRENT_PROJECT_VERSION → {VERSION}
> #   (leave the Tests targets' 1.0 / 1 alone)
> ENABLE_SAFARI_UPDATE_CHECK=true bun run build:safari
> # then follow the CLI archive/export + create-dmg steps above
> scripts/generate-sparkle-appcast.sh safari/Models/voyager-v{VERSION}.dmg v{VERSION} /tmp/appcast.xml
> gh release upload v{VERSION} safari/Models/voyager-v{VERSION}.dmg /tmp/appcast.xml --clobber
> ```

Historical precedent (v1.3.9) had the Safari DMG land ~12 hours after the main release. That's acceptable — Safari users are a small subset and the delay doesn't break their existing install since the extension is already running locally.
