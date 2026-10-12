/**
 * Gemini's chat appearance start points under either owner. The native
 * adjusters are counters. The plugin-owned case runs on the shipped owner
 * table; the native case is given a table with appearance rolled back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import {
  FEATURE_OWNERS,
  type FeatureOwner,
  OFFICIAL_PLUGIN_IDS,
  type OwnedFeature,
  type OwnedFeatureId,
  type PackagedSiteId,
} from '@/features/plugins/sites/featureOwners';

import { startGeminiChatAppearance } from '../appearanceStartup';

const started = vi.hoisted(() => ({ list: [] as string[] }));

vi.mock('../chatWidth/index', () => ({
  startChatWidthAdjuster: () => started.list.push('width'),
}));
vi.mock('../chatFontSize/index', () => ({
  startChatFontSizeAdjuster: () => started.list.push('fontSize'),
}));
vi.mock('../chatLineHeight/index', () => ({
  startChatLineHeightAdjuster: () => started.list.push('lineHeight'),
}));
vi.mock('../chatParagraphSpacing/index', () => ({
  startChatParagraphSpacingAdjuster: () => started.list.push('paragraphSpacing'),
}));

const APPEARANCE: readonly OwnedFeatureId[] = ['chatWidth', 'chatFontSize', 'chatLineHeight'];
const APPEARANCE_IDS = [
  OFFICIAL_PLUGIN_IDS.geminiChatWidth,
  OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
  OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
];

function withAppearanceOwnedBy(owner: FeatureOwner): readonly OwnedFeature[] {
  return FEATURE_OWNERS.map((entry) =>
    entry.site === 'gemini' && APPEARANCE.includes(entry.feature) ? { ...entry, owner } : entry,
  );
}

function ownerOf(owners: readonly OwnedFeature[]) {
  return (site: PackagedSiteId, feature: OwnedFeatureId): FeatureOwner =>
    owners.find((entry) => entry.site === site && entry.feature === feature)?.owner ?? 'legacy';
}

beforeEach(() => {
  started.list = [];
});

describe('Gemini chat appearance start points', () => {
  it('starts each native adjuster once, paragraph spacing with line height, and admits no official plugin', async () => {
    const owners = withAppearanceOwnedBy('legacy');
    const admission = createOfficialAdmission(owners);

    await startGeminiChatAppearance(admission, ownerOf(owners));
    admission.close();

    expect(started.list).toEqual(['width', 'fontSize', 'lineHeight', 'paragraphSpacing']);
    for (const id of APPEARANCE_IDS) expect(admission.stateOf(id)).toBe('denied');
  });

  it('admits the typography and width plugins at the native start point and starts no native adjuster', async () => {
    const admission = createOfficialAdmission();

    await startGeminiChatAppearance(admission);
    admission.close();

    // Paragraph spacing included: it would otherwise set margins beside the plugin.
    expect(started.list).toEqual([]);
    for (const id of APPEARANCE_IDS) expect(admission.stateOf(id)).toBe('admitted');
  });
});
