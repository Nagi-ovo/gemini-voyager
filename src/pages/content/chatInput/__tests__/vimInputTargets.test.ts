import { describe, expect, it } from 'vitest';

import { setupVimTestEnvironment } from './vimHarness';

setupVimTestEnvironment();

describe('resolveConfiguredComposer', () => {
  const tall = (element: HTMLElement): void => {
    element.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 300, height: 40, bottom: 40, right: 300 }) as DOMRect;
  };

  it('narrows a wrapper match to its rendered editable control and skips hidden duplicates', async () => {
    const { resolveConfiguredComposer } = await import('../vimInputTargets');
    document.body.innerHTML = `
      <div class="composer"><textarea id="ghost"></textarea></div>
      <div class="composer"><div><div id="live" contenteditable="true"></div></div></div>
    `;
    tall(document.getElementById('live')!);
    expect(resolveConfiguredComposer('.composer')?.id).toBe('live');
  });

  it('skips a duplicate that keeps its layout box but is not visible', async () => {
    const { resolveConfiguredComposer } = await import('../vimInputTargets');
    document.body.innerHTML = `
      <div class="composer"><textarea id="ghost" style="visibility: hidden"></textarea></div>
      <div class="composer"><textarea id="live"></textarea></div>
    `;
    tall(document.getElementById('ghost')!);
    tall(document.getElementById('live')!);
    expect(resolveConfiguredComposer('.composer')?.id).toBe('live');
  });

  it('scans every editable control inside one wrapper before giving up on it', async () => {
    const { resolveConfiguredComposer } = await import('../vimInputTargets');
    document.body.innerHTML = `
      <div class="composer">
        <textarea id="ghost" style="display: none"></textarea>
        <div id="live" contenteditable="true"></div>
      </div>
    `;
    tall(document.getElementById('live')!);
    expect(resolveConfiguredComposer('.composer')?.id).toBe('live');
  });

  it('returns nothing for matches without an editable control or for an invalid selector', async () => {
    const { resolveConfiguredComposer } = await import('../vimInputTargets');
    document.body.innerHTML = '<div class="composer"><span>label</span></div>';
    tall(document.querySelector<HTMLElement>('.composer')!);
    expect(resolveConfiguredComposer('.composer')).toBeNull();
    expect(resolveConfiguredComposer('[')).toBeNull();
  });

  it('falls back to the first editable match only when visibility is not required', async () => {
    const { resolveConfiguredComposer } = await import('../vimInputTargets');
    document.body.innerHTML = '<div class="composer"><textarea id="hidden"></textarea></div>';
    expect(resolveConfiguredComposer('.composer')).toBeNull();
    expect(resolveConfiguredComposer('.composer', { requireVisible: false })?.id).toBe('hidden');
  });
});
