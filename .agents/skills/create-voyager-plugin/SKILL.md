---
name: create-voyager-plugin
description: Create or change a Voyager declarative plugin, site adapter, or native primitive.
metadata:
  version: '1.3.0'
---

# Create a Voyager plugin

## Select the path

Read only the matching implementation reference. Paths are relative to `src/features/plugins/`.

| Change                                                 | Reference                                       | Distribution                                                            |
| ------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------- |
| CSS/JSON plugin using DOM ops or an existing primitive | [Declarative plugin](references/declarative.md) | `catalog/sites/<site>/plugins/<id>/`; bundled and remote                |
| Site selectors, theme, URL matching or a new site      | [Site adapter](references/site-adapter.md)      | `catalog/sites/<site>/site.json`; existing-site updates travel remotely |
| Behavior needing events, state or generated DOM        | [Native primitive](references/primitive.md)     | `verbs/`; packaged executable code, requires an extension release       |

A new site also requires host permission and content-script registration in an extension release. A primitive needs a declarative plugin that invokes it, so read that reference too when adding the caller.

New features follow `.github/CONTRIBUTING.md`; a new primitive or site requires explicit maintainer approval of the approach. Reuse a direct maintainer instruction in the current task as approval; loading this skill grants none. A selector fix within an existing site's approved scope needs no new feature approval.

For architecture or distribution changes, read `src/features/plugins/README.md` and `.github/docs/PLUGIN_DISTRIBUTION_PLAN.md`. PR preparation uses `voyager-contribute`; live checks use `verify-in-browser` (Safari loading uses `update-safari-extension`).

## Shared constraints

- Every injected class is `gv-` prefixed; plugin-scoped classes are
  `gv-plugin-<site>-<id>`. Nothing leaks to the host page unscoped.
- CSS loads nothing, not even from the page's origin: no `@import`, no
  `image-set()` / `image()` / `cross-fade()` / `src()`, `url()` only with a
  `#fragment` or a raster `data:` URI (`image/png`, `jpeg`, `gif`, `webp`,
  `avif`, `bmp`, icon; never `data:image/svg+xml`, in any encoding, since an SVG
  filter resource can load images), and no string that starts with an external URL
  (`--u:"//…"`), in the sheet, a `setStyle` value or a `style` attribute.
  `validateStyleCss` rejects the rest.
- `setAttribute` names are an allowlist: `data-*`, `aria-*`, `title`, `role`,
  `lang`, `dir`, `hidden`, `tabindex`, `draggable`, `spellcheck`, `translate`,
  `style`. Values may not contain an external URL. Use `addClass` for classes.
- Prefer a semantic key over a raw selector:
  `{ "kind": "semantic", "key": "userTurn" }`. Raw selectors are for what the
  vocabulary cannot name, and they are the first thing to break on a redesign.
- A plugin's `matches` stays inside its site's `matches` (D18).
  `catalog:build` fails otherwise. Patterns are read as Chrome reads them:
  `*.example.com` needs a subdomain (the apex host is outside it) and `*://`
  means http or https only; the build and the runtime agree, so a pattern that
  passes the build also resolves a site.
- `conversationIdPattern`, in `site.json` or as a `turnNavigator` param, is a
  plain anchored capture such as `^/c/([^/?#]+)`: no lookarounds or
  backreferences, no repeated group that holds a quantifier or `|`, at most
  eight quantifiers and 200 characters. It runs on the page's main thread
  against every URL, so the gate (`sites/safeRegex.ts`) refuses anything that
  can backtrack.
- `requires.handlers` lists every primitive the plugin invokes, and `engine`'s
  minimum is at least each primitive's `sinceEngine`. That ordering is the
  point: an old build then says "update Voyager" (`needs-engine`) instead of
  `needs-handler`, which is left meaning a real configuration mistake.
- Ten locales. English lives in the top-level `name` / `description`; the other
  nine sit under `i18n.<locale>` with `name`, `description`, `changelog` when
  set, and a label for every setting.
- `marketplace.json` gets the entry, and the plugin directory gets a `README.md`
  next to the manifest. A test enforces both.
- `params` is configuration, not instructions (plan §5, C1): no conditions, no
  ordering, no code. A selector-valued parameter such as `yieldWhen` is still
  data, so do not reject one on its name.
- Themes come from the site, not from guesswork: `site.json`'s `theme` block
  records the host, light and dark selectors. Check both. That block is the
  **only** place a host's own dark-mode dialect is ever named:
  `pages/content/platformTheme/scheme.ts` resolves it once and stamps
  `html[data-gv-scheme='light'|'dark']` plus `html[data-gv-platform='<siteId>']`.
- So scope every light/dark rule — in plugin CSS and in `contentStyle.css` — with
  `html[data-gv-scheme='…']`, never with the host's class (`html.dark`,
  `body.dark-theme`, `:root:not(.dark)`). Get `theme` right and a new site
  inherits every existing Voyager surface with no theme CSS of its own.
  `contentStyleTheme.test.ts` fails on a host dialect that slips back in.
- Accent likewise: `brandColor` in `site.json` (or a plugin's `theme.brand`)
  becomes `--gv-pm-brand`, `--gv-pm-brand-fg` and `--gv-pm-brand-h` on the root.
  Voyager UI that should carry the site's colour reads
  `oklch(L C var(--gv-pm-brand-h, var(--gv-pm-brand-h-default)))`, never a
  literal — a hard-coded hue is how the Vim HUD stayed Gemini green on DeepSeek.
  A rule for one platform only keys off `html[data-gv-platform='<id>']`;
  `gv-platform-themed` means "some brand applies" and three sites share it.
- Never hand-edit `dist_*` or `docs/public/catalog`; `catalog:build` writes the
  published catalog.

## Write your own plugin locally

A declarative plugin for personal use needs no PR, catalog entry or release. Write `plugin.json` and its `.css` as the [declarative reference](references/declarative.md) describes, then in the popup open **Local plugins** (on Claude, ChatGPT and DeepSeek it is on the plugin page; on Gemini and AI Studio it is the last entry of the settings) and use **Import files** (manifest plus its `.css` files) or **Paste JSON** (CSS inlined).

- The id is stored as `local.<id>`. Local plugins never replace an official id, are merged last and are outside the remote kill switch.
- The gate is the remote catalog's (`validateManifest`, CSS and rendered-sink guards) plus: `tier: "declarative"` only; `native` ops only for shipped primitives, with params that fit `verbs/contracts.ts` and `engine` at or above their `sinceEngine`; and `matches` inside an existing plugin platform (Claude, ChatGPT, DeepSeek) or a native surface (Gemini, AI Studio). No plugin-supplied JS, ever.
- Gemini and AI Studio accept only local plugins (official plugins and the online catalog never target them). Semantic keys resolve through the native adapters (`userTurn`, `assistantTurn`, `composer`, `sidebar`); `theme` is rejected there because those pages keep Voyager's accent, and `native` ops are rejected because the timeline, formula copy and Vim already run there natively: CSS and reversible DOM ops only. No permission prompt: the manifest already injects these hosts. The page still makes zero catalog requests. Example that tightens your own turns on Gemini:

  ```json
  {
    "id": "me.gemini-compact-turns",
    "name": "Compact Gemini turns",
    "version": "1.0.0",
    "description": "Tighter spacing between my messages",
    "author": "me",
    "category": "readability",
    "license": "MIT",
    "engine": ">=1.0.0",
    "tier": "declarative",
    "matches": ["https://gemini.google.com/*"],
    "contributes": {
      "styles": [{ "css": ".gv-plugin-compact-turn{margin-block:4px!important}" }],
      "domOps": [
        {
          "op": "addClass",
          "target": { "kind": "semantic", "key": "userTurn" },
          "className": "gv-plugin-compact-turn"
        }
      ]
    }
  }
  ```

- A rejected import lists `path: message` and keeps the installed version. An accepted import lands disabled with an inspect view of its sites, CSS size, page changes, primitives and settings; enable it from the plugin list. To update, edit and re-import: the new version also lands disabled, so re-inspect and turn it back on. A plugin with a `native` op that was running keeps its mounted version until the page reloads (D7).
- Export downloads the manifest with CSS inlined; that file is also the starting point for an official contribution, after renaming the id out of `local.` and moving it into `catalog/sites/<site>/plugins/<id>/`.
- Manifests stay on the device (no Drive backup yet); export to keep a copy.

Implementation: `src/features/plugins/local/` and the "Write your own plugin locally" section of `src/features/plugins/README.md`.

## Verification and completion

Use the selected path's validators and focused tests during implementation. Before a code PR, run `bun run verify:pr` on the final tree per `AGENTS.md`; reuse covered results for unchanged inputs. Run `catalog:build` for catalog/contract changes and inspect its generated diff. Keep the evidence tied to the final changed files; later relevant edits invalidate it.

The PR needs:

- A screenshot or recording on a real conversation in both light and dark themes. Record the site and approximate conversation length; redact conversation/account details from shared evidence.
- The submitted directory's `plugin:check` output and the target selector match count, measured in the page (for example `document.querySelectorAll('<selector>').length`). For pure CSS without countable targets, use visible before/after evidence.
- For a primitive, passing contract tests and parametric tests against two sites' fixtures.

Confirm the intended extension/catalog version is loaded before collecting evidence. A plugin target count of zero while the adapter's `userTurn` matches is the `no-effect` failure (`runtime/healthMonitor.ts`, design D12); investigate missing selectors. Pure-CSS plugins are not tracked by this counter.

Complete when the selected path's requirements pass and a reviewer can see the real behavior in both themes. Apply the affected-browser requirements in [browser-testing.md](../voyager-contribute/references/browser-testing.md) when preparing a contribution. If coverage is unavailable, report the gap and owner; it remains pending.
