import { describe, expect, it } from 'vitest';

import { CleanupManager } from '@/core/utils/cleanupManager';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';

import { createGeminiRendererStartup } from '../rendererStartup';

const DIAGRAM_IDS = [
  OFFICIAL_PLUGIN_IDS.geminiMermaid,
  OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
  OFFICIAL_PLUGIN_IDS.geminiECharts,
  OFFICIAL_PLUGIN_IDS.geminiUserLatex,
];
const RENDERER_IDS = [OFFICIAL_PLUGIN_IDS.geminiCodeCollapse, ...DIAGRAM_IDS];

describe('Gemini renderer start points', () => {
  it('admits collapse among DOM enhancements, then diagrams and user LaTeX after the prompt panel', async () => {
    const admission = createOfficialAdmission();
    const cleanups = new CleanupManager();
    const startup = createGeminiRendererStartup(admission, cleanups);

    await startup.startCodeBlockCollapse();
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiCodeCollapse)).toBe('admitted');
    for (const id of DIAGRAM_IDS) expect(admission.stateOf(id)).toBe('pending');
    await startup.startRenderers();
    admission.close();

    for (const id of RENDERER_IDS) expect(admission.stateOf(id)).toBe('admitted');
    cleanups.executeCleanups();
  });

  it('late initialization after page teardown cannot admit renderers or register more cleanup', async () => {
    const admission = createOfficialAdmission();
    const cleanups = new CleanupManager();
    const startup = createGeminiRendererStartup(admission, cleanups);
    cleanups.executeCleanups();

    await startup.startCodeBlockCollapse();
    await startup.startRenderers();
    admission.close();

    for (const id of RENDERER_IDS) expect(admission.stateOf(id)).toBe('denied');
    expect(cleanups.list()).toEqual([]);

    const lifetime = new AbortController();
    const abortedAdmission = createOfficialAdmission();
    const abortingStartup = createGeminiRendererStartup(
      abortedAdmission,
      cleanups,
      lifetime.signal,
    );
    lifetime.abort();
    await abortingStartup.startCodeBlockCollapse();
    await abortingStartup.startRenderers();
    abortedAdmission.close();
    for (const id of RENDERER_IDS) expect(abortedAdmission.stateOf(id)).toBe('denied');
    cleanups.executeCleanups();

    const lateAdmission = createOfficialAdmission();
    const lateStartup = createGeminiRendererStartup(lateAdmission, cleanups, lifetime.signal);
    await lateStartup.startCodeBlockCollapse();
    await lateStartup.startRenderers();
    lateAdmission.close();
    for (const id of RENDERER_IDS) expect(lateAdmission.stateOf(id)).toBe('denied');
    expect(cleanups.list()).toEqual([]);
  });
});
