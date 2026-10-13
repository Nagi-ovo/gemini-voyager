import { describe, expect, it } from 'vitest';

import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';

import { startGeminiChatAppearance } from '../appearanceStartup';

const APPEARANCE_IDS = [
  OFFICIAL_PLUGIN_IDS.geminiChatWidth,
  OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
  OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
];

describe('Gemini chat appearance start points', () => {
  it('admits width, font size and line-height with paragraph spacing at the layout start point', async () => {
    const admission = createOfficialAdmission();
    for (const id of APPEARANCE_IDS) expect(admission.stateOf(id)).toBe('pending');

    await startGeminiChatAppearance(admission);
    admission.close();

    for (const id of APPEARANCE_IDS) expect(admission.stateOf(id)).toBe('admitted');
  });
});
