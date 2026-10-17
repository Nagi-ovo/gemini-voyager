// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { WEAK_PERSIST_MS, createChallengeGuard } from './challengeGuard';

const SCRIPT =
  '<script src="https://chatgpt.com/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>';

describe('Local Bridge challenge guard', () => {
  it('never flags the app shell, even with the bot-management script on it', () => {
    document.title = 'ChatGPT';
    document.body.innerHTML = `<form data-chatgpt-composer><div id="prompt-textarea"></div></form>${SCRIPT}`;
    expect(createChallengeGuard().current()).toBeNull();
  });

  it('flags a verification interstitial at once', () => {
    document.title = 'Just a moment...';
    document.body.innerHTML = '<div>Verifying you are human.</div>';
    expect(createChallengeGuard().current()).toBe('challenge');
  });

  it('counts a shell-less page with only the script once it persisted', () => {
    let clock = 0;
    document.title = 'ChatGPT';
    document.body.innerHTML = SCRIPT;
    const guard = createChallengeGuard(document, () => clock);
    expect(guard.current()).toBeNull();
    clock = WEAK_PERSIST_MS - 1;
    expect(guard.current()).toBeNull();
    clock = WEAK_PERSIST_MS;
    expect(guard.current()).toBe('challenge');
  });

  it('reports the account security block on its own', () => {
    document.title = 'ChatGPT';
    document.body.innerHTML =
      '<main><p>Suspicious activity detected. Secure your account to continue.</p></main>';
    expect(createChallengeGuard().current()).toBe('account-blocked');
  });
});
