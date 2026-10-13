import { describe, expect, it, vi } from 'vitest';

import { PIE_OPTION, createEChartsFixture, waitFor } from './fixture';

const fixture = createEChartsFixture();
function block(): void {
  const host = document.createElement('code-block');
  host.innerHTML =
    '<div class="code-block-decoration"><span>echarts</span></div><code data-test-id="code-content"></code>';
  host.querySelector('code')!.textContent = PIE_OPTION;
  document.body.append(host);
}

describe('ECharts primitive scheme switching', () => {
  it('closes an old fullscreen chart and redraws it with the new panel backdrop', async () => {
    block();
    fixture.start();
    await waitFor(() => expect(fixture.query('.gv-echarts-diagram')).not.toBeNull());
    const runtime = await import('../runtime');
    const lightInstance = vi.mocked(runtime.init).mock.results[0]!.value;
    fixture.query<HTMLButtonElement>('[aria-label="Fullscreen"]')!.click();
    expect(
      fixture
        .query<HTMLElement>('.gv-echarts-modal-card')!
        .style.getPropertyValue('--gv-echarts-panel-bg'),
    ).toBe('#f9fafb');
    document.documentElement.setAttribute('data-gv-scheme', 'dark');
    await waitFor(() => expect(runtime.init).toHaveBeenCalledTimes(2));
    const chart = fixture.query<HTMLElement>('.gv-echarts-diagram')!;
    expect(runtime.init).toHaveBeenLastCalledWith(chart, 'dark', { renderer: 'canvas' });
    expect(lightInstance.dispose).toHaveBeenCalledTimes(1);
    expect(fixture.query('.gv-echarts-modal')).toBeNull();
    expect(chart.style.getPropertyValue('--gv-echarts-panel-bg')).toBe('#1a1a1a');
    fixture.query<HTMLButtonElement>('[aria-label="Fullscreen"]')!.click();
    expect(
      fixture
        .query<HTMLElement>('.gv-echarts-modal-card')!
        .style.getPropertyValue('--gv-echarts-panel-bg'),
    ).toBe('#1a1a1a');
  });
  it('settles on the newest scheme when it changes during asynchronous loading', async () => {
    block();
    fixture.start();
    document.documentElement.setAttribute('data-gv-scheme', 'dark');
    const runtime = await import('../runtime');
    await waitFor(() =>
      expect(runtime.init).toHaveBeenLastCalledWith(expect.anything(), 'dark', {
        renderer: 'canvas',
      }),
    );
    expect(
      fixture
        .query<HTMLElement>('.gv-echarts-diagram')!
        .style.getPropertyValue('--gv-echarts-panel-bg'),
    ).toBe('#1a1a1a');
  });
});
