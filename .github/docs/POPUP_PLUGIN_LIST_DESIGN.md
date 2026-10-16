# Popup plugin list for official plugins: design

Status: proposal, no code changed. Base: `main@a7408277`. Written in English (the brief's language); sibling plans in this folder are Chinese.

**Goal.** Each optional Voyager feature is an official plugin, switched on or off in one place: the popup's plugin list. Core data features (folders, Prompt Manager, cloud sync, conversation export, backup, account isolation) stay native and keep their cards.

**Summary of the design.**

1. The popup already holds the state the list needs. `usePopupPlugins` keeps a live `gvPluginsState` map and a live legacy-key snapshot, and resolves the effective enable flag and settings for diagnostics (`src/pages/popup/hooks/usePopupPlugins.ts:90-111`, `:198-219`). The list row should read that same view. The missing piece is a **write path**: legacy-bound ids write their sync keys, every other id writes `gvPluginsState`.
2. Gemini and AI Studio get one **Plugins** card: grouped rows, filtered by the existing search box, with the same row component everywhere. A row's simple values are manifest settings shown inline. Anything else goes into a small **Options** panel taken from a trusted popup registry.
3. Migration moves rows one batch at a time, and old and new rows never coexist. No value is copied into `gvPluginsState`, so every user's settings stay exactly as they are.

---

## 1. Current state

### 1.1 How the popup is organised per site

| Site                        | What the popup shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini                      | The search box (`src/pages/popup/Popup.tsx:235`), health notice, update banner and storage card. After them come 21 reorderable sections, in the saved order or in `NATIVE_POPUP_SECTION_IDS` (`src/pages/popup/utils/nativeSiteCapabilities.ts:5-28`). The order is persisted in `gvPopupSectionOrder` (`src/pages/popup/hooks/usePopupSections.ts:168-186`). The `plugins` section id exists but is always hidden (`usePopupSections.ts:122`). Local plugins get their own collapsed section (`Popup.tsx:474-487`). It filters to local ids only (`src/pages/popup/components/NativeLocalPluginsSection.tsx:30`).                                                                                                                                                   |
| AI Studio                   | The same surface through an allowlist (`nativeSiteCapabilities.ts:39-57`): cloud sync, local plugins, a subset of folder, folder spacing, sidebar width, visual effect, formula copy, the `enterSend` row of the input card, and subsets of Prompt Manager and General. A master switch card sits on top (`Popup.tsx:261-290`). Turning it off unmounts every plugin on the page (`src/features/plugins/runtime/surfaceSwitch.ts:1-9`).                                                                                                                                                                                                                                                                                                                               |
| ChatGPT / Claude / DeepSeek | Plugin-site mode (`src/pages/popup/utils/siteMode.ts:22-34`), with no search box. Shows cloud sync where folders run (`Popup.tsx:292-296`), then `PluginSiteSettings`: the ChatGPT export card, the per-site Prompt Manager switch, prompt transfer, and **one `PluginManager` listing official, catalog and local plugins together**, followed by the import panel (`src/pages/popup/components/PluginSiteSettings.tsx:41-90`). On a site whose rail offers style or levels, the Timeline card and shortcuts card are shown too, and the duplicated rail fields are hidden from the row (`Popup.tsx:183-194`, `:334-355`, `:411-413`; `src/pages/popup/components/PluginManager.tsx:29-59`). Visual effects appear once the site is activated (`Popup.tsx:380-389`). |

The generic row controls in `PluginManager` read and write `gvPluginsState` only (`src/pages/popup/components/usePluginPreferences.ts:20-34`, `:69-99`; `src/pages/popup/utils/pluginEnablement.ts:98-108`). Legacy-bound official plugins ignore their entries there (`src/features/plugins/storage/legacySettingBindings.ts:5-10`). Removing the local-only filter would therefore show switches that do nothing.

The old cards hydrate once from one bulk read and do not follow storage changes (`src/pages/popup/hooks/usePopupSettingsHydration.ts:57-74`). If one switch is shown in two places, the second copy goes stale within the same popup session, so duplicates are not a safe transition state.

### 1.2 Where each migrated feature is switched today

26 feature ids map to 27 site entries (`src/features/plugins/sites/featureOwners.ts:92-291`). Formula Copy has one Gemini entry and one AI Studio entry. Paths below drop the `src/pages/popup/` prefix.

| Feature (official id `voyager.…`)   | Switch today                                                                   | Advanced controls / special flow                                                                                                                                                                                                                                           | Write path today                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Timeline (`gemini-timeline`)        | `components/TimelineSettingsCard.tsx:70`                                       | Style, scroll mode, hide container, draggable, pin preview, levels, reset position and starred history (`TimelineSettingsCard.tsx:80-229`). Message timestamps (`:183`) belongs to a separate, not yet migrated feature.                                                   | `hooks/useTimelinePopupSettings.ts:62-92`                                                               |
| Prevent auto-scroll                 | `TimelineSettingsCard.tsx:161`                                                 | none                                                                                                                                                                                                                                                                       | `useTimelinePopupSettings.ts:83`                                                                        |
| Draft save                          | `components/InputSettingsCard.tsx:185`                                         | Status note (`Popup.tsx:425`)                                                                                                                                                                                                                                              | `hooks/useInputPopupSettings.ts:61-76`                                                                  |
| Ctrl+Enter send (G), Enter send (A) | `InputSettingsCard.tsx:122` (one row, label and key picked per site)           | Status note (`Popup.tsx:426-430`)                                                                                                                                                                                                                                          | same                                                                                                    |
| Safari Enter fix                    | `InputSettingsCard.tsx:162`, **Safari only**                                   | none                                                                                                                                                                                                                                                                       | same                                                                                                    |
| Vim input                           | `InputSettingsCard.tsx:100`                                                    | Status note (`Popup.tsx:424`)                                                                                                                                                                                                                                              | `useInputPopupSettings.ts:69` (`legacyEnableWrite`)                                                     |
| Input collapse                      | `InputSettingsCard.tsx:49`                                                     | "Collapse when not empty" sub-switch, shown only when on (`:76-99`)                                                                                                                                                                                                        | `useInputPopupSettings.ts:61-76`                                                                        |
| Formula copy (G + A)                | `components/FormulaCopySettings.tsx:46`                                        | Format radios (`:69-95`) and scope note (`:45`). **One switch and one format for both sites** (`hooks/useFormulaCopyPopupSettings.ts:7-8`).                                                                                                                                | `Popup.tsx:195-212`                                                                                     |
| Chat width                          | `components/PopupLayoutSettings.tsx:172` (WidthSlider with toggle)             | Percent slider; an unset switch follows a customised width (`hooks/usePopupLayoutSettings.ts:22-31`)                                                                                                                                                                       | `usePopupLayoutSettings.ts:68-90`, `:268-273` (direct `chrome.storage.sync.set`)                        |
| Chat font size                      | `PopupLayoutSettings.tsx:189`                                                  | Slider                                                                                                                                                                                                                                                                     | `usePopupLayoutSettings.ts:95-101`, `:275-280`                                                          |
| Chat line height                    | `PopupLayoutSettings.tsx:206`                                                  | Line-height and paragraph-spacing sliders (`:221-228`)                                                                                                                                                                                                                     | `usePopupLayoutSettings.ts:108-127`, `:282-287`                                                         |
| Mermaid / WaveDrom / ECharts        | `components/GeneralSettingsCard.tsx:109`, `:116`, `:123`                       | none                                                                                                                                                                                                                                                                       | `hooks/useGeneralPopupSettings.ts:282-320`; `useWaveDromPopupSettings.ts`, `useEchartsPopupSettings.ts` |
| Code collapse / User LaTeX          | `GeneralSettingsCard.tsx:130`, `:137`                                          | none                                                                                                                                                                                                                                                                       | same                                                                                                    |
| Quote reply                         | `GeneralSettingsCard.tsx:144`                                                  | none                                                                                                                                                                                                                                                                       | same                                                                                                    |
| Highlight                           | `GeneralSettingsCard.tsx:151`                                                  | "Timeline markers" sub-switch (`:158`, default on). The runtime reads the key itself, live (`src/pages/content/highlight/highlightAction.ts:57-61`).                                                                                                                       | same                                                                                                    |
| Response notification               | `GeneralSettingsCard.tsx:166`                                                  | **Permission flow.** Chrome hands off intent before the first await, Firefox makes the permission request the first await, Safari uses the native app (`useGeneralPopupSettings.ts:119-157`, `:228-274`). Hint text differs on Safari (`GeneralSettingsCard.tsx:171-173`). | `useGeneralPopupSettings.ts:228-274`                                                                    |
| Usage status / Hide input halo      | `GeneralSettingsCard.tsx:202`, `:209`                                          | Halo is inverted: `true` hides it, which means the feature is on (`legacySettingBindings.ts:147-152`)                                                                                                                                                                      | `useGeneralPopupSettings.ts:307`                                                                        |
| Default model / Research pack       | `GeneralSettingsCard.tsx:216`, `:101` (experimental)                           | none                                                                                                                                                                                                                                                                       | `useGeneralPopupSettings.ts:282-320`                                                                    |
| Fork                                | `components/FolderSettingsCard.tsx:123-133` (experimental), inside a core card | none                                                                                                                                                                                                                                                                       | `hooks/useFolderPopupSettings.ts:100-101`                                                               |
| Prompt history                      | `components/PromptManagerSettingsCard.tsx:65-75`, inside a core card           | none                                                                                                                                                                                                                                                                       | `hooks/usePromptManagerSettings.ts:27`                                                                  |

The "locate setting" hints point at these cards. When a local plugin is blocked by an official one, `pluginBlockedNote` names the official plugin's _card and switch_ (`components/pluginBlockedNote.ts:63-82`) through `officialSettingLocation` (`components/officialFeatureSetting.ts:16-26`, nine features). Notes under the old rows explain when a local plugin is running the feature instead (`components/OfficialFeatureStatus.tsx:24-45`, wired at `Popup.tsx:200-208`). No coachmark targets a popup card (`src/pages/content/coachmark/` has no popup reference).

---

## 2. Target UX

### 2.1 Principles

- **One switch per feature, and it is the row.** No feature keeps a second switch in a card.
- **Fixed order.** Rows never move when they are toggled, so the user's spatial memory holds.
- **A row stays small until it is on.** Options appear only for an enabled plugin, which matches `PluginManager.tsx:288-300` today.
- **Search, not nesting.** The existing search box finds rows; groups are plain headings and do not collapse.

### 2.2 Gemini (end state for the 26 migrated features)

```
┌──────────────────────────────────────────┐
│ Voyager                               ◐  │
│ [ Search settings…                    ]  │
│ ┌ Cloud sync ──────────────────────────┐ │
│ ┌ Storage ─────────────────────────────┐ │
│ ┌ Folders ─────────────── (no Fork) ───┐ │
│ ┌ Prompt Manager ──── (no history) ────┐ │
│ ┌ Plugins ───────────────────────── ▲▼ ┐ │
│ │ Turn Voyager features on or off.     │ │
│ │ Options appear when a feature is on. │ │
│ │                                      │ │
│ │ APPEARANCE                           │ │
│ │ Chat Width                     [●━]  │ │
│ │ Widen the conversation as a share…   │ │
│ │ Chat width (%)                  70   │ │
│ │ Narrow ├────────●──────┤ Wide        │ │
│ │ ──────────────────────────────────── │ │
│ │ Chat Font Size                 [━○]  │ │
│ │ Set the text size of chat messages…  │ │
│ │ ──────────────────────────────────── │ │
│ │ CONTENT                              │ │
│ │ Formula Copy                   [●━]  │ │
│ │ Click a formula to copy it…          │ │
│ │ › Options                            │ │
│ │ ──────────────────────────────────── │ │
│ │ CONVERSATION                         │ │
│ │ Timeline                       [●━]  │ │
│ │ Navigate long chats from a rail…     │ │
│ │ ⏸ Paused on this page: your local    │ │
│ │   plugin "My rail" already does this │ │
│ │ › Options                            │ │
│ └──────────────────────────────────────┘ │
│ ┌ Local plugins ──────────────────── ▾ ┐ │
│ ┌ General ───── (export bar, notices) ─┐ │
│ ┌ Keyboard shortcuts ──────────────────┐ │
└──────────────────────────────────────────┘
```

**Groups** come from a trusted popup table, not from the manifest. Manifest `category` is `readability` or `productivity` for all 26, and the docs plugin table reads it too. Rows keep a fixed order within each group:

| Group        | Rows now (Gemini)                                                                                                  | Joins later                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Appearance   | Chat width, Chat font size, Line height and spacing, Hide input halo                                               | Edit input width, Sidebar width, Auto-hide, Full hide, Gems sidebar, Visual effects |
| Content      | Code collapse, Formula copy, LaTeX in your messages, Mermaid, WaveDrom, ECharts                                    | Markdown fix, Canvas copy as Markdown, Deep Research menu                           |
| Input        | Input collapse, Ctrl+Enter to send, Safari Enter fix (Safari), Vim mode, Draft save, Prompt history, Quote reply   | none yet                                                                            |
| Conversation | Timeline, Prevent auto-scroll, Highlights, Fork, Research pack, Default model, Usage status, Response notification | Message timestamps, Context Sync, Batch delete, NanoBanana (2 rows)                 |

That gives 25 rows on Gemini (24 on browsers without Safari's fix) and two on AI Studio.

**A row shows:**

```
Name  [Experimental]                      [switch]
One-sentence description (manifest, localized)
<status note, only when paused / waiting>
<manifest settings inline, only when on>
› Options   ← only when on and a custom panel exists
```

- The name and description come from the manifest. `displayName` already strips the `Gemini ·` prefix (`components/PluginIdentity.tsx:61-63`). Old card labels such as "Enable Mermaid diagram rendering" survive as search keys only.
- Packaged official rows (`isPackagedOfficialPluginId`, `featureOwners.ts:297-303`: the Gemini and AI Studio ids only, so `voyager.chatgpt-*` builtins keep theirs) **drop the provenance block**: no version, source label, homepage, changelog or "updated" badge (`PluginIdentity.tsx:209-275`). Those plugins update only with Voyager itself.
- Status notes reuse the row's existing `blockedPluginNote` with `conflictKey: 'officialFeaturePausedByLocal'`, which is what `OfficialFeatureStatus` passes today (`OfficialFeatureStatus.tsx:34-40`). Packaged ids never get `needs-*` or `host-policy` statuses (`OfficialFeatureStatus.tsx:32`), and their health monitor is off (`featureOwners.ts:84-89`). In practice the only notes are "paused by local" and "waiting".
- **Options** is a disclosure held in memory and closed by default. It opens on its own while a search query matches something inside it. No new storage key.
- The card description is new: `pluginsDescription` talks about site permissions and voyager.nagi.fun updates (en `messages.json`), which is wrong here. Adding one key (`pluginsNativeDescription`) means all 10 locales.

### 2.3 Search

Typing "ruler" or "字号" shows only the Plugins section, holding only the matching rows. A match inside Options opens it:

```
[ ruler                                 ]
┌ Plugins ──────────────────────────────┐
│ CONVERSATION                          │
│ Timeline                        [●━]  │
│ ▾ Options                             │
│   Style   ( Nodes | Ruler | Compact ) │
└───────────────────────────────────────┘
```

### 2.4 AI Studio

```
┌ Enable on AI Studio ─────────── [●━] ┐   ← master switch stays on top
┌ Plugins ─────────────────────────────┐
│ CONTENT                              │
│ Formula Copy                   [●━]  │
│ › Options  (format; "applies to      │
│            Gemini and AI Studio")    │
│ INPUT                                │
│ Enter to send                  [━○]  │
└──────────────────────────────────────┘
┌ Local plugins ───────────────────  ▾ ┐
```

The master switch keeps priority over every row (`surfaceSwitch.ts:1-9`). Rows stay editable while it is off, as cards are today.

### 2.5 ChatGPT, Claude, DeepSeek

No change in this project. Their list already shows official plugins with working toggles, because those ids are not legacy-bound. They get the new row component and the effective-state wiring for free, since unbound ids resolve exactly as before. A later follow-up registers the Timeline panel (§3.3) for their rails as well, then deletes `dedicatedTimelineSettings` and `DEDICATED_TIMELINE_SOURCES` (`PluginManager.tsx:23-59`, `Popup.tsx:183-194`).

### 2.6 Local plugins stay distinct

On Gemini and AI Studio, local plugins stay in their own collapsed **Local plugins** section with its import card (`NativeLocalPluginsSection.tsx:23-62`). Its default slot moves right below Plugins. Local rows keep the full `PluginIdentity`, with the "Local" label, version and review semantics (`pluginEnablement.ts:98-108`). `nameSources` lets a local row name the official plugin that holds a runtime, and that name now matches a visible row.

### 2.7 What stays in non-plugin cards (Gemini, end state)

Cloud sync and storage; Folders (minus Fork), folder spacing and tree indent; Prompt Manager (minus Prompt history); Keyboard shortcuts; General (persistent export toolbar, remote announcements with their permission CTA, changelog badge, and the disabled tab-title row). On AI Studio the master switch also stays. Context Sync, NanoBanana, visual effects and the remaining layout sliders keep their cards until their own migration. Each then leaves its card through the recipe in §5.

---

## 3. Architecture

### 3.1 One effective view, read and write

```
 gvPluginsState (local) ─┐
 legacy sync keys ───────┤ usePopupPlugins: pluginState + legacySettings (live, subscribe-then-read)
                         ▼
   effectivePluginView(manifest, state, legacy)                       ← one resolver
     enabled  = resolveEffectiveEnabled(state, legacy, id)            legacySettingBindings.ts:248
     settings = legacyBoundSettings(id, legacy)                       legacySnapshotFeed.ts:161
                ?? resolveEffectiveSettings(manifest, state)          legacySettingBindings.ts:269
     authority = legacyBindingFor(id) ? 'legacy' : 'plugin-state'
                         │
          ┌──────────────┼───────────────────────────┐
     diagnostics    plugin list row             (PluginHost already uses the
 (usePopupPlugins   (PluginManager)              same functions: isPluginWanted,
  .ts:90-111)                                    legacySnapshotFeed.ts:144-167)
```

**Read.** Extract the two lines diagnostics already runs (`usePopupPlugins.ts:99-106`) into `effectivePluginView` in `src/features/plugins/storage/`. Diagnostics, the list and the host then resolve through the same functions. The popup passes no `wasChangedLive`, so a derived switch (chat width, Safari fix) is read the same way the old popup read it (`usePopupLayoutSettings.ts:22-31`, `legacySettingBindings.ts:122-130`, `:164-174`).

**Write.** This is the only new mechanism:

| Write                                      | Bound id (`legacyBindingFor`)                                                             | Unbound id (local, plugin sites)                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Enable                                     | `writePopupSyncStorage(legacyEnableWrite(id, next))` (`legacySettingBindings.ts:281-285`) | `setPluginEnabled`, as today (`pluginEnablement.ts:106`) |
| Manifest setting backed by a value binding | new `legacyValueWrite(id, key, value)`: `{ [legacyKey]: binding.write(value) }`           | `setPluginSetting(s)`, as today                          |
| Manifest setting without a value binding   | not allowed: the contract test fails (§4.3)                                               | n/a                                                      |
| Anything a custom panel owns               | the panel's existing hook, unchanged                                                      | n/a                                                      |

Concrete changes:

- `legacyValueBindings.ts:36-45`: add `write: (value) => unknown` to `LegacyValueBinding`. Number bindings write their own normalize, which is what the old hooks did before `set` (`usePopupLayoutSettings.ts:76-88`, `:101`, `:114`, `:127`). Widen `read` from `number | boolean` to `PluginSettingValue`, so that a later enum (visual effects) needs no new type. Add `onUnlessFalse` boolean bindings beside `trueOnlyBinding` (`:61-64`) for runtime-consumed sub-switches that default on.
- `pluginEnablement.ts`: route `persistEnabled` (`:98-108`) and the two rollbacks (`:152`, `:167`) through one `writeEnabled(plugin, enabled)`. A bound id never reaches a host prompt: `pluginToOriginPatternsForActiveUrl` returns `[]` on statically injected hosts (`src/features/plugins/runtime/siteRegistration.ts:108`), and `pluginApiPermissions` only names the ChatGPT notification id (`pluginEnablement.ts:70-75`).
- `usePluginPreferences.ts`: `enabledMap` and `settingsMap` come from `effectivePluginView` and no longer from `gvPluginsState` alone (`:20-34`). `handleSetting` and `handleImmediateSettings` (`:69-99`) route by authority and keep the 200 ms debounce and flush-on-close (`:102-113`). Optimistic values sit in a small pending overlay that clears when the matching storage change arrives. The subscribe-then-read loader moves from `usePopupPlugins.ts:198-219` into a shared `useLegacySettingSnapshot` hook, so both callers use the same code.
- All popup writes go through `writePopupSyncStorage` (`utils/popupStorage.ts:4-18`). The direct `chrome.storage.sync.set` calls in the layout hook leave together with their adjusters.

**Invariant.** The list never writes `gvPluginsState` for a bound id, and no value is copied there. That keeps the order-independence promised at `legacySettingBindings.ts:5-10`.

### 3.2 Which controls a row gets

Use the simplest rule that holds:

| The control is…                                                                                                             | Declare it as                                                                        | Examples                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A scalar **the runtime takes as a plugin setting** (the handler has `updateSettings`, or a restart on change is acceptable) | Manifest `contributes.settings` + value binding, rendered inline by `PluginSettings` | Chat width, font size, line height and spacing (`legacyValueBindings.ts:71-85`); `collapseWhenNotEmpty` (`geminiInputCollapseManifest.ts:80-89`, `messageKeys` for the old wording) |
| Anything the runtime **reads from storage itself**, enums the schema can't carry yet, cross-site notes, action buttons      | Custom panel in the popup registry, behind **Options**                               | Timeline, Formula copy format and scope note, Highlight timeline markers                                                                                                            |
| An **enable flow** that is not a plain write (permissions)                                                                  | Control override in the registry                                                     | Response notification                                                                                                                                                               |

Why Highlight markers is a panel and not a value binding: the highlight runtime listens to that key itself (`highlightAction.ts:57-61`), and its handler has no `updateSettings` (`src/pages/content/pluginNativeRegistration.ts:87-88`). A bound value would push a settings change on every toggle, and the engine's default response is a full dispose and re-activate (`src/features/plugins/runtime/declarativeEngine.ts:351-358`). Timeline has the same shape (`pluginNativeRegistration.ts:39`).

**Registry.** New file `src/pages/popup/officialPlugins/officialPluginRegistry.ts`. It is data only, and the only place that knows popup presentation:

```ts
export type OfficialPluginGroup = 'appearance' | 'content' | 'input' | 'conversation';

export interface OfficialPluginEntry {
  readonly id: string; // OFFICIAL_PLUGIN_IDS.*
  readonly group: OfficialPluginGroup;
  /** Moved verbatim from the retired popupSettingsSearchIndex.ts entry. */
  readonly searchKeys?: readonly TranslationKey[];
  readonly searchAliases?: readonly string[];
  readonly experimental?: boolean;
  /** Row eligibility beyond `matches`, e.g. Safari-only. */
  readonly eligible?: (env: PopupEnv) => boolean;
  /** Key into OFFICIAL_PLUGIN_PANELS. */
  readonly panel?: OfficialPanelId;
  /** Key into the control overrides: the hook owns read + write of the switch. */
  readonly control?: OfficialControlId;
}
/** Array order = display order within a group. */
export const OFFICIAL_PLUGIN_ENTRIES: readonly OfficialPluginEntry[] = [...];
```

`officialPluginPanels.tsx` maps `OfficialPanelId` to a component. Each panel is the old card's JSX without its enable row. A panel receives `enabled` from the row's effective view; the old hook's own copy of the flag is not used. `TimelineSettingsCard.tsx:92`, `:116` and others disable controls from `values.timelineEnabled`, and that hook copy goes stale once the switch lives in the row. Panels keep using the hook owners that `Popup.tsx` already mounts (`Popup.tsx:105-141`). `Popup.tsx` passes them as one `officialControls` object built in a small `useOfficialPluginControls` hook, so `Popup.tsx` gets shorter overall.

### 3.3 The three special cases among the 26

- **Timeline.** Panel = `TimelineSettingsCard.tsx:80-229` without the enable row (`:70`), Prevent auto-scroll (`:161`, its own plugin) and message timestamps (`:183`, a separate feature). Reset position and starred history stay in it. Starred history also stays reachable while Timeline is off, through Storage → Manage → highlights (`Popup.tsx:217-226`).
- **Formula copy.** One panel serves both ids. It shows the format radios (`FormulaCopySettings.tsx:69-95`) and the scope note (`:45`). Both ids share `FORMULA_COPY_ENABLED` and the format key (`legacySettingBindings.ts:131-141`), so toggling on AI Studio flips Gemini too, and the note says so.
- **Response notification.** The override takes `{ enabled, setEnabled, hint }` from `useGeneralPopupSettings` and keeps its revision guards and the per-browser order (`useGeneralPopupSettings.ts:112-157`, `:228-274`). The row's `onChange` calls `setEnabled` **synchronously**, with no await before it, so Firefox still gets the permission request as the gesture's first await (`:250-251`).

### 3.4 Browser differences

- **Safari.** Safari Enter fix is listed only when `eligible` returns true there (it is shown today only on Safari, `InputSettingsCard.tsx:162`), and the binding's `derive` already checks `isSafari()`. The notification override uses the native-app permission (`useGeneralPopupSettings.ts:230-234`) and the Safari hint (`GeneralSettingsCard.tsx:171-173`). Icons come from `lucide-react` as in `NativeLocalPluginsSection.tsx:3`; no new Material Symbols glyphs.
- **Firefox.** No await may come before a permission request (`pluginEnablement.ts:134-136`, `useGeneralPopupSettings.ts:250`). Bound toggles request nothing.
- **Chrome and Edge.** The popup may close while a prompt is open. The notification override already persists intent first (`useGeneralPopupSettings.ts:247-249`). Host-access plugins on plugin sites keep `setPluginEnabledWithSiteAccess` unchanged.

### 3.5 Settings search and locate hints

- **Search targets.** `usePopupSections` takes extra items `officialPlugins:<pluginId>`, generated from manifests plus the registry. The corpus is the manifest name and description in every locale, setting labels, registry `searchKeys` and `searchAliases`, all through `buildSettingsSearchCorpus` (`utils/settingsSearch.ts:85-90`). Moving the old `keys` and aliases (for example `popupSettingsSearchIndex.ts:159-165`, "字号 字体") into `searchKeys` and `searchAliases` keeps every old query working. The list hides rows with `shouldShowSetting('officialPlugins', id)`.
- **Section.** A new section id `officialPlugins` takes the place of the always-hidden `plugins` (`usePopupSections.ts:122`, `nativeSiteCapabilities.ts:25`). In the default order it sits right before `localPlugins`, which moves next to it. Saved orders need no migration. `withMissingSections` inserts a new id after its default predecessor (`usePopupSections.ts:47-55`), and hydration drops ids that no longer exist (`:112-116`). The same filtering makes it safe to delete each per-feature section id later. AI Studio gets `officialPlugins: true` in its allowlist (`nativeSiteCapabilities.ts:39-57`). The `plugins` search entries (`popupSettingsSearchIndex.ts:299-313`) are retargeted.
- **Locate hints.** Each migration deletes that feature's `LOCATIONS` entry (`officialFeatureSetting.ts:16-26`). `pluginBlockedNote` then falls through to `pluginDisplayName` (`pluginBlockedNote.ts:73-75`, `:78-80`), which names a row the user can now see in the same popup. Once `LOCATIONS` is empty, delete the module, the `pluginBlockedByOfficialSetting` key in all 10 locales, and `OfficialFeatureStatus.tsx`.
- **From the page.** The default-model failure toast opens the popup (`src/pages/content/defaultModel/autoApply.ts:221-247`). Recommendation: before `gv.openPopup`, write the plugin's name to `gvPopupSettingsSearchQuery` in local storage, so the popup opens filtered to that row. The popup already restores this key (`usePopupSections.ts:82-99`). Coachmarks need no change.

### 3.6 Backup, restore, cloud sync

- **Legacy keys** are in `chrome.storage.sync`. They ride the settings backup and the Drive settings file with their existing defaults (for example `src/core/services/SettingsBackupService.ts:103`). The list follows them live, so a restore while the popup is open updates the rows, which the one-shot cards could not do.
- **`gvPluginsState`** has its own Drive file (`SettingsBackupService.ts:467-471`). It is ignored for bound ids and never written for them, so restoring settings and plugins in either order cannot disagree.
- **New official features without a legacy key** get a default-on **sync** enable key and a binding, as the audit recommends and as Code collapse and User LaTeX already do. Every Gemini and AI Studio official plugin then has a single authority (sync), and `gvPluginsState` stays for local plugins and plugin-site plugins.
- **Storage keys.** This design adds none. The Options disclosure lives in memory. `gvPopupSectionOrder` keeps its format.

---

## 4. Migration of the 26 existing features

### 4.1 Rules for every batch

- A batch moves **whole rows**: the registry entry is added, and the old row, its hook state, its `*_STORAGE_DEFAULTS` key, its search entry, its `LOCATIONS` entry and any section left empty are removed, all in one commit. One key never has two switches in the same popup (§1.1).
- Nothing is written on upgrade. Users keep their keys exactly as stored.
- Runtime code is untouched: these 26 already run as plugins, so every batch is a popup-only change.

### 4.2 Order

| Batch                                             | Moves                                                                                                                                                                                                 | Removed from the popup                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. List and simple booleans** (13)              | Infrastructure (§3.1, §3.5) plus Mermaid, WaveDrom, ECharts, Code collapse, User LaTeX, Quote reply, Usage status, Hide halo, Default model, Research pack, Prevent auto-scroll, Fork, Prompt history | 10 General rows (`GeneralSettingsCard.tsx:101-222`, keeping the export toolbar, announcements, changelog and tab title); `useWaveDromPopupSettings.ts`, `useEchartsPopupSettings.ts`; Prevent auto-scroll from the shared Timeline card (rails never offer it, `useCatalogTimelineSettings.ts:152-153`); Fork from Folders; Prompt history from Prompt Manager                                                               |
| **2. Input** (6)                                  | Input collapse (manifest sub-switch inline), Vim, Ctrl+Enter (G), Enter send (A), Safari fix (`eligible`), Draft save                                                                                 | `InputSettingsCard.tsx` and `useInputPopupSettings.ts` entirely; the `inputCollapse` section and its AI Studio allowlist entry; three `OfficialFeatureStatus` notes (`Popup.tsx:424-430`)                                                                                                                                                                                                                                    |
| **3. Appearance sliders** (3)                     | Chat width, Font size, Line height and spacing (manifest settings + `legacyValueWrite`)                                                                                                               | Three sections, their `VALUE_BADGE_SECTION_IDS` entries (`usePopupSections.ts:31-40`), and their adjusters and toggles in `usePopupLayoutSettings.ts`                                                                                                                                                                                                                                                                        |
| **4. Panels and flows** (4 ids, 3 rows on Gemini) | Formula copy G + A (panel), Highlight (markers panel), Response notification (override)                                                                                                               | `FormulaCopySettings.tsx`, `useFormulaCopyPopupSettings.ts`, the `formulaCopy` section, `Popup.tsx:195-212`; the Highlight, markers and notification rows in General                                                                                                                                                                                                                                                         |
| **5. Timeline** (1)                               | Timeline (panel)                                                                                                                                                                                      | `TimelineSettingsCard` on Gemini. On Gemini, "Show message timestamps" moves to the General card as a native row until that feature migrates; the shared card keeps the row for rails that offer it (`useCatalogTimelineSettings.ts:156-158`) (it must stay reachable while Timeline is off; today it is never disabled, `TimelineSettingsCard.tsx:183-193`). The `timeline` section stays for plugin-site rails until §2.5. |

The batches go from least to most coupled. Batch 1 proves both default polarities and the routed write path with no UI special cases. Batch 3 adds value writes, Batch 4 adds panels and permission flows, and Timeline comes last because it has the most controls.

### 4.3 Tests

Each batch extends one table-driven popup test (render `Popup` on Gemini, and on AI Studio where it applies):

- **Missing, false, true.** For each moved id, the row's switch equals what the page would run: `resolveEffectiveEnabled(state, legacy, id)`, the function `PluginHost` uses through `isPluginWanted` (`legacySnapshotFeed.ts:144-155`). Three cases need their own assertions: the inverted halo (`true` means on), input collapse treating a missing key as off (`legacySettingBindings.ts:59-60`, `:205-209`), and chat width (unset switch + customised width shows on).
- **Write shape.** Toggling writes exactly the old sync payload (for example `{ gvMermaidEnabled: false }`) and never calls `setPluginEnabled`, so `gvPluginsState` is unchanged. Sliders write the normalised value to the legacy key.
- **Cross-site and browser.** Formula copy toggled on AI Studio changes the Gemini row. Safari fix is absent off Safari. Notification denied leaves the row off, and on Firefox no await comes before the permission request.
- **Search.** Old queries still find their rows ("字号" finds Chat font size; "ruler" opens Timeline Options).
- **Saved order.** A stored order containing removed section ids hydrates with the remaining sections in the same relative order.
- **Contract test** (`officialPluginRegistry.test.ts`, a static contract, allowed by AGENTS.md): every registry id is a packaged official id and appears once. Every manifest setting of a bound id has a value binding unless the id has a panel. After Batch 5, every Gemini and AI Studio `FEATURE_OWNERS` entry has a registry entry.
- **Existing tests.** Move their assertions with the controls: `GeneralSettingsCard.test.tsx`, `InputSettingsCard.integration.test.tsx`, `PopupLayoutSettings.test.tsx`, `FormulaCopySettings.test.tsx`, `TimelineSettingsCard.test.tsx`, `OfficialFeatureStatus.test.tsx`, `NativeLocalPluginsSection.test.tsx`, `Popup.test.tsx`, `settingsSearch.test.ts`. Delete those that exist only for deleted components.

Each batch is a popup UI change, so it also gets a dev-build check with `verify-in-browser` (popup on Gemini and AI Studio, light and dark), then `verify:pr` on the final tree.

---

## 5. Recipe for each later migration

Example: **Edit input width** (`voyager.gemini-edit-input-width`). Runtime steps follow the audit; popup steps follow this design.

**Runtime** (unchanged pattern, see the Chat width template):

1. Manifest: `src/features/plugins/builtin/geminiEditInputWidthManifest.ts`, registered in `builtin/index.ts`, or a catalog `src/features/plugins/catalog/sites/gemini/plugins/<id>/plugin.json` for pure CSS.
2. Owner: `src/features/plugins/sites/featureOwners.ts` (id, `OwnedFeatureId`, entry).
3. Bindings: `src/features/plugins/storage/legacySettingBindings.ts` (enable, with `derive` if the switch depends on a customised value) and `legacyValueBindings.ts` (runtime-consumed values, with `read` **and** `write`). A feature with no old switch gets a new default-on sync key in `StorageKeys`, plus `SettingsBackupService.ts` defaults.
4. Handler: `src/pages/content/<feature>/pluginHandler.ts` (with `updateSettings` if it has value bindings), registered in `src/pages/content/pluginNativeRegistration.ts`. Admission at the original start point (for example `src/pages/content/appearanceStartup.ts`), with the native start removed.

**Popup** (the part this design makes mechanical):

5. Add an entry to `src/pages/popup/officialPlugins/officialPluginRegistry.ts`: group, position, and `searchKeys` and `searchAliases` moved from the feature's entry in `utils/popupSettingsSearchIndex.ts`. Add `eligible`, `experimental`, `panel` or `control` only when §3.2 calls for them.
6. Only if needed, add the panel to `officialPluginPanels.tsx`, reusing the old card JSX with `enabled` taken from props.
7. Delete the old surface: the row or `wrapSection` call (for Edit input width, `components/PopupLayoutSettings.tsx:231-247`); its state, adjuster and `*_STORAGE_DEFAULTS` key (`hooks/usePopupLayoutSettings.ts:42`, `:45`, `:134-155`, `:289-294`); the section id in `utils/nativeSiteCapabilities.ts`, the AI Studio allowlist and `VALUE_BADGE_SECTION_IDS`; the search entry; and any `officialFeatureSetting.ts` entry.
8. Locales: remove keys used only by the deleted row, in all 10 locales, and keep any key listed in `searchKeys` or a manifest's `messageKeys`. Run `bun run i18n:check`.
9. Tests: add the id to the missing/false/true table and move the card test's assertions. The contract test then checks the rest.
10. Docs: every locale copy of the feature's guide (`docs/*/guide/<feature>.md`) says "**Plugins** → **<name>**" instead of the card name. Today's wording names cards: `docs/en/guide/mermaid.md:18`, `send-behavior.md:23`, `timeline.md:20`, `:44`, `:93`.

Notes on the features still to migrate, from the audit:

- Auto-hide and full hide: two rows over one controller.
- Gems sidebar: count 0 must not turn into "on".
- AI Studio sidebar width: a new enable key, because the shared `gvSidebarWidthEnabled` is not what that runtime reads.
- Visual effects: an enum binding (§3.1), and one shared choice across sites.
- Context Sync: a panel holding port, status and Sync.
- NanoBanana: two rows following the resolver in `src/core/utils/watermarkSettings.ts`.

---

## 6. Risks and open questions

| #   | Question / risk                                                                                           | Recommendation                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Gemini has 25 rows now and about 38 after the next wave. Is it too long?                                  | Groups plus the existing search are enough. Don't add collapsible groups; reconsider only if the next wave makes a group exceed about 12 rows.                                                       |
| 2   | Row names come from manifests ("Chat Width") instead of old labels ("Enable Mermaid diagram rendering").  | Use manifest names everywhere (row, diagnostics, blocked notes, docs table). Old labels stay as search keys.                                                                                         |
| 3   | Options appear only when the plugin is on, while the old Timeline card showed disabled controls when off. | Show them only when on, which matches `PluginManager.tsx:288-300` and keeps the list short. Starred history stays reachable through Storage → Manage.                                                |
| 4   | Message timestamps needs a home when the Timeline card goes away.                                         | Park it as a native General row in Batch 5 and move it when it migrates. Don't block Timeline on that riskier migration.                                                                             |
| 5   | Formula copy is one switch for two sites.                                                                 | Keep it shared, with the scope note in the panel. Separate switches per site would be a product and data change, not part of this refactor.                                                          |
| 6   | Keyboard shortcuts relate to Timeline.                                                                    | Keep them as a separate card. They are global and drive catalog rails too (`Popup.tsx:410-413`).                                                                                                     |
| 7   | Plugin-site rails show the Timeline card next to their own row.                                           | Do it as a follow-up after Batch 5: register the Timeline panel for those ids and delete `dedicatedTimelineSettings`.                                                                                |
| 8   | Should the Options disclosure state persist?                                                              | Not now. Sliders stay inline, and rarely-used panels can stay closed. Add a device-local key only if users ask.                                                                                      |
| 9   | Visual effects is a cross-site setting shown on plugin sites too.                                         | When it migrates, list it as one row on every site, bound to the same key, after the enum binding lands. Until then it keeps its card.                                                               |
| 10  | Downgrade safety.                                                                                         | Safe by construction: no data moves, so an older build reads the same keys.                                                                                                                          |
| 11  | The AI Studio master switch is off while the user edits rows.                                             | Same as today: rows stay editable and take effect when the switch is on. No extra note.                                                                                                              |
| 12  | `usePluginPreferences` and `usePopupPlugins` each load plugin state.                                      | This is existing duplication. Share the legacy loader now (§3.1) and lift both into one owner later only if it gets in the way.                                                                      |
| 13  | Locate from the page.                                                                                     | Use the search-query handoff (§3.5) for the default-model toast only. The Prompt Manager "open settings" entry (`src/pages/content/prompt/index.ts:712`) points at a core card, so it needs nothing. |
