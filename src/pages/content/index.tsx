import { startExportButton } from './export/index';
import { startPromptManager } from './prompt/index';
import { startTimeline } from './timeline/index';
import { startFolderManager } from './folder/index';

try {
  if (location.hostname === 'gemini.google.com') {
    startTimeline();
    startFolderManager();
  }
  if (location.hostname === 'gemini.google.com' || location.hostname === 'aistudio.google.com') {
    startPromptManager();
  }
  startExportButton();
} catch (e) {
  console.error(e);
}
