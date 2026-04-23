# Safari DMG Sub-Workflow

Safari is the odd platform out: the extension ships as a **macOS app bundled inside a signed DMG**, not a webstore upload. This sub-workflow handles building that DMG and uploading it to the GitHub release.

Previously this lived as a standalone `safari-release` skill; it's now merged into the release skill so the full release flow has one owner.

## Prerequisites

- **Full Xcode.app** (not just Command Line Tools). Check with `xcodebuild -version` — if it fails with "requires Xcode, but active developer directory ... is a command line tools instance", bail out and tell the user to either install Xcode.app or defer the Safari DMG to a later machine.
- Apple Developer ID for signing (one-time setup on the machine).
- `create-dmg` installed (`brew install create-dmg`).
- `gh` authenticated to the repo.

## Steps

### 1. Read the target version

Get `VERSION` from `package.json`:

```bash
VERSION=$(node -e "console.log(require('./package.json').version)")
```

### 2. Sync Xcode project version to match `package.json`

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

### 4. Xcode export (manual user step)

Tell the user:

> Safari bundle built (`dist_safari/`). Now do the Xcode export:
>
> 1. Open the Xcode project (if not already open).
> 2. **Product → Archive**
> 3. **Window → Organizer** → select the new archive → **Distribute App**
> 4. Export the signed `Gemini Voyager.app` into `safari/Models/dmg_source/`
>
> Let me know when you're done.

**Wait for confirmation.** Don't proceed until the user says done. This step requires Xcode GUI interaction and can't be scripted reliably.

### 5. Verify the export landed

```bash
ls "safari/Models/dmg_source/Gemini Voyager.app"
```

If the file is missing, ask the user to check their export path (Xcode sometimes saves to a default archive folder instead of the prompt-specified path).

### 6. Build the DMG

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

### 7. Upload to the GitHub release

```bash
gh release upload v${VERSION} safari/Models/voyager-v${VERSION}.dmg --clobber
```

`--clobber` overwrites if a DMG with the same name already exists (useful when re-signing or rebuilding).

### 8. Verify

```bash
gh release view v${VERSION} --json assets --jq '.assets[].name'
```

Confirm `voyager-v${VERSION}.dmg` is in the list alongside the Chrome/Firefox assets.

## If Xcode isn't available on this machine

The release can still ship — Chrome/Firefox/Edge users won't block on it (Chrome + Firefox are on the GitHub release; Edge users update via the Edge Add-ons store). Tell the user:

> Xcode isn't installed here, so I can't build the Safari DMG. The release v{VERSION} is live for Chrome/Firefox; Edge ships via its own store. When you're on a machine with Xcode.app, run:
>
> ```bash
> # sync Xcode project version to match package.json first (bun run bump doesn't touch pbxproj)
> # edit "Gemini Voyager/Gemini Voyager.xcodeproj/project.pbxproj":
> #   MARKETING_VERSION / CURRENT_PROJECT_VERSION → {VERSION}
> #   (leave the Tests targets' 1.0 / 1 alone)
> ENABLE_SAFARI_UPDATE_CHECK=true bun run build:safari
> # then follow the Xcode export + create-dmg steps
> gh release upload v{VERSION} safari/Models/voyager-v{VERSION}.dmg --clobber
> ```

Historical precedent (v1.3.9) had the Safari DMG land ~12 hours after the main release. That's acceptable — Safari users are a small subset and the delay doesn't break their existing install since the extension is already running locally.
