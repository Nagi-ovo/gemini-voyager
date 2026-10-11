import { requireBundledSiteAdapter } from '../../catalog/sites';
import type { SiteAdapter } from '../../types';

/**
 * Thin shell over `catalog/sites/aistudio/site.json`. AI Studio ships with the
 * extension, so this data is packaged only: no remote catalog ever replaces it
 * (`hostPolicy.allowsRemoteCatalog`). AI Studio toggles theme on <body> rather
 * than the `.theme-host` element Gemini uses. Edit the JSON, not this file.
 */
export const aistudioAdapter: SiteAdapter = requireBundledSiteAdapter('aistudio');
