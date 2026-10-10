import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const gate = readFileSync('.github/workflows/pr-gate.yml', 'utf8');
const script = ci.match(/^          script: \|\n((?:            .*\n|\n)+)/m)[1];
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const labelPullRequest = new AsyncFunction('github', 'context', 'core', script);

describe('PR size labels', () => {
  function setup(changes, names) {
    const labels = new Set(names);
    const events = [];
    const github = {
      rest: {
        pulls: { listFiles: async () => ({ data: [{ changes }] }) },
        issues: {
          listLabelsOnIssue: async () => ({ data: [...labels].map((name) => ({ name })) }),
          removeLabel: async ({ name }) => {
            labels.delete(name);
            events.push(['removed', name]);
          },
          addLabels: async ({ labels: added }) => {
            for (const name of added) {
              labels.add(name);
              events.push(['added', name]);
            }
          },
        },
      },
    };
    const context = {
      repo: { owner: 'Nagi-ovo', repo: 'voyager' },
      payload: { pull_request: { number: 957 } },
    };
    return {
      labels,
      events,
      run: () => labelPullRequest(github, context, { info: vi.fn() }),
    };
  }

  it.each([
    [49, 'size/S'],
    [50, 'size/M'],
    [200, 'size/L'],
    [500, 'size/XL'],
  ])(
    'leaves an unchanged %s-line size label untouched across repeated runs',
    async (changes, label) => {
      const state = setup(changes, ['intake-approved', label]);
      await state.run();
      await state.run();
      expect(state.events).toEqual([]);
      expect([...state.labels]).toEqual(['intake-approved', label]);
    },
  );

  it('replaces a changed size once and preserves unrelated labels', async () => {
    const state = setup(500, ['intake-approved', 'size/L']);
    await state.run();
    await state.run();
    expect(state.events).toEqual([
      ['removed', 'size/L'],
      ['added', 'size/XL'],
    ]);
    expect([...state.labels]).toEqual(['intake-approved', 'size/XL']);
  });

  it('removes stale sizes without removing or readding the correct size', async () => {
    const state = setup(500, ['size/M', 'size/XL', 'intake-approved']);
    await state.run();
    expect(state.events).toEqual([['removed', 'size/M']]);
    expect([...state.labels]).toEqual(['size/XL', 'intake-approved']);
  });
});

describe('PR intake job routing', () => {
  const [, inline, block] = gate.match(/^    if: (.+)\n((?:      .*\n)*)/m);
  // This condition uses only equality and boolean operators shared with JavaScript.
  const shouldRun = new Function('github', `return (${inline === '>-' ? block : inline});`);

  it.each([
    ['opened', {}, true],
    ['synchronize', {}, true],
    ['reopened', {}, true],
    ['edited', { body: { from: 'old description' } }, false],
    ['edited', { title: { from: 'old title' } }, true],
    ['edited', { base: { ref: { from: 'main' } } }, true],
    ['edited', { body: { from: '' }, title: { from: 'old title' } }, true],
  ])('routes %s with %j to %s', (action, changes, expected) => {
    expect(shouldRun({ repository: 'voyager-crew/voyager', event: { action, changes } })).toBe(
      expected,
    );
  });

  it('does not run the intake policy in another repository', () => {
    expect(shouldRun({ repository: 'someone/voyager', event: { action: 'opened' } })).toBe(false);
  });
});
