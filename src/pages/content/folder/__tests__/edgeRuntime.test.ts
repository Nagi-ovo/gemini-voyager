import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  folderInit: vi.fn(),
  FolderManager: vi.fn(),
}));

vi.mock('../manager', () => ({
  FolderManager: mocks.FolderManager,
}));

describe('FolderManager runtime startup', () => {
  beforeEach(() => {
    mocks.folderInit.mockReset();
    mocks.FolderManager.mockReset();
    mocks.FolderManager.mockImplementation(function FolderManagerMock() {
      return { init: mocks.folderInit };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the Gemini folder runtime when running in Edge', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Edg/120.0.0.0',
    );

    const { startFolderManager } = await import('../index');
    const manager = await startFolderManager();

    expect(manager).not.toBeNull();
    expect(mocks.FolderManager).toHaveBeenCalledTimes(1);
    expect(mocks.folderInit).toHaveBeenCalledTimes(1);
  });
});
