import { describe, expect, it } from 'vitest';

import { ResponseCompletionDetector } from '../detector';

describe('ResponseCompletionDetector', () => {
  it('does not notify for completed history loaded before generation starts', () => {
    const detector = new ResponseCompletionDetector(1000);

    const decision = detector.update({
      conversationKey: '/app/history',
      hasCompletedResponse: true,
      isGenerating: false,
      responseFingerprint: '42:answer',
      now: 2000,
    });

    expect(decision.type).toBe('none');
  });

  it('notifies once after generation stops and the response is stable', () => {
    const detector = new ResponseCompletionDetector(1000);

    detector.update({
      conversationKey: '/app/current',
      hasCompletedResponse: false,
      isGenerating: true,
      responseFingerprint: null,
      now: 1000,
    });

    expect(
      detector.update({
        conversationKey: '/app/current',
        hasCompletedResponse: true,
        isGenerating: false,
        responseFingerprint: '100:final answer',
        now: 1500,
      }).type,
    ).toBe('none');

    const decision = detector.update({
      conversationKey: '/app/current',
      hasCompletedResponse: true,
      isGenerating: false,
      responseFingerprint: '100:final answer',
      now: 2600,
    });

    expect(decision).toEqual({
      type: 'notify',
      conversationKey: '/app/current',
      responseFingerprint: '100:final answer',
    });

    expect(
      detector.update({
        conversationKey: '/app/current',
        hasCompletedResponse: true,
        isGenerating: false,
        responseFingerprint: '100:final answer',
        now: 4000,
      }).type,
    ).toBe('none');
  });

  it('restarts the stability window when the response fingerprint changes', () => {
    const detector = new ResponseCompletionDetector(1000);

    detector.update({
      conversationKey: '/app/current',
      hasCompletedResponse: false,
      isGenerating: true,
      responseFingerprint: null,
      now: 1000,
    });
    detector.update({
      conversationKey: '/app/current',
      hasCompletedResponse: true,
      isGenerating: false,
      responseFingerprint: '100:partial',
      now: 1500,
    });

    expect(
      detector.update({
        conversationKey: '/app/current',
        hasCompletedResponse: true,
        isGenerating: false,
        responseFingerprint: '120:final',
        now: 2300,
      }).type,
    ).toBe('none');

    expect(
      detector.update({
        conversationKey: '/app/current',
        hasCompletedResponse: true,
        isGenerating: false,
        responseFingerprint: '120:final',
        now: 3400,
      }).type,
    ).toBe('notify');
  });
});
