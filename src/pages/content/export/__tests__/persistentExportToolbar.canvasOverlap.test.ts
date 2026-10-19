import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readContentStyle } from '@/tests/contentStyle';

import { mountPersistentExportToolbar } from '../persistentExportToolbar';
import { cleanUpToolbars, nextFrame } from './persistentExportToolbarHarness';

afterEach(cleanUpToolbars);

describe('persistentExportToolbar', () => {
  describe('Canvas fullscreen overlap', () => {
    let styles: HTMLStyleElement;

    beforeEach(() => {
      styles = document.createElement('style');
      const css = readContentStyle();
      styles.textContent = css.match(/\.gv-hidden\s*\{[^}]*\}/)![0];
      document.head.appendChild(styles);
    });

    afterEach(() => {
      styles.remove();
      document.querySelectorAll('inline-preview, immersive-panel').forEach((node) => node.remove());
    });

    it.each(['immersive-editor', 'code-immersive-panel'])(
      'does not cover the fullscreen Canvas collapse button with %s',
      async (editorTag) => {
        document.body.insertAdjacentHTML(
          'beforeend',
          `<inline-preview><${editorTag}></${editorTag}></inline-preview>
           <immersive-panel><button aria-label="收起"></button><${editorTag}></${editorTag}></immersive-panel>`,
        );
        const fullscreen = document.querySelector('immersive-panel')!;
        const handle = mountPersistentExportToolbar({
          label: '导出',
          tooltip: '导出',
          onClick: vi.fn(),
        });
        await nextFrame();
        expect(getComputedStyle(handle.root).display).toBe('none');

        fullscreen.remove();
        await Promise.resolve();
        await nextFrame();
        expect(getComputedStyle(handle.root).display).not.toBe('none');

        document.body.appendChild(fullscreen);
        await Promise.resolve();
        await nextFrame();
        expect(getComputedStyle(handle.root).display).toBe('none');

        fullscreen.remove();
        document.querySelector('inline-preview')!.remove();
        await Promise.resolve();
        await nextFrame();
        expect(getComputedStyle(handle.root).display).not.toBe('none');
        handle.remove();
      },
    );

    it('restores export when a retained fullscreen Canvas is hidden', async () => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<immersive-panel><immersive-editor></immersive-editor></immersive-panel>',
      );
      const panel = document.querySelector('immersive-panel')!;
      const handle = mountPersistentExportToolbar({
        label: 'Export',
        tooltip: 'Export',
        onClick: vi.fn(),
      });
      await nextFrame();
      expect(getComputedStyle(handle.root).display).toBe('none');

      panel.setAttribute('aria-hidden', 'true');
      await Promise.resolve();
      await nextFrame();
      expect(getComputedStyle(handle.root).display).not.toBe('none');

      panel.removeAttribute('aria-hidden');
      await Promise.resolve();
      await nextFrame();
      expect(getComputedStyle(handle.root).display).toBe('none');
      handle.remove();
    });

    it('keeps export visible for inline Canvas and other immersive panels', async () => {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<immersive-panel><inline-preview><immersive-editor></immersive-editor></inline-preview></immersive-panel>
         <immersive-panel><deep-research-immersive-panel><div class="markdown">Report</div></deep-research-immersive-panel></immersive-panel>`,
      );
      const handle = mountPersistentExportToolbar({
        label: 'Export',
        tooltip: 'Export',
        onClick: vi.fn(),
      });
      await nextFrame();
      expect(getComputedStyle(handle.root).display).not.toBe('none');

      const panel = document.createElement('immersive-panel');
      document.body.appendChild(panel);
      await Promise.resolve();
      await nextFrame();
      expect(getComputedStyle(handle.root).display).not.toBe('none');

      panel.appendChild(document.createElement('immersive-editor'));
      await Promise.resolve();
      await nextFrame();
      expect(getComputedStyle(handle.root).display).toBe('none');

      handle.remove();
      const query = vi.spyOn(document, 'querySelectorAll');
      panel.remove();
      window.dispatchEvent(new Event('resize'));
      await Promise.resolve();
      await nextFrame();
      expect(query).not.toHaveBeenCalled();
    });
  });
});
