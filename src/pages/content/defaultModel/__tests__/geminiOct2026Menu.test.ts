import { describe, expect, it, vi } from 'vitest';

import {
  OCT_2026_MODEL_IDS,
  buildOct2026Menu,
  buildOct2026Trigger,
  encodeJslogMetadata,
  mountOct2026Picker,
} from './geminiOct2026Menu';
import { setupModelLockerTests } from './modelLockerHarness';

describe("Gemini's October 2026 model menu", () => {
  const { startAutoApply, startStars, selectModel, mockSyncGet } = setupModelLockerTests();

  function storageWrites(): Record<string, unknown>[] {
    const setSpy = chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>;
    return setSpy.mock.calls.map(([payload]) => payload as Record<string, unknown>);
  }

  it('applies the default model in the popover-hosted model menu', async () => {
    mockSyncGet({ gvDefaultModel: { id: OCT_2026_MODEL_IDS.pro, name: '3.1 Pro' } });
    history.replaceState({}, '', '/app');
    const { trigger, rows } = mountOct2026Picker('Flash');

    await startAutoApply();
    await vi.advanceTimersByTimeAsync(1500);

    expect(trigger.click).toHaveBeenCalled();
    expect(rows.pro.click).toHaveBeenCalledTimes(1);
    expect(rows.flash.click).not.toHaveBeenCalled();
    expect(rows.low.click).not.toHaveBeenCalled();
  });

  it('applies a starred Medium thinking strength instead of stopping at Low', async () => {
    mockSyncGet({ gvDefaultThinkingLevel: { index: 1, label: 'Medium' } });
    history.replaceState({}, '', '/app');
    const { rows } = mountOct2026Picker('Flash');

    await startAutoApply();
    await vi.advanceTimersByTimeAsync(1500);

    expect(rows.medium.click).toHaveBeenCalledTimes(1);
    expect(rows.low.click).not.toHaveBeenCalled();
    expect(rows.high.click).not.toHaveBeenCalled();
  });

  it('carries a pre-October Extended thinking default over to High, not Low', async () => {
    mockSyncGet({
      gvDefaultThinkingLevel: { index: 0, label: 'Extended thinking', mode: 'extended' },
    });
    history.replaceState({}, '', '/app');
    const { rows } = mountOct2026Picker('Flash');

    await startAutoApply();
    await vi.advanceTimersByTimeAsync(1500);

    expect(rows.high.click).toHaveBeenCalledTimes(1);
    expect(rows.low.click).not.toHaveBeenCalled();
  });

  it('leaves the menu alone once the starred thinking strength is already selected', async () => {
    mockSyncGet({ gvDefaultThinkingLevel: { index: 2, label: 'High', mode: 'extended' } });
    history.replaceState({}, '', '/app');
    const { trigger, rows } = mountOct2026Picker('Flash', { selectedLevel: 2 });

    await startAutoApply();
    await vi.advanceTimersByTimeAsync(5000);

    expect(rows.high.click).not.toHaveBeenCalled();
    expect(trigger.click).toHaveBeenCalledTimes(1);
  });

  it('stars every Low / Medium / High row and saves the one the user picks', async () => {
    mockSyncGet({});
    (chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>).mockClear();
    await startStars();

    const { pillContainer } = buildOct2026Trigger('Flash');
    const rows = buildOct2026Menu(pillContainer);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const star = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('.gv-default-star-btn');
    for (const row of [rows.low, rows.medium, rows.high]) {
      expect(star(row)?.dataset.gvDefaultKind).toBe('thinking');
    }
    expect(star(rows.pro)?.dataset.gvDefaultKind).toBe('model');

    star(rows.medium)?.click();
    await Promise.resolve();
    expect(storageWrites()).toContainEqual({
      gvDefaultThinkingLevel: { index: 1, label: 'Medium' },
    });

    star(rows.high)?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(storageWrites()).toContainEqual({
      gvDefaultThinkingLevel: { index: 2, label: 'High', mode: 'extended' },
    });
    expect(star(rows.high)?.classList.contains('is-default')).toBe(true);
    expect(star(rows.medium)?.classList.contains('is-default')).toBe(false);
    expect(storageWrites().some((payload) => 'gvDefaultModel' in payload)).toBe(false);
  });

  it('shows a pre-October Extended thinking default on the High row only', async () => {
    mockSyncGet({
      gvDefaultThinkingLevel: { index: 0, label: 'Extended thinking', mode: 'extended' },
    });
    await startStars();

    const { pillContainer } = buildOct2026Trigger('Flash');
    const rows = buildOct2026Menu(pillContainer);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const isDefault = (row: HTMLElement) =>
      row.querySelector('.gv-default-star-btn')?.classList.contains('is-default');
    expect(isDefault(rows.high)).toBe(true);
    expect(isDefault(rows.medium)).toBe(false);
    expect(isDefault(rows.low)).toBe(false);
  });

  it('locks by id when the compact menu only carries base64 jslog metadata', async () => {
    mockSyncGet({ gvDefaultModel: { id: OCT_2026_MODEL_IDS.pro, name: '3.1 Pro' } });
    history.replaceState({}, '', '/app');

    const trigger = document.createElement('button');
    trigger.className = 'input-area-switch-label';
    trigger.textContent = 'Flash';
    trigger.click = vi.fn();
    document.body.appendChild(trigger);

    const list = document.createElement('mat-action-list');
    list.className = 'gds-mode-switch-menu-list';
    const row = (id: string, title: string) => {
      const item = document.createElement('button');
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute(
        'jslog',
        `242569;track:generic_click;BardVeMetadataKey:${encodeJslogMetadata([id])}`,
      );
      // A localized title proves the match is by id, not by name.
      item.innerHTML = `<div class="title-and-description"><span class="gds-title-m">${title}</span></div>`;
      item.click = vi.fn();
      list.appendChild(item);
      return item;
    };
    const flash = row(OCT_2026_MODEL_IDS.flash, '快速');
    const pro = row(OCT_2026_MODEL_IDS.pro, '专业');
    document.body.appendChild(list);

    await selectModel();

    expect(pro.click).toHaveBeenCalledTimes(1);
    expect(flash.click).not.toHaveBeenCalled();
  });

  it('applies 4 Argon as the default model in new chats', async () => {
    mockSyncGet({ gvDefaultModel: { id: OCT_2026_MODEL_IDS.argon, name: '4 Argon' } });
    history.replaceState({}, '', '/app');
    const { trigger, rows } = mountOct2026Picker('Flash');

    await startAutoApply();
    await vi.advanceTimersByTimeAsync(1500);

    expect(trigger.click).toHaveBeenCalled();
    expect(rows.argon.click).toHaveBeenCalledTimes(1);
    expect(rows.flash.click).not.toHaveBeenCalled();
  });

  it('stars 4 Argon and persists it as default model', async () => {
    mockSyncGet({});
    (chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>).mockClear();
    await startStars();

    const { pillContainer } = buildOct2026Trigger('Flash');
    const rows = buildOct2026Menu(pillContainer);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const star = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('.gv-default-star-btn');
    expect(star(rows.argon)?.dataset.gvDefaultKind).toBe('model');

    star(rows.argon)?.click();
    await Promise.resolve();
    expect(storageWrites()).toContainEqual({
      gvDefaultModel: { id: OCT_2026_MODEL_IDS.argon, name: '4 Argon' },
    });
    expect(star(rows.argon)?.classList.contains('is-default')).toBe(true);
  });

  it('handles nested thinking level submenu: stars Low/Medium/High in the subpane and saves default', async () => {
    mockSyncGet({});
    (chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>).mockClear();
    await startStars();

    const { pillContainer } = buildOct2026Trigger('Argon');
    const rows = buildOct2026Menu(pillContainer, { useSubmenu: true, selectedModel: 'argon' });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    // Thinking level trigger row in main menu must not have a model star
    const star = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('.gv-default-star-btn');
    expect(star(rows.thinkingTriggerRow!)).toBeNull();

    // Trigger submenu open
    rows.thinkingTriggerRow!.click();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    // Submenu rows must have thinking stars
    for (const row of [rows.low, rows.medium, rows.high]) {
      expect(star(row)?.dataset.gvDefaultKind).toBe('thinking');
    }

    star(rows.high)?.click();
    await Promise.resolve();
    expect(storageWrites()).toContainEqual({
      gvDefaultThinkingLevel: { index: 2, label: 'High', mode: 'extended' },
    });
    expect(star(rows.high)?.classList.contains('is-default')).toBe(true);
  });

  it('auto-applies High thinking level by opening the Thinking level submenu', async () => {
    mockSyncGet({
      gvDefaultModel: { id: OCT_2026_MODEL_IDS.argon, name: '4 Argon' },
      gvDefaultThinkingLevel: { index: 2, label: 'High', mode: 'extended' },
    });
    history.replaceState({}, '', '/app');
    const { trigger: _trigger, rows } = mountOct2026Picker('Argon', {
      useSubmenu: true,
      selectedModel: 'argon',
      selectedLevel: 0,
    });

    await startAutoApply();
    await vi.advanceTimersByTimeAsync(1500);

    expect(rows.thinkingTriggerRow!.click).toHaveBeenCalled();
    expect(rows.high.click).toHaveBeenCalledTimes(1);
    expect(rows.low.click).not.toHaveBeenCalled();
  });
});
