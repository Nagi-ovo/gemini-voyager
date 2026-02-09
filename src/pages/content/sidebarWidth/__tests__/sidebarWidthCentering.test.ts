import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sidebar width title centering', () => {
  it('does not override native center-section positioning', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).not.toContain('.center-section');
    expect(code).not.toContain('translate(-50%, -50%)');
    expect(code).not.toContain('left: 50% !important;');
    expect(code).not.toContain('left: clamp(');
  });

  it('does not force top bar host transform/width overrides', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).not.toContain('#app-root > main > top-bar-actions {');
    expect(code).not.toContain('#app-root > main > .top-bar-actions {');
    expect(code).not.toContain('width: calc(100% - var(--gv-sidenav-shift)) !important;');
  });

  it('does not override top-bar actions right-section to fixed', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).not.toContain('div.right-section > div:nth-child(2)');
    expect(code).not.toContain('position: fixed !important;');
  });
});
