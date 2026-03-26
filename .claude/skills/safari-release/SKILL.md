---
name: safari-release
description: Build Safari extension with update check enabled, guide user through Xcode export, and create DMG for distribution. Use when user wants to release a new Safari version or create a Safari DMG.
user-invocable: true
---

# Safari Release Workflow

Build the Safari extension for manual distribution and create a signed DMG.

## Steps

### 1. Read version from package.json

Read `package.json` to get the current version number. Store it as `VERSION` for later steps.

### 2. Build Safari with update check enabled

Run the following command:

```bash
ENABLE_SAFARI_UPDATE_CHECK=true bun run build:safari
```

Wait for the build to complete successfully. If it fails, report the error and stop.

### 3. Prompt user for Xcode export

Tell the user:

> Safari build complete (`dist_safari/`). Please complete the following steps in Xcode:
>
> 1. Open the Xcode project (if not already open)
> 2. **Product → Archive**
> 3. **Window → Organizer** → select the archive → **Distribute App**
> 4. Export the signed `Gemini Voyager.app` into `safari/Models/dmg_source/`
>
> Let me know when you're done exporting.

**Wait for the user to confirm** before proceeding. Do NOT continue until the user says they're done.

### 4. Verify the exported app exists

Check that `safari/Models/dmg_source/Gemini Voyager.app` exists:

```bash
ls "safari/Models/dmg_source/Gemini Voyager.app"
```

If it doesn't exist, ask the user to check their export path.

### 5. Create DMG

Run `create-dmg` in the `safari/Models` directory:

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

### 6. Upload DMG to GitHub release

Upload the DMG to the existing GitHub release for the current version:

```bash
gh release upload v${VERSION} safari/Models/voyager-v${VERSION}.dmg --clobber
```

### 7. Verify and report

Confirm the DMG was uploaded and report success to the user.
