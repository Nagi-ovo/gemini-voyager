import {
  HIGHLIGHT_LIMITS,
  type HighlightColor,
  type HighlightRecordV1,
  type HighlightUpdatePatch,
  areHighlightColorsEqual,
  getHighlightColorHex,
} from '@/core/types/highlight';

import { getSaveFailureMessage, translate } from './messages';

const NOTE_MAX_CHARS = 8 * 1024;
const CONFIRMATION_WAIT_MS = 15_000;

interface EditorDraft {
  note: string;
  color: HighlightColor;
  pending: boolean;
  message: string;
}

interface HighlightEditorActions {
  save(record: HighlightRecordV1, patch: HighlightUpdatePatch): Promise<void>;
  delete(record: HighlightRecordV1): Promise<void>;
  announce(message: string): void;
}

export class HighlightEditor {
  private popover: HTMLElement | null = null;
  private readonly drafts = new Map<string, EditorDraft>();
  private currentDraft: EditorDraft | null = null;
  private refreshDraft: (() => void) | null = null;
  private popoverReturnFocus: HTMLElement | null = null;
  private popoverFocusTimer: number | null = null;
  private readonly onOutsideClick = (event: MouseEvent): void => {
    const target = event.target instanceof Node ? event.target : null;
    if (target && !this.popover?.contains(target) && !this.popoverReturnFocus?.contains(target)) {
      this.close();
    }
  };
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.close(true);
  };
  private readonly onViewportChange = (event: Event): void => {
    const target = event.target instanceof Node ? event.target : null;
    if (!target || !this.popover?.contains(target)) this.close();
  };

  constructor(private readonly actions: HighlightEditorActions) {}

  open(
    record: HighlightRecordV1,
    anchorElement: HTMLElement,
    palette: readonly HighlightColor[],
  ): void {
    this.close();
    const draftKey = JSON.stringify([
      record.platform,
      record.accountHash,
      record.conversationId,
      record.id,
    ]);
    const draft = this.drafts.get(draftKey) ?? {
      note: record.note ?? '',
      color: record.color,
      pending: false,
      message: '',
    };
    this.currentDraft = draft;

    const popover = document.createElement('section');
    popover.className = 'gv-highlight-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');
    popover.setAttribute(
      'aria-label',
      translate('highlightAriaLabel', 'Saved highlight annotation'),
    );
    popover.setAttribute('dir', 'auto');

    const quote = document.createElement('div');
    quote.className = 'gv-highlight-popover-quote';
    quote.textContent = record.anchor.quote.exact;

    const note = document.createElement('textarea');
    note.className = 'gv-highlight-note';
    note.maxLength = NOTE_MAX_CHARS;
    note.placeholder = translate('highlightNotePlaceholder', 'Add a note');
    note.value = draft.note;
    note.setAttribute('aria-label', note.placeholder);

    const colorRow = document.createElement('div');
    colorRow.className = 'gv-highlight-color-row';
    colorRow.setAttribute('role', 'group');
    const colorLabel = document.createElement('span');
    colorLabel.className = 'gv-highlight-color-label';
    colorLabel.textContent = translate('highlightColor', 'Color');
    colorRow.setAttribute('aria-label', colorLabel.textContent);
    colorRow.appendChild(colorLabel);

    const updateColorSelection = (): void => {
      swatches.forEach((item, itemIndex) => {
        item.setAttribute(
          'aria-pressed',
          String(areHighlightColorsEqual(palette[itemIndex], draft.color)),
        );
      });
    };
    const swatches = palette.map((color, index) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'gv-highlight-swatch';
      swatch.style.backgroundColor = getHighlightColorHex(color);
      swatch.setAttribute('aria-label', `${colorLabel.textContent} ${index + 1}`);
      swatch.setAttribute('aria-pressed', String(areHighlightColorsEqual(color, draft.color)));
      swatch.addEventListener('click', () => {
        draft.color = color;
        updateColorSelection();
      });
      colorRow.appendChild(swatch);
      return swatch;
    });

    const actions = document.createElement('div');
    actions.className = 'gv-highlight-popover-actions';
    const deleteButton = this.createPopoverButton(
      translate('pm_delete', 'Delete'),
      'gv-highlight-popover-button-danger',
    );
    const cancelButton = this.createPopoverButton(translate('pm_cancel', 'Cancel'));
    const saveButton = this.createPopoverButton(
      translate('pm_save', 'Save'),
      'gv-highlight-popover-button-primary',
    );
    actions.append(deleteButton, cancelButton, saveButton);
    const status = document.createElement('p');
    status.className = 'gv-highlight-save-status';
    status.hidden = true;
    popover.append(quote, note, colorRow, status, actions);
    document.body.appendChild(popover);
    this.popover = popover;
    this.popoverReturnFocus = anchorElement;
    document.addEventListener('click', this.onOutsideClick, true);
    document.addEventListener('keydown', this.onKeydown, true);
    window.addEventListener('resize', this.onViewportChange, { passive: true });
    document.addEventListener('scroll', this.onViewportChange, { capture: true, passive: true });

    const setBusy = (busy: boolean): void => {
      deleteButton.disabled = busy;
      cancelButton.textContent = busy
        ? translate('floatingPanelClose', 'Close')
        : translate('pm_cancel', 'Cancel');
      saveButton.disabled = busy;
      note.disabled = busy;
      swatches.forEach((swatch) => {
        swatch.disabled = busy;
      });
    };
    this.refreshDraft = () => {
      setBusy(draft.pending);
      status.textContent = draft.message;
      status.hidden = !draft.message;
    };
    this.refreshDraft();

    const mutate = async (write: () => Promise<void>, saving: boolean): Promise<void> => {
      draft.note = note.value;
      draft.pending = true;
      draft.message = '';
      this.drafts.set(draftKey, draft);
      this.refreshDraft?.();
      // An overdue reply cannot prove failure or cancel a dispatched write.
      const watchdog = window.setTimeout(() => {
        draft.message = translate(
          'highlightConfirmationPending',
          'Still waiting for confirmation. You can close this editor; your draft will be kept.',
        );
        if (this.currentDraft === draft) {
          this.refreshDraft?.();
          this.actions.announce(draft.message);
        }
      }, CONFIRMATION_WAIT_MS);
      try {
        await write();
        this.drafts.delete(draftKey);
        if (this.currentDraft !== draft) return;
        this.close(saving);
        if (saving) this.actions.announce(translate('highlightSaved', 'Highlight saved.'));
      } catch (error) {
        draft.message = getSaveFailureMessage(error);
        if (this.currentDraft !== draft) return;
        this.actions.announce(draft.message);
      } finally {
        window.clearTimeout(watchdog);
        draft.pending = false;
        if (this.currentDraft === draft) this.refreshDraft?.();
      }
    };
    cancelButton.addEventListener('click', () => this.close(true));
    saveButton.addEventListener('click', async () => {
      const noteBytes = new TextEncoder().encode(note.value).byteLength;
      if (noteBytes > HIGHLIGHT_LIMITS.noteBytes) {
        const message = `${translate('highlightSaveFailed', 'Could not save the highlight.')} (${noteBytes} / ${HIGHLIGHT_LIMITS.noteBytes})`;
        note.setCustomValidity(message);
        note.reportValidity();
        this.actions.announce(message);
        return;
      }
      note.setCustomValidity('');
      const patch: HighlightUpdatePatch = { note: note.value, color: draft.color };
      await mutate(() => this.actions.save(record, patch), true);
    });
    note.addEventListener('input', () => {
      draft.note = note.value;
      note.setCustomValidity('');
    });
    deleteButton.addEventListener('click', () => mutate(() => this.actions.delete(record), false));

    this.positionPopover(popover, anchorElement);
    this.popoverFocusTimer = window.setTimeout(() => {
      this.popoverFocusTimer = null;
      if (note.isConnected) (note.disabled ? cancelButton : note).focus({ preventScroll: true });
    }, 0);
  }

  private createPopoverButton(label: string, extraClass = ''): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `gv-highlight-popover-button ${extraClass}`.trim();
    button.textContent = label;
    return button;
  }

  private positionPopover(popover: HTMLElement, anchorElement: HTMLElement): void {
    const anchorRect = anchorElement.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const edge = 12;
    const gap = 8;
    const desiredTop = anchorRect.bottom + gap;
    const fallbackTop = anchorRect.top - popoverRect.height - gap;
    const top =
      desiredTop + popoverRect.height <= window.innerHeight - edge ? desiredTop : fallbackTop;
    const left = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;
    popover.style.top = `${Math.max(edge, Math.min(top, window.innerHeight - popoverRect.height - edge))}px`;
    popover.style.left = `${Math.max(edge, Math.min(left, window.innerWidth - popoverRect.width - edge))}px`;
  }

  close(restoreFocus = false): void {
    const returnFocus = this.popoverReturnFocus;
    document.removeEventListener('click', this.onOutsideClick, true);
    document.removeEventListener('keydown', this.onKeydown, true);
    window.removeEventListener('resize', this.onViewportChange);
    document.removeEventListener('scroll', this.onViewportChange, true);
    if (this.popoverFocusTimer !== null) {
      window.clearTimeout(this.popoverFocusTimer);
      this.popoverFocusTimer = null;
    }
    this.popover?.remove();
    this.popover = null;
    this.currentDraft = null;
    this.refreshDraft = null;
    this.popoverReturnFocus = null;
    if (!restoreFocus || !returnFocus?.isConnected) return;
    try {
      returnFocus.focus({ preventScroll: true });
    } catch {
      returnFocus.focus();
    }
  }
}
