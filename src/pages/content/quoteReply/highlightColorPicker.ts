import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import {
  type HighlightColor,
  areHighlightColorsEqual,
  getHighlightColorHex,
  isHighlightColor,
  normalizeHighlightColorPalette,
} from '@/core/types/highlight';

import { getTranslationSync } from '../../../utils/i18n';

const CSS_CLASSES = {
  HIGHLIGHT_COLOR_BUTTON: 'gv-highlight-color-trigger',
  HIGHLIGHT_COLOR_PALETTE: 'gv-highlight-color-palette',
  HIDDEN: 'gv-hidden',
} as const;
const POSITIONING = { MIN_EDGE_OFFSET_PX: 10 } as const;
const EDIT_COLOR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>`;

const HIGHLIGHT_PREVIEW_CLASS = 'gv-highlight-selection-preview-active';
const HIGHLIGHT_PREVIEW_COLOR_PROPERTY = '--gv-highlight-selection-preview-color';
function getHighlightPreviewBackground(color: HighlightColor): string {
  const hex = getHighlightColorHex(color);
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, 0.38)`;
}

interface HighlightColorPickerOptions {
  highlightDefaultColor?: HighlightColor;
  highlightColorPalette?: readonly HighlightColor[];
}

interface HighlightColorPickerCallbacks {
  onInternalClick: () => void;
  restoreSelection: () => void;
  onPaletteChange: (colors: readonly HighlightColor[]) => void;
}

export function createHighlightColorPicker(
  options: HighlightColorPickerOptions,
  callbacks: HighlightColorPickerCallbacks,
) {
  let highlightColors = normalizeHighlightColorPalette(
    options.highlightColorPalette,
    options.highlightDefaultColor,
  );
  let selectedHighlightSlot = Math.max(
    0,
    highlightColors.findIndex((color) =>
      areHighlightColorsEqual(color, options.highlightDefaultColor ?? 'yellow'),
    ),
  );
  let selectedHighlightColor = highlightColors[selectedHighlightSlot];
  let highlightColorBtn: HTMLButtonElement | null = null;
  let highlightColorPalette: HTMLElement | null = null;
  let highlightCustomColorInput: HTMLInputElement | null = null;

  function closeHighlightColorPalette(): void {
    highlightColorPalette?.classList.add(CSS_CLASSES.HIDDEN);
    highlightColorBtn?.setAttribute('aria-expanded', 'false');
  }

  function previewHighlightColor(): void {
    document.documentElement.style.setProperty(
      HIGHLIGHT_PREVIEW_COLOR_PROPERTY,
      getHighlightPreviewBackground(selectedHighlightColor),
    );
    document.documentElement.classList.add(HIGHLIGHT_PREVIEW_CLASS);
  }

  function clearHighlightColorPreview(): void {
    document.documentElement.classList.remove(HIGHLIGHT_PREVIEW_CLASS);
    document.documentElement.style.removeProperty(HIGHLIGHT_PREVIEW_COLOR_PROPERTY);
  }

  function getHighlightColorLabel(index: number): string {
    return `${getTranslationSync('highlightColor')} ${index + 1}`;
  }

  function getHighlightColorEditLabel(): string {
    return `${getTranslationSync('highlightCustomColor')} · ${getHighlightColorLabel(selectedHighlightSlot)}`;
  }

  function positionHighlightColorPalette(): void {
    if (
      !highlightColorBtn ||
      !highlightColorPalette ||
      highlightColorPalette.classList.contains(CSS_CLASSES.HIDDEN)
    ) {
      return;
    }

    const triggerRect = highlightColorBtn.getBoundingClientRect();
    const paletteRect = highlightColorPalette.getBoundingClientRect();
    const edge = POSITIONING.MIN_EDGE_OFFSET_PX;
    const gap = 6;
    const maxTop = Math.max(edge, window.innerHeight - paletteRect.height - edge);
    const maxLeft = Math.max(edge, window.innerWidth - paletteRect.width - edge);
    const opensAbove = triggerRect.bottom + gap + paletteRect.height > window.innerHeight - edge;
    const preferredTop = opensAbove
      ? triggerRect.top - paletteRect.height - gap
      : triggerRect.bottom + gap;
    const preferredLeft = triggerRect.left + triggerRect.width / 2 - paletteRect.width / 2;

    highlightColorPalette.style.top = `${Math.min(maxTop, Math.max(edge, preferredTop))}px`;
    highlightColorPalette.style.left = `${Math.min(maxLeft, Math.max(edge, preferredLeft))}px`;
  }

  function updateHighlightColorUi(): void {
    if (highlightColorBtn) {
      highlightColorBtn.style.backgroundColor = getHighlightColorHex(selectedHighlightColor);
      highlightColorBtn.title = getTranslationSync('highlightColor');
      highlightColorBtn.setAttribute('aria-label', getTranslationSync('highlightColor'));
    }
    highlightColorPalette
      ?.querySelectorAll<HTMLButtonElement>('.gv-highlight-color-option')
      .forEach((swatch) => {
        const slot = Number(swatch.dataset.highlightSlot);
        const color = highlightColors[slot];
        if (!color) return;
        swatch.style.backgroundColor = getHighlightColorHex(color);
        swatch.dataset.highlightColor = color;
        swatch.setAttribute('aria-pressed', String(slot === selectedHighlightSlot));
        swatch.setAttribute('aria-label', getHighlightColorLabel(slot));
      });
    if (highlightCustomColorInput) {
      highlightCustomColorInput.value = getHighlightColorHex(selectedHighlightColor);
    }
    const editColorControl = highlightColorPalette?.querySelector<HTMLElement>(
      '.gv-highlight-color-edit',
    );
    if (editColorControl) {
      const label = getHighlightColorEditLabel();
      editColorControl.title = label;
      highlightCustomColorInput?.setAttribute('aria-label', label);
    }
  }

  function selectHighlightColor(color: HighlightColor): void {
    const matchingSlot = highlightColors.findIndex((candidate) =>
      areHighlightColorsEqual(candidate, color),
    );
    if (matchingSlot >= 0) {
      selectedHighlightSlot = matchingSlot;
    } else {
      highlightColors = [color, ...highlightColors.slice(1)];
      selectedHighlightSlot = 0;
      callbacks.onPaletteChange(highlightColors);
    }
    selectedHighlightColor = highlightColors[selectedHighlightSlot];
    updateHighlightColorUi();
  }

  function createCustomColorControl(palette: HTMLElement): void {
    const editColorControl = document.createElement('label');
    editColorControl.className = 'gv-highlight-color-edit';
    editColorControl.innerHTML = EDIT_COLOR_ICON;
    editColorControl.title = getHighlightColorEditLabel();
    highlightCustomColorInput = document.createElement('input');
    highlightCustomColorInput.type = 'color';
    highlightCustomColorInput.className = 'gv-highlight-custom-color';
    highlightCustomColorInput.value = getHighlightColorHex(selectedHighlightColor);
    highlightCustomColorInput.setAttribute('aria-label', getHighlightColorEditLabel());
    highlightCustomColorInput.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      callbacks.onInternalClick();
    });
    highlightCustomColorInput.addEventListener('input', () => {
      if (!highlightCustomColorInput) return;
      selectedHighlightColor = highlightCustomColorInput.value as HighlightColor;
      highlightColors[selectedHighlightSlot] = selectedHighlightColor;
      callbacks.onPaletteChange(highlightColors);
      updateHighlightColorUi();
      previewHighlightColor();
    });
    highlightCustomColorInput.addEventListener('change', () => {
      if (!highlightCustomColorInput) return;
      selectedHighlightColor = highlightCustomColorInput.value as HighlightColor;
      highlightColors[selectedHighlightSlot] = selectedHighlightColor;
      callbacks.onPaletteChange(highlightColors);
      updateHighlightColorUi();
      void browser.storage.sync
        .set({
          [StorageKeys.HIGHLIGHT_DEFAULT_COLOR]: selectedHighlightColor,
          [StorageKeys.HIGHLIGHT_COLOR_PALETTE]: [...highlightColors],
        })
        .catch(() => undefined);
      callbacks.restoreSelection();
      previewHighlightColor();
      positionHighlightColorPalette();
    });
    editColorControl.appendChild(highlightCustomColorInput);
    palette.appendChild(editColorControl);
    updateHighlightColorUi();
  }

  function mount(parent: HTMLElement): void {
    highlightColorBtn = document.createElement('button');
    highlightColorBtn.type = 'button';
    highlightColorBtn.className = `${CSS_CLASSES.HIGHLIGHT_COLOR_BUTTON} ${CSS_CLASSES.HIDDEN}`;
    highlightColorBtn.setAttribute('aria-expanded', 'false');
    highlightColorBtn.setAttribute('aria-controls', 'gv-highlight-color-palette');
    highlightColorBtn.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      callbacks.onInternalClick();
    });
    highlightColorBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = highlightColorPalette?.classList.contains(CSS_CLASSES.HIDDEN) === true;
      highlightColorPalette?.classList.toggle(CSS_CLASSES.HIDDEN, !willOpen);
      highlightColorBtn?.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) positionHighlightColorPalette();
    });

    highlightColorPalette = document.createElement('div');
    highlightColorPalette.id = 'gv-highlight-color-palette';
    highlightColorPalette.className = `${CSS_CLASSES.HIGHLIGHT_COLOR_PALETTE} ${CSS_CLASSES.HIDDEN}`;
    highlightColorPalette.setAttribute('role', 'group');
    highlightColorPalette.setAttribute('aria-label', getTranslationSync('highlightColor'));
    highlightColors.forEach((color, index) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'gv-highlight-color-option';
      swatch.style.backgroundColor = getHighlightColorHex(color);
      swatch.dataset.highlightColor = color;
      swatch.dataset.highlightSlot = String(index);
      swatch.setAttribute('aria-label', getHighlightColorLabel(index));
      swatch.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        callbacks.onInternalClick();
      });
      swatch.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectedHighlightSlot = index;
        selectedHighlightColor = highlightColors[index];
        updateHighlightColorUi();
        void browser.storage.sync
          .set({ [StorageKeys.HIGHLIGHT_DEFAULT_COLOR]: selectedHighlightColor })
          .catch(() => undefined);
        previewHighlightColor();
      });
      highlightColorPalette?.appendChild(swatch);
    });
    createCustomColorControl(highlightColorPalette);
    parent.append(highlightColorBtn, highlightColorPalette);
  }

  function applyStorageChanges(changes: Record<string, browser.Storage.StorageChange>): void {
    const paletteChange = changes[StorageKeys.HIGHLIGHT_COLOR_PALETTE];
    if (paletteChange) {
      highlightColors = normalizeHighlightColorPalette(
        paletteChange.newValue,
        selectedHighlightColor,
      );
      callbacks.onPaletteChange(highlightColors);
      selectHighlightColor(selectedHighlightColor);
    }
    const nextColor = changes[StorageKeys.HIGHLIGHT_DEFAULT_COLOR]?.newValue;
    if (isHighlightColor(nextColor)) selectHighlightColor(nextColor);
  }

  function handleDismissal(event: MouseEvent | KeyboardEvent): boolean {
    if (!highlightColorPalette || highlightColorPalette.classList.contains(CSS_CLASSES.HIDDEN)) {
      return false;
    }
    if (event instanceof KeyboardEvent) {
      if (event.key !== 'Escape') return false;
      closeHighlightColorPalette();
      highlightColorBtn?.focus({ preventScroll: true });
      return true;
    }
    if (
      !highlightColorPalette.contains(event.target as Node) &&
      !highlightColorBtn?.contains(event.target as Node)
    ) {
      closeHighlightColorPalette();
    }
    return false;
  }

  return {
    get color() {
      return selectedHighlightColor;
    },
    get colors() {
      return highlightColors;
    },
    mount,
    applyStorageChanges,
    handleDismissal,
    updateText() {
      highlightColorPalette?.setAttribute('aria-label', getTranslationSync('highlightColor'));
      updateHighlightColorUi();
    },
    setVisible(visible: boolean) {
      highlightColorBtn?.classList.toggle(CSS_CLASSES.HIDDEN, !visible);
    },
    position: positionHighlightColorPalette,
    hide() {
      closeHighlightColorPalette();
      clearHighlightColorPreview();
    },
  };
}
