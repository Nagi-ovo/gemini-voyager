import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureNotificationsPermission,
  hasNotificationsPermission,
} from '../notificationsPermission';

const containsMock = vi.fn();
const requestMock = vi.fn();

vi.mock('webextension-polyfill', () => ({
  default: {
    get permissions() {
      return {
        contains: containsMock,
        request: requestMock,
      };
    },
  },
}));

const isFirefoxMock = vi.fn(() => false);
const isSafariMock = vi.fn(() => false);

vi.mock('../browser', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isFirefox: () => isFirefoxMock(),
  isSafari: () => isSafariMock(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  isFirefoxMock.mockReturnValue(false);
  isSafariMock.mockReturnValue(false);
});

describe('hasNotificationsPermission', () => {
  it('returns the contains() result', async () => {
    containsMock.mockResolvedValue(true);
    expect(await hasNotificationsPermission()).toBe(true);
    expect(containsMock).toHaveBeenCalledWith({ permissions: ['notifications'] });
  });

  it('returns false when the permissions API throws', async () => {
    containsMock.mockRejectedValue(new Error('boom'));
    expect(await hasNotificationsPermission()).toBe(false);
  });
});

describe('ensureNotificationsPermission', () => {
  it('skips the request when already granted (non-Firefox)', async () => {
    containsMock.mockResolvedValue(true);
    expect(await ensureNotificationsPermission()).toBe(true);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('requests the permission when not granted and returns the result', async () => {
    containsMock.mockResolvedValue(false);
    requestMock.mockResolvedValue(true);
    expect(await ensureNotificationsPermission()).toBe(true);
    expect(requestMock).toHaveBeenCalledWith({ permissions: ['notifications'] });

    requestMock.mockResolvedValue(false);
    expect(await ensureNotificationsPermission()).toBe(false);
  });

  it('skips the contains pre-check on Firefox (request must be first await in the gesture)', async () => {
    isFirefoxMock.mockReturnValue(true);
    requestMock.mockResolvedValue(true);
    expect(await ensureNotificationsPermission()).toBe(true);
    expect(containsMock).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledWith({ permissions: ['notifications'] });
  });

  it('treats Safari as granted without touching the permissions API', async () => {
    isSafariMock.mockReturnValue(true);
    expect(await ensureNotificationsPermission()).toBe(true);
    expect(containsMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('returns false when the request throws', async () => {
    containsMock.mockResolvedValue(false);
    requestMock.mockRejectedValue(new Error('denied'));
    expect(await ensureNotificationsPermission()).toBe(false);
  });
});
