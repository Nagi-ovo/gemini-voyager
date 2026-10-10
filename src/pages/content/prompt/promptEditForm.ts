/**
 * The add / edit form of the Prompt Manager.
 *
 * Validates the name (required, unique under the shared normalization) and
 * saves through the prompt library. A save that did not land keeps what was
 * typed; an edit whose prompt was deleted elsewhere keeps the draft, and the
 * next save adds it as a new prompt.
 */
import type { PromptItem } from '@/core/types/sync';
import { convertLegacyBraces } from '@/features/prompt/model/promptTemplate';
import type { TranslationKey } from '@/utils/translations';

import type { PromptLibraryState } from './promptLibraryState';
import { isPromptNameTaken, normalizePromptName } from './promptName';
import { dedupeTags } from './promptTags';

export interface PromptEditForm {
  readonly element: HTMLFormElement;
  /** Opens an empty form for a new prompt. */
  startAdd: () => void;
  /** Opens the form filled with `item`; saving replaces it. */
  startEdit: (item: PromptItem) => void;
  /** Hides the form and forgets which prompt was being edited, keeping the fields. */
  hide: () => void;
  applyTexts: () => void;
}

export interface PromptEditFormOptions {
  t: (key: TranslationKey) => string;
  library: Pick<PromptLibraryState, 'items' | 'add' | 'edit'>;
  setNotice: (text: string, kind: 'ok' | 'err') => void;
  /** Called after a save that closed the form. */
  onSaved: () => void;
}

export function createPromptEditForm({
  t,
  library,
  setNotice,
  onSaved,
}: PromptEditFormOptions): PromptEditForm {
  const form = document.createElement('template');
  form.innerHTML = `<form class="gv-pm-add-form gv-hidden">
        <input class="gv-pm-input-name" type="text" maxlength="60" required aria-required="true" placeholder="${escapeHtml(
          t('pm_name_placeholder') || 'Name',
        )}" />
        <textarea class="gv-pm-input-text" placeholder="${escapeHtml(
          t('pm_prompt_placeholder') || 'Prompt text',
        )}" rows="3"></textarea>
        <button type="button" class="gv-pm-convert-braces gv-hidden">${escapeHtml(
          t('pm_convert_braces') || 'Turn {name} into {{name}}',
        )}</button>
        <input class="gv-pm-input-tags" type="text" placeholder="${escapeHtml(
          t('pm_tags_placeholder') || 'Tags (comma separated)',
        )}" />
        <div class="gv-pm-add-actions">
          <span class="gv-pm-inline-hint" aria-live="polite"></span>
          <button type="submit" class="gv-pm-save">${escapeHtml(t('pm_save') || 'Save')}</button>
          <button type="button" class="gv-pm-cancel">${escapeHtml(
            t('pm_cancel') || 'Cancel',
          )}</button>
        </div>
      </form>`.trim();
  const element = form.content.firstElementChild as HTMLFormElement;
  const nameInput = element.querySelector('.gv-pm-input-name') as HTMLInputElement;
  const textInput = element.querySelector('.gv-pm-input-text') as HTMLTextAreaElement;
  const tagsInput = element.querySelector('.gv-pm-input-tags') as HTMLInputElement;
  const convertBracesBtn = element.querySelector('.gv-pm-convert-braces') as HTMLButtonElement;
  const saveBtn = element.querySelector('.gv-pm-save') as HTMLButtonElement;
  const cancelBtn = element.querySelector('.gv-pm-cancel') as HTMLButtonElement;
  let editingId: string | null = null;

  /*
   * Prompts written before double braces keep working as plain text; this
   * offers the rewrite rather than guessing. Only the author knows whether a
   * given `{x}` is a placeholder or part of the prose, so the button appears
   * only when the body would actually change, and never fires on its own.
   */
  function syncConvertBracesVisibility(): void {
    const value = textInput.value;
    const changes = value.length > 0 && convertLegacyBraces(value) !== value;
    convertBracesBtn.classList.toggle('gv-hidden', !changes);
  }

  function setInlineHint(text: string, kind: 'ok' | 'err' = 'err'): void {
    const hint = element.querySelector('.gv-pm-inline-hint') as HTMLSpanElement | null;
    if (!hint) return;
    hint.textContent = text || '';
    hint.classList.toggle('ok', kind === 'ok');
    hint.classList.toggle('err', kind === 'err');
  }

  textInput.addEventListener('input', syncConvertBracesVisibility);
  convertBracesBtn.addEventListener('click', () => {
    textInput.value = convertLegacyBraces(textInput.value);
    syncConvertBracesVisibility();
    textInput.focus();
  });

  cancelBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    editingId = null;
    element.classList.add('gv-hidden');
  });

  element.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = normalizePromptName(nameInput.value);
    const text = textInput.value;
    const tags = dedupeTags((tagsInput.value || '').split(',').map((s) => s.trim()));
    if (!name) {
      setInlineHint(t('pm_name_required') || 'Prompt name is required', 'err');
      nameInput.focus();
      return;
    }
    if (isPromptNameTaken(library.items, name, editingId)) {
      setInlineHint(t('pm_name_duplicate') || 'Prompt name already exists', 'err');
      nameInput.focus();
      return;
    }
    if (!text.trim()) return;
    const outcome = editingId
      ? await library.edit(editingId, { name, text, tags })
      : await library.add({ name, text, tags });
    if (outcome === 'duplicate') {
      setInlineHint(t('pm_duplicate') || 'Duplicate prompt', 'err');
      return;
    }
    if (outcome === 'failed' || outcome === 'unavailable') return; // Keep what was typed.
    editingId = null;
    if (outcome === 'missing') {
      // Deleted elsewhere: keep the draft; saving again adds it as a new prompt.
      return setInlineHint(t('pm_edit_target_deleted') || 'Deleted elsewhere', 'err');
    }
    if (outcome === 'saved') setNotice(t('pm_saved') || 'Saved', 'ok');
    nameInput.value = '';
    textInput.value = '';
    syncConvertBracesVisibility();
    tagsInput.value = '';
    setInlineHint('');
    element.classList.add('gv-hidden');
    onSaved();
  });

  return {
    element,
    startAdd: () => {
      editingId = null;
      // Reset every field before opening so state from a cancelled edit cannot
      // leak into a new prompt.
      nameInput.value = '';
      textInput.value = '';
      syncConvertBracesVisibility();
      tagsInput.value = '';
      setInlineHint('');
      element.classList.remove('gv-hidden');
      nameInput.focus();
    },
    startEdit: (item) => {
      nameInput.value = item.name ?? '';
      textInput.value = item.text;
      syncConvertBracesVisibility();
      tagsInput.value = (item.tags || []).join(', ');
      element.classList.remove('gv-hidden');
      nameInput.focus();
      editingId = item.id;
    },
    hide: () => {
      element.classList.add('gv-hidden');
      editingId = null;
    },
    applyTexts: () => {
      convertBracesBtn.textContent = t('pm_convert_braces') || 'Turn {name} into {{name}}';
      nameInput.placeholder = t('pm_name_placeholder');
      textInput.placeholder = t('pm_prompt_placeholder');
      tagsInput.placeholder = t('pm_tags_placeholder');
      saveBtn.textContent = t('pm_save');
      cancelBtn.textContent = t('pm_cancel');
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
