/**
 * Read-only views of ChatGPT's chat-mode model picker, measured on chatgpt.com
 * (zh-CN) on 2026-10-18. Structure comes from ARIA and ChatGPT's own data
 * attributes; localized strings come from the site data (`modelPicker`) and
 * are never the only evidence:
 * - the trigger is a `button[aria-haspopup=menu]` in the composer form marked
 *   `data-composer-navigation-target="reasoning"`, else one whose `aria-label`
 *   is a `triggerLabels` entry;
 * - its menu is found only through the trigger's `aria-controls`: Voyager's
 *   own export menu is another `role=menu` on the same page;
 * - inside it, `role=menuitemradio` radios (in a collapsed, `aria-hidden`
 *   sub-panel) name the model, one `role=slider` holds the effort step, and
 *   `role=status` names that step.
 */
import type { ModelPickerSection } from '@/features/plugins/sites/sections/modelPickerData';
import { isRendered } from '@/pages/content/export/adapter/chatgptThread';

export interface PickerRadio {
  readonly label: string;
  readonly checked: boolean;
}

export interface PickerSlider {
  readonly element: HTMLElement;
  readonly now: number;
  readonly min: number;
  readonly max: number;
}

export interface PickerStatus {
  readonly text: string;
  readonly label: string | null;
  /** 1-based, when the template carries it. */
  readonly position: number | null;
}

export interface PickerReading {
  readonly radios: readonly PickerRadio[];
  readonly slider: PickerSlider | null;
  readonly status: PickerStatus;
}

export function normalizeLabel(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Every locale's labels, normalized: a page is not always in the language it claims. */
export function mergedLabels(table: Readonly<Record<string, readonly string[]>>): Set<string> {
  return new Set(Object.values(table).flatMap((labels) => labels.map(normalizeLabel)));
}

/** ChatGPT's marker on the picker trigger, the same in every UI language. */
const TRIGGER_MARKER = 'button[aria-haspopup="menu"][data-composer-navigation-target="reasoning"]';

/** The one rendered picker trigger in `scope`, else null (none, or ambiguous). */
export function findTrigger(scope: ParentNode, data: ModelPickerSection): HTMLElement | null {
  // The aria-label is translated into each of ChatGPT's UI languages; the marker is not.
  const marked = Array.from(scope.querySelectorAll<HTMLElement>(TRIGGER_MARKER)).filter(isRendered);
  if (marked.length > 0) return marked.length === 1 ? marked[0] : null;
  const labels = mergedLabels(data.triggerLabels);
  const found = Array.from(
    scope.querySelectorAll<HTMLElement>('button[aria-haspopup="menu"][aria-label]'),
  ).filter(
    (button) =>
      labels.has(normalizeLabel(button.getAttribute('aria-label') ?? '')) && isRendered(button),
  );
  return found.length === 1 ? found[0] : null;
}

/** The trigger's own open menu, never another `role=menu` on the page. */
export function findOpenMenu(trigger: HTMLElement): HTMLElement | null {
  if (trigger.getAttribute('aria-expanded') !== 'true') return null;
  const id = trigger.getAttribute('aria-controls');
  const menu = id ? document.getElementById(id) : null;
  return menu?.getAttribute('role') === 'menu' ? menu : null;
}

/** The trigger's text without its `aria-hidden` caption; recorded, never evidence. */
export function triggerText(trigger: HTMLElement): string {
  const copy = trigger.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return normalizeLabel(copy.textContent ?? '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `effortStatus` templates as patterns: `{label}` is text, `{position}` / `{count}` digits. */
function statusPatterns(data: ModelPickerSection): { regex: RegExp; groups: string[] }[] {
  return Object.values(data.effortStatus).map((template) => {
    const groups: string[] = [];
    const source = normalizeLabel(template)
      .split(/(\{label\}|\{position\}|\{count\})/)
      .map((part) => {
        if (part === '{label}' || part === '{position}' || part === '{count}') {
          groups.push(part);
          return part === '{label}' ? '(.+?)' : '(\\d+)';
        }
        return escapeRegExp(part);
      })
      .join('');
    return { regex: new RegExp(`^${source}$`), groups };
  });
}

export function readStatus(menu: HTMLElement, data: ModelPickerSection): PickerStatus {
  const text = normalizeLabel(menu.querySelector('[role="status"]')?.textContent ?? '');
  for (const { regex, groups } of statusPatterns(data)) {
    const match = regex.exec(text);
    if (!match) continue;
    const value = (name: string): string | undefined => {
      // A template may leave a placeholder out; index -1 would read the whole match.
      const at = groups.indexOf(name);
      return at < 0 ? undefined : match[at + 1];
    };
    const position = value('{position}');
    return {
      text,
      label: normalizeLabel(value('{label}') ?? ''),
      position: position === undefined ? null : Number(position),
    };
  }
  return { text, label: null, position: null };
}

function readNumber(element: Element, name: string): number | null {
  const raw = element.getAttribute(name);
  if (raw === null || !/^\d{1,3}$/.test(raw.trim())) return null;
  return Number(raw);
}

export function readPicker(menu: HTMLElement, data: ModelPickerSection): PickerReading {
  const radios = Array.from(menu.querySelectorAll('[role="menuitemradio"]')).map((radio) => ({
    label: normalizeLabel(radio.textContent ?? ''),
    checked: radio.getAttribute('aria-checked') === 'true',
  }));
  const sliders = menu.querySelectorAll<HTMLElement>('[role="slider"]');
  let slider: PickerSlider | null = null;
  if (sliders.length === 1) {
    const element = sliders[0];
    const now = readNumber(element, 'aria-valuenow');
    const min = readNumber(element, 'aria-valuemin');
    const max = readNumber(element, 'aria-valuemax');
    if (now !== null && min !== null && max !== null) slider = { element, now, min, max };
  }
  return { radios, slider, status: readStatus(menu, data) };
}
