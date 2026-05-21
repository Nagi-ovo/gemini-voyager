import { describe, expect, it, vi } from 'vitest';

import {
  getConversationMenuContext,
  getResponseMenuContext,
  injectConversationMenuExportButton,
  injectResponseMenuExportButton,
  isConversationMenuPanel,
  isResponseMenuPanel,
} from '../conversationMenuInjection';

function createNativeMenuButton(
  testId: string,
  label: string,
  iconName: string,
  useFontIcon: boolean = true,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'mat-mdc-menu-item mat-focus-indicator';
  button.setAttribute('role', 'menuitem');
  button.setAttribute('tabindex', '0');
  button.setAttribute('data-test-id', testId);

  const icon = document.createElement('mat-icon');
  icon.className =
    'mat-icon notranslate gds-icon-m google-symbols mat-ligature-font mat-icon-no-color';
  if (useFontIcon) {
    icon.setAttribute('fonticon', iconName);
  }
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = iconName;

  const text = document.createElement('span');
  text.className = 'mat-mdc-menu-item-text';
  const innerText = document.createElement('span');
  innerText.className = 'gds-label-m';
  innerText.textContent = label;
  text.appendChild(innerText);

  const ripple = document.createElement('div');
  ripple.className = 'mat-ripple mat-mdc-menu-ripple';
  ripple.setAttribute('matripple', '');

  button.appendChild(icon);
  button.appendChild(text);
  button.appendChild(ripple);
  return button;
}

function createConversationMenuPanel(useFontIcon: boolean = true): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'mat-mdc-menu-panel';
  panel.setAttribute('role', 'menu');

  const content = document.createElement('div');
  content.className = 'mat-mdc-menu-content';

  const pin = createNativeMenuButton('pin-button', 'Pin', 'keep', useFontIcon);
  const rename = createNativeMenuButton('rename-button', 'Rename', 'edit', useFontIcon);

  content.appendChild(pin);
  content.appendChild(rename);
  panel.appendChild(content);
  document.body.appendChild(panel);
  return panel;
}

function createResponseMenuPanel(useFontIcon: boolean = true): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'mat-mdc-menu-panel';
  panel.setAttribute('role', 'menu');

  const content = document.createElement('div');
  content.className = 'mat-mdc-menu-content';

  const exportToDocs = createNativeMenuButton(
    'export-to-docs-button',
    'Export to Docs',
    'docs',
    useFontIcon,
  );
  exportToDocs.removeAttribute('data-test-id');

  const draftInGmail = createNativeMenuButton(
    'draft-in-gmail-button',
    'Draft in Gmail',
    'gmail',
    useFontIcon,
  );
  draftInGmail.removeAttribute('data-test-id');

  const reportLegalIssue = createNativeMenuButton(
    'report-legal-issue-button',
    'Report legal issue',
    'flag',
    useFontIcon,
  );
  reportLegalIssue.removeAttribute('data-test-id');

  content.appendChild(exportToDocs);
  content.appendChild(draftInGmail);
  content.appendChild(reportLegalIssue);
  panel.appendChild(content);
  document.body.appendChild(panel);
  return panel;
}

describe('conversationMenuInjection', () => {
  it('does not treat deep research share/export menu as conversation menu', () => {
    const panel = document.createElement('div');
    panel.className = 'mat-mdc-menu-panel';
    panel.setAttribute('role', 'menu');

    const content = document.createElement('div');
    content.className = 'mat-mdc-menu-content';

    const shareContainer = document.createElement('div');
    shareContainer.setAttribute('data-test-id', 'share-button-tooltip-container');
    const shareButton = document.createElement('button');
    shareButton.setAttribute('data-test-id', 'share-button');
    shareContainer.appendChild(shareButton);
    content.appendChild(shareContainer);

    const exportToDocs = document.createElement('export-to-docs-button');
    exportToDocs.setAttribute('data-test-id', 'export-to-docs-button');
    content.appendChild(exportToDocs);

    const copyButton = document.createElement('copy-button');
    copyButton.setAttribute('data-test-id', 'copy-button');
    content.appendChild(copyButton);

    panel.appendChild(content);
    document.body.appendChild(panel);

    const deepResearchTrigger = document.createElement('button');
    deepResearchTrigger.setAttribute('data-test-id', 'export-menu-button');
    deepResearchTrigger.setAttribute('aria-haspopup', 'menu');
    deepResearchTrigger.setAttribute('aria-expanded', 'true');
    deepResearchTrigger.setAttribute('aria-controls', 'mat-menu-panel-dr');
    panel.id = 'mat-menu-panel-dr';
    document.body.appendChild(deepResearchTrigger);

    expect(isConversationMenuPanel(panel)).toBe(false);
    expect(getConversationMenuContext(panel)).toBeNull();
  });

  it('identifies conversation menu panel by known conversation action test ids', () => {
    const panel = createConversationMenuPanel();
    expect(isConversationMenuPanel(panel)).toBe(true);
  });

  it('does not treat model switch menu as conversation menu', () => {
    const panel = createConversationMenuPanel();
    panel.classList.add('gds-mode-switch-menu');
    expect(isConversationMenuPanel(panel)).toBe(false);
  });

  it('identifies sidebar conversation menu context from expanded trigger', () => {
    const sidebarContainer = document.createElement('div');
    sidebarContainer.setAttribute('data-test-id', 'overflow-container');
    const sidebarTrigger = document.createElement('button');
    sidebarTrigger.setAttribute('data-test-id', 'actions-menu-button');
    sidebarTrigger.setAttribute('aria-haspopup', 'menu');
    sidebarTrigger.setAttribute('aria-expanded', 'true');
    sidebarContainer.appendChild(sidebarTrigger);
    document.body.appendChild(sidebarContainer);

    const panel = createConversationMenuPanel();
    panel.id = 'mat-menu-panel-32';
    sidebarTrigger.setAttribute('aria-controls', 'mat-menu-panel-32');

    expect(isConversationMenuPanel(panel)).toBe(true);
    const context = getConversationMenuContext(panel);
    expect(context?.menuType).toBe('sidebar');
    expect(
      injectConversationMenuExportButton(panel, {
        label: 'Export',
        tooltip: 'Export chat history',
        onClick: vi.fn(),
      }),
    ).toBeTruthy();

    sidebarTrigger.setAttribute('aria-expanded', 'false');
    sidebarContainer.remove();
    panel.remove();
  });

  it('still treats top title conversation menu as conversation menu with same trigger test id', () => {
    const panel = createConversationMenuPanel();
    panel.id = 'mat-menu-panel-25';

    const topTrigger = document.createElement('button');
    topTrigger.setAttribute('data-test-id', 'actions-menu-button');
    topTrigger.setAttribute('aria-haspopup', 'menu');
    topTrigger.setAttribute('aria-expanded', 'true');
    topTrigger.setAttribute('aria-controls', 'mat-menu-panel-25');
    document.body.appendChild(topTrigger);

    expect(isConversationMenuPanel(panel)).toBe(true);
    const context = getConversationMenuContext(panel);
    expect(context?.menuType).toBe('top');
    const injected = injectConversationMenuExportButton(panel, {
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });
    expect(injected).toBeTruthy();

    topTrigger.setAttribute('aria-expanded', 'false');
    topTrigger.remove();
    panel.remove();
  });

  it('injects export button after pin button and avoids duplicate injection', () => {
    const panel = createConversationMenuPanel();
    const onClick = vi.fn();

    const first = injectConversationMenuExportButton(panel, {
      label: 'Export',
      tooltip: 'Export chat history',
      onClick,
    });
    const second = injectConversationMenuExportButton(panel, {
      label: 'Export',
      tooltip: 'Export chat history',
      onClick,
    });

    expect(first).toBeTruthy();
    expect(second).toBe(first);

    const content = panel.querySelector('.mat-mdc-menu-content') as HTMLElement;
    const items = Array.from(content.children);
    const pin = content.querySelector('[data-test-id="pin-button"]');
    expect(pin).toBeTruthy();
    expect(items[1]).toBe(first);
  });

  it('inherits native icon/text classes to keep alignment and weight consistent', () => {
    const panel = createConversationMenuPanel();
    const onClick = vi.fn();
    const pin = panel.querySelector('[data-test-id="pin-button"]') as HTMLButtonElement;
    const pinIcon = pin.querySelector('mat-icon');
    const pinText = pin.querySelector('.mat-mdc-menu-item-text > span');

    const button = injectConversationMenuExportButton(panel, {
      label: '导出对话记录',
      tooltip: '导出对话记录',
      onClick,
    });

    expect(button).toBeTruthy();
    const icon = button?.querySelector('mat-icon');
    const text = button?.querySelector('.mat-mdc-menu-item-text > span');
    expect(icon?.className).toBe(pinIcon?.className);
    expect(text?.className).toBe(pinText?.className);
    expect(text?.textContent).toBe('导出对话记录');
  });

  it('does not force fonticon when native icon uses ligature text only', () => {
    const panel = createConversationMenuPanel(false);
    const onClick = vi.fn();

    const button = injectConversationMenuExportButton(panel, {
      label: '导出对话记录',
      tooltip: '导出对话记录',
      onClick,
    });

    expect(button).toBeTruthy();
    const icon = button?.querySelector('mat-icon');
    expect(icon?.hasAttribute('fonticon')).toBe(false);
    expect((icon?.textContent || '').trim()).toBe('download');
  });

  it('does not override native overlay positioning styles', () => {
    const panel = createConversationMenuPanel();
    const overlayBox = document.createElement('div');
    overlayBox.className = 'cdk-overlay-connected-position-bounding-box';
    const overlayPane = document.createElement('div');
    overlayPane.className = 'cdk-overlay-pane';
    overlayPane.style.position = 'static';
    overlayPane.style.left = '12px';
    overlayPane.style.right = '8px';
    overlayPane.appendChild(panel);
    overlayBox.appendChild(overlayPane);
    document.body.appendChild(overlayBox);

    const trigger = document.createElement('button');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-label', 'Open menu for conversation actions.');
    document.body.appendChild(trigger);

    const asRect = (left: number, top: number, width: number, height: number): DOMRect => {
      const right = left + width;
      const bottom = top + height;
      return {
        x: left,
        y: top,
        width,
        height,
        top,
        left,
        right,
        bottom,
        toJSON: () => ({}),
      } as DOMRect;
    };

    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => asRect(150, 16, 100, 40));
    vi.spyOn(overlayBox, 'getBoundingClientRect').mockImplementation(() => asRect(0, 56, 400, 724));
    vi.spyOn(overlayPane, 'getBoundingClientRect').mockImplementation(() =>
      asRect(0, 56, 280, 256),
    );

    injectConversationMenuExportButton(panel, {
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });

    expect(overlayPane.style.position).toBe('static');
    expect(overlayPane.style.left).toBe('12px');
    expect(overlayPane.style.right).toBe('8px');
    expect(panel.style.transformOrigin).toBe('');
  });

  it('identifies assistant response menu panel from expanded more-menu trigger', () => {
    const panel = createResponseMenuPanel();
    panel.id = 'mat-menu-panel-77';

    const responseMoreTrigger = document.createElement('button');
    responseMoreTrigger.setAttribute('data-test-id', 'more-menu-button');
    responseMoreTrigger.setAttribute('aria-haspopup', 'menu');
    responseMoreTrigger.setAttribute('aria-expanded', 'true');
    responseMoreTrigger.setAttribute('aria-controls', 'mat-menu-panel-77');
    document.body.appendChild(responseMoreTrigger);

    expect(isResponseMenuPanel(panel)).toBe(true);
    const context = getResponseMenuContext(panel);
    expect(context?.trigger).toBe(responseMoreTrigger);
  });

  it('does not treat conversation menu as assistant response menu', () => {
    const panel = createConversationMenuPanel();
    panel.id = 'mat-menu-panel-78';

    const conversationTrigger = document.createElement('button');
    conversationTrigger.setAttribute('data-test-id', 'actions-menu-button');
    conversationTrigger.setAttribute('aria-haspopup', 'menu');
    conversationTrigger.setAttribute('aria-expanded', 'true');
    conversationTrigger.setAttribute('aria-controls', 'mat-menu-panel-78');
    document.body.appendChild(conversationTrigger);

    expect(isResponseMenuPanel(panel)).toBe(false);
    expect(getResponseMenuContext(panel)).toBeNull();
  });

  it('injects assistant-response export button after Export to Docs and avoids duplicate injection', () => {
    const panel = createResponseMenuPanel();
    panel.id = 'mat-menu-panel-79';
    const onClick = vi.fn();

    const responseMoreTrigger = document.createElement('button');
    responseMoreTrigger.setAttribute('data-test-id', 'more-menu-button');
    responseMoreTrigger.setAttribute('aria-haspopup', 'menu');
    responseMoreTrigger.setAttribute('aria-expanded', 'true');
    responseMoreTrigger.setAttribute('aria-controls', 'mat-menu-panel-79');
    document.body.appendChild(responseMoreTrigger);

    const first = injectResponseMenuExportButton(panel, {
      label: '导出对话记录',
      tooltip: '导出对话记录',
      onClick,
    });
    const second = injectResponseMenuExportButton(panel, {
      label: '导出对话记录',
      tooltip: '导出对话记录',
      onClick,
    });

    expect(first).toBeTruthy();
    expect(second).toBe(first);

    const content = panel.querySelector('.mat-mdc-menu-content') as HTMLElement;
    const items = Array.from(content.children);
    const exportToDocs = Array.from(content.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.querySelector('mat-icon')?.getAttribute('fonticon') === 'docs',
    );
    expect(exportToDocs).toBeTruthy();
    expect(items[items.indexOf(exportToDocs as Element) + 1]).toBe(first);
  });

  it('identifies assistant response menu by native action icons even when trigger linkage is missing', () => {
    document
      .querySelectorAll('[aria-haspopup="menu"][aria-expanded="true"]')
      .forEach((node) => node.remove());
    const panel = createResponseMenuPanel();
    expect(isResponseMenuPanel(panel)).toBe(true);
  });

  describe('gem-menu (lr26 response chrome updates)', () => {
    function createGemMenuItem(
      testId: string | null,
      label: string,
      iconName: string,
    ): HTMLElement {
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
});
