import { describe, expect, it } from 'vitest';

import { getGeminiTurnSelectors, getGeminiUserTurnObserverScope } from '../turnSelectors';

const USER_KEYS = ['turn.user', 'turn.userWithHosts', 'chatWidth.userTurn'] as const;

describe('Gemini turn selectors', () => {
  it('hands out a copy that callers can change', () => {
    const first = getGeminiTurnSelectors('turn.user');
    first.unshift('.gv-test-override');
    expect(getGeminiTurnSelectors('turn.user')).not.toContain('.gv-test-override');
  });

  it('gives every bundled selector valid syntax', () => {
    const keys = [
      ...USER_KEYS,
      'turn.assistant',
      'turn.assistantFallback',
      'turn.assistantWithHosts',
      'chatWidth.assistantTurn',
    ] as const;
    for (const key of keys) {
      for (const selector of getGeminiTurnSelectors(key)) {
        expect(() => document.querySelector(selector)).not.toThrow();
      }
    }
  });

  it('scopes each bundled user selector the way the legacy user-query name test did', () => {
    const bundled = new Set(USER_KEYS.flatMap((key) => getGeminiTurnSelectors(key)));
    for (const selector of bundled) {
      expect(getGeminiUserTurnObserverScope(selector)).toBe(
        /user-query/i.test(selector) ? 'conversation' : 'parent',
      );
    }
  });

  it('keeps the legacy name test for selectors Voyager does not bundle', () => {
    expect(getGeminiUserTurnObserverScope('USER-QUERY.legacy')).toBe('conversation');
    expect(getGeminiUserTurnObserverScope('.gv-test-custom-turn')).toBe('parent');
    expect(getGeminiUserTurnObserverScope('')).toBe('parent');
  });
});
