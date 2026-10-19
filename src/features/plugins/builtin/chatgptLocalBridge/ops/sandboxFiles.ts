/**
 * Files ChatGPT's python tool wrote, as one assistant turn links them: the
 * `[label](sandbox:/mnt/data/…)` links of its final-channel text, read from
 * ChatGPT's own conversation answer (the page renders them without an href).
 * A turn is the run of messages between one prompt and the next on the branch
 * the conversation ends on: the reply, its tool calls and their outputs, and a
 * Pro reply's sub-agent messages.
 */
import { type FileCandidate, MAX_FILE_CANDIDATES } from '@/features/bridge/protocol';

import { type ConversationMessage, SANDBOX_HREF_PREFIX } from '../pageData/protocol';

const SANDBOX_SCHEME = 'sandbox:';
const MAX_FILE_NAME = 255;
const MAX_EXTENSION = 16;
const FALLBACK_NAME = 'download';

/** The turn holding `messageId`, oldest first; null when the branch does not hold it. */
export function turnMessages(
  messages: readonly ConversationMessage[],
  messageId: string,
): readonly ConversationMessage[] | null {
  const at = messages.findIndex((message) => message.id === messageId);
  if (at < 0 || messages[at].role === 'user') return null;
  let start = at;
  while (start > 0 && messages[start - 1].role !== 'user') start -= 1;
  let end = at + 1;
  while (end < messages.length && messages[end].role !== 'user') end += 1;
  return messages.slice(start, end);
}

/** The turn's sandbox files in reply order, once per href, each naming the message that links it. */
export function sandboxCandidates(turn: readonly ConversationMessage[]): FileCandidate[] {
  const seen = new Set<string>();
  const candidates: FileCandidate[] = [];
  for (const message of turn) {
    for (const link of message.links) {
      if (seen.has(link.href)) continue;
      if (candidates.length >= MAX_FILE_CANDIDATES) return candidates;
      seen.add(link.href);
      candidates.push({
        kind: 'sandbox',
        label: link.label,
        href: link.href,
        controlRef: message.id,
      });
    }
  }
  return candidates;
}

/** The candidate's `/mnt/data/…` path, or null when it is not a sandbox file. */
export function sandboxPathOf(candidate: FileCandidate): string | null {
  const href = candidate.href;
  if (candidate.kind !== 'sandbox' || !href?.startsWith(SANDBOX_HREF_PREFIX)) return null;
  const path = href.slice(SANDBOX_SCHEME.length);
  const segments = path.slice(1).split('/');
  // A path that climbs out of /mnt/data, or names the directory itself, is not a file there.
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null;
  }
  return hasControlCharacter(path) ? null : path;
}

function isControl(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (isControl(text.charCodeAt(index))) return true;
  }
  return false;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function cleanName(raw: string): string {
  const name = Array.from(raw, (char) =>
    char === '/' || char === '\\' || isControl(char.charCodeAt(0)) ? '_' : char,
  )
    .join('')
    .trim();
  return name === '.' || name === '..' ? '' : name;
}

function shorten(name: string): string {
  if (name.length <= MAX_FILE_NAME) return name;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && name.length - dot <= MAX_EXTENSION ? name.slice(dot) : '';
  return name.slice(0, MAX_FILE_NAME - extension.length) + extension;
}

/**
 * A file name the protocol accepts (no path separators, at most 255
 * characters): the sandbox path's last segment, else ChatGPT's own name for
 * the file. ChatGPT numbers its name on each fetch ("report(1).txt", measured
 * 2026-10-19), while the path is what the reply linked.
 */
export function downloadFileName(name: string | null, sandboxPath: string): string {
  const chosen = cleanName(basename(sandboxPath)) || cleanName(name ?? '') || FALLBACK_NAME;
  return shorten(chosen);
}
