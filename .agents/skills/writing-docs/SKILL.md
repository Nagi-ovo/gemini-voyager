---
name: writing-docs
description: Sets the standard for Voyager's guide pages and their screenshots. Use when editing or adding a page under docs/guide/ or any locale's docs/<lang>/guide/, or when taking or replacing a docs screenshot.
metadata:
  version: '1.0.0'
---

# Writing a guide page

Voyager runs on several AI sites and gains more. A page describes a feature once, with the site differences carried by data, so a new site needs no prose edit. `docs/guide/folders.md` is the reference page.

## Shape

1. One page per feature, never per platform. Open with one or two plain sentences on what it does for the person.
2. Right after the intro, `<SiteSupport feature="<id>" :labels="{ … }" />` (`docs/.vitepress/theme/components/SiteSupport.vue`). Its rows and ticks come from shipped code through `docs/.vitepress/siteSupport.ts`: the feature's own row from the plugin table (`pluginsPage.ts` `featureRows`), then the capability rows in `FEATURE_CAPABILITIES`. The page only supplies row labels; an unlabelled row shows its id.
3. A capability that differs by site gets a row in `FEATURE_CAPABILITIES`, derived from code data (plugin manifests, `catalog/sites/<site>/site.json`, popup allowlists). Trace where it is wired before adding one. Never write a hand-ticked table. When no data can say it, add one "Only on" bullet under the table naming the sites, and say so in your report.
4. Sections by operation (filing, nesting, import/export, …), not by platform. Short sentences, no marketing filler, no em-dash asides.
5. Every claim is checked against code before it is written. Quote UI labels from `src/locales/<lang>/messages.json` exactly. Drop or fix anything stale rather than carrying it over.
6. Zh (`docs/guide/`) and en are written natively. The other 8 locales are translated naturally from en with the same structure, links to their own locale's pages, and the same images.

## Screenshots

```
- [ ] Exactly one in-page screenshot answering "where is it"
- [ ] At most one element-only crop per operation, of Voyager's own component
- [ ] Taken live from the dev build (verify-in-browser), light theme, about 2x
- [ ] Saved under docs/public/assets/ with a descriptive name; -zh and -en variants when the crop has text
- [ ] zh and zh_TW use -zh, every other locale uses -en
- [ ] Privacy check passed (below); images no page references are removed
```

For 2x clarity, set `document.documentElement.style.zoom = '2'` before `zoom` + `save_to_disk`; floating menus may then render off-screen, so move the menu with inline `inset` and put a temporary white backdrop behind it. Undo both afterwards.

**Privacy, a hard rule.** These images are public and the browser is the owner's real account. A crop shows no real conversation titles, account names, avatars or emails. Crop tightly to the Voyager component. Where a crop needs folders, use a site whose folder bucket you can save and restore, write demo folders with neutral names ("Research", "Writing", "Travel"; "研究", "写作", "旅行" for zh), show folder rows only, never chat rows, then restore the original bucket exactly and confirm it. Never file, rename, delete, pin or send anything of the host's. Restore every setting you changed through the dev settings bridge, including `language`. If an image cannot be taken without private content, keep the existing asset or skip it and say so.

## Verify

`bun run docs:build` (it fails on dead links), `bunx oxfmt --check` on changed files, and the `docs/.vitepress/*.test.ts` tests when `siteSupport.ts` changes. Then run `bun run docs:dev`, open the zh and en pages, and capture the rendered page in light and dark (VitePress theme toggle) so the owner sees the real site.
