import { describe, expect, it, vi } from 'vitest';

import {
  getConversationMenuContext,
  injectConversationMenuExportButton,
  injectConversationMenuMoveToFolderButton,
  injectResponseMenuExportButton,
  isConversationMenuPanel,
  isResponseMenuPanel,
} from '../conversationMenuInjection';

describe('gem-menu (lr26 response chrome updates)', () => {
  function createGemMenuItem(testId: string | null, label: string, iconName: string): HTMLElement {
    const item = document.createElement('gem-menu-item');
    item.setAttribute('role', 'menuitem');
    if (testId) item.setAttribute('data-test-id', testId);

    const content = document.createElement('gem-menu-item-content');

    const leading = document.createElement('div');
    leading.className = 'leading-container';
    const gemIcon = document.createElement('gem-icon');
    const icon = document.createElement('mat-icon');
    icon.className = 'mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font';
    icon.setAttribute('fonticon', iconName);
    icon.setAttribute('role', 'img');
    gemIcon.appendChild(icon);
    leading.appendChild(gemIcon);

    const labelContainer = document.createElement('div');
    labelContainer.className = 'label-container';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    const innerSpan = document.createElement('span');
    innerSpan.textContent = label;
    labelSpan.appendChild(innerSpan);
    labelContainer.appendChild(labelSpan);

    const trailing = document.createElement('div');
    trailing.className = 'trailing-container';

    content.appendChild(leading);
    content.appendChild(labelContainer);
    content.appendChild(trailing);
    item.appendChild(content);
    return item;
  }

  function createGemConversationMenu(): HTMLElement {
    const menu = document.createElement('gem-menu');
    menu.appendChild(createGemMenuItem('share-button', 'Share conversation', 'share_1'));
    menu.appendChild(createGemMenuItem('pin-button', 'Pin', 'push_pin'));
    menu.appendChild(createGemMenuItem('rename-button', 'Rename', 'edit'));
    menu.appendChild(createGemMenuItem('delete-button', 'Delete', 'delete'));
    document.body.appendChild(menu);
    return menu;
  }

  function createGemResponseMenu(): HTMLElement {
    const menu = document.createElement('gem-menu');
    // Response menu: no pin/rename/delete test-ids; identified by docs + gmail/flag icons
    menu.appendChild(createGemMenuItem(null, 'Export to Docs', 'docs'));
    menu.appendChild(createGemMenuItem(null, 'Draft in Gmail', 'gmail'));
    menu.appendChild(createGemMenuItem(null, 'Report legal issue', 'flag'));
    document.body.appendChild(menu);
    return menu;
  }

  it('identifies gem-menu as conversation menu when trigger is new conversation-actions-menu-icon-button', () => {
    const menu = createGemConversationMenu();
    const trigger = document.createElement('gem-icon-button');
    trigger.setAttribute('data-test-id', 'conversation-actions-menu-icon-button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.appendChild(trigger);

    expect(isConversationMenuPanel(menu)).toBe(true);
    const ctx = getConversationMenuContext(menu);
    expect(ctx?.menuType).toBe('top');
  });

  it('injects export button into gem-menu using gem-menu-item as template', () => {
    const menu = createGemConversationMenu();
    const trigger = document.createElement('gem-icon-button');
    trigger.setAttribute('data-test-id', 'conversation-actions-menu-icon-button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.appendChild(trigger);

    const injected = injectConversationMenuExportButton(menu, {
      label: 'Export conversation',
      tooltip: 'Export conversation',
      onClick: vi.fn(),
    });

    expect(injected).toBeTruthy();
    expect(injected?.tagName.toLowerCase()).toBe('gem-menu-item');
    expect(injected?.classList.contains('gv-export-conversation-menu-btn')).toBe(true);
    expect(injected?.querySelector('mat-icon')?.getAttribute('fonticon')).toBe('download');
    // label structure: .label-container > .label > <span> (deepest text)
    const labelSpan = injected?.querySelector('.label-container .label') as HTMLElement | null;
    expect(labelSpan).toBeTruthy();
    // Either the deepest span carries the text, or the .label itself if no inner span exists
    const innerTextNode = labelSpan?.querySelector('span') ?? labelSpan;
    expect(innerTextNode?.textContent).toBe('Export conversation');
    // Should be inserted after pin-button
    const items = Array.from(menu.children);
    const pinIdx = items.findIndex(
      (c) => (c as HTMLElement).getAttribute('data-test-id') === 'pin-button',
    );
    expect(items[pinIdx + 1]).toBe(injected);
  });

  it('injects move-to-folder button into gem-menu using gem-menu-item as template', () => {
    const menu = createGemConversationMenu();
    const trigger = document.createElement('gem-icon-button');
    trigger.setAttribute('data-test-id', 'conversation-actions-menu-icon-button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.appendChild(trigger);

    const onClick = vi.fn();
    const injected = injectConversationMenuMoveToFolderButton(menu, {
      label: 'Move to folder',
      tooltip: 'Move to folder',
      onClick,
    });

    expect(injected).toBeTruthy();
    expect(injected?.tagName.toLowerCase()).toBe('gem-menu-item');
    expect(injected?.classList.contains('gv-move-to-folder-btn')).toBe(true);
    expect(injected?.querySelector('mat-icon')?.getAttribute('fonticon')).toBe('folder_open');

    const labelSpan = injected?.querySelector('.label-container .label') as HTMLElement | null;
    const innerTextNode = labelSpan?.querySelector('span') ?? labelSpan;
    expect(innerTextNode?.textContent).toBe('Move to folder');

    // Inserted after pin-button (no export button present)
    const items = Array.from(menu.children);
    const pinIdx = items.findIndex(
      (c) => (c as HTMLElement).getAttribute('data-test-id') === 'pin-button',
    );
    expect(items[pinIdx + 1]).toBe(injected);

    injected?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate-inject into the same gem-menu', () => {
    const menu = createGemConversationMenu();
    const trigger = document.createElement('gem-icon-button');
    trigger.setAttribute('data-test-id', 'conversation-actions-menu-icon-button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.appendChild(trigger);

    const first = injectConversationMenuExportButton(menu, {
      label: 'Export',
      tooltip: 'Export',
      onClick: vi.fn(),
    });
    const second = injectConversationMenuExportButton(menu, {
      label: 'Export',
      tooltip: 'Export',
      onClick: vi.fn(),
    });
    expect(second).toBe(first);
  });

  it('identifies gem-menu response panel by docs + gmail/flag icons', () => {
    const menu = createGemResponseMenu();
    const trigger = document.createElement('gem-icon-button');
    trigger.setAttribute('data-test-id', 'more-menu-button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.appendChild(trigger);

    expect(isResponseMenuPanel(menu)).toBe(true);
    const injected = injectResponseMenuExportButton(menu, {
      label: 'Export this message',
      tooltip: 'Export this message',
      onClick: vi.fn(),
    });
    expect(injected).toBeTruthy();
    expect(injected?.tagName.toLowerCase()).toBe('gem-menu-item');
  });
});
