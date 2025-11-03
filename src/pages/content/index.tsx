import { startExportButton } from './export/index';
import { startFolderManager } from './folder/index';
import { startPromptManager } from './prompt/index';
import { startTimeline } from './timeline/index';
import { startChatWidthAdjuster } from './chatWidth/index';

try {
  if (location.hostname === 'gemini.google.com') {
    startTimeline();
    startFolderManager();
    startChatWidthAdjuster();
  }
  if (location.hostname === 'gemini.google.com' || location.hostname === 'aistudio.google.com') {
    startPromptManager();
  }
  startExportButton();
} catch (e) {
  console.error(e);
}
