import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startRemoteAnnouncements } from '../index';

const ANNOUNCEMENT = {
  id: 'gemini-settings-change-2026-06',
  level: 'critical',
  title: 'Gemini settings changed',
  body: 'Open Voyager docs for the workaround.',
  link: 'https://voyager.nagi.fun/guide/settings',
  linkLabel: 'Read guide',
  createdAt: 1781611200000,
};

let cleanup: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  cleanup = null;
  (chrome.runtime.onMessage.addListener as unknown as Mock).mockClear();
  (chrome.runtime.onMessage.removeListener as unknown as Mock).mockClear();
  (chrome.runtime.sendMessage as unknown as Mock).mockReset();
  (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue({
    ok: true,
    announcements: [],
  });
  (chrome.i18n.getMessage as unknown as Mock).mockImplementation((key: string) => {
    if (key === 'remoteAnnouncementDismiss') return 'Dismiss';
    if (key === 'remoteAnnouncementOpen') return 'Open';
    if (key === 'remoteAnnouncementDefaultTitle') return 'Voyager announcement';
    return key;
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
});

describe('startRemoteAnnouncements', () => {
  it('keeps a pending announcement visible until the user dismisses it', async () => {
    (chrome.runtime.sendMessage as unknown as Mock).mockImplementation(async (message) => {
      if (message?.type === 'gv.remoteAnnouncement.getPending') {
        return { ok: true, announcements: [ANNOUNCEMENT] };
      }
      return { ok: true };
    });

    cleanup = startRemoteAnnouncements();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-remote-announcement--critical')).not.toBeNull();
    });
    expect(document.querySelector('.gv-remote-announcement__title')?.textContent).toBe(
      'Gemini settings changed',
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({
      type: 'gv.remoteAnnouncement.ack',
      payload: { id: 'gemini-settings-change-2026-06' },
    });

    document.querySelector<HTMLButtonElement>('.gv-remote-announcement__dismiss')?.click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'gv.remoteAnnouncement.ack',
      payload: { id: 'gemini-settings-change-2026-06' },
    });
  });

  it('renders announcements delivered by runtime message with action buttons', async () => {
    cleanup = startRemoteAnnouncements();
    const listener = (chrome.runtime.onMessage.addListener as unknown as Mock).mock.calls.at(
      -1,
    )?.[0];

    listener({
      type: 'gv.remoteAnnouncement.show',
      payload: { announcements: [ANNOUNCEMENT] },
    });

    const link = document.querySelector<HTMLButtonElement>('.gv-remote-announcement__link');
    const dismiss = document.querySelector<HTMLButtonElement>('.gv-remote-announcement__dismiss');
    expect(link?.textContent).toBe('Read guide');
    expect(dismiss?.textContent).toBe('Dismiss');

    link?.click();
    expect(window.open).toHaveBeenCalledWith(
      'https://voyager.nagi.fun/guide/settings',
      '_blank',
      'noopener,noreferrer',
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'gv.remoteAnnouncement.ack',
      payload: { id: 'gemini-settings-change-2026-06' },
    });
  });

  it('does not render a dismiss button for required-action announcements', async () => {
    cleanup = startRemoteAnnouncements();
    const listener = (chrome.runtime.onMessage.addListener as unknown as Mock).mock.calls.at(
      -1,
    )?.[0];

    listener({
      type: 'gv.remoteAnnouncement.show',
      payload: { announcements: [{ ...ANNOUNCEMENT, requiresAction: true }] },
    });

    expect(document.querySelector('.gv-remote-announcement__link')).not.toBeNull();
    expect(document.querySelector('.gv-remote-announcement__dismiss')).toBeNull();
  });
});
