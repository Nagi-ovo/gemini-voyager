/**
 * Where the public authoring skill lives. `bun run skills:build` writes it to
 * `docs/public/skills/write-voyager-plugin/SKILL.md`, which the docs site
 * serves at this URL; the popup copies it for the user's coding agent.
 */
export const WRITE_PLUGIN_SKILL_NAME = 'write-voyager-plugin';
export const WRITE_PLUGIN_SKILL_URL = `https://voyager.nagi.fun/skills/${WRITE_PLUGIN_SKILL_NAME}/SKILL.md`;
/** The npm package that scaffolds and checks a plugin offline. */
export const PLUGIN_CLI_PACKAGE = 'create-voyager-plugin';
