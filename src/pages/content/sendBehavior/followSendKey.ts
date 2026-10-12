import {
  type EffectiveSendKey,
  getSendKeyCoordinator,
} from '@/core/services/composer/sendKeys/sendKeyCoordinator';

/** Keep a reader's stored-key fallback until the page coordinator has finished its read. */
export function followGeminiSendKey(onKey: (key: EffectiveSendKey) => void): {
  isFollowing: () => boolean;
  stop: () => void;
} {
  const coordinator = getSendKeyCoordinator('gemini');
  let stopped = false;
  let following = false;
  let unsubscribe: (() => void) | null = null;
  if (coordinator) {
    void coordinator.whenReady().then(() => {
      if (stopped || coordinator.isStopped()) return;
      following = true;
      // Local send plugins can own the key while the legacy Ctrl+Enter switch is off.
      unsubscribe = coordinator.subscribeEffectiveSendKey(onKey);
      const key = coordinator.effectiveSendKey();
      if (key !== null) onKey(key);
    });
  }
  return {
    isFollowing: () => following,
    stop: () => {
      stopped = true;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
