import { startExportButton } from '@/pages/content/export';
import { openPersistentExportToolbar } from '@/pages/content/export/persistentExportToolbar';

import { startChatGptExportOpenListener } from './openListener';

let active = false;
let generation = 0;
let cleanup: (() => void) | null = null;
let lifecycleController: AbortController | null = null;
let stopOpenListener: (() => void) | null = null;

/** Native lifecycle bridge for the voyager.chatgpt-export builtin plugin. */
export function startChatGptExportPlugin(): void {
  if (active) return;

  active = true;
  const currentGeneration = ++generation;
  // Bind startup and preference-loaded dialogs to this mount so disabling cannot open stale UI.
  const controller = new AbortController();
  lifecycleController = controller;
  // Synchronous, so it never depends on the async mount settling: the popup's
  // request answers "no conversation" until the toolbar exists.
  stopOpenListener = startChatGptExportOpenListener(openPersistentExportToolbar);
  void startExportButton({ signal: controller.signal })
    .then((nextCleanup) => {
      if (!active || currentGeneration !== generation) {
        nextCleanup();
        return;
      }
      cleanup = nextCleanup;
    })
    .catch(() => {
      if (currentGeneration !== generation) return;
      active = false;
      stopOpenListener?.();
      stopOpenListener = null;
    });
}

export function stopChatGptExportPlugin(): void {
  active = false;
  generation++;
  stopOpenListener?.();
  stopOpenListener = null;
  lifecycleController?.abort();
  lifecycleController = null;
  cleanup?.();
  cleanup = null;
}
