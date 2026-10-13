import { describe, expect, it } from 'vitest';

import { BAR_OPTION, PIE_OPTION, createEChartsFixture, waitFor } from './fixture';

const fixture = createEChartsFixture();

/** Gemini's labels are read by the packaged primitive, not an old native wrapper. */
describe('Gemini ECharts language labels', () => {
  function block(source: string, label: string | null): HTMLElement {
    const host = document.createElement('code-block');
    host.innerHTML = `<div class="code-block-decoration"><span></span></div><code data-test-id="code-content"></code>`;
    host.querySelector('span')!.textContent = label;
    host.querySelector('code')!.textContent = source;
    document.body.append(host);
    return host;
  }
  it.each(['echarts', 'echart', 'chart', '代码段', null])(
    'renders chart source with label %s',
    async (label) => {
      const host = block(BAR_OPTION, label);
      fixture.start();
      await waitFor(() => expect(fixture.query('.gv-echarts-diagram')).not.toBeNull());
      expect(host.hasAttribute('data-gv-diagram-hidden')).toBe(true);
      expect(host.querySelector('code')!.textContent).toBe(BAR_OPTION);
    },
  );
  it.each(['json', 'typescript'])('leaves chart-shaped %s code alone', async (label) => {
    const host = block(PIE_OPTION, label);
    fixture.start();
    await Promise.resolve();
    expect(fixture.query('.gv-diagram-panel')).toBeNull();
    expect(host.hasAttribute('data-gv-diagram-hidden')).toBe(false);
  });
  it('leaves non-chart JSON as code', async () => {
    block('{"foo":"bar","list":[1,2,3]}', null);
    fixture.start();
    await Promise.resolve();
    expect(fixture.query('.gv-diagram-panel')).toBeNull();
  });
});
