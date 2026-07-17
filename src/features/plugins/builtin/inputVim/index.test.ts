import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startInputVimPlugin, stopInputVimPlugin } from './index';

const mocks = vi.hoisted(() => ({
  startInputVimMode: vi.fn(),
}));

vi.mock('@/pages/content/chatInput/vimMode', () => ({
  startInputVimMode: mocks.startInputVimMode,
}));

describe('input Vim builtin plugin lifecycle', () => {
  beforeEach(() => {
    stopInputVimPlugin();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopInputVimPlugin();
  });

  it('forces Vim on while the plugin is mounted and cleans up on unmount', async () => {
    const cleanup = vi.fn();
    mocks.startInputVimMode.mockResolvedValue(cleanup);

    startInputVimPlugin();

    expect(mocks.startInputVimMode).toHaveBeenCalledOnce();
    expect(mocks.startInputVimMode).toHaveBeenCalledWith({ forceEnabled: true });
    await vi.waitFor(() => expect(mocks.startInputVimMode).toHaveResolved());

    stopInputVimPlugin();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('cleans up a late async start when the plugin was already disabled', async () => {
    let resolveStart: (cleanup: () => void) => void = () => {
      throw new Error('Expected deferred Vim start resolver.');
    };
    const cleanup = vi.fn();
    mocks.startInputVimMode.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveStart = resolve;
      }),
    );

    startInputVimPlugin();
    stopInputVimPlugin();
    resolveStart(cleanup);

    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
  });
});
