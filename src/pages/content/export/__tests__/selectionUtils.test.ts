import { describe, expect, it } from 'vitest';

import {
  groupSelectedMessagesByTurn,
  pruneMissingSelectionIds,
  reconcileExistingSelectionHost,
  resolveInitialSelectedMessageIds,
  shouldRefreshSelectionUi,
} from '../selectionUtils';

describe('selectionUtils', () => {
  describe('groupSelectedMessagesByTurn', () => {
    it('groups user and assistant messages of same turn', () => {
      const selected = [
        { messageId: 't1:u', role: 'user' as const, text: 'U1', starred: false },
        { messageId: 't1:a', role: 'assistant' as const, text: 'A1', starred: true },
      ];

      const turns = groupSelectedMessagesByTurn(selected);

      expect(turns).toHaveLength(1);
      expect(turns[0].turnId).toBe('t1');
      expect(turns[0].user?.text).toBe('U1');
      expect(turns[0].assistant?.text).toBe('A1');
      expect(turns[0].starred).toBe(true);
    });

    it('keeps assistant-only selections as one grouped turn', () => {
      const selected = [
        { messageId: 't2:a', role: 'assistant' as const, text: 'A2', starred: false },
      ];

      const turns = groupSelectedMessagesByTurn(selected);

      expect(turns).toHaveLength(1);
      expect(turns[0].turnId).toBe('t2');
      expect(turns[0].user).toBeUndefined();
      expect(turns[0].assistant?.text).toBe('A2');
    });

    it('preserves visual order by first selected message occurrence', () => {
      const selected = [
        { messageId: 't2:a', role: 'assistant' as const, text: 'A2', starred: false },
        { messageId: 't1:u', role: 'user' as const, text: 'U1', starred: false },
        { messageId: 't1:a', role: 'assistant' as const, text: 'A1', starred: false },
      ];

      const turns = groupSelectedMessagesByTurn(selected);

      expect(turns.map((turn) => turn.turnId)).toEqual(['t2', 't1']);
    });
  });

  describe('resolveInitialSelectedMessageIds', () => {
    it('returns only the preferred id when it exists in all ids', () => {
      const allIds = ['t1:u', 't1:a', 't2:u'];
      const selected = resolveInitialSelectedMessageIds(allIds, 't1:a');

      expect(Array.from(selected)).toEqual(['t1:a']);
    });

    it('returns empty set when preferred id is missing', () => {
      const allIds = ['t1:u', 't1:a'];
      const selected = resolveInitialSelectedMessageIds(allIds, 't9:a');

      expect(selected.size).toBe(0);
    });

    it('returns empty set when preferred id is not provided', () => {
      const allIds = ['t1:u', 't1:a'];
      const selected = resolveInitialSelectedMessageIds(allIds, null);

      expect(selected.size).toBe(0);
    });
  });

  it('prunes selected ids that disappeared during same-route reconciliation', () => {
    const selectedIds = new Set(['user-1', 'assistant-old']);

    expect(pruneMissingSelectionIds(selectedIds, new Set(['user-1', 'assistant-new']))).toEqual([
      'assistant-old',
    ]);
    expect(Array.from(selectedIds)).toEqual(['user-1']);
  });

  describe('selection host reconciliation', () => {
    it('restores Voyager classes when ChatGPT rewrites the same host class list', () => {
      const host = document.createElement('div');
      host.className = 'gv-export-msg-host gv-export-msg-selected';
      const selector = document.createElement('div');
      selector.className = 'gv-export-msg-selector';
      host.appendChild(selector);
      document.body.appendChild(host);

      // ChatGPT can reconcile the existing node in place and overwrite className.
      host.className = 'chatgpt-turn';

      expect(reconcileExistingSelectionHost(host, host, true)).toBe(true);
      expect(host.classList.contains('chatgpt-turn')).toBe(true);
      expect(host.classList.contains('gv-export-msg-host')).toBe(true);
      expect(host.classList.contains('gv-export-msg-selected')).toBe(true);
    });

    it('rebuilds a binding when ChatGPT removes its selector from the same host', () => {
      const host = document.createElement('div');
      host.className = 'chatgpt-turn';
      document.body.appendChild(host);

      expect(reconcileExistingSelectionHost(host, host, true)).toBe(false);
      expect(host.className).toBe('chatgpt-turn');
    });

    it('does not reuse a binding when ChatGPT replaces the host node', () => {
      const previousHost = document.createElement('div');
      const replacementHost = document.createElement('div');

      expect(reconcileExistingSelectionHost(previousHost, replacementHost, true)).toBe(false);
      expect(replacementHost.className).toBe('');
    });

    it('refreshes selection UI when a bound host class changes', async () => {
      const root = document.createElement('div');
      const host = document.createElement('div');
      const selector = document.createElement('div');
      selector.className = 'gv-export-msg-selector';
      host.appendChild(selector);
      root.appendChild(host);

      let records: MutationRecord[] = [];
      const observer = new MutationObserver((mutations) => {
        records = mutations;
      });
      observer.observe(root, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true,
      });

      host.className = 'chatgpt-turn';
      await Promise.resolve();
      observer.disconnect();

      expect(shouldRefreshSelectionUi(records)).toBe(true);
    });
  });
});
