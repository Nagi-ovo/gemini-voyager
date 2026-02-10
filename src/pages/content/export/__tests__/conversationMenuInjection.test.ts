import { describe, expect, it, vi } from 'vitest';

import {
  injectConversationMenuExportButton,
  isConversationMenuPanel,
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

describe('conversationMenuInjection', () => {
  it('identifies conversation menu panel by known conversation action test ids', () => {
    const panel = createConversationMenuPanel();
    expect(isConversationMenuPanel(panel)).toBe(true);
  });

  it('does not treat model switch menu as conversation menu', () => {
    const panel = createConversationMenuPanel();
    panel.classList.add('gds-mode-switch-menu');
    expect(isConversationMenuPanel(panel)).toBe(false);
  });

  it('does not treat sidebar conversation menu as top title conversation menu', () => {
    const sidebarContainer = document.createElement('div');
    sidebarContainer.setAttribute('data-test-id', 'overflow-container');
    const sidebarTrigger = document.createElement('button');
    sidebarTrigger.setAttribute('data-test-id', 'actions-menu-button');
    sidebarTrigger.setAttribute('aria-haspopup', 'menu');
    sidebarTrigger.setAttribute('aria-expanded', 'true');
    sidebarContainer.appendChild(sidebarTrigger);
    document.body.appendChild(sidebarContainer);

    const panel = createConversationMenuPanel();

    expect(isConversationMenuPanel(panel)).toBe(false);
    expect(
      injectConversationMenuExportButton(panel, {
        label: 'Export',
        tooltip: 'Export chat history',
        onClick: vi.fn(),
      }),
    ).toBeNull();

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
});
