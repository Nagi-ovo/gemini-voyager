/**
 * Read an AI's reply to the authoring prompt (`pluginAuthoringPrompt.ts`): find
 * the one manifest in it, then run the same read and gate as a pasted
 * `plugin.json` (`readLocalPluginFiles`, `validateLocalManifest`). Nothing here
 * installs anything; the popup previews the result and imports the exact
 * object it previewed through `importLocalPlugin`.
 */
import type { ManifestIssue } from '../manifest/validate';
import type { PluginManifest } from '../types';
import { MAX_LOCAL_PLUGIN_IMPORT_CHARS, readLocalPluginFiles } from './localPluginImport';
import {
  type LocalPluginRecordMap,
  loadLocalPluginRecords,
  localPluginRecordSnapshot,
} from './localPluginStore';
import { validateLocalManifest } from './validateLocalManifest';

/** Why no manifest text could be taken from a reply. */
export type PluginReplyProblem = 'empty' | 'too-long' | 'no-json' | 'multiple-json';

export type PluginReplyText =
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly problem: PluginReplyProblem };

const JSON_INFO = new Set(['', 'json', 'jsonc', 'json5']);

interface Fence {
  readonly ticks: number;
  /** First word of the info string, lowercased ('' when none). */
  readonly info: string;
}

/** A backtick fence line (up to 3 spaces of indent), read without a backtracking regex. */
function readFence(line: string): Fence | null {
  let start = 0;
  while (start < 3 && line[start] === ' ') start += 1;
  let end = start;
  while (line[end] === '`') end += 1;
  if (end - start < 3) return null;
  const rest = line.slice(end);
  if (rest.includes('`')) return null;
  return { ticks: end - start, info: (rest.trim().split(/\s+/)[0] ?? '').toLowerCase() };
}

/**
 * The manifest text of a reply: the body of its single ```json (or unlabeled)
 * fenced block, or the whole reply when it has no fence and is a bare JSON
 * object. Zero or several candidate blocks are refused rather than guessed.
 * One linear pass over the lines; the input is bounded first.
 */
export function extractPluginReplyJson(reply: string): PluginReplyText {
  if (reply.length > MAX_LOCAL_PLUGIN_IMPORT_CHARS) return { ok: false, problem: 'too-long' };
  const text = reply.replace(/\r\n?/g, '\n');
  if (text.trim() === '') return { ok: false, problem: 'empty' };

  const blocks: string[] = [];
  let sawFence = false;
  let open: { readonly ticks: number; readonly json: boolean; readonly lines: string[] } | null =
    null;
  for (const line of text.split('\n')) {
    const fence = readFence(line);
    if (open) {
      if (fence && fence.info === '' && fence.ticks >= open.ticks) {
        if (open.json) blocks.push(open.lines.join('\n'));
        open = null;
      } else {
        open.lines.push(line);
      }
    } else if (fence) {
      sawFence = true;
      open = { ticks: fence.ticks, json: JSON_INFO.has(fence.info), lines: [] };
    }
  }
  // A reply cut off inside its block still offers that block; the JSON read reports the rest.
  if (open?.json) blocks.push(open.lines.join('\n'));

  if (blocks.length > 1) return { ok: false, problem: 'multiple-json' };
  if (blocks.length === 1) return { ok: true, json: blocks[0] };
  const bare = text.trim();
  if (!sawFence && bare.startsWith('{') && bare.endsWith('}')) return { ok: true, json: bare };
  return { ok: false, problem: 'no-json' };
}

export type CheckedPluginReply =
  | {
      readonly ok: true;
      /** The manifest exactly as read: what `importLocalPlugin` receives on import. */
      readonly raw: unknown;
      readonly manifest: PluginManifest;
      /** Version installed under the same id, which an import would replace. */
      readonly previousVersion?: string;
      /** `localPluginRecordSnapshot` of that install: the import lands only over it. */
      readonly installed: string | null;
    }
  | { readonly ok: false; readonly problem: PluginReplyProblem }
  | { readonly ok: false; readonly issues: readonly ManifestIssue[] };

/** Extract, read and gate a reply without installing it. */
export async function checkPluginReply(
  reply: string,
  loadRecords: () => Promise<LocalPluginRecordMap> = loadLocalPluginRecords,
): Promise<CheckedPluginReply> {
  const extracted = extractPluginReplyJson(reply);
  if (!extracted.ok) return extracted;
  const read = await readLocalPluginFiles([{ name: 'plugin.json', text: extracted.json }]);
  if (!read.success) return { ok: false, issues: read.error };
  const result = validateLocalManifest(read.data);
  if (!result.success) return { ok: false, issues: result.error };
  const { manifest } = result.data;
  const record = (await loadRecords())[manifest.id];
  const installedVersion = record?.manifest.version;
  return {
    ok: true,
    raw: read.data,
    manifest,
    installed: localPluginRecordSnapshot(record),
    ...(typeof installedVersion === 'string' ? { previousVersion: installedVersion } : {}),
  };
}
