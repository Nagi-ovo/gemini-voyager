/**
 * The self-contained prompt for "describe a change in one sentence": the user
 * copies it into any AI they choose, and pastes the reply back into the popup
 * (`pluginReply.ts`). Voyager itself never sends, opens or reads anything.
 *
 * The contract is `buildPluginContract(site, { audience: 'chat' })`, the same
 * one the scaffold's AGENTS.md and the public SKILL.md are rendered from: CSS
 * inlined (the reply is pasted), no primitives or theme (the preview flags
 * them), settings allowed. Its examples are asserted to pass
 * `validateLocalManifest` in tests, so the prompt cannot drift from what
 * imports.
 *
 * The text is machine-facing and stays in English; it asks for `name` and
 * `description` in the language of the user's request.
 */
import { SiteRegistry, DEFAULT_ADAPTERS } from '../sites/registry';
import type { SiteAdapter } from '../types';
import { buildPluginContract, renderExample, renderSections } from './authoring/pluginContract';

export {
  AUTHORING_OP_KINDS,
  AUTHORING_OP_TEMPLATES,
  type AuthoringOpKind,
  buildPluginExample,
} from './authoring/pluginExamples';
export { siteAnchors } from './authoring/siteFacts';

/** Ceiling on the one-sentence request. */
export const MAX_PLUGIN_REQUEST_CHARS = 1000;

/** Sites a plugin may target: every plugin platform and native surface this build knows. */
export function authoringSites(): readonly SiteAdapter[] {
  return DEFAULT_ADAPTERS;
}

/** The supported site of a page URL, or null. */
export function authoringSiteForUrl(url: string | undefined): SiteAdapter | null {
  if (!url) return null;
  return SiteRegistry.createDefault().resolveByUrl(url);
}

/** The full prompt for one request and target site. */
export function buildPluginAuthoringPrompt(request: string, site: SiteAdapter): string {
  const contract = buildPluginContract(site, { audience: 'chat' });
  return [
    'Write a Voyager local plugin for the request below. Voyager is a browser extension that',
    'applies a declarative JSON manifest (CSS plus reversible page changes) to a web page. It runs',
    'the manifest through a strict validator, so follow this contract exactly.',
    '',
    'The request, verbatim between the markers:',
    '----- BEGIN REQUEST -----',
    request.trim(),
    '----- END REQUEST -----',
    '',
    ...renderSections(contract.sections),
    '## Valid examples (adapt one; do not copy its purpose)',
    '',
    ...contract.examples.flatMap((example) => renderExample(example)),
    '## Reply format',
    'Reply with exactly one ```json fenced code block that holds the complete manifest. Put no',
    'other code block in the reply.',
    '',
  ].join('\n');
}
