/**
 * Gemini's chat appearance start points (width, font size, line height with
 * paragraph spacing), each asking the owner table whether its native adjuster
 * starts here or its packaged official plugin is admitted instead.
 *
 * The native adjusters keep their order and their own storage listeners; none
 * of them has a stop (they clean up on unload), and none starts at all when
 * the plugin owns the feature.
 */
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';
import { featureOwner } from '@/features/plugins/sites/featureOwners';

import { startChatFontSizeAdjuster } from './chatFontSize/index';
import { startChatLineHeightAdjuster } from './chatLineHeight/index';
import { startChatParagraphSpacingAdjuster } from './chatParagraphSpacing/index';
import { startChatWidthAdjuster } from './chatWidth/index';
import { type OwnerOf, startOwnedFeature } from './featureOwnerStartup';

export async function startGeminiChatAppearance(
  admission: OfficialAdmissionController,
  ownerOf: OwnerOf = featureOwner,
): Promise<void> {
  await startOwnedFeature(
    admission,
    'gemini',
    'chatWidth',
    async () => {
      startChatWidthAdjuster();
    },
    ownerOf,
  );
  await startOwnedFeature(
    admission,
    'gemini',
    'chatFontSize',
    async () => {
      startChatFontSizeAdjuster();
    },
    ownerOf,
  );
  // Paragraph spacing shares the line height switch and its official plugin:
  // gated apart, the plugin and the native module would both set the margins.
  await startOwnedFeature(
    admission,
    'gemini',
    'chatLineHeight',
    async () => {
      startChatLineHeightAdjuster();
      startChatParagraphSpacingAdjuster();
    },
    ownerOf,
  );
}
