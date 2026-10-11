import { requireBundledSiteAdapter } from '../../catalog/sites';
import type { SiteAdapter } from '../../types';

/**
 * Thin shell over `catalog/sites/gemini/site.json`. Gemini ships with the
 * extension, so this data is packaged only: no remote catalog ever replaces it
 * (`hostPolicy.allowsRemoteCatalog`). Edit the JSON, not this file.
 *
 * `userTurn` and `assistantTurn` are the membership lists
 * `getUserTurnSelectors()` / `getAssistantTurnSelectors()` join; a parity test
 * binds them. Timeline, export and highlight keep reading the ordered lists in
 * `@/core/gemini/turnSelectors`, never these joined strings.
 */
export const geminiAdapter: SiteAdapter = requireBundledSiteAdapter('gemini');
