import { startExportButton } from './export/index';
import { startPromptManager } from './prompt/index';
import { startTimeline } from './timeline/index';

try {
  if (location.hostname === 'gemini.google.com') startTimeline();
  if (location.hostname === 'gemini.google.com' || location.hostname === 'aistudio.google.com') {
    startPromptManager();
  }
  startExportButton();
} catch (e) {
  console.error(e);
}
