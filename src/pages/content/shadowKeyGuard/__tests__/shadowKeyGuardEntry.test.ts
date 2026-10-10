import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHADOW_SURFACE_ATTR } from '..';

const CONTENT = resolve(__dirname, '../..');
const SRC = resolve(CONTENT, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const importsOf = (path: string) =>
  [
    ...readFileSync(path, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*'([^']+)'/g),
  ].map((match) => match[1]);

afterEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
});

describe('shadow key guard entry', () => {
  // The bundler emits the entry as one synchronous classic script only while it
  // shares no module with another entry; the build plugin checks the output.
  it('imports only the guard, which imports nothing', () => {
    expect(importsOf(join(CONTENT, 'shadowKeyGuardEntry.ts'))).toEqual(['./shadowKeyGuard']);
    expect(importsOf(join(CONTENT, 'shadowKeyGuard/index.ts'))).toEqual([]);
  });

  it('is the only source that imports the guard', () => {
    const importers = sourceFiles(SRC).filter((path) =>
      importsOf(path).some((spec) => /(^|\/)shadowKeyGuard$/.test(spec)),
    );
    expect(importers.map((path) => path.slice(SRC.length + 1))).toEqual([
      'pages/content/shadowKeyGuardEntry.ts',
    ]);
  });

  it('installs the guard when it is evaluated', async () => {
    const pageSaw: string[] = [];
    const add = vi.spyOn(window, 'addEventListener');
    await import('../../shadowKeyGuardEntry');
    expect(add.mock.calls.map(([type, , capture]) => [type, capture])).toEqual([
      ['keydown', true],
      ['keypress', true],
      ['keyup', true],
    ]);
    add.mockRestore();

    const host = document.createElement('div');
    host.setAttribute(SHADOW_SURFACE_ATTR, '');
    document.body.appendChild(host);
    const input = host.attachShadow({ mode: 'open' }).appendChild(document.createElement('input'));
    const page = (e: Event) => pageSaw.push((e as KeyboardEvent).key);
    window.addEventListener('keydown', page, true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, composed: true }));
    window.removeEventListener('keydown', page, true);
    expect(pageSaw).toEqual([]);
  });
});
