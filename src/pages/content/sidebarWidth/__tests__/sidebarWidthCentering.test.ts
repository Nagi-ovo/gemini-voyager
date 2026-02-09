import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sidebar width title centering', () => {
  it('uses clamped center-section positioning strategy', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).toContain('left: clamp(');
    expect(code).toContain('calc(var(--gv-sidenav-shift) + 120px)');
    expect(code).toContain('calc(0.5 * var(--gv-top-bar-width, 100vw) - var(--gv-sidenav-shift))');
    expect(code).toContain('transform: translateX(-50%) !important;');
  });

  it('anchors center-section positioning to top-bar-actions container', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).toContain('#app-root > main > top-bar-actions,');
    expect(code).toContain('#app-root > main > top-bar-actions > div > div.center-section,');
    expect(code).toContain('position: absolute !important;');
  });

  it('does not override top-bar-actions inner wrapper positioning', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).not.toContain('#app-root > main > top-bar-actions > div,');
  });
});
