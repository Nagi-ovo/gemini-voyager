import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { computeAnchoredPosition } from '../anchoredPanelPosition';
import { type PanelPlacement, createPanelPlacement } from '../promptPanelPlacement';
import { readPromptPref, writePromptPref } from '../promptPrefs';

vi.mock('../anchoredPanelPosition', () => ({
  computeAnchoredPosition: vi.fn(() => ({ left: 40, top: 50 })),
}));
vi.mock('../promptPrefs', () => ({
  readPromptPref: vi.fn(async (_key: string, fallback: unknown) => fallback),
  writePromptPref: vi.fn(async () => {}),
}));

let placement: PanelPlacement | undefined;

async function setup(open = true) {
  const panel = document.createElement('div');
  const handle = document.createElement('div');
  handle.className = 'gv-pm-drag';
  panel.appendChild(handle);
  const anchor = document.createElement('button');
  const lockButton = document.createElement('button');
  document.body.append(panel, anchor, lockButton);
  placement = await createPanelPlacement({
    panel,
    anchor,
    lockButton,
    isOpen: () => open,
    t: (key) => key,
  });
  placement.applyTexts();
  return { panel, handle, lockButton };
}

function drag(handle: HTMLElement, to: { x: number; y: number }): void {
  handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: to.x, clientY: to.y }));
  window.dispatchEvent(new MouseEvent('pointerup', { clientX: to.x, clientY: to.y }));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readPromptPref).mockImplementation(async (_key, fallback) => fallback);
  vi.mocked(computeAnchoredPosition).mockReturnValue({ left: 40, top: 50 });
  document.body.innerHTML = '';
});

afterEach(() => {
  placement?.destroy();
  placement = undefined;
});

describe('prompt panel placement', () => {
  it('anchors an unlocked panel to the trigger and follows it', async () => {
    const { panel } = await setup();

    placement!.place();
    expect(panel.style.left).toBe('40px');
    expect(panel.style.top).toBe('50px');

    vi.mocked(computeAnchoredPosition).mockReturnValue({ left: 70, top: 80 });
    placement!.reposition();
    expect(panel.style.left).toBe('70px');
    expect(panel.style.top).toBe('80px');
  });

  it('locks on click: saves the state and the position, and marks the button', async () => {
    const { panel, lockButton } = await setup();

    lockButton.click();
    await flush();

    expect(writePromptPref).toHaveBeenCalledWith(StorageKeys.PROMPT_PANEL_LOCKED, true);
    expect(writePromptPref).toHaveBeenCalledWith(
      StorageKeys.PROMPT_PANEL_POSITION,
      expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }),
    );
    expect(lockButton.getAttribute('aria-pressed')).toBe('true');
    expect(lockButton.title).toBe('pm_unlock');
    expect(panel.classList.contains('gv-locked')).toBe(true);
  });

  it('restores a locked panel to its saved position instead of the trigger', async () => {
    vi.mocked(readPromptPref).mockImplementation(async (key) =>
      key === StorageKeys.PROMPT_PANEL_LOCKED ? true : { left: 120, top: 130 },
    );
    const { panel, lockButton } = await setup();

    placement!.place();

    expect(panel.style.left).toBe('120px');
    expect(panel.style.top).toBe('130px');
    expect(lockButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('drags an unlocked panel by its header and stops after destroy', async () => {
    const { panel, handle } = await setup();

    drag(handle, { x: 15, y: 25 });
    await flush();
    expect(panel.style.left).toBe('15px');
    expect(panel.style.top).toBe('25px');
    expect(writePromptPref).toHaveBeenCalledWith(
      StorageKeys.PROMPT_PANEL_POSITION,
      expect.any(Object),
    );

    placement!.destroy();
    drag(handle, { x: 90, y: 95 });
    expect(panel.style.left).toBe('15px');
  });
});
