/**
 * Turning what a user hands Voyager into one raw manifest, with no storage,
 * DOM or extension API: picked files (`readLocalPluginFiles`) and an AI reply
 * (`extractPluginReplyJson`). The popup importer, the AI-reply check and the
 * `create-voyager-plugin` CLI all read through this module, so the CLI's
 * `check` sees a plugin directory exactly as the popup's file picker does.
 */
import type { Result } from '@/core/types/common';

import type { ManifestIssue } from '../manifest/validate';
import { resolveStyleFileContributions } from '../sources/styleFiles';

/** One picked file: its relative path (or bare name) and text. */
export interface LocalPluginFile {
  readonly name: string;
  readonly text: string;
}

/** Ceiling on everything one import reads (manifest plus CSS), and on the CSS it expands to. */
export const MAX_LOCAL_PLUGIN_IMPORT_CHARS = 1_000_000;
/** Ceiling on `contributes.styles` entries, checked before any file is expanded. */
export const MAX_LOCAL_PLUGIN_STYLES = 32;

function issue(path: string, message: string): ManifestIssue {
  return { path, message };
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash + 1);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Turn picked files into one raw manifest: exactly one `.json` file, with each
 * `contributes.styles[].file` resolved against the `.css` files picked with it
 * (by path relative to the manifest, then by unique file name). The CSS goes
 * through the same file-path and stylesheet checks as the bundled catalog.
 */
export async function readLocalPluginFiles(
  files: readonly LocalPluginFile[],
): Promise<Result<unknown, ManifestIssue[]>> {
  const total = files.reduce((sum, file) => sum + file.text.length, 0);
  if (total > MAX_LOCAL_PLUGIN_IMPORT_CHARS) {
    return {
      success: false,
      error: [issue('file', `exceeds ${MAX_LOCAL_PLUGIN_IMPORT_CHARS} characters`)],
    };
  }
  const manifests = files.filter((file) => extension(file.name) === 'json');
  if (manifests.length !== 1) {
    return {
      success: false,
      error: [issue('file', 'pick exactly one manifest .json file, plus its .css files')],
    };
  }
  const manifestFile = manifests[0];

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestFile.text) as unknown;
  } catch (error) {
    return {
      success: false,
      error: [
        issue('', `not valid JSON (${error instanceof Error ? error.message : 'parse error'})`),
      ],
    };
  }

  // A small manifest can name one big file thousands of times: bound the entry
  // count before expanding, and the CSS the expansion produces while it runs,
  // so nothing past the import ceiling is ever copied or scanned.
  const styles = (parsed as { contributes?: { styles?: unknown } } | null)?.contributes?.styles;
  if (Array.isArray(styles) && styles.length > MAX_LOCAL_PLUGIN_STYLES) {
    return {
      success: false,
      error: [issue('contributes.styles', `at most ${MAX_LOCAL_PLUGIN_STYLES} style entries`)],
    };
  }
  const base = dirname(manifestFile.name);
  const cssFiles = files.filter((file) => extension(file.name) === 'css');
  let expanded = 0;
  const loadCss = async (file: string): Promise<string> => {
    const exact = cssFiles.find((css) => css.name === `${base}${file}` || css.name === file);
    const byName = cssFiles.filter((css) => basename(css.name) === basename(file));
    const match = exact ?? (byName.length === 1 ? byName[0] : undefined);
    if (!match) throw new Error(`style file ${file} was not picked with the manifest`);
    const text = match.text;
    expanded += text.length;
    if (expanded > MAX_LOCAL_PLUGIN_IMPORT_CHARS) {
      throw new Error(`style files expand past ${MAX_LOCAL_PLUGIN_IMPORT_CHARS} characters`);
    }
    return text;
  };
  try {
    return {
      success: true,
      data: await resolveStyleFileContributions(parsed, basename(manifestFile.name), loadCss),
    };
  } catch (error) {
    return {
      success: false,
      error: [issue('contributes.styles', error instanceof Error ? error.message : String(error))],
    };
  }
}

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
