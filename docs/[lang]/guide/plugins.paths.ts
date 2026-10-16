import { CATALOG_DIR, pluginsRoutes } from '../../.vitepress/pluginsPage';

// The plugin table of every locale but the root one (see `../../guide/[page].paths.ts`).
export default {
  watch: [`${CATALOG_DIR}/**/*.json`],
  paths: () => pluginsRoutes(false),
};
