import { startChatWidthAdjuster } from './chatWidth/index';
import { startEditInputWidthAdjuster } from './editInputWidth/index';
import { startExportButton } from './export/index';
import { startFolderManager } from './folder/index';
import { startAIStudioFolderManager } from './folder/aistudio';
import { startPromptManager } from './prompt/index';
import { startTimeline } from './timeline/index';

import { startFormulaCopy } from '@/features/formulaCopy';

try {
  if (location.hostname === 'gemini.google.com') {
    startTimeline();
    startFolderManager();
    startChatWidthAdjuster();
    startEditInputWidthAdjuster();
    startFormulaCopy();
  }
  if (
    location.hostname === 'gemini.google.com' ||
    location.hostname === 'aistudio.google.com' ||
    location.hostname === 'aistudio.google.cn'
  ) {
    startPromptManager();
  }
  if (location.hostname === 'aistudio.google.com' || location.hostname === 'aistudio.google.cn') {
    startAIStudioFolderManager();
  }
  startExportButton();
} catch (e) {
  console.error(e);
}
