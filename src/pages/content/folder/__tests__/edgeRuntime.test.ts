import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isEdge: vi.fn(),
  folderInit: vi.fn(),
  FolderManager: vi.fn(),
}));

vi.mock('@/core/utils/browser', () => ({
  isEdge: mocks.isEdge,
}));

vi.mock('../manager', () => ({
  FolderManager: mocks.FolderManager,
}));

describe('FolderManager Edge runtime guard', () => {
  beforeEach(() => {
    mocks.isEdge.mockReset();
    mocks.folderInit.mockReset();
    mocks.FolderManager.mockReset();
    mocks.FolderManager.mockImplementation(function FolderManagerMock() {
      return { init: mocks.folderInit };
    });
  });

  it('does not start the Gemini folder runtime on Edge', async () => {
    mocks.isEdge.mockReturnValue(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { startFolderManager } = await import('../index');
    const manager = await startFolderManager();

    expect(manager).toBeNull();
    expect(mocks.FolderManager).not.toHaveBeenCalled();
    expect(mocks.folderInit).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('starts the Gemini folder runtime outside Edge', async () => {
    mocks.isEdge.mockReturnValue(false);

    const { startFolderManager } = await import('../index');
    const manager = await startFolderManager();

    expect(manager).not.toBeNull();
    expect(mocks.FolderManager).toHaveBeenCalledTimes(1);
    expect(mocks.folderInit).toHaveBeenCalledTimes(1);
  });
});
