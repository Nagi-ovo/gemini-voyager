import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createSlashPromptLifecycle } from '../slashPrompt';

describe('prompt manager lifecycle', () => {
  it('reconciles slash completion when the runtime hide setting changes', () => {
    const code = readFileSync(resolve(process.cwd(), 'src/pages/content/prompt/index.ts'), 'utf8');
    const hideSettingBranch =
      code.match(
        /if \(area === 'sync' && changes\?\.gvHidePromptManager\) \{[\s\S]*?\n      \}/,
      )?.[0] ?? '';

    expect(hideSettingBranch).toContain('void setSlashPromptEnabled(!shouldHide);');
  });

  it('destroys slash completion while hidden and starts one fresh controller when restored', async () => {
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const start = vi
      .fn()
      .mockResolvedValueOnce({ destroy: firstDestroy })
      .mockResolvedValueOnce({ destroy: secondDestroy });
    const lifecycle = createSlashPromptLifecycle(start);

    await lifecycle.setEnabled(true);
    await lifecycle.setEnabled(true);
    expect(start).toHaveBeenCalledTimes(1);

    await lifecycle.setEnabled(false);
    expect(firstDestroy).toHaveBeenCalledTimes(1);

    await lifecycle.setEnabled(true);
    expect(start).toHaveBeenCalledTimes(2);

    lifecycle.destroy();
    expect(secondDestroy).toHaveBeenCalledTimes(1);
  });

  it('destroys a controller that finishes starting after the feature was hidden', async () => {
    let resolveStart!: (controller: { destroy: () => void }) => void;
    const pendingController = new Promise<{ destroy: () => void }>((resolve) => {
      resolveStart = resolve;
    });
    const destroy = vi.fn();
    const start = vi.fn(() => pendingController);
    const lifecycle = createSlashPromptLifecycle(start);

    const enabling = lifecycle.setEnabled(true);
    await lifecycle.setEnabled(false);
    resolveStart({ destroy });
    await enabling;

    expect(start).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
