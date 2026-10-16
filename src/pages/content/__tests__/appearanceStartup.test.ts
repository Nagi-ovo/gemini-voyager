import { describe, expect, it } from 'vitest';

import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';

import { startGeminiChatAppearance } from '../appearanceStartup';

const APPEARANCE_IDS = [
  OFFICIAL_PLUGIN_IDS.geminiChatWidth,
  OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
  OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
  OFFICIAL_PLUGIN_IDS.geminiEditInputWidth,
];

describe('Gemini chat appearance start points', () => {
  it('admits width, font size, line-height with paragraph spacing and edit input width at the layout start point', async () => {
    const admission = createOfficialAdmission();
    for (const id of APPEARANCE_IDS) expect(admission.stateOf(id)).toBe('pending');

    await startGeminiChatAppearance(admission);
    admission.close();

    for (const id of APPEARANCE_IDS) expect(admission.stateOf(id)).toBe('admitted');
  });

  it('admits nothing once the page lifetime has ended', async () => {
    const admission = createOfficialAdmission();
    const lifetime = new AbortController();
    lifetime.abort();
    await startGeminiChatAppearance(admission, lifetime.signal);
    admission.close();
    for (const id of APPEARANCE_IDS) expect(admission.stateOf(id)).toBe('denied');
  });
});
