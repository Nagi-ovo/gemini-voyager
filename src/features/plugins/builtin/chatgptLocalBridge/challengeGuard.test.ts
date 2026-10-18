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

  it('does not stop on an existing chat whose page data quotes the block notice', () => {
    // Measured live: a reopened chat embeds its turns, and Pro's notes, in <script> data.
    document.title = 'ChatGPT';
    document.body.innerHTML = `<form data-chatgpt-composer><div id="prompt-textarea"></div></form>
      <script>enqueue("suspicious activity detected ... secure your account")</script>`;
    expect(createChallengeGuard().current()).toBeNull();
  });

  it('does not stop on a reply that quotes the block notice', () => {
    document.title = 'ChatGPT';
    document.body.innerHTML = `<div data-turn-key="t1"><p>It checks for "Suspicious activity
      detected" and "Secure your account".</p></div><form data-chatgpt-composer></form>`;
    expect(createChallengeGuard().current()).toBeNull();
  });

  it('still reports the block notice shown on the app shell outside the conversation', () => {
    document.title = 'ChatGPT';
    document.body.innerHTML = `<div role="dialog">Suspicious activity detected. Secure your
      account to continue.</div><form data-chatgpt-composer></form>`;
    expect(createChallengeGuard().current()).toBe('account-blocked');
  });
});
