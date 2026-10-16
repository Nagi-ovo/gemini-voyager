import { NOTES_DIR, changelogRoutes } from './.vitepress/changelog';

// The root locale's changelog. A dynamic route cannot leave its parameter empty,
// so `/changelog` gets its own route beside `[lang]/changelog`.
export default {
  watch: [`${NOTES_DIR}/*.md`],
  paths: () => changelogRoutes(true),
};
