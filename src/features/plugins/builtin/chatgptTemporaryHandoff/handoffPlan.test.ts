import { describe, expect, it } from 'vitest';

import type { ChatTurn } from '@/features/export/types/export';
import { APP_LANGUAGES } from '@/utils/language';

import {
  buildHandoffBackup,
  buildHandoffTranscript,
  createHandoffFilename,
  planHandoff,
} from './handoffPlan';
import { getTemporaryHandoffCopy } from './i18n';

function turn(user: string, assistant = ''): ChatTurn {
  return { user, assistant, starred: false, omitEmptySections: true };
}

function containingInOrder(...parts: string[]) {
  const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return expect.stringMatching(new RegExp(escaped.join('[\\s\\S]*')));
}

describe('temporary chat handoff planning', () => {
  it('builds a role-preserving Markdown transcript and localized inline handoff', () => {
    const turns = [turn('First question', 'First answer')];
    expect(buildHandoffTranscript(turns)).toContain('## User\n\nFirst question');
    expect(buildHandoffTranscript(turns)).toContain('## ChatGPT\n\nFirst answer');

    const chinese = planHandoff(turns, 'zh', 'zh.md');
    const english = planHandoff(turns, 'en', 'en.md');
    const japanese = planHandoff(turns, 'ja', 'ja.md');
    expect(chinese.delivery).toMatchObject({
      mode: 'inline',
      text: expect.stringContaining('[从临时对话继续]'),
    });
    expect(english.delivery).toMatchObject({
      mode: 'inline',
      text: expect.stringContaining('[Continue from a temporary chat]'),
    });
    expect(japanese.transcript).toContain('## ユーザー\n\nFirst question');
    expect(japanese.delivery).toMatchObject({
      mode: 'inline',
      text: containingInOrder('[一時チャットから続ける]', '--- 会話記録 開始 ---'),
    });
  });

  it('includes an unsent draft in the downloaded backup without adding it to the handoff transcript', () => {
    const transcript = '## User\n\nQuestion\n\n## ChatGPT\n\nAnswer';
    const backup = buildHandoffBackup(transcript, 'Unsent follow-up', 'en');

    expect(backup).toBe(`${transcript}\n\n## Unsent draft\n\nUnsent follow-up`);
    expect(buildHandoffBackup(transcript, '   ', 'en')).toBe(transcript);
    expect(buildHandoffBackup(transcript, '待发送内容', 'zh')).toContain('## 未发送草稿');
    expect(buildHandoffBackup(transcript, '待傳送內容', 'zh_TW')).toContain('## 未傳送草稿');
  });

  it('localizes every user-visible handoff artifact in all supported languages', () => {
    const shortTurns = [turn('Question', 'Answer')];
    const longTurns = [turn('x'.repeat(5_100))];
    const titles = new Set<string>();
    const draftWarnings = new Set<string>();

    for (const language of APP_LANGUAGES) {
      const copy = getTemporaryHandoffCopy(language);
      const inline = planHandoff(shortTurns, language, `${language}-inline.md`);
      const attachment = planHandoff(longTurns, language, `${language}-attachment.md`);
      expect(inline.transcript).toContain(`## ${copy.userRole}\n\nQuestion`);
      expect(inline.delivery).toMatchObject({
        mode: 'inline',
        text: containingInOrder(
          copy.handoffTitle,
          copy.inlineInstruction,
          copy.transcriptStart,
          copy.transcriptEnd,
        ),
      });
      expect(attachment.delivery).toMatchObject({
        mode: 'attachment',
        directive: containingInOrder(copy.handoffTitle, copy.attachmentInstruction),
      });
      expect(buildHandoffBackup(inline.transcript, 'Draft', language)).toContain(
        `## ${copy.unsentDraftHeading}`,
      );
      titles.add(copy.handoffTitle);
      draftWarnings.add(copy.attachmentDraftUnsupported);
    }

    expect(titles.size).toBe(APP_LANGUAGES.length);
    expect(draftWarnings.size).toBe(APP_LANGUAGES.length);
  });

  it('gives separate handoffs unique filenames even at the same instant', () => {
    const now = new Date('2026-08-13T12:34:56.789Z');
    const first = createHandoffFilename(now, 'first-nonce');
    const second = createHandoffFilename(now, 'second-nonce');

    expect(first).not.toBe(second);
    expect(first).toMatch(/^chatgpt-temporary-handoff-20260813123456789-firstnonce\.md$/);
    expect(second).toContain('secondnonce');
  });

  it('uses the same unique filename for a long transcript backup and attachment', () => {
    const plan = planHandoff([turn('x'.repeat(5_100))], 'en', 'unique-handoff.md');
    expect(plan.backupFilename).toBe('unique-handoff.md');
    expect(plan.delivery).toMatchObject({
      mode: 'attachment',
      filename: 'unique-handoff.md',
      attachment: plan.transcript,
    });
    expect(plan.transcript.length).toBeGreaterThan(5_000);
  });
});
