# Write Your Own Plugin

A local plugin is a plugin you make for yourself. It changes how Gemini, AI Studio, ChatGPT, Claude or DeepSeek looks or is laid out, it lives only in your browser, and it needs no pull request and no copy of the Voyager source.

Like every Voyager plugin, it is declarative: a `plugin.json` manifest plus CSS. It runs no code of its own. Voyager checks it on import, applies its changes, and removes every change when you turn it off. An imported plugin starts switched off, so you can review it first.

## Three ways to make one

### Describe it, and let any AI write it

1. Open the site you want to change, open the Voyager popup and find the **Local plugins** card (on Gemini and AI Studio it is the last entry in the settings).
2. Choose **Describe a change**, write one sentence ("Make my messages narrower and hide the sidebar") and choose **Write prompt**.
3. Copy the prompt into any AI chat yourself, then paste its whole reply back and choose **Check reply**.
4. Voyager shows what the plugin changes in plain language. Import it, then turn it on in the plugin list.

Voyager never sends the prompt anywhere: you choose the AI and carry the text both ways.

### Hand it to a coding agent

If you use a coding agent (Claude Code, Codex, Cursor and the like), give it Voyager's plugin skill:

```text
https://voyager.nagi.fun/skills/write-voyager-plugin/SKILL.md
```

In the **Local plugins** card, open **Describe a change** to find a **Copy skill link** button for it. The skill holds the full contract: the manifest fields, what each site declares, the primitives, and what a plugin cannot do. Ask the agent for the change you want; it scaffolds a folder, writes `plugin.json` and `style.css`, and checks them offline. You then choose **Import files** in the popup and pick both files.

To keep the skill installed, save the file as `write-voyager-plugin/SKILL.md` in your agent's skills folder (for Claude Code, `~/.claude/skills/`).

### Write it by hand

With Node.js 18 or newer:

```sh
npx create-voyager-plugin@latest init my-plugin --site claude
# edit my-plugin/plugin.json and my-plugin/style.css
npx create-voyager-plugin@latest check my-plugin
```

`init` writes a `plugin.json` and `style.css` that already pass, plus an `AGENTS.md` with the rules for that site. `--site` takes `gemini`, `aistudio`, `chatgpt`, `claude` or `deepseek`.

`check` runs the same checks as the popup's import, offline. It exits 0 when the plugin would import, and otherwise prints one `path: message` line per problem. Add `--json` for machine-readable output.

## What a plugin can do

- Add CSS, scoped under a `gv-` class the plugin adds to the page.
- Add a class, set a safe attribute or inline style, or hide elements. Targets are semantic anchors the site declares (`userTurn`, `assistantTurn`, `composer`, …) or CSS selectors.
- Offer settings in the popup: switches, sliders and dropdowns, whose values reach CSS through `{{key}}` tokens.
- On ChatGPT, Claude and DeepSeek, turn on a Voyager primitive (formula copy, the timeline, Mermaid diagrams and others) and tint Voyager's own UI.

## What it cannot do

A plugin cannot run JavaScript, react to clicks or keys, load anything from the network (fonts, images, stylesheets), read or rewrite what a message says, or run on other sites. If a request needs any of that, the authoring material tells the AI to say so and to build the closest version that works.

## Rules the import checks

Beyond the shared manifest checks (see [Plugin Contribution](./plugin-contribution.md)), a local plugin must:

- match only URLs inside a site Voyager supports;
- use only semantic anchors that every matched site declares;
- add exactly one class per `addClass`, starting with `gv-`;
- use boolean, number or select settings (string and color have no popup control yet);
- not use a `theme` on Gemini or AI Studio, and use only the primitives each allows: `formulaCopy` and `vimInput` on Gemini, `formulaCopy` on AI Studio. They run the same code as Voyager's own Formula copy and Input Vim mode settings; only one of the two runs on a page. When the page loads, or while neither is running, the built-in setting goes first; after that, whichever is already running keeps running and the other shows as paused. Turn one off to hand the feature to the other.

Translations (`i18n`) are optional.

## Sharing it

A local plugin stays in your browser; export its JSON from the plugin list to move it elsewhere. If it would help everyone, propose it for the official catalog: [Plugin Contribution](./plugin-contribution.md) describes that path.
