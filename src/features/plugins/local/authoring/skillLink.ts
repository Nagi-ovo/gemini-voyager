/**
 * Where the public authoring skill lives. `bun run skills:build` writes its
 * files (SKILL.md plus the site and primitive files it links) to
 * `docs/public/skills/write-voyager-plugin/`, which the docs site serves at
 * this folder URL; the popup copies the SKILL.md URL for the user's coding agent.
 */
export const WRITE_PLUGIN_SKILL_NAME = 'write-voyager-plugin';
export const WRITE_PLUGIN_SKILL_BASE_URL = `https://voyager.nagi.fun/skills/${WRITE_PLUGIN_SKILL_NAME}/`;
export const WRITE_PLUGIN_SKILL_URL = `${WRITE_PLUGIN_SKILL_BASE_URL}SKILL.md`;
/** The npm package that scaffolds and checks a plugin offline. */
export const PLUGIN_CLI_PACKAGE = 'create-voyager-plugin';
