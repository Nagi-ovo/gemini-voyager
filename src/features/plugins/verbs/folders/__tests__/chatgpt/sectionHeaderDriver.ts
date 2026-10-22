/**
 * Drives the ChatGPT folder section's header the way a user does: its buttons
 * by accessible name, and the menus and settings they open in body-level
 * popover layers.
 */
import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

function sectionRoot(): ShadowRoot {
  return document.querySelector<HTMLElement>('.gv-chatgpt-folder-section')!.shadowRoot!;
}

export function headerButton(label: string): HTMLButtonElement {
  const button = sectionRoot().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`No header button named ${label}`);
  return button;
}

/** The header buttons' accessible names, in order. */
export function headerLabels(): string[] {
  return [...sectionRoot().querySelectorAll('.gv-folder-header-actions button')].map(
    (button) => button.getAttribute('aria-label') ?? '',
  );
}

function popoverRoots(): ShadowRoot[] {
  return [...document.querySelectorAll<HTMLElement>('[data-gv-layer="popover"]')].map(
    (host) => host.shadowRoot!,
  );
}

/** Presses the header button `button`, then the item `item` in the menu it opens. */
export function chooseFromHeaderMenu(button: string, item: string): void {
  headerButton(button).click();
  const entry = popoverRoots()
    .flatMap((root) => [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')])
    .find((candidate) => candidate.textContent === item);
  if (!entry) throw new Error(`No menu item ${item}`);
  entry.click();
}

/** Imports or exports through the header's import/export menu. */
export function transfer(direction: 'import' | 'export'): void {
  chooseFromHeaderMenu(t('folder_import_export'), t(`folder_${direction}`));
}

/** Opens the folder settings from the header and returns the open popover. */
export function openSettings(): HTMLElement {
  headerButton(t('folder_settings')).click();
  const settings = popoverRoots()
    .map((root) => root.querySelector<HTMLElement>('.gv-folder-settings-menu'))
    .find(Boolean);
  if (!settings) throw new Error('The folder settings did not open');
  return settings;
}

/** Picks a conversation order in the open settings. */
export function chooseSortMode(settings: HTMLElement, mode: 'manual' | 'recent'): void {
  const label = t(mode === 'manual' ? 'folder_sort_manual' : 'folder_sort_recent');
  [...settings.querySelectorAll<HTMLButtonElement>('.gv-folder-sort-option')]
    .find((option) => option.textContent === label)!
    .click();
}

/** Steps a display setting in the open settings, by its label key. */
export function stepSetting(settings: HTMLElement, labelKey: string, step: 'down' | 'up'): void {
  const row = [...settings.querySelectorAll('.gv-folder-settings-row')].find(
    (candidate) =>
      candidate.querySelector('.gv-folder-settings-label')?.textContent === t(labelKey),
  );
  if (!row) throw new Error(`No settings row ${labelKey}`);
  const [down, up] = row.querySelectorAll<HTMLButtonElement>('.gv-folder-stepper-btn');
  (step === 'down' ? down : up).click();
}
