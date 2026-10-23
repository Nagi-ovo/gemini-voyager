// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chat.deepseek.com/a/chat/s/abc123" }
import { beforeAll } from 'vitest';

import { loadExportDictionaries } from '@/pages/content/export/exportLocale';

import { definePluginPairMatrix } from './pluginPairMatrix';

// The export toolbar waits on lazily imported locale files; a cold first import takes real
// time that fake timers never grant, so the first export render would lack its toolbar.
beforeAll(() => loadExportDictionaries());

// The page URL is the site's, so host checks (send keys, drafts, timeline) take their real path.
definePluginPairMatrix('deepseek');
