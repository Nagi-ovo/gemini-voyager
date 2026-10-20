import { NOTES_DIR, changelogRoutes } from '../.vitepress/changelog';

// The changelog page of every locale but the root one (see `../[page].paths.ts`).
export default {
  watch: [`${NOTES_DIR}/*/*.md`],
  paths: () => changelogRoutes(false),
};
