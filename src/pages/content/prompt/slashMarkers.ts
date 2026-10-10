/**
 * Name markers for placed slash prompts, drawn in a fixed layer over the
 * composer.
 *
 * A `<textarea>` cannot hold a token, so its prompt names are shown as chips
 * in this layer. A contenteditable editor holds real tokens, but Gemini can
 * rebuild them as plain text; a marker then sits over each prompt name so it
 * keeps its hover preview. Markers are index-aligned with the prompts that
 * `promptsFor(input)` returns: whoever removes a prompt removes the marker at
 * the same index.
 */
import { createPackageIcon } from '@/core/icons/promptManagerIcons';
import type { PromptScheme } from '@/features/prompt/PromptSiteAdapter';

import {
  type PromptOccurrence,
  TOKEN_CLASS,
  type TokenPrompt,
  getPromptAnchor,
} from './slashComposerText';
import { applyPromptTokenColor } from './slashTheme';

export const TEXTAREA_TOKEN_CLASS = 'gv-pm-slash-textarea-token';
export const TEXTAREA_HAS_TOKEN_CLASS = 'gv-pm-slash-textarea-has-token';
export const TEXTAREA_HIDE_VALUE_CLASS = 'gv-pm-slash-textarea-hide-value';
export const INPUT_PROMPT_SELECTION_CLASS = 'gv-pm-slash-prompt-only-selection';
const TEXTAREA_TOKEN_NAME_CLASS = 'gv-pm-slash-textarea-token-name';
const NATIVE_TOKEN_MARKER_CLASS = 'gv-pm-slash-textarea-token-native';
const COVERED_SOURCE_MARKER_CLASS = 'gv-pm-slash-textarea-token-covered-source';
const SELECTED_TOKEN_MARKER_CLASS = 'gv-pm-slash-textarea-token-selected';
const LAYER_VISIBLE_CLASS = 'gv-pm-slash-textarea-tokens-visible';

export interface MarkerLayer {
  /** The composer the markers currently describe, if any. */
  readonly input: HTMLElement | null;
  /** Adds a marker for `prompt`, placed last, and starts tracking `input`. */
  add: (prompt: TokenPrompt, input: HTMLElement, hideInputValue: boolean) => void;
  /** Keeps the markers but tracks a composer the host page rebuilt. */
  follow: (input: HTMLElement) => void;
  /** Lays the markers out again, now and once more after the next frame. */
  reflow: () => void;
  /** Lays the markers out again in the page's current scheme. */
  position: () => void;
  /** Removes the markers at `indexes` (positions before any removal). */
  remove: (indexes: readonly number[]) => void;
  /** Highlights exactly the markers at `indexes`; `[]` clears the highlight. */
  markSelected: (indexes: readonly number[]) => void;
  /** Removes every marker and the classes they put on `input` (default: the tracked composer). */
  clear: (input?: HTMLElement | null) => void;
  destroy: () => void;
}

export interface MarkerLayerOptions {
  promptsFor: (input: HTMLElement) => readonly PromptOccurrence[];
  bindPreview: (target: HTMLElement, text: string) => void;
  scheme: () => PromptScheme;
}

export function createMarkerLayer({
  promptsFor,
  bindPreview,
  scheme,
}: MarkerLayerOptions): MarkerLayer {
  const container = document.createElement('div');
  container.className = 'gv-pm-slash-textarea-tokens';
  container.setAttribute('aria-hidden', 'false');
  document.body.appendChild(container);
  let tracked: HTMLElement | null = null;

  const layout = (input: HTMLElement): void =>
    positionMarkers(container, input, promptsFor(input), scheme());
  const markers = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(`.${TEXTAREA_TOKEN_CLASS}`));

  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (!tracked?.isConnected) return;
          layout(tracked);
          requestAnimationFrame(() => {
            if (tracked?.isConnected) {
              layout(tracked);
            }
          });
        })
      : null;

  function track(input: HTMLElement): void {
    resizeObserver?.disconnect();
    tracked = input;
    resizeObserver?.observe(input);
  }

  function add(prompt: TokenPrompt, input: HTMLElement, hideValue: boolean): void {
    track(input);
    const chip = document.createElement('span');
    chip.className = TEXTAREA_TOKEN_CLASS;
    const name = document.createElement('span');
    name.className = TEXTAREA_TOKEN_NAME_CLASS;
    name.textContent = prompt.name!.trim();
    chip.append(createPackageIcon(14), name);
    syncMarkerTypography(chip, input, null);
    chip.dataset.gvPromptText = prompt.text;
    if (prompt.gvSourceText) {
      chip.dataset.gvPromptSource = prompt.gvSourceText;
    }
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', prompt.name!.trim());
    bindPreview(chip, prompt.text);
    container.appendChild(chip);
    container.classList.add(LAYER_VISIBLE_CLASS);
    layout(input);
    if (hideValue && input instanceof HTMLTextAreaElement) {
      input.classList.add(TEXTAREA_HIDE_VALUE_CLASS);
    }
    if (
      input instanceof HTMLTextAreaElement &&
      !input.classList.contains(TEXTAREA_HAS_TOKEN_CLASS)
    ) {
      input.style.setProperty(
        '--gv-pm-slash-native-padding-top',
        window.getComputedStyle(input).paddingTop || '0px',
      );
      input.classList.add(TEXTAREA_HAS_TOKEN_CLASS);
    }
    const syncTokenOffset = () => {
      if (
        !container.isConnected ||
        !(input instanceof HTMLTextAreaElement) ||
        !input.classList.contains(TEXTAREA_HAS_TOKEN_CLASS)
      ) {
        return;
      }
      const height = container.getBoundingClientRect().height || 28;
      input.style.setProperty('--gv-pm-slash-token-offset', `${Math.ceil(height + 8)}px`);
    };
    syncTokenOffset();
    requestAnimationFrame(syncTokenOffset);
  }

  function clear(input: HTMLElement | null = tracked): void {
    container.replaceChildren();
    container.classList.remove(LAYER_VISIBLE_CLASS);
    delete container.dataset.gvInputKind;
    if (input) {
      input.classList.remove(INPUT_PROMPT_SELECTION_CLASS);
      input.classList.remove(TEXTAREA_HAS_TOKEN_CLASS);
      input.classList.remove(TEXTAREA_HIDE_VALUE_CLASS);
      input.classList.remove('gv-pm-slash-contenteditable-hide-value');
      if (input instanceof HTMLTextAreaElement) {
        input.style.removeProperty('--gv-pm-slash-native-padding-top');
        input.style.removeProperty('--gv-pm-slash-token-offset');
      }
    }
    tracked = null;
  }

  return {
    get input() {
      return tracked;
    },
    add,
    follow: track,
    reflow: () => {
      if (!tracked?.isConnected) return;
      layout(tracked);
      requestAnimationFrame(() => {
        if (tracked?.isConnected) {
          layout(tracked);
        }
      });
    },
    position: () => {
      container.dataset.gvTheme = scheme();
      if (tracked) layout(tracked);
    },
    remove: (indexes) => {
      const current = markers();
      for (const index of indexes) current[index]?.remove();
    },
    markSelected: (indexes) => {
      const current = markers();
      current.forEach((marker) => marker.classList.remove(SELECTED_TOKEN_MARKER_CLASS));
      indexes.forEach((index) => current[index]?.classList.add(SELECTED_TOKEN_MARKER_CLASS));
    },
    clear,
    destroy: () => {
      resizeObserver?.disconnect();
      clear();
      container.remove();
    },
  };
}

/**
 * Removes every marker on the page and the room textareas made for them.
 * Used when every placed prompt is expanded, with or without a live layer.
 */
export function stripAllMarkers(): void {
  document.querySelectorAll<HTMLElement>(`.${TEXTAREA_TOKEN_CLASS}`).forEach((token) => {
    token.parentElement?.classList.remove(LAYER_VISIBLE_CLASS);
    token.remove();
  });
  document
    .querySelectorAll<HTMLTextAreaElement>(`textarea.${TEXTAREA_HAS_TOKEN_CLASS}`)
    .forEach((input) => {
      input.classList.remove(TEXTAREA_HAS_TOKEN_CLASS, TEXTAREA_HIDE_VALUE_CLASS);
      input.style.removeProperty('--gv-pm-slash-native-padding-top');
      input.style.removeProperty('--gv-pm-slash-token-offset');
    });
}

function positionMarkers(
  container: HTMLElement,
  input: HTMLElement,
  prompts: readonly PromptOccurrence[],
  scheme: PromptScheme,
): void {
  const rect = input.getBoundingClientRect();
  const inputSurfaceColor = findInputSurfaceColor(input);
  if (input instanceof HTMLTextAreaElement) {
    container.dataset.gvInputKind = 'textarea';
    container.style.left = `${Math.round(rect.left + 8)}px`;
    container.style.top = `${Math.round(rect.top + 6)}px`;
    container.style.maxWidth = `${Math.max(120, rect.width - 16)}px`;
    container.querySelectorAll<HTMLElement>(`.${TEXTAREA_TOKEN_CLASS}`).forEach((marker) => {
      marker.classList.remove(NATIVE_TOKEN_MARKER_CLASS);
      marker.classList.remove(COVERED_SOURCE_MARKER_CLASS);
      marker.style.removeProperty('background-color');
      if (inputSurfaceColor) {
        marker.style.setProperty('--gv-pm-slash-input-surface', inputSurfaceColor);
      } else {
        marker.style.removeProperty('--gv-pm-slash-input-surface');
      }
      marker.style.removeProperty('left');
      marker.style.removeProperty('top');
      marker.style.removeProperty('max-width');
    });
    return;
  }

  container.dataset.gvInputKind = 'contenteditable';
  container.style.left = '0px';
  container.style.top = '0px';
  container.style.removeProperty('max-width');
  const markers = Array.from(container.querySelectorAll<HTMLElement>(`.${TEXTAREA_TOKEN_CLASS}`));
  prompts.forEach((prompt, index) => {
    const marker = markers[index];
    if (!marker) return;
    const anchor = getPromptAnchor(input, prompt);
    const anchorRect = anchor.rect;
    const left = anchorRect?.left ?? rect.left;
    syncMarkerTypography(marker, anchor.styleSource, anchorRect);
    // Contenteditable markers keep this geometry for hover hit-testing, but
    // only paint their glyphs when an opaque editor surface can cover the
    // rebuilt plain-text source underneath without introducing a visible chip.
    marker.classList.toggle(NATIVE_TOKEN_MARKER_CLASS, Boolean(anchor.nativeToken));
    const canCoverSource = !anchor.nativeToken && Boolean(inputSurfaceColor);
    marker.classList.toggle(COVERED_SOURCE_MARKER_CLASS, canCoverSource);
    if (canCoverSource) marker.style.backgroundColor = inputSurfaceColor!;
    else marker.style.removeProperty('background-color');
    if (inputSurfaceColor) {
      marker.style.setProperty('--gv-pm-slash-input-surface', inputSurfaceColor);
    } else {
      marker.style.removeProperty('--gv-pm-slash-input-surface');
    }
    // The marker is fixed to the viewport while the editor scrolls its own
    // content. Hide it once the prompt range leaves the editor's visible area;
    // otherwise a long collapsed composer can leak the name outside the box.
    marker.hidden = Boolean(anchorRect && !isRectInsideInput(anchorRect, rect));
    marker.style.left = `${Math.round(left)}px`;
    marker.style.top = `${Math.round(anchorRect?.top ?? rect.top)}px`;
    marker.style.maxWidth = `${Math.max(20, rect.right - left)}px`;
  });
  input
    .querySelectorAll<HTMLElement>(`.${TOKEN_CLASS}`)
    .forEach((token) => applyPromptTokenColor(token, scheme));
}

export function syncMarkerTypography(
  marker: HTMLElement,
  source: Element,
  rect: DOMRect | null,
): void {
  const sourceStyle = window.getComputedStyle(source);
  const properties = [
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'font-stretch',
    'font-variant',
    'font-kerning',
    'font-feature-settings',
    'font-variation-settings',
    'font-optical-sizing',
    'letter-spacing',
    'word-spacing',
    'text-rendering',
    'text-transform',
  ];
  properties.forEach((property) =>
    marker.style.setProperty(property, sourceStyle.getPropertyValue(property)),
  );
  marker.style.lineHeight =
    sourceStyle.lineHeight === 'normal' && rect ? `${rect.height}px` : sourceStyle.lineHeight;
}

function isRectInsideInput(rect: DOMRect, inputRect: DOMRect): boolean {
  return (
    rect.top >= inputRect.top &&
    rect.bottom <= inputRect.bottom &&
    rect.left >= inputRect.left &&
    rect.right <= inputRect.right
  );
}

function cssColorAlpha(color: string): number {
  if (!color || color === 'transparent') return 0;
  const slashAlpha = color.match(/\/\s*([\d.]+)(%)?\s*\)$/);
  if (slashAlpha) {
    const value = Number(slashAlpha[1]);
    return slashAlpha[2] ? value / 100 : value;
  }
  const rgbaAlpha = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/i);
  return rgbaAlpha ? Number(rgbaAlpha[1]) : 1;
}

function findInputSurfaceColor(input: HTMLElement): string | null {
  let current: HTMLElement | null = input;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      (!style.backgroundImage || style.backgroundImage === 'none') &&
      cssColorAlpha(style.backgroundColor) >= 0.99
    ) {
      return style.backgroundColor;
    }
    current = current.parentElement;
  }
  return null;
}
