// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app/abc123" }
import { definePluginPairMatrix } from './pluginPairMatrix';

// The page URL is the site's, so host checks (send keys, drafts, timeline) take their real path.
definePluginPairMatrix('gemini');
