/**
 * The optional `pageHooks` section of a `site.json`: the page markers and the
 * text fallbacks the Local Bridge and the model picker use to read ChatGPT, so
 * a ChatGPT change to one of them is fixed by publishing data, not a release.
 * Structure comes first; text only stands in where the page has no structure
 * for it, or where that structure is missing.
 *
 * Its own top-level section: a client reads an unknown top-level section as
 * absent, but drops a whole known section that gains a key, so `modelPicker`
 * keeps the shape 2.1.0 reads. A broken section is reported and dropped (the
 * code's measured defaults stand in where it has them, and every mode reads
 * as unknown), and `catalog:build` refuses to publish one.
 *
 * Format 1 (measured on chatgpt.com, 2026-10-18):
 * - `modeSwitch`: the chat/Work pair on a new chat or project page: `group`
 *   holds exactly two `button`s, in `order`, pressed per `pressedAttribute`;
 * - `modes`: per mode, the composer's placeholder (`composerLabels`) and the
 *   switch button's text (`switchLabels`), from ChatGPT's own messages
 *   (`chatgptConversations.composer.placeholder`,
 *   `composer.placeholder.workWithChatGPT`, `composer.home.modeToggle.*`): read
 *   where the page has no switch (an existing conversation), or the switch
 *   is not found;
 * - `modelPickerTrigger`: the model picker button, in every UI language;
 * - `effortControl`: the effort row in the picker's menu, which takes the arrow
 *   keys when its slider did not render (a tab that was never shown);
 * - `replyFailed` / `rateLimit`: patterns (case-insensitive) over a failed
 *   reply's text and over a page alert's text; ChatGPT's servers send these
 *   in English;
 * - `accountBlocked`: groups of phrases a blocked account's page shows, all
 *   of one group present.
 */
import type { ManifestIssue } from '../../manifest/validate';
import { isSafeRegexSource } from '../safeRegex';
import type { LocalizedLabels } from './modelPickerData';

export const PAGE_HOOKS_FORMATS = [1] as const;
export type PageHooksFormat = (typeof PAGE_HOOKS_FORMATS)[number];

export type HookMode = 'chat' | 'work';

export interface ModeLabels {
  readonly composerLabels: LocalizedLabels;
  readonly switchLabels: LocalizedLabels;
}

export interface ModeSwitchHooks {
  readonly group: string;
  readonly button: string;
  readonly pressedAttribute: string;
  readonly order: readonly [HookMode, HookMode];
}

export interface PageHooksSection {
  readonly format: PageHooksFormat;
  readonly modeSwitch: ModeSwitchHooks;
  readonly modes: { readonly chat: ModeLabels; readonly work: ModeLabels };
  readonly modelPickerTrigger: string;
  readonly effortControl: string;
  readonly replyFailed: readonly string[];
  readonly rateLimit: readonly string[];
  readonly accountBlocked: readonly (readonly string[])[];
}

export interface PageHooksSectionRead {
  readonly pageHooks?: PageHooksSection;
  readonly issues: readonly ManifestIssue[];
}

const SECTION_KEYS = [
  'format',
  'modeSwitch',
  'modes',
  'modelPickerTrigger',
  'effortControl',
  'replyFailed',
  'rateLimit',
  'accountBlocked',
];
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_TEXT_LENGTH = 200;
const MAX_ENTRIES = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class Reader {
  readonly issues: ManifestIssue[] = [];

  constructor(private readonly isSelector: (selector: string) => boolean) {}

  issue(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  record(raw: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
    if (!isRecord(raw)) {
      this.issue(path, 'must be an object');
      return {};
    }
    for (const key of Object.keys(raw)) {
      if (!allowed.includes(key)) this.issue(`${path}.${key}`, 'unknown key');
    }
    return raw;
  }

  text(raw: unknown, path: string): string {
    if (typeof raw !== 'string' || raw.trim() === '' || raw.length > MAX_TEXT_LENGTH) {
      this.issue(path, `must be a non-empty string of up to ${MAX_TEXT_LENGTH} chars`);
      return '';
    }
    return raw;
  }

  selector(raw: unknown, path: string): string {
    const text = this.text(raw, path);
    if (text && !this.isSelector(text)) this.issue(path, 'must be a valid CSS selector');
    return text;
  }

  list<T>(raw: unknown, path: string, read: (value: unknown, at: string) => T): T[] {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ENTRIES) {
      this.issue(path, `must be an array of 1-${MAX_ENTRIES} entries`);
      return [];
    }
    return raw.map((value, index) => read(value, `${path}[${index}]`));
  }

  pattern(raw: unknown, path: string): string {
    const text = this.text(raw, path);
    if (!text) return text;
    if (!isSafeRegexSource(text)) {
      this.issue(path, 'must be a safe regular expression');
      return text;
    }
    try {
      new RegExp(text, 'i');
    } catch {
      this.issue(path, 'must be a valid regular expression');
    }
    return text;
  }

  labels(raw: unknown, path: string): LocalizedLabels {
    if (!isRecord(raw) || Object.keys(raw).length === 0 || Object.keys(raw).length > MAX_ENTRIES) {
      this.issue(path, `must map 1-${MAX_ENTRIES} locales to labels`);
      return {};
    }
    const out: Record<string, string[]> = {};
    for (const [locale, value] of Object.entries(raw)) {
      const at = `${path}.${locale}`;
      if (!LOCALE_PATTERN.test(locale)) this.issue(at, 'must be a locale such as zh-CN');
      out[locale] = this.list(value, at, (item, itemAt) => this.text(item, itemAt));
    }
    return out;
  }

  modeLabels(raw: unknown, path: string): ModeLabels {
    const rec = this.record(raw, path, ['composerLabels', 'switchLabels']);
    return {
      composerLabels: this.labels(rec.composerLabels, `${path}.composerLabels`),
      switchLabels: this.labels(rec.switchLabels, `${path}.switchLabels`),
    };
  }
}

/**
 * Read `site.pageHooks`. `isSelector` is the site validator's selector check
 * (passed in so this module does not import the validator that imports it).
 */
export function readPageHooksSection(
  raw: unknown,
  isSelector: (selector: string) => boolean,
  path = 'pageHooks',
): PageHooksSectionRead {
  if (raw === undefined) return { issues: [] };
  if (!isRecord(raw)) return { issues: [{ path, message: 'must be an object' }] };
  if (!PAGE_HOOKS_FORMATS.some((known) => known === raw.format)) {
    return { issues: [{ path: `${path}.format`, message: 'unknown format' }] };
  }
  const reader = new Reader(isSelector);
  reader.record(raw, path, SECTION_KEYS);
  const at = (key: string) => `${path}.${key}`;
  const switchRaw = reader.record(raw.modeSwitch, at('modeSwitch'), [
    'group',
    'button',
    'pressedAttribute',
    'order',
  ]);
  const pressedAttribute = reader.text(
    switchRaw.pressedAttribute,
    `${at('modeSwitch')}.pressedAttribute`,
  );
  if (pressedAttribute && !ATTRIBUTE_NAME.test(pressedAttribute)) {
    reader.issue(`${at('modeSwitch')}.pressedAttribute`, 'must be a lower-case attribute name');
  }
  const order = switchRaw.order;
  const orderOk =
    Array.isArray(order) &&
    order.length === 2 &&
    new Set(order).size === 2 &&
    order.every((mode) => mode === 'chat' || mode === 'work');
  if (!orderOk) reader.issue(`${at('modeSwitch')}.order`, 'must be ["chat", "work"] in page order');
  const modesRaw = reader.record(raw.modes, at('modes'), ['chat', 'work']);
  const section: PageHooksSection = {
    format: 1,
    modeSwitch: {
      group: reader.selector(switchRaw.group, `${at('modeSwitch')}.group`),
      button: reader.selector(switchRaw.button, `${at('modeSwitch')}.button`),
      pressedAttribute,
      order: (orderOk ? order : ['chat', 'work']) as [HookMode, HookMode],
    },
    modes: {
      chat: reader.modeLabels(modesRaw.chat, `${at('modes')}.chat`),
      work: reader.modeLabels(modesRaw.work, `${at('modes')}.work`),
    },
    modelPickerTrigger: reader.selector(raw.modelPickerTrigger, at('modelPickerTrigger')),
    effortControl: reader.selector(raw.effortControl, at('effortControl')),
    replyFailed: reader.list(raw.replyFailed, at('replyFailed'), (value, itemAt) =>
      reader.pattern(value, itemAt),
    ),
    rateLimit: reader.list(raw.rateLimit, at('rateLimit'), (value, itemAt) =>
      reader.pattern(value, itemAt),
    ),
    accountBlocked: reader.list(raw.accountBlocked, at('accountBlocked'), (group, groupAt) =>
      reader.list(group, groupAt, (value, itemAt) => reader.text(value, itemAt).toLowerCase()),
    ),
  };
  if (reader.issues.length > 0) return { issues: reader.issues };
  return { pageHooks: section, issues: [] };
}
