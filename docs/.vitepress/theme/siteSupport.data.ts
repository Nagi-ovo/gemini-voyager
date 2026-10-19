import { defineLoader } from 'vitepress';

import { CATALOG_DIR } from '../pluginsPage';
import { type SiteSupportData, loadSiteSupport } from '../siteSupport';

declare const data: SiteSupportData;
export { data };

// Build-time data for `<SiteSupport>`: the page gets the table, never the code it is read from.
export default defineLoader({
  watch: [`${CATALOG_DIR}/**/*.json`],
  load: (): SiteSupportData => loadSiteSupport(),
});
