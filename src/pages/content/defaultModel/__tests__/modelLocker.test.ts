import { describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { setupModelLockerTests } from './modelLockerHarness';

describe('DefaultModelManager lifecycle', () => {
  const { startManager, mockSyncGet, changeAutoApply, mountPicker, reachFailureToast } =
    setupModelLockerTests();

  describe('auto-apply kill switch', () => {
    it('does not start the lock loop when gvDefaultModelAutoApply is false', async () => {
      mockSyncGet({
        gvDefaultModel: { id: 'pro-id', name: 'Pro' },
        gvDefaultModelAutoApply: false,
      });
      history.replaceState({}, '', '/app');
      const picker = mountPicker();
      await startManager();
      await vi.advanceTimersByTimeAsync(5000);
      expect(picker.triggerClick).not.toHaveBeenCalled();
      expect(picker.itemClick).not.toHaveBeenCalled();
    });

    it('resumes the lock loop after gvDefaultModelAutoApply flips from false to true via storage change', async () => {
      mockSyncGet({
        gvDefaultModel: { id: 'pro-id', name: 'Pro' },
        gvDefaultModelAutoApply: false,
      });
      history.replaceState({}, '', '/app');
      const picker = mountPicker();
      await startManager();
      await vi.advanceTimersByTimeAsync(1500);
      expect(picker.triggerClick).not.toHaveBeenCalled();
      changeAutoApply(true);
      await vi.advanceTimersByTimeAsync(1500);
      expect(picker.triggerClick).toHaveBeenCalledTimes(1);
      expect(picker.itemClick).toHaveBeenCalledTimes(1);
    });

    it('skips star button injection when the toggle is off at init time', async () => {
      mockSyncGet({ gvDefaultModelAutoApply: false });
      await startManager();
      const { item } = mountPicker();
      await vi.advanceTimersByTimeAsync(500);
      expect(item.querySelector('.gv-default-star-btn')).toBeNull();
    });

    it('sweeps already-injected star buttons when the toggle flips off', async () => {
      mockSyncGet({ gvDefaultModel: { id: 'pro-id', name: 'Pro' } });
      await startManager();
      const { item } = mountPicker();
      await vi.advanceTimersByTimeAsync(500);
      expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();
      changeAutoApply(false);
      expect(item.querySelector('.gv-default-star-btn')).toBeNull();
    });

    it('renders a failure toast once across repeated failed navigation sessions', async () => {
      const { triggerClick } = await reachFailureToast();
      const toast = toastDriver.find('defaultModelAutoApplyFailed')!.element;
      history.pushState({}, '', '/u/1/app');
      await vi.advanceTimersByTimeAsync(4000);
      expect(triggerClick).toHaveBeenCalledTimes(6);
      expect(toastDriver.all().map((open) => open.element)).toEqual([toast]);
    });

    it('toast action button sends gv.openPopup runtime message', async () => {
      const sendMessageMock = vi.fn().mockResolvedValue({ ok: true });
      chrome.runtime.sendMessage = sendMessageMock;
      await reachFailureToast();
      toastDriver.press(
        toastDriver.find('defaultModelAutoApplyFailed')!,
        'defaultModelAutoApplyFailedAction',
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(sendMessageMock).toHaveBeenCalledWith({ type: 'gv.openPopup' });
      expect(toastDriver.all()).toEqual([]);
    });

    it('toast falls back to manual-open text when openPopup is rejected', async () => {
      const sendMessageMock = vi.fn().mockResolvedValue({ ok: false });
      chrome.runtime.sendMessage = sendMessageMock;
      await reachFailureToast();
      toastDriver.press(
        toastDriver.find('defaultModelAutoApplyFailed')!,
        'defaultModelAutoApplyFailedAction',
      );
      await vi.advanceTimersByTimeAsync(0);
      const [toast] = toastDriver.all();
      expect(toast.message).toBe('defaultModelAutoApplyFailedFallback');
      expect(toastDriver.labels(toast)).toEqual([]);
    });

    it('observer ignores menu mutations when the toggle is off (no scheduled injection)', async () => {
      mockSyncGet({ gvDefaultModelAutoApply: false });
      await startManager();
      const schedule = vi.spyOn(window, 'setTimeout');
      const { panel } = mountPicker();
      await vi.advanceTimersByTimeAsync(1000);
      expect(panel.querySelectorAll('.gv-default-star-btn')).toHaveLength(0);
      expect(schedule).not.toHaveBeenCalled();
    });

    it('panel-level sweep removes stars whose owning item is orphaned', async () => {
      mockSyncGet({ gvDefaultModel: { id: 'pro-id', name: 'Pro' } });
      await startManager();
      const { panel, item } = mountPicker();
      const staleItem = document.createElement('div');
      const staleStar = document.createElement('button');
      staleStar.className = 'gv-default-star-btn';
      staleItem.appendChild(staleStar);
      panel.prepend(staleItem);
      await vi.advanceTimersByTimeAsync(500);
      expect(staleItem.querySelector('.gv-default-star-btn')).toBeNull();
      expect(panel.querySelectorAll('.gv-default-star-btn')).toHaveLength(1);
      expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();
    });

    it('off-state observer sweeps stale stars in a reattached detached overlay pane', async () => {
      mockSyncGet({ gvDefaultModelAutoApply: false });
      await startManager();
      const stalePane = document.createElement('div');
      stalePane.className = 'cdk-overlay-pane';
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitemradio');
      item.innerHTML = `<div class="title-and-description"><div class="mode-title">Pro</div></div>`;
      const staleStar = document.createElement('button');
      staleStar.className = 'gv-default-star-btn is-default';
      item.appendChild(staleStar);
      stalePane.appendChild(item);
      document.body.appendChild(stalePane);
      await vi.advanceTimersByTimeAsync(100);
      expect(stalePane.querySelector('.gv-default-star-btn')).toBeNull();
    });

    it('off-state click on a stale star does not write to storage', async () => {
      const setSpy = chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>;
      const removeSpy = chrome.storage.sync.remove as unknown as ReturnType<typeof vi.fn>;
      mockSyncGet({ gvDefaultModel: { id: 'pro-id', name: 'Pro' } });
      await startManager();
      const { panel, item } = mountPicker('Flash', 'flash-id');
      await vi.advanceTimersByTimeAsync(500);
      const star = item.querySelector<HTMLButtonElement>('.gv-default-star-btn')!;
      expect(star).not.toBeNull();
      panel.remove();
      changeAutoApply(false);
      setSpy.mockClear();
      removeSpy.mockClear();
      star.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(item.querySelector('.gv-default-star-btn')).toBeNull();
      expect(setSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('sweeps the failure toast when the toggle flips off', async () => {
      await reachFailureToast();
      changeAutoApply(false);
      expect(toastDriver.all()).toEqual([]);
    });

    it('aborts an in-flight lock loop when the toggle flips off', async () => {
      mockSyncGet({ gvDefaultModel: { id: 'pro-id', name: 'Pro' } });
      history.replaceState({}, '', '/app');
      const { triggerClick, itemClick } = mountPicker();
      await startManager();
      await vi.advanceTimersByTimeAsync(1500);
      expect(triggerClick).toHaveBeenCalledTimes(1);
      expect(itemClick).toHaveBeenCalledTimes(1);
      changeAutoApply(false);
      await vi.advanceTimersByTimeAsync(10000);
      expect(triggerClick).toHaveBeenCalledTimes(1);
      expect(itemClick).toHaveBeenCalledTimes(1);
    });
  });
});
