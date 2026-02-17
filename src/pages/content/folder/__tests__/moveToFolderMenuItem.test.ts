import { describe, expect, it } from 'vitest';

import { createMoveToFolderMenuItem } from '../moveToFolderMenuItem';

function createTemplateButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'mat-mdc-menu-item mat-focus-indicator';
  button.setAttribute('data-test-id', 'pin-button');

  const icon = document.createElement('mat-icon');
  icon.className =
    'mat-icon notranslate menu-icon google-symbols mat-ligature-font mat-icon-no-color';
  icon.setAttribute('fonticon', 'keep');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'keep';

  const text = document.createElement('span');
  text.className = 'mat-mdc-menu-item-text';
  const inner = document.createElement('span');
  inner.className = 'menu-text';
  inner.textContent = 'Pin';
  text.appendChild(inner);

  const ripple = document.createElement('div');
  ripple.className = 'mat-ripple mat-mdc-menu-ripple';
  ripple.setAttribute('matripple', '');

  button.append(icon, text, ripple);
  return button;
}

describe('createMoveToFolderMenuItem', () => {
  it('uses native template when available', () => {
    const menuContent = document.createElement('div');
    menuContent.className = 'mat-mdc-menu-content';
    menuContent.appendChild(createTemplateButton());

    const menuItem = createMoveToFolderMenuItem(menuContent, 'Move to folder', 'Move to folder');
    expect(menuItem.classList.contains('gv-move-to-folder-btn')).toBe(true);
    expect(menuItem.querySelector('.mat-mdc-menu-item-text .menu-text')?.textContent).toBe(
      'Move to folder',
    );
  });

  it('falls back to manual button when no native template exists', () => {
    const menuContent = document.createElement('div');
    menuContent.className = 'mat-mdc-menu-content';

    const menuItem = createMoveToFolderMenuItem(menuContent, 'Move to folder', 'Move to folder');
    expect(menuItem.classList.contains('gv-move-to-folder-btn')).toBe(true);
    expect(menuItem.querySelector('mat-icon')?.getAttribute('fonticon')).toBe('folder_open');
    expect(menuItem.querySelector('.mat-mdc-menu-item-text .gds-body-m')?.textContent).toBe(
      'Move to folder',
    );
  });
});
