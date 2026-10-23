# Plugin requirements and status (`runtime/pluginStatus.ts`)

Part of the [Plugin ecosystem overview](../README.md).

`requires` states what a plugin needs from the host beyond the `engine` range (primitive floors: [verbs/README.md](../verbs/README.md)):

- `requires.handlers` lists the primitives the plugin invokes. Every `native` op
  is implied, so listing it is documentation, not duplication.
- `requires.semantic` lists semantic keys the plugin depends on beyond the ones
  its ops target. A primitive's own `semantic` keys come from its contract, and
  the key a `semanticKey` param names (every option, when the param is a select
  setting's `{{key}}` token) comes from the op's params.

`runtime/pluginStatus.ts` derives both sets (`requiredHandlers`,
`requiredSemanticKeys`) and turns them into a status, which `PluginHost` reports
for every plugin that targets the page instead of quietly filtering it:

| Kind             | Meaning                                 | Popup                                         |
| ---------------- | --------------------------------------- | --------------------------------------------- |
| `needs-engine`   | `engine` range above this build         | toggle disabled, "needs Voyager ≥ x.y"        |
| `needs-handler`  | a primitive or runtime it lacks         | toggle disabled, "update Voyager"             |
| `needs-semantic` | the site adapter lacks a key it needs   | toggle disabled, names the site               |
| `ready`          | compatible, not mounted yet             | normal toggle                                 |
| `mounted`        | enabled and running on this page        | normal toggle                                 |
| `no-effect`      | mounted but found nothing (D12)         | toggle stays on, yellow warning               |
| `blocked`        | compatible, kept off by `blockedReason` | toggle keeps the user's choice, note says why |

`blockedReason` (with `blockedBy` naming the other plugin where there is one):

| Reason            | Meaning                                                                                       | Clears                              |
| ----------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| `host-policy`     | this build refuses its `theme` or a `native` op on this site                                  | in a build that allows it           |
| `duplicate-claim` | the manifest starts one page-wide runtime twice                                               | when the manifest is fixed          |
| `conflict`        | `blockedBy` holds or reserves a page-wide runtime it needs                                    | when the user turns one of them off |
| `releasing`       | next in line, waiting for `blockedBy` to finish shutting the runtime down                     | by itself                           |
| `pending`         | `blockedBy`, an official plugin needing the same runtime, is still reading its native setting | by itself, once the read lands      |

The popup names a packaged official plugin in `blockedBy` by its row and the
topic card that holds it (`officialSwitch` in
`pages/popup/components/pluginBlockedNote.ts`: the manifest name plus the
card title, such as Vim Input under Input), and re-asks for statuses while a
`releasing` or `pending` block lasts.

`needs-permission` is not in this list: the popup owns the permission flow, and
a content script that is running already has its permission.

**Health signal (D12).** `runtime/healthMonitor.ts` answers "is this plugin
doing anything here?". It waits for the engine's `childList` observer to go
quiet, then flags a plugin only when the adapter's `userTurn` selector matches
more than zero elements **and** the plugin's own target count is zero. An empty
conversation is never flagged, a slow page is never flagged early (quiet
detection drives the timing; the deadline is only a ceiling), and a target
appearing later clears the flag. Pure-CSS plugins have no countable targets and
are never tracked.

**Update timing (D7).** A CSS or `domOps` update remounts immediately. A
primitive-backed plugin does not: the primitive may hold UI state, so the page
keeps the mounted version, the status carries `pendingVersion`, and the popup
says the update applies after a reload. A SPA `pushState` is not a reload; only
a full page load switches versions.

**Evolution (D9).** A published parameter never changes type and never becomes
required. Parameters may only be **added**, and only as **optional**. Anything
breaking ships under a new primitive name, so `handler` never needs a version
suffix. Each primitive's committed `verbs/<name>/paramsBaseline.json` holds the
contract tests to this: write unpublished entries with `sinceEngine: "next"`.
The release bump stamps them to the concrete version, which makes them
published and immutable; later only append optional params. It lives in the
folder, so deleting a primitive's folder deletes its baseline too; no test stops that, and review must.

`formulaCopy` is the first primitive, and
`catalog/sites/deepseek/plugins/formula-copy/` is the first plugin built on one.
The builtin `voyager.formula-copy` (Claude, ChatGPT) and the packaged Gemini and
AI Studio official plugins are native-op manifests over the same primitive.
