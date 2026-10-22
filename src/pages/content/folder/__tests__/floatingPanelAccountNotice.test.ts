import { afterEach, expect, it, vi } from 'vitest';

import {
  FLOATING_PANEL_CLASS,
  destroyMountedPanels,
  mountPanel,
  panelRoot,
} from './floatingPanelHarness';

vi.mock('@/utils/i18n', () => ({
  getTranslationSyncUnsafe: (key: string) => key,
}));

afterEach(() => {
  destroyMountedPanels();
  document.body.innerHTML = '';
});

it('says why the floating folders are hidden instead of loading forever while the account is unreadable', () => {
  const handle = mountPanel({ dataReady: false, accountNotice: 'account unknown' });
  const root = panelRoot(handle);
  const body = () => root.querySelector<HTMLElement>(`.${FLOATING_PANEL_CLASS}__body`)!;
  const notice = () => root.querySelector<HTMLElement>('.gv-folder-account-notice');

  expect(body().getAttribute('aria-busy')).toBe('false');
  expect(body().inert).toBe(true);
  expect(notice()?.textContent).toBe('account unknown');
  expect(notice()?.getAttribute('role')).toBe('status');

  handle.setDataReady(true);
  expect(notice()).toBeNull();
  expect(body().inert).toBe(false);
  expect(body().getAttribute('aria-busy')).toBe('false');

  // Still loading, with nothing unknown: the body is busy, as before.
  handle.setDataReady(false);
  expect(notice()).toBeNull();
  expect(body().getAttribute('aria-busy')).toBe('true');
});
