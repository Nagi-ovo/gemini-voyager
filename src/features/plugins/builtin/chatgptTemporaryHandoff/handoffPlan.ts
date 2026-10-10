import type { ChatTurn } from '@/features/export/types/export';
import type { AppLanguage } from '@/utils/language';

import { getTemporaryHandoffCopy } from './i18n';

export type HandoffDelivery =
  | { readonly mode: 'inline'; readonly text: string }
  | {
      readonly mode: 'attachment';
      readonly directive: string;
      readonly attachment: string;
      readonly filename: string;
    };

export interface HandoffPlan {
  readonly delivery: HandoffDelivery;
  readonly transcript: string;
  readonly backupFilename: string;
}

const INLINE_THRESHOLD = 5_000;
let fallbackFilenameSequence = 0;

function turnContent(turn: ChatTurn, role: 'user' | 'assistant'): string {
  if (role === 'user') return (turn.userContent?.text || turn.user || '').trim();
  return (turn.assistantContent?.text || turn.assistant || '').trim();
}

export function buildHandoffTranscript(
  turns: readonly ChatTurn[],
  language: AppLanguage = 'en',
): string {
  const copy = getTemporaryHandoffCopy(language);
  const sections: string[] = [];
  for (const turn of turns) {
    const user = turnContent(turn, 'user');
    const assistant = turnContent(turn, 'assistant');
    if (user) sections.push(`## ${copy.userRole}\n\n${user}`);
    if (assistant) sections.push(`## ChatGPT\n\n${assistant}`);
  }
  return sections.join('\n\n');
}

export function buildHandoffBackup(
  transcript: string,
  draft: string | undefined,
  language: AppLanguage = 'en',
): string {
  if (!draft?.trim()) return transcript;
  const heading = `## ${getTemporaryHandoffCopy(language).unsentDraftHeading}`;
  return `${transcript}\n\n${heading}\n\n${draft}`;
}

function randomFilenameNonce(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID().slice(0, 12);
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(36))
      .join('')
      .slice(0, 12);
  } catch {
    fallbackFilenameSequence += 1;
    return fallbackFilenameSequence.toString(36).padStart(4, '0');
  }
}

export function createHandoffFilename(now = new Date(), nonce = randomFilenameNonce()): string {
  const timestamp = now
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 17); // Unique names stop recovery accepting an earlier attachment preview.
  const safeNonce = nonce.replace(/[^a-z0-9]/gi, '').slice(0, 12) || randomFilenameNonce();
  return `chatgpt-temporary-handoff-${timestamp}-${safeNonce}.md`;
}

export function planHandoff(
  turns: readonly ChatTurn[],
  language: AppLanguage = 'en',
  filename = createHandoffFilename(),
): HandoffPlan {
  const copy = getTemporaryHandoffCopy(language);
  const transcript = buildHandoffTranscript(turns, language);

  const delivery: HandoffDelivery =
    transcript.length <= INLINE_THRESHOLD
      ? {
          mode: 'inline',
          text: `${copy.handoffTitle}\n\n${copy.inlineInstruction}\n\n${copy.transcriptStart}\n\n${transcript}\n\n${copy.transcriptEnd}`,
        }
      : {
          mode: 'attachment',
          directive: `${copy.handoffTitle}\n\n${copy.attachmentInstruction}`,
          attachment: transcript,
          filename,
        };
  return { delivery, transcript, backupFilename: filename };
}

export function downloadHandoffBackup(transcript: string, filename: string): void {
  const blob = new Blob([transcript], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createHandoffTabToken(): string {
  return `${Date.now().toString(36)}-${randomFilenameNonce()}`;
}
