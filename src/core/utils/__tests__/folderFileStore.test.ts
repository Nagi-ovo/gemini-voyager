import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

import type { StoredFile } from '../folderFileStore';
import { listFilesForFolder, loadFile, removeFile, saveFile } from '../folderFileStore';

// Each test uses the shared in-memory IDB provided by fake-indexeddb/auto.

function makeFile(overrides: Partial<StoredFile> = {}): StoredFile {
  const data = new TextEncoder().encode('test content').buffer as ArrayBuffer;
  return {
    id: 'file-1',
    folderId: 'folder-a',
    name: 'test.txt',
    mimeType: 'text/plain',
    data,
    ...overrides,
  };
}

describe('folderFileStore', () => {
  afterEach(async () => {
    // Clean up between tests by removing known test IDs
    await removeFile('file-1');
    await removeFile('file-2');
    await removeFile('a1');
    await removeFile('b1');
    await removeFile('a2');
  });

  it('saves and loads a file by ID', async () => {
    const file = makeFile();
    await saveFile(file);
    const loaded = await loadFile('file-1');

    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe('test.txt');
    expect(loaded?.folderId).toBe('folder-a');
    expect(loaded?.mimeType).toBe('text/plain');
  });

  it('returns null when loading a nonexistent file', async () => {
    const result = await loadFile('does-not-exist');
    expect(result).toBeNull();
  });

  it('removes a file by ID', async () => {
    const file = makeFile({ id: 'file-2', folderId: 'folder-b' });
    await saveFile(file);
    await removeFile('file-2');
    const loaded = await loadFile('file-2');
    expect(loaded).toBeNull();
  });

  it('lists files for a specific folder', async () => {
    const data = new TextEncoder().encode('x').buffer as ArrayBuffer;
    await saveFile({ id: 'a1', folderId: 'folder-x', name: 'a.txt', mimeType: 'text/plain', data });
    await saveFile({ id: 'b1', folderId: 'folder-y', name: 'b.txt', mimeType: 'text/plain', data });
    await saveFile({ id: 'a2', folderId: 'folder-x', name: 'c.txt', mimeType: 'text/plain', data });

    const results = await listFilesForFolder('folder-x');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(['a1', 'a2']);
  });
});
