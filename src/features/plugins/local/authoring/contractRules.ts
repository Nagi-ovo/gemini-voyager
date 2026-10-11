/**
 * The site-independent rules of a local plugin, as text sections. Required
 * fields, op kinds, the attribute allowlist, setting kinds and primitives are
 * read from the gate's own exports, so this text cannot offer something the
 * import refuses. `audience` picks how the reader works: `chat` is an AI in a
 * chat tab whose reply the user pastes (CSS inlined, no primitives), `agent` is
 * a coding agent with a file system that runs `create-voyager-plugin check`.
 */

import { NATIVE_PARAM_SETTINGS_SINCE_ENGINE } from '../../manifest/nativeParamSettings';
import { ALLOWED_ATTRIBUTE_NAMES, ALLOWED_ATTRIBUTE_PREFIXES } from '../../manifest/sinkGuards';
import { REQUIRED_STRINGS } from '../../manifest/validate';
import type { SemanticSelectorKey } from '../../sites/semanticKeys';
import { PLUGIN_CATEGORIES } from '../../types';
import { EFFECTIVE_PLUGIN_ENGINE_VERSION } from '../../verbs/contracts';
import { LOCAL_PLUGIN_ID_PREFIX } from '../localPluginId';
import { LOCAL_SETTING_TYPES } from '../localPluginRules';
import { inlineJson } from './jsonText';
import { AUTHORING_OP_KINDS, AUTHORING_OP_TEMPLATES } from './pluginExamples';
import { listPrimitiveReferences } from './primitiveReference';

export type ContractAudience = 'chat' | 'agent';

export interface ContractSection {
  readonly title: string;
  readonly lines: readonly string[];
}

/** The setAttribute names the gate allows, as the text lists them. */
export function allowedAttributeText(): string {
  return [
    ...ALLOWED_ATTRIBUTE_NAMES,
    ...ALLOWED_ATTRIBUTE_PREFIXES.map((prefix) => `${prefix}*`),
  ].join(', ');
}

export function manifestSection(audience: ContractAudience): ContractSection {
  return {
    title: 'Manifest contract',
    lines: [
      `- Required non-empty string fields: ${REQUIRED_STRINGS.join(', ')}. Also "tier": "declarative", "matches" (see the target site) and "contributes".`,
      `- "id": a short lowercase reverse-dotted slug such as "me.short-name" (a-z, 0-9, ".", "_", "-"). Voyager stores it as "${LOCAL_PLUGIN_ID_PREFIX}<id>"; you do not add that prefix.`,
      '- "version": "1.0.0"; raise it when you change the plugin. "author": "me". "license": "MIT".',
      `- "engine": ">=1.0.0", or ">=" the sinceEngine of every primitive the plugin uses. This build's plugin engine is ${EFFECTIVE_PLUGIN_ENGINE_VERSION}.`,
      `- "category": one of ${PLUGIN_CATEGORIES.join(', ')}.`,
      `- Write "name" and "description" in the language of the ${audience === 'chat' ? 'request' : 'user'}. "i18n" translations are optional for a local plugin.`,
      ...(audience === 'agent'
        ? [
            '- Optional: "$schema": "https://voyager.nagi.fun/plugin.schema.json" lets an editor check the file as you type. The import gate is stricter than the schema; `check` is the authority.',
          ]
        : []),
    ],
  };
}

export function stylesSection(audience: ContractAudience): ContractSection {
  return {
    title: 'Styles',
    lines: [
      ...(audience === 'agent'
        ? [
            '- "contributes.styles": [{ "file": "style.css" }] with the CSS in style.css beside plugin.json. The popup’s Import files reads plugin.json plus the .css files picked with it; Paste JSON only takes inlined CSS ([{ "css": "..." }]).',
            '- Import files takes exactly one .json file: the user picks plugin.json and its .css files, nothing else.',
          ]
        : ['- "contributes.styles": a list of { "css": "..." } with the CSS inlined as a string.']),
      '- CSS may not load anything, not even from the same site: no @import, image-set(), image(), cross-fade() or src(), and url() only with a #fragment or a png, jpeg, gif, webp or avif data: URI (never SVG). No web fonts, no remote images.',
      '- Scope every rule under a class your plugin adds (see addClass), so nothing else changes. Site styles often win on specificity: add !important where a rule does not apply.',
      "- Light or dark only rules: scope them with html[data-gv-scheme='dark'] or html[data-gv-scheme='light'], never with the site's own theme classes.",
    ],
  };
}

export function pageChangesSection(
  audience: ContractAudience,
  templateKey: SemanticSelectorKey,
): ContractSection {
  const target = { kind: 'semantic', key: templateKey } as const;
  const native = audience === 'agent' ? ', and "native" where the site allows primitives' : '';
  return {
    title: 'Page changes',
    lines: [
      `- "contributes.domOps": reversible page changes. Allowed "op" values: ${AUTHORING_OP_KINDS.join(', ')}${native}. Voyager applies them to every match, again as the page changes, and removes them when the plugin is turned off. One example of each:`,
      ...AUTHORING_OP_KINDS.map(
        (kind) => `  - ${kind}: ${inlineJson(AUTHORING_OP_TEMPLATES[kind](target))}`,
      ),
      '- "target": prefer { "kind": "semantic", "key": <anchor> } with an anchor the target site declares. Use a plain CSS selector string only for something no anchor names; it breaks on a redesign.',
      '- addClass "className": exactly one class that starts with "gv-"; use "gv-plugin-<plugin-name>". Then style that class in "contributes.styles".',
      `- setAttribute "name" must be one of: ${allowedAttributeText()}. Never href, src, on*, class or id. Values may not contain an external URL.`,
      '- setStyle "styles": CSS property -> value, custom properties (--gv-…) included; values may not load anything either.',
    ],
  };
}

export function settingsSection(): ContractSection {
  return {
    title: 'Settings (optional)',
    lines: [
      `- "contributes.settings": { "<key>": { "type", "label", "default", … } }. Types: ${LOCAL_SETTING_TYPES.join(', ')}. string and color settings are refused: the popup has no control for them yet.`,
      '- number: the popup shows a slider from "min" to "max" (0 and 100 when omitted), with optional "minLabel" and "maxLabel" at its ends.',
      '- select: "options": [{ "value": "…", "label": "…" }] with at least one option and unique values, and a "default" that is one of the values.',
      '- Optional "enabledBy": "<booleanKey>" keeps a number, select or boolean control visible but disabled unless that boolean setting resolves to true; its value is retained. The key must be non-empty and name another boolean in the same plugin. Its target must have no enabledBy of its own (one level only). This changes only the popup control; gate page behavior separately with the boolean. Engine 1.7.0 ignores enabledBy and leaves the control enabled, so no higher engine floor is needed.',
      '- Use a setting through a {{key}} token in CSS text, a setStyle value or a setAttribute value; Voyager substitutes the current value (the default until the user changes it). A common pattern: setStyle sets a custom property from the setting, and the CSS reads var(...).',
      '- A boolean renders as "true" or "false": set data-gv-… to "{{key}}" with setAttribute and style [data-gv-…=\'true\'].',
    ],
  };
}

export function localRulesSection(audience: ContractAudience): ContractSection {
  return {
    title: 'Local plugin rules',
    lines: [
      '- "matches" may only use patterns inside a site Voyager supports (listed per site).',
      '- Every semantic key the plugin relies on must be declared by every site its "matches" cover.',
      '- On Gemini and AI Studio: no "theme" and no "native" op (Voyager already runs its own features there).',
      ...(audience === 'agent'
        ? [
            '- "theme": { "brand": "#rrggbb" } optionally recolors Voyager’s own UI on Claude, ChatGPT or DeepSeek. "requires" is optional: native ops already imply "requires.handlers".',
          ]
        : ['- Do not add "theme", "requires", any "native" op, links or JavaScript.']),
      '- An import lands switched off; the user reviews it and turns it on in the popup.',
    ],
  };
}

export function primitivesSection(): ContractSection {
  const lines: string[] = [
    'A primitive is behavior Voyager ships as code; a plugin can only call it by name and configure it: { "op": "native", "handler": "<name>", "params": { … } }. Every param is optional. Set "engine" to ">=" the primitive’s sinceEngine (and any param’s). Not on Gemini or AI Studio, and only on a site that declares the semantic keys the primitive reads.',
    `- To pass a setting into params, use "{{key}}" in a string value, recursively inside objects and arrays. Parameter names and object keys stay literal. A whole-value token preserves the setting's number, boolean or string type; embedded "a{{key}}b" produces a string. Expansion runs once: tokens inside setting values remain literal. Set "engine" to ">=${NATIVE_PARAM_SETTINGS_SINCE_ENGINE}" or any higher primitive/param floor; this capability's floor stays ${NATIVE_PARAM_SETTINGS_SINCE_ENGINE} in later releases.`,
    '- Every referenced key must exist in contributes.settings and its type must fit the primitive contract wherever statically knowable. Manifest loading checks substituted defaults. Each activation substitutes resolved stored values and runs the primitive’s validateParams; an invalid result skips the op with the same diagnostic as invalid static params. Setting changes dispose then reactivate templated primitive ops in order; static params keep the existing in-place update path.',
    '- Example: turnNavigator params { "position": "{{side}}" } with a select setting side whose options are left and right.',
    '',
  ];
  for (const primitive of listPrimitiveReferences()) {
    const reads = primitive.semantic.length > 0 ? ` Reads: ${primitive.semantic.join(', ')}.` : '';
    lines.push(
      `- ${primitive.name} (sinceEngine ${primitive.sinceEngine}): ${primitive.description}${reads}`,
    );
    for (const param of primitive.params) {
      const since = param.sinceEngine ? `, since ${param.sinceEngine}` : '';
      lines.push(`  - ${param.name} (${param.type}${since}): ${param.description}`);
    }
  }
  return { title: 'Primitives', lines };
}

export function selectorsSection(): ContractSection {
  return {
    title: 'Finding selectors',
    lines: [
      '- Use a semantic anchor whenever one names the element. Otherwise ask the user to open the site, press F12 and inspect the element in the Elements panel.',
      "- Have them test a selector in the Console: document.querySelectorAll('<selector>').length should count what you expect (for example one per message); 0 means it is wrong.",
      '- Prefer data-testid, aria-*, role and stable element names. Avoid generated class names (hashes such as css-1x2y3z): they change with every site deploy.',
      '- Do not guess selectors you cannot verify: tell the user which ones to check.',
    ],
  };
}

const IMPOSSIBLE = [
  'run JavaScript or any code of its own: no event handlers, clicks, timers or keyboard shortcuts',
  'make network requests or load anything: remote images, fonts, stylesheets or scripts',
  'read, rewrite or translate what a message says, or store and sync data beyond its own settings',
  'add buttons or links that do something, open pages, download or copy (CSS ::before and ::after can add fixed text)',
  'decide by message content: logic, conditions or counting beyond what CSS selectors such as :has() and :nth-child() express',
  'run on sites other than those listed, or change Voyager’s own settings',
];

export function impossibleSection(audience: ContractAudience): ContractSection {
  return {
    title: 'What a plugin cannot do',
    lines: [
      ...IMPOSSIBLE.map((item) => `- It cannot ${item}.`),
      '',
      'If the request needs any of this, do not invent fields or ops: the import refuses them. Start your reply with one line "NOT POSSIBLE: <what and why>", then build the closest version this contract allows and say what it leaves out.',
      audience === 'chat'
        ? 'Give that version in the one ```json block; reply with no block only when nothing declarative helps.'
        : 'When nothing declarative helps, stop there and write no files.',
    ],
  };
}
