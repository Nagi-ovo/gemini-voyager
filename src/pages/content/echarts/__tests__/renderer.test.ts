import { describe, expect, it, vi } from 'vitest';

import { PIE_OPTION, createEChartsFixture } from './fixture';

const fixture = createEChartsFixture();

describe('safe chart rendering', () => {
  const addEChartsBlock = (code: string, language = 'echarts'): HTMLElement => {
    const codeBlock = document.createElement('code-block');
    const decoration = document.createElement('div');
    decoration.className = 'code-block-decoration';
    const span = document.createElement('span');
    span.textContent = language;
    decoration.appendChild(span);
    const codeEl = document.createElement('code');
    codeEl.setAttribute('data-test-id', 'code-content');
    codeEl.textContent = code;
    codeBlock.append(decoration, codeEl);
    document.body.appendChild(codeBlock);
    return codeEl;
  };

  it('inits a canvas chart with the dark theme and merged backdrop on a dark page', async () => {
    const darkHost = document.createElement('div');
    darkHost.className = 'theme-host dark-theme';
    document.body.appendChild(darkHost);
    addEChartsBlock(PIE_OPTION);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    const initMock = vi.mocked(echartsMod.init);
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith(document.querySelector('.gv-echarts-diagram'), 'dark', {
      renderer: 'canvas',
    });
    const fakeInstance = initMock.mock.results[0]?.value;
    expect(fakeInstance.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: '#1a1a1a',
        series: [{ type: 'pie', data: [{ value: 1, name: 'a' }] }],
      }),
      true,
    );
  });

  it('keeps the renderer backdrop when the option supplies its own background', async () => {
    const darkHost = document.createElement('div');
    darkHost.className = 'theme-host dark-theme';
    document.body.appendChild(darkHost);
    addEChartsBlock(`{
      "backgroundColor": "hotpink",
      "series": [{ "type": "pie", "data": [{ "value": 1 }] }]
    }`);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
    expect(fakeInstance.setOption).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: '#1a1a1a' }),
      true,
    );
  });

  it('keeps the renderer backdrop in every timeline and responsive option layer', async () => {
    const darkHost = document.createElement('div');
    darkHost.className = 'theme-host dark-theme';
    document.body.appendChild(darkHost);
    addEChartsBlock(`{
      "backgroundColor": "top",
      "baseOption": {
        "backgroundColor": "base",
        "timeline": { "data": ["2026"] },
        "xAxis": {},
        "series": [{ "type": "bar", "data": [1] }]
      },
      "options": [{ "backgroundColor": "state", "series": [{ "data": [2] }] }],
      "media": [{ "option": { "backgroundColor": "media" } }]
    }`);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
    const safeOption = fakeInstance.setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(safeOption['backgroundColor']).toBe('#1a1a1a');
    expect((safeOption['baseOption'] as Record<string, unknown>)['backgroundColor']).toBe(
      '#1a1a1a',
    );
    expect((safeOption['options'] as Array<Record<string, unknown>>)[0]?.['backgroundColor']).toBe(
      '#1a1a1a',
    );
    const mediaOption = (safeOption['media'] as Array<Record<string, unknown>>)[0]?.[
      'option'
    ] as Record<string, unknown>;
    expect(mediaOption['backgroundColor']).toBe('#1a1a1a');
  });

  it('inits with no theme on a light page', async () => {
    const lightHost = document.createElement('div');
    lightHost.className = 'theme-host light-theme';
    document.body.appendChild(lightHost);
    addEChartsBlock(PIE_OPTION);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    expect(vi.mocked(echartsMod.init)).toHaveBeenCalledWith(
      document.querySelector('.gv-echarts-diagram'),
      undefined,
      { renderer: 'canvas' },
    );
  });

  it('forces untrusted tooltip markup through the rich-text renderer', async () => {
    addEChartsBlock(`{
      "tooltip": {
        "renderMode": "html",
        "formatter": "<img src=x onerror=alert(1)>"
      },
      "series": { "type": "pie", "data": [{ "value": 1 }] }
    }`);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
    expect(fakeInstance.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        tooltip: expect.objectContaining({
          formatter: '<img src=x onerror=alert(1)>',
          renderMode: 'richText',
        }),
      }),
      true,
    );
  });

  it('forces series-level tooltip formatters through the rich-text renderer', async () => {
    addEChartsBlock(`{
      "series": {
        "type": "pie",
        "tooltip": { "renderMode": "html", "formatter": "<img src=x>" },
        "data": [{ "value": 1 }]
      }
    }`);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
    expect(fakeInstance.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        tooltip: { renderMode: 'richText' },
        series: expect.objectContaining({
          tooltip: {
            formatter: '<img src=x>',
            renderMode: 'richText',
          },
        }),
      }),
      true,
    );
  });

  it('forces tooltip rendering in timeline and responsive option layers', async () => {
    addEChartsBlock(`{
      "baseOption": {
        "timeline": { "data": ["2026"] },
        "xAxis": {},
        "tooltip": { "renderMode": "html", "formatter": "<b>base</b>" },
        "series": [{ "type": "bar", "data": [1] }]
      },
      "options": [{ "tooltip": { "formatter": "<b>state</b>" } }],
      "media": [{ "option": { "tooltip": { "formatter": "<b>media</b>" } } }]
    }`);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
    expect(fakeInstance.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        aria: { enabled: true },
        baseOption: expect.objectContaining({
          aria: { enabled: true },
          tooltip: expect.objectContaining({ renderMode: 'richText' }),
        }),
        options: [
          expect.objectContaining({
            aria: { enabled: true },
            tooltip: expect.objectContaining({ renderMode: 'richText' }),
          }),
        ],
        media: [
          expect.objectContaining({
            option: expect.objectContaining({
              aria: { enabled: true },
              tooltip: expect.objectContaining({ renderMode: 'richText' }),
            }),
          }),
        ],
      }),
      true,
    );
  });

  it('removes active title links from every option layer before rendering', async () => {
    addEChartsBlock(`{
      "title": { "text": "Top", "link": "javascript:alert(1)", "target": "self" },
      "baseOption": {
        "timeline": { "data": ["2026"] },
        "xAxis": {},
        "title": { "text": "Base", "sublink": "javascript:alert(2)", "subtarget": "self" },
        "series": [{ "type": "bar", "data": [1] }]
      },
      "options": [{ "title": { "text": "State", "link": "javascript:alert(3)" } }],
      "media": [{ "option": { "title": { "text": "Media", "sublink": "javascript:alert(1)" } } }]
    }`);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
    const safeOption = fakeInstance.setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(safeOption['title']).toEqual({ text: 'Top' });
    expect((safeOption['baseOption'] as Record<string, unknown>)['title']).toEqual({
      text: 'Base',
    });
    expect((safeOption['options'] as Array<Record<string, unknown>>)[0]?.['title']).toEqual({
      text: 'State',
    });
    const mediaOption = (safeOption['media'] as Array<Record<string, unknown>>)[0]?.[
      'option'
    ] as Record<string, unknown>;
    expect(mediaOption['title']).toEqual({ text: 'Media' });
  });

  it('removes series-data navigation from every option layer', async () => {
    addEChartsBlock(`{
      "series": {
        "type": "treemap",
        "nodeClick": "link",
        "data": [{ "value": 1, "link": "javascript:alert(1)", "target": "self" }]
      },
      "baseOption": {
        "timeline": { "data": ["2026"] },
        "series": [{
          "type": "sunburst",
          "nodeClick": "link",
          "data": [{
            "value": 1,
            "link": "javascript:alert(2)",
            "children": [{ "value": 2, "link": "javascript:alert(3)", "target": "blank" }]
          }]
        }]
      },
      "options": [{
        "series": [{ "nodeClick": "link", "data": [{ "value": 3, "link": "javascript:alert(4)" }] }]
      }],
      "media": [{
        "option": {
          "series": [{ "nodeClick": "link", "data": [{ "value": 4, "target": "self" }] }]
        }
      }]
    }`);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
    const safeOption = fakeInstance.setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(safeOption['series']).toEqual({ type: 'treemap', data: [{ value: 1 }] });
    expect((safeOption['baseOption'] as Record<string, unknown>)['series']).toEqual([
      {
        type: 'sunburst',
        data: [{ value: 1, children: [{ value: 2 }] }],
      },
    ]);
    expect((safeOption['options'] as Array<Record<string, unknown>>)[0]?.['series']).toEqual([
      { data: [{ value: 3 }] },
    ]);
    const mediaOption = (safeOption['media'] as Array<Record<string, unknown>>)[0]?.[
      'option'
    ] as Record<string, unknown>;
    expect(mediaOption['series']).toEqual([{ data: [{ value: 4 }] }]);
  });

  it('removes HTML-bearing toolbox data views from every option layer', async () => {
    addEChartsBlock(`{
      "toolbox": [{ "feature": { "dataView": { "lang": ["<img src=x>"] }, "saveAsImage": {} } }],
      "baseOption": {
        "timeline": { "data": ["2026"] },
        "xAxis": {},
        "toolbox": { "feature": { "dataView": { "lang": ["<b>base</b>"] } } },
        "series": [{ "type": "bar", "data": [1] }]
      },
      "options": [{ "toolbox": { "feature": { "dataView": { "lang": ["state"] } } } }],
      "media": [{ "option": { "toolbox": { "feature": { "dataView": { "lang": ["media"] } } } } }]
    }`);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    const echartsMod = await import('../runtime');
    const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
    const safeOption = fakeInstance.setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    const topToolbox = (safeOption['toolbox'] as Array<Record<string, unknown>>)[0]!;
    expect(topToolbox['feature']).toEqual({ saveAsImage: {} });
    const baseToolbox = (safeOption['baseOption'] as Record<string, unknown>)['toolbox'] as Record<
      string,
      unknown
    >;
    expect(baseToolbox['feature']).toEqual({});
    const stateToolbox = (safeOption['options'] as Array<Record<string, unknown>>)[0]?.[
      'toolbox'
    ] as Record<string, unknown>;
    expect(stateToolbox['feature']).toEqual({});
    const responsiveOption = (safeOption['media'] as Array<Record<string, unknown>>)[0]?.[
      'option'
    ] as Record<string, unknown>;
    const responsiveToolbox = responsiveOption['toolbox'] as Record<string, unknown>;
    expect(responsiveToolbox['feature']).toEqual({});
  });
});
