/** How deep a user can nest new folders in each consumer of the shared tree. */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONSUMERS, destroyMountedTrees, mountConsumer } from './treeConsumers';
import { label, menuItemLabels, treeDriver } from './treeDriver';
import { folder, sharedFixture, spyActions } from './treeFixtures';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

afterEach(() => {
  destroyMountedTrees();
  document.body.innerHTML = '';
});

describe.each(CONSUMERS)('$name: folder depth', ({ consumer }) => {
  it('offers subfolders down to a third level and none below it', () => {
    const stored = sharedFixture(
      consumer === 'aistudio' ? '__uncategorized__' : '__root_conversations__',
    );
    stored.folders.push(
      folder('i', 'Inner', { parentId: 'a', sortIndex: 0, createdAt: 3 }),
      folder('d', 'Deep', { parentId: 'i', sortIndex: 0, createdAt: 4 }),
    );
    stored.folderContents.i = [];
    stored.folderContents.d = [];
    const view = treeDriver(mountConsumer(consumer, stored, spyActions()));

    expect(view.addSubfolderButton('Alpha')).not.toBeNull();
    expect(view.addSubfolderButton('Inner')).not.toBeNull();
    expect(view.addSubfolderButton('Deep')).toBeNull();
    view.openMenuByRightClick('Inner');
    expect(menuItemLabels()).toContain(label('floatingPanelCreateSubfolder'));
    view.openMenuByRightClick('Deep');
    expect(menuItemLabels()).not.toContain(label('floatingPanelCreateSubfolder'));
  });
});
