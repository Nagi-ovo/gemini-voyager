import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { activateGeminiMarkdownFix } from '../pluginHandler';

describe('Markdown fix activation', () => {
  const scopes = new Set<PluginScope>();

  const activate = (): PluginScope => {
    const scope = new PluginScope();
    scopes.add(scope);
    activateGeminiMarkdownFix(scope);
    return scope;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    for (const scope of scopes) await scope.dispose();
    scopes.clear();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('retains repaired content and live host elements when switched off', async () => {
    document.body.innerHTML = '<p>**plain** and **<b data-path-to-node="1">split</b>**</p>';
    const hostNode = document.querySelector('b')!;
    const clicked = vi.fn();
    hostNode.addEventListener('click', clicked);
    const scope = activate();
    const repaired = document.body.innerHTML;

    await scope.dispose();

    expect(document.body.innerHTML).toBe(repaired);
    expect(document.querySelectorAll('strong')).toHaveLength(2);
    expect(document.querySelector('b')).toBe(hostNode);
    hostNode.click();
    expect(clicked).toHaveBeenCalledOnce();
    document.body.insertAdjacentHTML('beforeend', '<p>**new message**</p>');
    await vi.advanceTimersByTimeAsync(200);
    expect(document.body.lastElementChild?.textContent).toBe('**new message**');
    expect(document.querySelectorAll('strong')).toHaveLength(2);
  });

  it('does not overwrite a host replacement or an updated repaired node on disable', async () => {
    document.body.innerHTML = '<p>**replace me**</p><p>**update me**</p>';
    const scope = activate();
    const replacement = document.createElement('p');
    replacement.textContent = 'host replacement';
    document.body.firstElementChild!.replaceWith(replacement);
    const updated = document.querySelector('strong')!;
    updated.textContent = 'host update';

    await scope.dispose();
    await vi.advanceTimersByTimeAsync(200);

    expect(document.body.firstElementChild).toBe(replacement);
    expect(replacement.textContent).toBe('host replacement');
    expect(document.querySelector('strong')).toBe(updated);
    expect(updated.textContent).toBe('host update');
  });

  it('off then on patches new messages without duplicating repaired wrappers', async () => {
    document.body.innerHTML = '<p>**plain** and **<b data-path-to-node="1">split</b>**</p>';
    const first = activate();
    const originalWrappers = Array.from(document.querySelectorAll('strong'));
    await first.dispose();
    document.body.insertAdjacentHTML('beforeend', '<p>**new message**</p>');

    activate();
    await vi.advanceTimersByTimeAsync(200);

    expect(document.querySelectorAll('strong')).toHaveLength(3);
    expect(document.querySelector('strong strong')).toBeNull();
    expect(Array.from(document.querySelectorAll('strong')).slice(0, 2)).toEqual(originalWrappers);
    expect(document.body.textContent).toBe('plain and splitnew message');
  });

  it('cancels a pending scan immediately even while scope cleanup is waiting', async () => {
    const scope = activate();
    let finishCleanup!: () => void;
    scope.effect(() => () => new Promise<void>((resolve) => (finishCleanup = resolve)));
    document.body.innerHTML = '<p>**pending**</p>';
    await Promise.resolve();

    const disposal = scope.dispose();
    try {
      await vi.advanceTimersByTimeAsync(200);
      expect(document.querySelector('strong')).toBeNull();
      document.body.insertAdjacentHTML('beforeend', '<p>**after abort**</p>');
      await vi.advanceTimersByTimeAsync(200);
      expect(document.querySelector('strong')).toBeNull();
    } finally {
      finishCleanup();
      await disposal;
    }
  });

  it('ignores a queued mutation observer callback after abort', async () => {
    const scope = activate();
    document.body.innerHTML = '<p>**queued**</p>';
    await scope.dispose();
    await vi.advanceTimersByTimeAsync(200);
    expect(document.body.textContent).toBe('**queued**');
    expect(document.querySelector('strong')).toBeNull();
  });

  it('leaves streamed code, math and composer content untouched', async () => {
    activate();
    document.body.innerHTML =
      '<pre><code>**code**</code></pre><math-block>**math**</math-block><div contenteditable="true">**draft**</div>';
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelector('strong')).toBeNull();
    expect(document.body.textContent).toBe('**code****math****draft**');
  });

  it('does not patch a detached message when its queued scan runs', async () => {
    activate();
    const paragraph = document.createElement('p');
    paragraph.textContent = '**old response**';
    document.body.appendChild(paragraph);
    await Promise.resolve();
    paragraph.remove();
    await vi.advanceTimersByTimeAsync(200);
    expect(paragraph.textContent).toBe('**old response**');
    expect(paragraph.querySelector('strong')).toBeNull();
  });
});
