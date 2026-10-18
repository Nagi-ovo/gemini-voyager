/**
 * The optional `chatModes` section of a `site.json`: how the page shows chat
 * and Work mode, which the Local Bridge reads before it sends a prompt, picks
 * a model or switches a mode. Its own top-level section, not part of
 * `modelPicker`: a client reads an unknown top-level section as absent, but
 * drops a whole known section that gains a key, so `modelPicker` keeps the
 * shape 2.1.0 reads. A broken section is reported and dropped (every mode
 * then reads as unknown), and `catalog:build` refuses to publish one.
 *
 * Format 1 (taken from ChatGPT's own messages, 2026-10-18): per mode,
 * - `composerLabels`: the composer's placeholder
 *   (`chatgptConversations.composer.placeholder`,
 *   `composer.placeholder.workWithChatGPT`);
 * - `switchLabels`: the exact text of the mode switch's button
 *   (`composer.home.modeToggle.chat` / `.work`).
 *
 * Label tables are keyed by UI locale, and every locale is merged when read.
 */
import type { ManifestIssue } from '../../manifest/validate';
import type { LocalizedLabels } from './modelPickerData';

export const CHAT_MODES_FORMATS = [1] as const;
export type ChatModesFormat = (typeof CHAT_MODES_FORMATS)[number];

export interface ChatModeLabels {
  readonly composerLabels: LocalizedLabels;
  readonly switchLabels: LocalizedLabels;
}

export interface ChatModesSection {
  readonly format: ChatModesFormat;
  readonly chat: ChatModeLabels;
  readonly work: ChatModeLabels;
}

export interface ChatModesSectionRead {
  readonly chatModes?: ChatModesSection;
  readonly issues: readonly ManifestIssue[];
}

const SECTION_KEYS = ['format', 'chat', 'work'];
const MODE_KEYS = ['composerLabels', 'switchLabels'];
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const MAX_LABEL_LENGTH = 200;
const MAX_ENTRIES = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readLabels(raw: unknown, path: string, issues: ManifestIssue[]): LocalizedLabels {
  if (!isRecord(raw) || Object.keys(raw).length === 0 || Object.keys(raw).length > MAX_ENTRIES) {
    issues.push({ path, message: `must map 1-${MAX_ENTRIES} locales to labels` });
    return {};
  }
  const out: Record<string, string[]> = {};
  for (const [locale, value] of Object.entries(raw)) {
    const at = `${path}.${locale}`;
    if (!LOCALE_PATTERN.test(locale))
      issues.push({ path: at, message: 'must be a locale such as zh-CN' });
    const valid =
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= MAX_ENTRIES &&
      value.every(
        (label) =>
          typeof label === 'string' && label.trim() !== '' && label.length <= MAX_LABEL_LENGTH,
      );
    if (!valid) {
      issues.push({ path: at, message: `must be an array of 1-${MAX_ENTRIES} non-empty labels` });
      continue;
    }
    out[locale] = value as string[];
  }
  return out;
}

function readMode(raw: unknown, path: string, issues: ManifestIssue[]): ChatModeLabels {
  if (!isRecord(raw)) {
    issues.push({ path, message: 'must be an object' });
    return { composerLabels: {}, switchLabels: {} };
  }
  for (const key of Object.keys(raw)) {
    if (!MODE_KEYS.includes(key)) issues.push({ path: `${path}.${key}`, message: 'unknown key' });
  }
  return {
    composerLabels: readLabels(raw.composerLabels, `${path}.composerLabels`, issues),
    switchLabels: readLabels(raw.switchLabels, `${path}.switchLabels`, issues),
  };
}

export function readChatModesSection(raw: unknown, path = 'chatModes'): ChatModesSectionRead {
  if (raw === undefined) return { issues: [] };
  if (!isRecord(raw)) return { issues: [{ path, message: 'must be an object' }] };
  if (!CHAT_MODES_FORMATS.some((known) => known === raw.format)) {
    return { issues: [{ path: `${path}.format`, message: 'unknown format' }] };
  }
  const issues: ManifestIssue[] = [];
  for (const key of Object.keys(raw)) {
    if (!SECTION_KEYS.includes(key))
      issues.push({ path: `${path}.${key}`, message: 'unknown key' });
  }
  const chat = readMode(raw.chat, `${path}.chat`, issues);
  const work = readMode(raw.work, `${path}.work`, issues);
  if (issues.length > 0) return { issues };
  return { chatModes: { format: 1, chat, work }, issues: [] };
}
