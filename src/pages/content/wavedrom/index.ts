import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { createWaveDromCodeBlocks, type WaveDromCodeBlocks } from './codeBlock';
import { createWaveDromFullscreen } from './fullscreen';
import { createWaveDromRenderer } from './renderer';
import { createWaveDromView } from './view';

/** Owns the storage setting, observer and pending debounce timer for the feature lifetime. */
export const createWaveDromFeature = (blocks: WaveDromCodeBlocks) => {
  let observer: MutationObserver | null = null;
  let pendingProcessTimer: ReturnType<typeof setTimeout> | null = null;

  const disableWaveDrom = () => {
    blocks.setEnabled(false);
    observer?.disconnect();
    observer = null;
    if (pendingProcessTimer !== null) {
      clearTimeout(pendingProcessTimer);
      pendingProcessTimer = null;
    }
    blocks.clear();
  };

  /**
   * Start the WaveDrom renderer (called from the content script entry point).
   * Storage calls are guarded: after an extension reload the context may be
   * invalidated, and an unguarded call would throw on the page.
   */
  const start = () => {
    try {
      chrome.storage?.sync?.get({ [StorageKeys.WAVEDROM_ENABLED]: true }, (result) => {
        const enabled = result?.[StorageKeys.WAVEDROM_ENABLED] !== false;
        if (enabled) {
          blocks.setEnabled(true);
          initializeWaveDrom();
        } else {
          disableWaveDrom();
          logger.info('[Gemini Voyager] WaveDrom rendering is disabled');
        }
      });
    } catch (err) {
      if (!isExtensionContextInvalidatedError(err)) {
        console.error('[Gemini Voyager] Failed to read WaveDrom setting:', err);
      }
    }

    try {
      chrome.storage?.onChanged?.addListener((changes, areaName) => {
        if (areaName === 'sync' && changes[StorageKeys.WAVEDROM_ENABLED]) {
          const enabled = changes[StorageKeys.WAVEDROM_ENABLED].newValue !== false;
          if (enabled) {
            blocks.setEnabled(true);
            initializeWaveDrom();
            logger.info('[Gemini Voyager] WaveDrom rendering enabled');
          } else {
            disableWaveDrom();
            logger.info('[Gemini Voyager] WaveDrom rendering disabled');
          }
        }
      });
    } catch (err) {
      if (!isExtensionContextInvalidatedError(err)) {
        console.error('[Gemini Voyager] Failed to watch WaveDrom setting:', err);
      }
    }
  };

  const initializeWaveDrom = () => {
    blocks.process();

    if (!observer) {
      const debouncedProcess = () => {
        if (!blocks.enabled) return;
        if (pendingProcessTimer !== null) clearTimeout(pendingProcessTimer);
        pendingProcessTimer = setTimeout(() => {
          pendingProcessTimer = null;
          if (blocks.enabled) blocks.process();
        }, 1000);
      };

      observer = new MutationObserver(debouncedProcess);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    logger.info('[Gemini Voyager] WaveDrom integration started');
  };
  return { start, stop: disableWaveDrom };
};

const renderer = createWaveDromRenderer();
const fullscreen = createWaveDromFullscreen();
const view = createWaveDromView(fullscreen);
const blocks = createWaveDromCodeBlocks(renderer, view);
const feature = createWaveDromFeature(blocks);

export const startWaveDrom = feature.start;
