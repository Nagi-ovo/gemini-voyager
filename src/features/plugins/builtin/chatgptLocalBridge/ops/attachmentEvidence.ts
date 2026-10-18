/**
 * Read-only views of ChatGPT's composer attachments, for `composer.attach`.
 * Measured live on 2026-10-17 (zh-CN UI): the composer form holds four
 * `input[type=file]`; the one without `accept` (and with `multiple`) is the
 * general entry, its id a Radix id. Files set on it plus `input`/`change`
 * render an attachment card within about 4 s, with a
 * `button[aria-label="移除 <name>"]`, and the send control turns enabled.
 *
 * The file input itself never counts as evidence: it holds the files the
 * moment they are set, whether or not the page took them. The uploading state
 * was not observed live; busy markers below are the usual structural ones.
 */
import { isRendered } from '@/pages/content/export/adapter/chatgptThread';

const FILE_INPUT_SELECTOR = 'input[type="file"]';
const NOT_A_CARD = 'input, textarea, select, script, style, template';
const BUSY_SELECTOR = [
  '[aria-busy="true"]',
  '[data-state="loading"]',
  '[data-state="uploading"]',
  '[data-state="pending"]',
  '.animate-spin',
].join(', ');
const NOTICE_SELECTOR =
  '[role="alert"], [role="status"], [data-sonner-toast], [data-radix-toast-viewport] li, [class*="toast" i]';

const fold = (text: string): string => text.normalize('NFC').toLowerCase();

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A file name ends where no name character follows; `a.txt.zip` is another file.
 * The start is a consumed boundary, not a lookbehind, which older Safari cannot parse.
 */
const NAME_START = '(?:^|[^\\p{L}\\p{N}_.\\-])';
const NAME_END = '(?![\\p{L}\\p{N}_\\-]|\\.[\\p{L}\\p{N}])';
/** Something shaped like a file name: an extension that starts with a letter, so `GPT-5.5` is none. */
const FILE_TOKEN = /\S\.\p{L}[\p{L}\p{N}]{0,9}(?![\p{L}\p{N}])/u;

export type FileNameMatch = 'exact' | 'renamed';

/** How `text` names the file `name`: as written, or as ChatGPT renames a repeated upload. */
export function matchFileName(text: string, name: string): FileNameMatch | null {
  const haystack = fold(text);
  const wanted = fold(name.trim());
  if (!wanted) return null;
  // Bounded on both sides: `Remove private-report.txt` must not count as `report.txt`.
  if (new RegExp(`${NAME_START}${escapeRegExp(wanted)}${NAME_END}`, 'u').test(haystack)) {
    return 'exact';
  }
  const dot = wanted.lastIndexOf('.');
  const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
  const extension = dot > 0 ? wanted.slice(dot) : '';
  const renamed = `${NAME_START}${escapeRegExp(stem)} ?\\(\\d+\\)${escapeRegExp(extension)}${NAME_END}`;
  return new RegExp(renamed, 'u').test(haystack) ? 'renamed' : null;
}

/**
 * Whether `text` names the file `name`, also as ChatGPT renames a repeated upload:
 * a second `note.txt` shows as `note(2).txt` once it has uploaded.
 */
export function namesFile(text: string, name: string): boolean {
  return matchFileName(text, name) !== null;
}

function queryAll<T extends Element>(root: ParentNode, selector: string): T[] {
  try {
    return Array.from(root.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
}

/**
 * The form's general file input: no `accept`, unique; with several, the one
 * that takes `multiple`. Null when it cannot be told apart.
 */
export function findGeneralFileInput(form: Element): HTMLInputElement | null {
  const open = queryAll<HTMLInputElement>(form, FILE_INPUT_SELECTOR).filter(
    (input) => !input.hasAttribute('accept') && !input.disabled,
  );
  if (open.length === 1) return open[0];
  const multiple = open.filter((input) => input.multiple);
  return multiple.length === 1 ? multiple[0] : null;
}

export interface AttachmentCard {
  /** A rendered element other than the composer field or an input that names the file. */
  readonly card: boolean;
  /** A button labelled with the file name: ChatGPT's remove control. */
  readonly removeControl: boolean;
}

function labelOf(element: Element): string {
  return fold(
    `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''} ${element.textContent ?? ''}`,
  );
}

/** Positive, structural evidence that the composer shows `name` as an attachment. */
export function findAttachmentCard(form: Element, field: Element, name: string): AttachmentCard {
  if (!fold(name.trim())) return { card: false, removeControl: false };
  let card = false;
  let removeControl = false;
  for (const element of queryAll<HTMLElement>(form, '*')) {
    // The composer's own text, and every wrapper around it, say nothing about attachments.
    if (element === field || field.contains(element) || element.contains(field)) continue;
    if (element.closest(NOT_A_CARD)) continue;
    if (!namesFile(labelOf(element), name) || !isRendered(element)) continue;
    card = true;
    if (element instanceof HTMLButtonElement) {
      const label = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`;
      if (namesFile(label, name)) removeControl = true;
    }
    if (removeControl) break;
  }
  return { card, removeControl };
}

export interface AttachmentInventory {
  /** Expected files no card shows. */
  readonly missing: readonly string[];
  /** Expected files more than one card answers to, so the one we attached cannot be told apart. */
  readonly ambiguous: readonly string[];
  /** Attachments no expected file accounts for (counted, never named: they are the person's). */
  readonly unexpected: number;
}

const CONTROL_SELECTOR = 'button, [role="button"]';
const MARKER_ATTRIBUTES = ['data-attachment-id', 'data-file-id'] as const;

function controlLabel(element: Element): string {
  const own = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`;
  return fold(own.trim() ? own : (element.textContent ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The expected file a label names: an exact name wins over a renamed one. */
function expectedNamedBy(label: string, expected: readonly string[]): string | null {
  const exact = expected.find((name) => matchFileName(label, name) === 'exact');
  return exact ?? expected.find((name) => matchFileName(label, name) === 'renamed') ?? null;
}

/**
 * Every attachment the composer shows, held against the files the task expects.
 * Sources: the cards' controls (a label that names a file, or that reads like the
 * remove control of an expected card with another name in it), the files the form's
 * inputs hold, and structural attachment markers.
 */
export function inventoryAttachments(
  form: Element,
  field: Element,
  expected: readonly string[],
): AttachmentInventory {
  const controls = new Map<string, number>(expected.map((name) => [name, 0]));
  const templates: { prefix: string; suffix: string }[] = [];
  const others: string[] = [];
  let unexpected = 0;

  for (const element of queryAll<HTMLElement>(form, CONTROL_SELECTOR)) {
    if (element === field || field.contains(element) || element.contains(field)) continue;
    if (element.matches('[type="submit"]') || !isRendered(element)) continue;
    const label = controlLabel(element);
    if (!label) continue;
    const named = expectedNamedBy(label, expected);
    if (named) {
      controls.set(named, (controls.get(named) ?? 0) + 1);
      const shown = fold(named.trim());
      const at = label.indexOf(shown);
      if (at >= 0) {
        const prefix = label.slice(0, at);
        const suffix = label.slice(at + shown.length);
        if (prefix.trim() || suffix.trim()) templates.push({ prefix, suffix });
      }
    } else if (FILE_TOKEN.test(label)) {
      unexpected += 1;
    } else {
      others.push(label);
    }
  }
  // A control shaped like an expected card's remove control (`移除 <name>`) is another card.
  for (const label of others) {
    const shaped = templates.some(
      ({ prefix, suffix }) =>
        label.length > prefix.length + suffix.length &&
        label.startsWith(prefix) &&
        label.endsWith(suffix),
    );
    if (shaped) unexpected += 1;
  }

  for (const input of queryAll<HTMLInputElement>(form, FILE_INPUT_SELECTOR)) {
    for (const file of Array.from(input.files ?? [])) {
      if (!expected.some((name) => fold(name.trim()) === fold(file.name))) unexpected += 1;
    }
  }

  const markers = new Set<string>();
  for (const attribute of MARKER_ATTRIBUTES) {
    for (const element of queryAll(form, `[${attribute}]`)) {
      if (!field.contains(element)) markers.add(`${attribute}=${element.getAttribute(attribute)}`);
    }
  }
  unexpected += Math.max(0, markers.size - expected.length);

  return {
    missing: expected.filter((name) => !findAttachmentCard(form, field, name).card),
    ambiguous: expected.filter((name) => (controls.get(name) ?? 0) > 1),
    unexpected,
  };
}

function isUnfinishedProgress(element: Element): boolean {
  if (element instanceof HTMLProgressElement) {
    return !element.hasAttribute('value') || element.value < element.max;
  }
  const now = Number(element.getAttribute('aria-valuenow'));
  const max = Number(element.getAttribute('aria-valuemax') ?? 100);
  return !Number.isFinite(now) || element.getAttribute('aria-valuenow') === null || now < max;
}

/** Markers of an upload still running in the composer form, outside the composer field. */
export function uploadBusySignals(form: Element, field: Element): string[] {
  const signals: string[] = [];
  const outsideField = (element: Element) => !field.contains(element) && isRendered(element);
  if (queryAll(form, BUSY_SELECTOR).some(outsideField)) signals.push('busy-marker');
  const progress = queryAll(form, 'progress, [role~="progressbar"]').filter(outsideField);
  if (progress.some(isUnfinishedProgress)) signals.push('progress');
  return signals;
}

/** Text of a rendered page notice (toast, alert) outside the form that names `name`. */
export function rejectionNotice(form: Element, name: string): string | null {
  if (!fold(name.trim())) return null;
  for (const element of queryAll<HTMLElement>(document, NOTICE_SELECTOR)) {
    if (form.contains(element) || !isRendered(element)) continue;
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (namesFile(text, name)) return text.slice(0, 300);
  }
  return null;
}
