# Migrating the Safari Extension

::: warning One-time manual step
Starting with **v1.6.0**, the Safari host app is renamed from "**Gemini Voyager**" to "**Voyager**". macOS identifies apps by name, so installing the new version straight away leaves it side by side with the old app, which can cause a duplicate extension or confusing behavior. Do this swap once and automatic updates continue as usual afterward.
:::

## Your data is safe

The app's Bundle ID has not changed. Your folders, prompt library, cloud sync, and all settings are preserved. This step only replaces the app itself — it never touches your data.

## Migration steps

1. **Quit Safari completely** (press `⌘Q` inside Safari, not just close the window).
2. Open **Finder → Applications** and drag the old "**Gemini Voyager.app**" to the Trash.
3. Open the newly downloaded DMG and drag "**Voyager.app**" into **Applications**.
4. Reopen Safari → **Settings → Extensions** and enable "**Voyager Extension**".

## Two things not to do

- ❌ **Don't keep both apps.** If you leave the old "Gemini Voyager.app" in place, the two extensions will conflict.
- ❌ **Don't click "Uninstall" for the old extension inside Safari's Extensions pane.** That points back to the old app and makes things messier. Just drag the old app to the Trash as in step 2.

## After that

Once you've done this one swap, future Safari releases update the new "Voyager" through the built-in auto-updater (Sparkle) — no more manual swapping.

Questions? Let us know on [GitHub Issues](https://github.com/Nagi-ovo/voyager/issues).
