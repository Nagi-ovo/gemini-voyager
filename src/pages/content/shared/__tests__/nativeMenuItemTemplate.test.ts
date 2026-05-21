import { describe, expect, it } from 'vitest';

import {
  createMenuItemFromNativeTemplate,
  updateMenuItemTemplateLabel,
} from '../nativeMenuItemTemplate';

function createTemplateButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'mat-mdc-menu-item mat-focus-indicator';
  button.setAttribute('data-test-id', 'share-button');

  const icon = document.createElement('mat-icon');
  icon.className =
    'mat-icon notranslate menu-icon google-symbols mat-ligature-font mat-icon-no-color';
  icon.setAttribute('fonticon', 'share');
  icon.setAttribute('data-mat-icon-type', 'font');
  icon.setAttribute('data-mat-icon-name', 'share');
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'mat-mdc-menu-item-text';

  const textInner = document.createElement('span');
  textInner.className = 'menu-text';
  textInner.textContent = 'Share conversation';
  text.appendChild(textInner);

  button.append(icon, text);
  return button;
}

function createMenuContent(): HTMLElement {
  const content = document.createElement('div');
  content.className = 'mat-mdc-menu-content';
  content.appendChild(createTemplateButton());
  document.body.appendChild(content);
  return content;
}

function createWrappedMenuContent(): HTMLElement {
  const content = document.createElement('div');
  content.className = 'mat-mdc-menu-content';

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-test-id', 'share-button-tooltip-container');
  wrapper.appendChild(createTemplateButton());
  content.appendChild(wrapper);

  document.body.appendChild(content);
  return content;
}

describe('nativeMenuItemTemplate', () => {
  it('updates data-mat-icon-name to match injected icon', () => {
    const menuContent = createMenuContent();
    const button = createMenuItemFromNativeTemplate({
      menuContent,
      injectedClassName: 'gv-export-conversation-menu-btn',
      iconName: 'download',
      label: '导出对话记录',
      tooltip: '导出对话记录',
    });

    expect(button).toBeTruthy();
    const icon = button?.querySelector('mat-icon');
    expect(icon?.getAttribute('fonticon')).toBe('download');
    expect(icon?.getAttribute('data-mat-icon-name')).toBe('download');
  });

  it('keeps native menu-text wrapper when replacing label text', () => {
    const menuContent = createMenuContent();
    const button = createMenuItemFromNativeTemplate({
      menuContent,
      injectedClassName: 'gv-export-conversation-menu-btn',
      iconName: 'download',
      label: '导出对话记录',
      tooltip: '导出对话记录',
    });

    expect(button).toBeTruthy();
    const textInner = button?.querySelector('.mat-mdc-menu-item-text > .menu-text');
    expect(textInner).toBeTruthy();
    expect(textInner?.textContent).toBe('导出对话记录');
  });

  it('keeps native menu-text wrapper when updating existing button label', () => {
    const menuContent = createMenuContent();
    const button = createMenuItemFromNativeTemplate({
      menuContent,
      injectedClassName: 'gv-export-conversation-menu-btn',
      iconName: 'download',
      label: 'Export conversation history',
      tooltip: 'Export conversation history',
    });

    expect(button).toBeTruthy();
    if (!button) return;

    updateMenuItemTemplateLabel(button, '导出对话记录', '导出对话记录');
    const textInner = button.querySelector('.mat-mdc-menu-item-text > .menu-text');
    expect(textInner).toBeTruthy();
    expect(textInner?.textContent).toBe('导出对话记录');
  });

  it('still finds nested native template when direct buttons are excluded', () => {
    const menuContent = createWrappedMenuContent();
    const injected = document.createElement('button');
    injected.className = 'mat-mdc-menu-item gv-export-conversation-menu-btn';
    menuContent.appendChild(injected);

    const button = createMenuItemFromNativeTemplate({
      menuContent,
      injectedClassName: 'gv-export-conversation-menu-btn',
      iconName: 'download',
      label: 'Export conversation history',
      tooltip: 'Export conversation history',
      excludedClassNames: ['gv-export-conversation-menu-btn'],
    });

    expect(button).toBeTruthy();
    expect(button?.classList.contains('gv-export-conversation-menu-btn')).toBe(true);
    expect(button?.querySelector('mat-icon')?.className).toContain('menu-icon');
  });

  it('swaps lumi-symbols to google-symbols so Material Symbols glyphs render', () => {
    // Simulate a gem-menu-item template using lumi-symbols (lr26 Gemini default).
    const menuContent = document.createElement('gem-menu');
    const item = document.createElement('gem-menu-item');
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-test-id', 'pin-button');

    const content = document.createElement('gem-menu-item-content');
    const leading = document.createElement('div');
    leading.className = 'leading-container';
    const gemIcon = document.createElement('gem-icon');
    const icon = document.createElement('mat-icon');
    icon.className = 'mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font';
    icon.setAttribute('fonticon', 'push_pin');
    icon.setAttribute('role', 'img');
    gemIcon.appendChild(icon);
    leading.appendChild(gemIcon);

    const labelContainer = document.createElement('div');
    labelContainer.className = 'label-container';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    const inner = document.createElement('span');
    inner.textContent = 'Pin';
    labelSpan.appendChild(inner);
    labelContainer.appendChild(labelSpan);

    content.appendChild(leading);
    content.appendChild(labelContainer);
    item.appendChild(content);
    menuContent.appendChild(item);
    document.body.appendChild(menuContent);

    const button = createMenuItemFromNativeTemplate({
      menuContent,
      injectedClassName: 'gv-export-conversation-menu-btn',
      iconName: 'download',
      label: 'Export',
      tooltip: 'Export',
    });

    expect(button).toBeTruthy();
    const cloneIcon = button?.querySelector('mat-icon');
    expect(cloneIcon?.classList.contains('lumi-symbols')).toBe(false);
    expect(cloneIcon?.classList.contains('google-symbols')).toBe(true);
    expect(cloneIcon?.getAttribute('fonticon')).toBe('download');
  });
});
