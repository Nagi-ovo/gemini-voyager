import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { createEChartsCodeBlocks } from './codeBlock';
import { createEChartsFullscreen } from './fullscreen';
import { createEChartsRenderer } from './renderer';
import { createEChartsView } from './view';

export function createEChartsFeature(
  blocks: ReturnType<typeof createEChartsCodeBlocks>,
  renderer: ReturnType<typeof createEChartsRenderer>,
) {
  let settingChangeRevision = 0;
  let observer: MutationObserver | null = null;
  let pendingProcessTimer: ReturnType<typeof setTimeout> | null = null;
  const disableEcharts = () => {
    blocks.setEnabled(false);
    observer?.disconnect();
    observer = null;
    if (pendingProcessTimer !== null) {
      clearTimeout(pendingProcessTimer);
      pendingProcessTimer = null;
    }
    renderer.stopResizeObserver();
    blocks.clear();
  };

  /**
   * Start the ECharts renderer (called from the content script entry point).
   * Storage calls are guarded: after an extension reload the context may be
   * invalidated, and an unguarded call would throw on the page.
   */
  const startEcharts = () => {
    const readRevision = settingChangeRevision;
    try {
      chrome.storage?.sync?.get({ [StorageKeys.ECHARTS_ENABLED]: true }, (result) => {
        if (readRevision !== settingChangeRevision) return;
        const enabled = result?.[StorageKeys.ECHARTS_ENABLED] !== false;
        if (enabled) {
          initializeEcharts();
        } else {
          disableEcharts();
        }
      });
    } catch (err) {
      if (!isExtensionContextInvalidatedError(err)) {
        console.error('[Gemini Voyager] Failed to read ECharts setting:', err);
      }
    }

    try {
      chrome.storage?.onChanged?.addListener((changes, areaName) => {
        if (areaName === 'sync' && changes[StorageKeys.ECHARTS_ENABLED]) {
          settingChangeRevision += 1;
          const enabled = changes[StorageKeys.ECHARTS_ENABLED].newValue !== false;
          if (enabled) {
            initializeEcharts();
          } else {
            disableEcharts();
          }
        }
      });
    } catch (err) {
      if (!isExtensionContextInvalidatedError(err)) {
        console.error('[Gemini Voyager] Failed to watch ECharts setting:', err);
      }
    }
  };

  const initializeEcharts = () => {
    blocks.setEnabled(true);
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
        // Class changes let an explicit Gemini theme switch re-render existing
        // charts (theme-host.dark-theme / light-theme live on class attributes).
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    renderer.startResizeObserver();
  };
  return {
    start: startEcharts,
    stop() {
      settingChangeRevision += 1;
      disableEcharts();
    },
  };
}

const renderer = createEChartsRenderer();
const fullscreen = createEChartsFullscreen(renderer.resize);
const view = createEChartsView(renderer, fullscreen);
const blocks = createEChartsCodeBlocks(renderer, view);
const feature = createEChartsFeature(blocks, renderer);
export const startEcharts = feature.start;
