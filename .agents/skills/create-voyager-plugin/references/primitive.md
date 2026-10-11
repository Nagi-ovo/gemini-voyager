# Native primitive

Read this for the selected path; shared constraints and PR evidence remain in [SKILL.md](../SKILL.md).

**(c) Primitive.** First-party TypeScript under `src/features/plugins/verbs/`,
called by name from a manifest's `native` op. Pick this only when the behavior
cannot be data: it needs event handling, its own state, or DOM that Voyager
builds. A primitive is one folder, `verbs/<name>/`, and the folder is all the
registration: `contract.ts` (data only), `index.ts` (the implementation) and
`paramsBaseline.json`. Discovery finds them; no central list is edited.

A primitive is a published API. Plan D9 holds it to: parameters are only ever
**added**, and only as **optional**; a published parameter never changes type
and never becomes required; `sinceEngine` never changes; anything breaking ships
under a **new name**, because `handler` carries no version suffix.
`verbs/contracts.test.ts` enforces this against each folder's committed
baseline. A primitive PR also needs parametric tests over **two sites'**
fixtures, so the behavior is proven to be site-independent rather than one
site's code with a name on it.

A primitive does not stand alone: the plugin that invokes it is still path (a),
and usually lands in the same PR.

## Implementation

1. `verbs/<name>/contract.ts`: `export const contract` (`name` equal to the
   folder name, `sinceEngine`, `semantic`, `params`, `description`). Import
   only types and data modules (`../contractTypes`, `../codeBlockDiagramParams`);
   `primitiveFolders.test.ts` fails otherwise. `sinceEngine` is the
   `PLUGIN_ENGINE_VERSION` the primitive first ships in, so bump
   `src/features/plugins/constants.ts` in the same PR and use the new value.
2. `verbs/<name>/index.ts`: export the primitive, with
   `contract: getPrimitiveContract('<name>')!`, the `validateParams` guard
   (hand-written, no schema library, per D17) and `activate(scope, params, context)`. Register
   every side effect on the `PluginScope` so unmount pays it all back, and
   report the element count through `context.setTargetCounter` so the health
   signal works. `verifyPrimitiveRegistry()` names a folder whose contract and
   implementation disagree.
3. `verbs/<name>/paramsBaseline.json`: `sinceEngine` and each param's `type`
   and `required`. Later, only append params to it; never edit an entry.
4. Tests: the parametric two-site test, plus the contract tests staying green.
5. The manifest that uses it: a `native` op naming it and an `engine` range
   whose minimum is at least `sinceEngine`. `requires.handlers` is optional;
   the `native` op already counts as a required handler.
6. Run `bun run skills:build`: it regenerates the primitive enums in
   `docs/public/plugin.schema.json` and the public write-voyager-plugin skill
   (tests fail while either is stale).

```bash
bun run test src/features/plugins
bun run catalog:build
```

Use these focused checks while developing; the final PR verification in `SKILL.md` covers unchanged checks already run.

## Complete when

- **Primitive**: the folder's contract, implementation and baseline agree;
  `contracts.test.ts`, `primitiveFolders.test.ts` and the two-site parametric
  test pass; the engine version and every dependent manifest's `engine` floor
  were bumped together; the first plugin that calls it is verified on a real
  page; and the parameters added are optional, with any breaking change
  carrying a new name.
