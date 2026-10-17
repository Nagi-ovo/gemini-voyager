# Declarative plugin

Read this for the selected path; shared constraints and PR evidence remain in [SKILL.md](../SKILL.md).

**(a) Declarative plugin.** CSS plus a JSON manifest under
`catalog/sites/<site>/plugins/<id>/`. Pick this when the behavior is a
stylesheet plus the four reversible DOM ops (`addClass`, `setAttribute`,
`setStyle`, `hide`), or a `native` op that calls a primitive that already
exists. Most contributions are this.

## Implementation

```bash
bun run plugin:new <id-segment> --site <site> --dry-run   # see the plan
bun run plugin:new <id-segment> --site <site>             # write it
```

The scaffold creates `plugin.json` (id `voyager.<site>-<segment>`, `matches`
copied from the site, `engine` pinned to this build), a `style.css` scoped under
`gv-plugin-<site>-<segment>`, a `README.md` skeleton, and appends the
`marketplace.json` entry that `catalog/sites/index.test.ts` requires (the
site's plugin table reads manifests, not that file). It refuses to overwrite
an existing directory and lists the known sites when `--site` is unknown.

Then replace every `TODO`: the English `name` and `description` first, then the
nine other locales, then the real CSS and DOM ops. Add `contributes.settings`
only for values a user should control; a `{{settingKey}}` token in CSS, a
`setStyle` value, a `setAttribute` value or a native op's `params` string is
how a setting reaches the page.
Add a one-line `changelog` when a later version changes behavior.

```bash
bun run plugin:check src/features/plugins/catalog/sites/<site>/plugins/<id>
bun run test src/features/plugins
bun run catalog:build
```

`plugin:check` is the gate: manifest, CSS, site containment, primitive handlers
and the engine floor, semantic keys, selector syntax, the regex subset,
ten-locale metadata, README presence. It only accepts a directory under
`catalog/sites/<site>/plugins/`. Fix what it reports rather than arguing with
it.

Use these focused checks while developing; the final PR verification in `SKILL.md` covers unchanged checks already run.

## Settings

Set a field's `"enabledBy": "<booleanKey>"` when its control should be usable
only while another boolean setting in the same plugin resolves to `true`.
This works for number, select and boolean controls: the popup keeps the field
and its value visible, disables the control while the switch is off, and
retains the stored value. The key must be non-empty, name another boolean
field, and point to a field without its own `enabledBy` (one level only).
Page behavior still needs its existing boolean gate; `enabledBy` controls only
the popup input. Engine 1.7.0 ignores this field and leaves the control enabled,
so it needs no higher engine floor.

### Settings in native params

Use `"params": { "position": "{{side}}" }` on `turnNavigator` with a select
setting `side` whose options are `left` and `right`. Tokens are expanded in
string values recursively through params objects and arrays; parameter names
and object keys stay literal. A whole-value `"{{key}}"` preserves the setting's
number, boolean or string type. Embedded `"a{{key}}b"` produces a string.
Expansion runs once: tokens inside a setting's value remain literal.

Every referenced key must exist in `contributes.settings`, and its type must
fit the primitive's parameter contract wherever that can be checked. Manifest
loading checks the substituted defaults; each activation checks the resolved
stored values with the primitive's `validateParams`. An invalid result skips
the op through the same diagnostic path as invalid static params. Changing a
setting disposes then reactivates templated primitive ops in order; static
params keep the existing in-place settings update path.

Params tokens shipped in engine 1.8.0: manifests that rely on them declare
`"engine": ">=1.8.0"`, or a higher floor when the primitive or one of its
params requires it. Reserve `">=next"` for primitives or params that are still
unreleased.

## Complete when

The directory holds a manifest, CSS and README; `plugin:check`, focused tests and `catalog:build` pass; `marketplace.json` lists it (the index test checks this); and all ten locales are real translations. Verify light and dark behavior plus a non-zero target match count on a real conversation, or visible before/after evidence for pure CSS without countable targets.

When preparing a PR, also complete the PR checks and include the evidence specified in [SKILL.md](../SKILL.md).
