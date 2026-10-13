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

  it('page retirement during width admission cannot admit the remaining appearance plugins', async () => {
    const admission = createOfficialAdmission();
    const lifetime = new AbortController();
    admission.subscribe(() => lifetime.abort());

    await startGeminiChatAppearance(admission, lifetime.signal);
    admission.close();

    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiChatWidth)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiChatFontSize)).toBe('denied');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiChatLineHeight)).toBe('denied');

    const lateAdmission = createOfficialAdmission();
    await startGeminiChatAppearance(lateAdmission, lifetime.signal);
    lateAdmission.close();
    for (const id of APPEARANCE_IDS) expect(lateAdmission.stateOf(id)).toBe('denied');
  });
});
