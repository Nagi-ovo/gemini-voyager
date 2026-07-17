import { logger } from '@/core/services/LoggerService';
import { startInputVimMode } from '@/pages/content/chatInput/vimMode';

let active = false;
let generation = 0;
let cleanup: (() => void) | null = null;

/** Native lifecycle bridge for the voyager.input-vim builtin plugin. */
export function startInputVimPlugin(): void {
  if (active) return;

  active = true;
  const currentGeneration = ++generation;

  void startInputVimMode({ forceEnabled: true })
    .then((nextCleanup) => {
      if (!active || currentGeneration !== generation) {
        nextCleanup();
        return;
      }

      cleanup = nextCleanup;
    })
    .catch((error) => {
      if (currentGeneration !== generation) return;
      active = false;
      logger.warn('Input Vim plugin failed to start', { error: String(error) });
    });
}

export function stopInputVimPlugin(): void {
  active = false;
  generation++;
  cleanup?.();
  cleanup = null;
}
