import { CATALOG_DIR, pluginsRoutes } from '../.vitepress/pluginsPage';

// The root locale's plugin table. A dynamic route cannot leave its parameter
// empty, so `/guide/plugins` gets its own route beside `[lang]/guide/plugins`.
export default {
  watch: [`${CATALOG_DIR}/**/*.json`],
  paths: () => pluginsRoutes(true),
};
