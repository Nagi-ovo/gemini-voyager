/**
 * The chat width feature's native health probe, shared by the native module
 * and the chat width plugin handler.
 */
import { classifyGeminiRoute } from '@/core/gemini/nativeHealth';
import { getGeminiTurnSelectors } from '@/core/gemini/turnSelectors';

import { nativeHealthReporter } from '../nativeHealth';
import { hasRenderedConversationContent } from '../nativeHealth/pageEvidence';

function hasWidenedUserTurn(): boolean {
  return document.querySelector(getGeminiTurnSelectors('chatWidth.userTurn').join(',')) !== null;
}

/**
 * Probe while the width rules are applied. A route settles once a user turn is found, or at once
 * when it is not a conversation, so a healthy page stops querying after its first match. Until
 * then each debounced check looks again, which lets a miss recover when turns render later on the
 * same route.
 */
export function createUserTurnProbe(): { check: () => void; reset: () => void } {
  let settledPath: string | null = null;
  return {
    check() {
      const path = location.pathname;
      if (settledPath === path) return;
      if (classifyGeminiRoute(path) !== 'conversation') {
        settledPath = path;
        return;
      }
      if (hasWidenedUserTurn()) {
        settledPath = path;
        nativeHealthReporter.reportFound('chat-width');
        return;
      }
      nativeHealthReporter.reportMissing('chat-width', {
        route: 'conversation',
        recheck: hasWidenedUserTurn,
        expected: () => hasRenderedConversationContent(),
      });
    },
    reset() {
      settledPath = null;
      nativeHealthReporter.withdraw('chat-width');
    },
  };
}
