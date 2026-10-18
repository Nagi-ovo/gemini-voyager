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
 * Whether `text` names the file `name`, also as ChatGPT renames a repeated upload:
 * a second `note.txt` shows as `note(2).txt` once it has uploaded.
 */
export function namesFile(text: string, name: string): boolean {
  const haystack = fold(text);
  const wanted = fold(name.trim());
  if (!wanted) return false;
  if (haystack.includes(wanted)) return true;
  const dot = wanted.lastIndexOf('.');
  const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
  const extension = dot > 0 ? wanted.slice(dot) : '';
  return new RegExp(`${escapeRegExp(stem)} ?\\(\\d+\\)${escapeRegExp(extension)}`).test(haystack);
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
