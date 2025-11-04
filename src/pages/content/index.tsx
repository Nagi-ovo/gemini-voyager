import { startChatWidthAdjuster } from './chatWidth/index';
import { startExportButton } from './export/index';
import { startFolderManager } from './folder/index';
import { startPromptManager } from './prompt/index';
import { startTimeline } from './timeline/index';

import { startFormulaCopy } from '@/features/formulaCopy';

try {
  if (location.hostname === 'gemini.google.com') {
    startTimeline();
    startFolderManager();
    startChatWidthAdjuster();
    startFormulaCopy();
  }
  if (location.hostname === 'gemini.google.com' || location.hostname === 'aistudio.google.com') {
    startPromptManager();
  }
  startExportButton();
} catch (e) {
  console.error(e);
}
