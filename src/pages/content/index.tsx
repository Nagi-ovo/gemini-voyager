import { startTimeline } from './timeline/index';

try {
  if (location.hostname === 'gemini.google.com') startTimeline();
} catch (e) {
  console.error(e);
}
