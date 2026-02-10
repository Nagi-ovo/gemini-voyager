import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeConversationFingerprint,
  waitForConversationFingerprintChangeOrTimeout,
} from '../topNodePreload';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('topNodePreload', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('detects a delayed history expansion and waits for idle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    document.body.innerHTML = '';

    const root = document.createElement('div');
    document.body.appendChild(root);

    const b = document.createElement('div');
    b.className = 'msg';
    b.textContent = 'B';
    root.appendChild(b);

    const c = document.createElement('div');
    c.className = 'msg';
    c.textContent = 'C';
    root.appendChild(c);

    const selectors = ['.msg'];
    const before = computeConversationFingerprint(root, selectors, 5);

    let resolved = false;
    const promise = waitForConversationFingerprintChangeOrTimeout(root, selectors, before, {
      timeoutMs: 5000,
      idleMs: 200,
      pollIntervalMs: 50,
      maxSamples: 5,
    }).then((r) => {
      resolved = true;
      return r;
    });

    setTimeout(() => {
      const a = document.createElement('div');
      a.className = 'msg';
      a.textContent = 'A';
      root.insertBefore(a, root.firstChild);
    }, 100);

    setTimeout(() => {
      const first = root.querySelector('.msg');
      if (first) first.textContent = 'A2';
    }, 250);

    vi.advanceTimersByTime(350);
    await flushMicrotasks();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(400);
    await flushMicrotasks();

    const result = await promise;
    expect(result.changed).toBe(true);
    expect(result.fingerprint.count).toBe(3);
    expect(result.fingerprint.signature).not.toBe(before.signature);
  });

  it('times out as stable when nothing changes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    document.body.innerHTML = '';

    const root = document.createElement('div');
    document.body.appendChild(root);

    const b = document.createElement('div');
    b.className = 'msg';
    b.textContent = 'B';
    root.appendChild(b);

    const selectors = ['.msg'];
    const before = computeConversationFingerprint(root, selectors, 5);

    const promise = waitForConversationFingerprintChangeOrTimeout(root, selectors, before, {
      timeoutMs: 600,
      idleMs: 100,
      pollIntervalMs: 50,
      maxSamples: 5,
    });

    vi.advanceTimersByTime(700);
    await flushMicrotasks();

    const result = await promise;
    expect(result.changed).toBe(false);
    expect(result.fingerprint.signature).toBe(before.signature);
  });

  it('resolves unchanged fingerprint within about one second by default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    document.body.innerHTML = '';

    const root = document.createElement('div');
    document.body.appendChild(root);

    const node = document.createElement('div');
    node.className = 'msg';
    node.textContent = 'stable';
    root.appendChild(node);

    const selectors = ['.msg'];
    const before = computeConversationFingerprint(root, selectors, 5);

    let resolved = false;
    const promise = waitForConversationFingerprintChangeOrTimeout(root, selectors, before, {
      timeoutMs: 3000,
      idleMs: 120,
      pollIntervalMs: 40,
      maxSamples: 5,
    }).then((result) => {
      resolved = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(true);

    const result = await promise;
    expect(result.changed).toBe(false);
    expect(result.fingerprint.signature).toBe(before.signature);
  });
});
