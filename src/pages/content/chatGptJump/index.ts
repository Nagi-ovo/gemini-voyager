import { startChatGptJumpAccountListener } from './account';
import { startChatGptLegacyJumpHint } from './legacyHint';

/** Identity checks and inaccessible-star hints are available independently of optional plugins. */
export function startChatGptJump(): () => void {
  if (location.hostname !== 'chatgpt.com' || window.top !== window) return () => {};
  const stopAccount = startChatGptJumpAccountListener();
  const stopHint = startChatGptLegacyJumpHint();
  const stop = (): void => {
    window.removeEventListener('pagehide', stop);
    stopAccount();
    stopHint();
  };
  window.addEventListener('pagehide', stop, { once: true });
  return stop;
}
