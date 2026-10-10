import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchConversationMenusForExport } from '../conversationMenuExportObserver';

function menuButton(testId: string | null, label: string, iconName: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'mat-mdc-menu-item mat-focus-indicator';
  button.setAttribute('role', 'menuitem');
  if (testId) button.setAttribute('data-test-id', testId);
  const icon = document.createElement('mat-icon');
  icon.className = 'mat-icon google-symbols mat-ligature-font';
  icon.setAttribute('fonticon', iconName);
  icon.textContent = iconName;
  const text = document.createElement('span');
  text.className = 'mat-mdc-menu-item-text';
  text.textContent = label;
  button.append(icon, text);
  return button;
}

function openMenu(
  id: string,
  triggerTestId: string,
  items: HTMLButtonElement[],
): { panel: HTMLElement; trigger: HTMLButtonElement } {
  const trigger = document.createElement('button');
  trigger.setAttribute('data-test-id', triggerTestId);
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', id);
  document.body.appendChild(trigger);

  const panel = document.createElement('div');
  panel.id = id;
  panel.className = 'mat-mdc-menu-panel';
  panel.setAttribute('role', 'menu');
  const content = document.createElement('div');
  content.className = 'mat-mdc-menu-content';
  content.append(...items);
  panel.appendChild(content);
  document.body.appendChild(panel);
  return { panel, trigger };
}

describe('watchConversationMenusForExport', () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('adds a translated export item to a conversation menu that opens', async () => {
    const onExport = vi.fn();
    stop = watchConversationMenusForExport({ label: () => 'Exporter', onExport });

    const { panel, trigger } = openMenu('menu-top', 'actions-menu-button', [
      menuButton('pin-button', 'Pin', 'keep'),
      menuButton('rename-button', 'Rename', 'edit'),
    ]);
    await vi.advanceTimersByTimeAsync(40);

    const item = panel.querySelector<HTMLElement>('.gv-export-conversation-menu-btn');
    expect(item?.textContent).toContain('Exporter');
    item?.click();
    expect(onExport).toHaveBeenCalledWith({ menuType: 'top', trigger });
  });

  it('routes the response menu item as a message export', async () => {
    const onExport = vi.fn();
    stop = watchConversationMenusForExport({ label: () => 'Export', onExport });

    const { panel, trigger } = openMenu('menu-response', 'more-menu-button', [
      menuButton(null, 'Export to Docs', 'docs'),
      menuButton(null, 'Draft in Gmail', 'gmail'),
    ]);
    await vi.advanceTimersByTimeAsync(40);

    panel.querySelector<HTMLElement>('.gv-export-response-menu-btn')?.click();
    expect(onExport).toHaveBeenCalledWith({ menuType: 'message', trigger });
  });

  it('reads the label again for each menu so language changes apply', async () => {
    let label = 'Export';
    stop = watchConversationMenusForExport({ label: () => label, onExport: vi.fn() });

    label = '导出对话记录';
    const { panel } = openMenu('menu-later', 'actions-menu-button', [
      menuButton('pin-button', 'Pin', 'keep'),
    ]);
    await vi.advanceTimersByTimeAsync(40);

    expect(panel.querySelector('.gv-export-conversation-menu-btn')?.textContent).toContain(
      '导出对话记录',
    );
  });

  it('ignores a second watcher and stops injecting once stopped', async () => {
    const onExport = vi.fn();
    stop = watchConversationMenusForExport({ label: () => 'First', onExport });
    const ignored = watchConversationMenusForExport({ label: () => 'Second', onExport });
    ignored();

    stop();
    const { panel } = openMenu('menu-after-stop', 'actions-menu-button', [
      menuButton('pin-button', 'Pin', 'keep'),
    ]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(panel.querySelector('.gv-export-conversation-menu-btn')).toBeNull();
  });
});
