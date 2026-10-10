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
`marketplace.json` entry. It refuses to overwrite an existing directory and
lists the known sites when `--site` is unknown.

Then replace every `TODO`: the English `name` and `description` first, then the
nine other locales, then the real CSS and DOM ops. Add `contributes.settings`
only for values a user should control; a `{{settingKey}}` token in CSS, a
`setStyle` value or a `setAttribute` value is how a setting reaches the page.
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

## Complete when

The directory holds a manifest, CSS and README; `plugin:check`, focused tests and `catalog:build` pass; `marketplace.json` lists it; and all ten locales are real translations. Verify light and dark behavior plus a non-zero target match count on a real conversation, or visible before/after evidence for pure CSS without countable targets.

When preparing a PR, also complete the PR checks and include the evidence specified in [SKILL.md](../SKILL.md).
