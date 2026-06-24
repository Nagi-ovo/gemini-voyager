import { describe, expect, it } from 'vitest';

import { getSettingsSearchMatches, matchesFuzzySearch } from './settingsSearch';

describe('settings search', () => {
  it('matches section text across bundled languages', () => {
    const matches = getSettingsSearchMatches(
      [{ id: 'general', keys: ['responseCompleteNotification'] }],
      '思考完成',
    );

    expect(matches.has('general')).toBe(true);
  });

  it('matches small typos in feature names', () => {
    expect(matchesFuzzySearch('Response completion notifications', 'notifcation')).toBe(true);
  });

  it('matches nearby user wording through section aliases', () => {
    const matches = getSettingsSearchMatches(
      [
        {
          id: 'general',
          keys: ['generalOptions'],
          aliases: ['alert reminder notice 提醒 推送'],
        },
      ],
      '提醒',
    );

    expect(matches.has('general')).toBe(true);
  });

  it('does not match short CJK fragments inside the query', () => {
    expect(matchesFuzzySearch('输入选项 用 i Escape 切换模式', '用量')).toBe(false);
    expect(matchesFuzzySearch('Gemini 用量限额', '用量')).toBe(true);
  });

  it('does not match unrelated words', () => {
    const matches = getSettingsSearchMatches(
      [{ id: 'general', keys: ['responseCompleteNotification'] }],
      'watermark',
    );

    expect(matches.size).toBe(0);
  });
});
