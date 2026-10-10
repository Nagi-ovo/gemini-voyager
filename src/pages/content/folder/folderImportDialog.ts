import type { ImportStrategy } from '@/features/folder/types/import-export';
import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

import type { ImportSource } from './folderTransferHost';

interface ImportDialogActions {
  /** Run the import, asking beside `anchor` if needed; resolves true once the data is saved. */
  submit: (source: ImportSource, strategy: ImportStrategy, anchor: HTMLElement) => Promise<boolean>;
  /** Whether `overlay` is still the dialog its owner tracks as open. */
  isActive: (overlay: HTMLElement) => boolean;
  close: () => void;
}

function createRadioOption(value: string, label: string, checked: boolean): HTMLElement {
  const container = document.createElement('label');
  container.className = 'gv-folder-import-radio-option';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'import-strategy';
  radio.value = value;
  radio.checked = checked;

  const labelText = document.createElement('span');
  labelText.textContent = label;

  container.appendChild(radio);
  container.appendChild(labelText);

  return container;
}

function createStrategySection(): { container: HTMLElement; mergeOption: HTMLElement } {
  const container = document.createElement('div');
  container.className = 'gv-folder-import-strategy';

  const strategyLabel = document.createElement('div');
  strategyLabel.className = 'gv-folder-import-strategy-label';
  strategyLabel.textContent = t('folder_import_strategy');

  const strategyOptions = document.createElement('div');
  strategyOptions.className = 'gv-folder-import-strategy-options';

  const mergeOption = createRadioOption('merge', t('folder_import_merge'), true);
  const overwriteOption = createRadioOption('overwrite', t('folder_import_overwrite'), false);

  strategyOptions.appendChild(mergeOption);
  strategyOptions.appendChild(overwriteOption);

  container.appendChild(strategyLabel);
  container.appendChild(strategyOptions);
  return { container, mergeOption };
}

function createFileSection(): { container: HTMLElement; fileInput: HTMLInputElement } {
  const container = document.createElement('div');
  container.className = 'gv-folder-import-file-input';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';

  const fileButton = document.createElement('button');
  fileButton.className = 'gv-folder-import-file-button';
  fileButton.textContent = t('folder_import_select_file');
  fileButton.addEventListener('click', () => fileInput.click());

  const fileName = document.createElement('div');
  fileName.className = 'gv-folder-import-file-name';
  fileName.textContent = '';

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      fileName.textContent = fileInput.files[0].name;
    }
  });

  container.appendChild(fileInput);
  container.appendChild(fileButton);
  container.appendChild(fileName);
  return { container, fileInput };
}

function createPasteSection(): { container: HTMLElement; pasteArea: HTMLTextAreaElement } {
  const container = document.createElement('div');
  container.className = 'gv-folder-import-paste-container';

  const pasteToggleBtn = document.createElement('button');
  pasteToggleBtn.className = 'gv-folder-import-paste-toggle';
  pasteToggleBtn.textContent = t('folder_import_paste_json');
  let pasteExpanded = false;

  const pasteArea = document.createElement('textarea');
  pasteArea.className = 'gv-folder-import-paste-area';
  pasteArea.placeholder = t('folder_import_paste_placeholder');
  pasteArea.style.display = 'none';

  pasteToggleBtn.addEventListener('click', () => {
    pasteExpanded = !pasteExpanded;
    pasteArea.style.display = pasteExpanded ? 'block' : 'none';
    pasteToggleBtn.classList.toggle('gv-folder-import-paste-toggle-active', pasteExpanded);
  });

  container.appendChild(pasteToggleBtn);
  container.appendChild(pasteArea);
  return { container, pasteArea };
}

/**
 * Builds the detached import overlay. Pasted JSON wins over a chosen file; the dialog closes
 * only after a saved import while it is still the active one, otherwise Import is re-enabled.
 */
export function createImportDialog(actions: ImportDialogActions): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'gv-folder-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'gv-folder-import-dialog';

  const dialogTitle = document.createElement('div');
  dialogTitle.className = 'gv-folder-dialog-title';
  dialogTitle.textContent = t('folder_import_title');

  const strategy = createStrategySection();
  const file = createFileSection();
  const paste = createPasteSection();

  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'gv-folder-dialog-buttons';

  const importBtn = document.createElement('button');
  importBtn.className = 'gv-folder-dialog-btn gv-folder-dialog-btn-primary';
  importBtn.textContent = t('pm_import');
  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true;
    const selected = (strategy.mergeOption.querySelector('input') as HTMLInputElement).checked
      ? 'merge'
      : 'overwrite';
    const pasteText = paste.pasteArea.value.trim();
    const saved = await actions.submit(
      pasteText ? { text: pasteText } : { file: file.fileInput.files?.[0] ?? null },
      selected,
      importBtn,
    );
    if (saved && actions.isActive(overlay)) actions.close();
    else importBtn.disabled = false;
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'gv-folder-dialog-btn gv-folder-dialog-btn-secondary';
  cancelBtn.textContent = t('pm_cancel');
  cancelBtn.addEventListener('click', () => {
    actions.close();
  });

  buttonsContainer.appendChild(cancelBtn);
  buttonsContainer.appendChild(importBtn);

  dialog.appendChild(dialogTitle);
  dialog.appendChild(strategy.container);
  dialog.appendChild(file.container);
  dialog.appendChild(paste.container);
  dialog.appendChild(buttonsContainer);
  overlay.appendChild(dialog);
  return overlay;
}
