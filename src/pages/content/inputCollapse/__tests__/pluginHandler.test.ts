/**
 * Input collapse under its official builtin plugin: the native session owned
 * by a plugin scope, its "collapse with content" value updated in place, and
 * the expand helpers other features call working with the plugin on or off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { resolvePromptSiteAdapter } from '../../prompt/resolvePromptSiteAdapter';
import { expandInputCollapseIfNeeded, expandInputWithCursorAtEnd } from '../index';
import { activateGeminiInputCollapse, updateGeminiInputCollapseSettings } from '../pluginHandler';

const COLLAPSED = 'gv-input-collapsed';
const STYLE_ID = 'gemini-voyager-input-collapse';

let scope: PluginScope | null = null;

async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

async function mountComposer(
  content = '',
): Promise<{ container: HTMLElement; editor: HTMLElement }> {
  const container = document.createElement('div');
  container.style.backgroundColor = '#f0f0f0';
  container.style.display = 'flex';
  const textarea = document.createElement('rich-textarea');
  const editor = document.createElement('div');
  editor.className = 'ql-editor';
  editor.setAttribute('contenteditable', 'true');
  editor.textContent = content;
  textarea.appendChild(editor);
  container.appendChild(textarea);
  document.body.appendChild(container);
  await settle(100);
  return { container, editor };
}

/** Leave the composer, as clicking elsewhere on the page does. */
async function collapseByBlur(container: HTMLElement): Promise<void> {
  (document.activeElement as HTMLElement | null)?.blur();
  const event = new Event('focusout', { bubbles: true });
  Object.defineProperty(event, 'relatedTarget', { value: null });
  container.dispatchEvent(event);
  await settle(300);
}

function activate(collapseWhenNotEmpty: boolean): PluginScope {
  scope = new PluginScope();
  activateGeminiInputCollapse(scope, { collapseWhenNotEmpty });
  return scope;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/app/abc123def456');
});

afterEach(async () => {
  await scope?.dispose();
  scope = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('Input collapse under its official plugin', () => {
  it('runs the native collapse while mounted and leaves the page as it was on unmount', async () => {
    const plugin = activate(false);
    const { container } = await mountComposer();
    await collapseByBlur(container);
    expect(container.classList.contains(COLLAPSED)).toBe(true);

    await plugin.dispose();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(container.className).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('follows collapse-with-content in place without restarting the session', async () => {
    activate(false);
    const { container } = await mountComposer('draft');
    const style = document.getElementById(STYLE_ID);
    await collapseByBlur(container);
    expect(container.classList.contains(COLLAPSED)).toBe(false);

    updateGeminiInputCollapseSettings({ collapseWhenNotEmpty: true });
    await collapseByBlur(container);
    expect(container.classList.contains(COLLAPSED)).toBe(true);
    expect(document.getElementById(STYLE_ID)).toBe(style);
  });

  it('expands a collapsed composer for prompt history, quote, the prompt manager and Vim insert', async () => {
    activate(false);
    const { container, editor } = await mountComposer();
    const focus = vi.spyOn(editor, 'focus');

    // The Prompt Manager's Gemini insert expands first.
    await collapseByBlur(container);
    expect(container.classList.contains(COLLAPSED)).toBe(true);
    resolvePromptSiteAdapter('https://gemini.google.com/app/abc123def456').insert('hello');
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    await settle();
    const focusedByPromptManager = focus.mock.calls.length;
    expect(focusedByPromptManager).toBeGreaterThan(0);

    // Prompt history's insert and quote reply call the same expand before inserting.
    editor.textContent = '';
    await collapseByBlur(container);
    expect(container.classList.contains(COLLAPSED)).toBe(true);
    expandInputCollapseIfNeeded();
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    await settle();
    expect(focus).toHaveBeenCalledTimes(focusedByPromptManager + 1);

    // Vim's `i` outside the composer expands it with the cursor at the end.
    await collapseByBlur(container);
    expect(container.classList.contains(COLLAPSED)).toBe(true);
    expandInputWithCursorAtEnd();
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    await settle();
    expect(focus).toHaveBeenCalledTimes(focusedByPromptManager + 2);
    const focusedWhileOn = focus.mock.calls.length;

    // With the plugin off they are harmless no-ops: nothing to expand, nothing left to focus.
    await scope?.dispose();
    scope = null;
    expect(() => {
      expandInputCollapseIfNeeded();
      expandInputWithCursorAtEnd();
    }).not.toThrow();
    await settle();
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    expect(focus).toHaveBeenCalledTimes(focusedWhileOn);
  });
});
