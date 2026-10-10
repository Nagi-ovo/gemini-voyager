import { describe, expect, it } from 'vitest';

import {
  stripEChartsAssignment,
  isEChartsOptionObject,
  isEChartsOptionCode,
  parseEChartsOption,
} from '../source';
import { BAR_OPTION, PIE_OPTION } from './fixture';

describe('stripEChartsAssignment', () => {
  it('strips a const assignment wrapper', () => {
    expect(stripEChartsAssignment(`const option = ${PIE_OPTION};`)).toBe(PIE_OPTION);
  });

  it('strips a bare assignment wrapper', () => {
    expect(stripEChartsAssignment(`option = ${PIE_OPTION}`)).toBe(PIE_OPTION);
  });

  it('strips leading comments before the assignment', () => {
    expect(stripEChartsAssignment(`// chart config\nconst option = ${PIE_OPTION};`)).toBe(
      PIE_OPTION,
    );
  });

  it('strips a trailing export default statement', () => {
    expect(stripEChartsAssignment(`const option = ${PIE_OPTION};\nexport default option;`)).toBe(
      PIE_OPTION,
    );
  });

  it('strips markdown fence markers', () => {
    expect(stripEChartsAssignment(`\`\`\`echarts\n${PIE_OPTION}\n\`\`\``)).toBe(PIE_OPTION);
  });
});

describe('isEChartsOptionObject', () => {
  it('accepts an axis-based chart with a structure key', () => {
    expect(isEChartsOptionObject(JSON.parse(BAR_OPTION))).toBe(true);
  });

  it('accepts an axis-free chart by its type alone', () => {
    expect(isEChartsOptionObject(JSON.parse(PIE_OPTION))).toBe(true);
  });

  it('accepts a single series object', () => {
    expect(isEChartsOptionObject({ series: { type: 'pie', data: [{ value: 1 }] } })).toBe(true);
  });

  it('accepts a standard timeline option through baseOption', () => {
    expect(
      isEChartsOptionObject({
        baseOption: {
          timeline: { axisType: 'category', data: ['2025', '2026'] },
          xAxis: { type: 'category' },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: [1] }],
        },
        options: [{ series: [{ data: [2] }] }],
      }),
    ).toBe(true);
  });

  it('accepts a complete chart series supplied by a responsive media option', () => {
    expect(
      isEChartsOptionObject({
        baseOption: { title: { text: 'Responsive chart' } },
        media: [
          {
            query: { maxWidth: 600 },
            option: { series: [{ type: 'pie', data: [{ value: 1 }] }] },
          },
        ],
      }),
    ).toBe(true);
  });

  it('accepts an axis structure supplied by a responsive override layer', () => {
    expect(
      isEChartsOptionObject({
        series: [{ type: 'bar', data: [1] }],
        media: [{ query: { maxWidth: 600 }, option: { xAxis: {}, yAxis: {} } }],
      }),
    ).toBe(true);
  });

  it('ignores malformed override entries while finding a responsive axis structure', () => {
    expect(
      isEChartsOptionObject({
        series: [{ type: 'bar', data: [1] }],
        options: [null],
        media: [null, { option: { xAxis: {}, yAxis: {} } }],
      }),
    ).toBe(true);
  });

  it.each([
    ['calendar', { calendar: {}, series: [{ type: 'heatmap', data: [] }] }],
    ['parallel', { parallel: {}, series: [{ type: 'parallel', data: [] }] }],
    ['parallelAxis', { parallelAxis: [], series: [{ type: 'parallel', data: [] }] }],
    ['singleAxis', { singleAxis: {}, series: [{ type: 'themeriver', data: [] }] }],
    ['matrix', { matrix: {}, series: [{ type: 'scatter', data: [] }] }],
  ])('accepts the registered %s coordinate system', (_name, option) => {
    expect(isEChartsOptionObject(option)).toBe(true);
  });

  it('rejects geo coordinates because the safe modular runtime does not register them', () => {
    expect(isEChartsOptionObject({ geo: {}, series: [{ type: 'scatter', data: [] }] })).toBe(false);
    expect(
      isEChartsOptionObject({
        geo: {},
        series: { type: 'graph', coordinateSystem: 'geo', data: [] },
      }),
    ).toBe(false);
  });

  it('rejects an unsupported explicit coordinate system before axis-free detection', () => {
    expect(
      isEChartsOptionObject({
        series: { type: 'graph', coordinateSystem: 'geo', data: [] },
      }),
    ).toBe(false);
  });

  it('rejects unsupported coordinates in timeline and responsive overrides', () => {
    expect(
      isEChartsOptionObject({
        baseOption: { timeline: {}, series: [{ type: 'graph', data: [] }] },
        options: [{ series: [{ coordinateSystem: 'geo' }] }],
      }),
    ).toBe(false);
    expect(
      isEChartsOptionObject({
        series: [{ type: 'graph', data: [] }],
        media: [{ query: { maxWidth: 500 }, option: { geo: {} } }],
      }),
    ).toBe(false);
  });

  it('rejects image-backed symbols and graphic images before they can load', () => {
    expect(
      isEChartsOptionObject({
        series: [{ type: 'pie', symbol: 'image://https://attacker.example/pixel' }],
      }),
    ).toBe(false);
    expect(
      isEChartsOptionObject({
        series: [{ type: 'pie', data: [1] }],
        graphic: [{ type: 'image', style: { image: 'https://attacker.example/pixel' } }],
      }),
    ).toBe(false);
    expect(
      isEChartsOptionObject({
        baseOption: { timeline: {}, series: [{ type: 'pie', data: [1] }] },
        options: [{ series: [{ symbol: 'image://https://attacker.example/pixel' }] }],
      }),
    ).toBe(false);
  });

  it('rejects a series entry without a chart type', () => {
    expect(isEChartsOptionObject({ series: [{ name: 'a', data: [1] }] })).toBe(false);
  });

  it('rejects an unknown chart type', () => {
    expect(isEChartsOptionObject({ series: [{ type: 'wordcloud' }] })).toBe(false);
  });

  it('rejects an axis-based type without any structure key', () => {
    expect(isEChartsOptionObject({ series: [{ type: 'bar', data: [1, 2] }] })).toBe(false);
  });

  it('rejects non-objects and arrays', () => {
    expect(isEChartsOptionObject(null)).toBe(false);
    expect(isEChartsOptionObject([BAR_OPTION])).toBe(false);
  });
});

describe('isEChartsOptionCode', () => {
  it('detects an axis-based chart', () => {
    expect(isEChartsOptionCode(BAR_OPTION)).toBe(true);
  });

  it('detects an axis-free chart by its type alone', () => {
    expect(isEChartsOptionCode(PIE_OPTION)).toBe(true);
  });

  it('detects a standard timeline option through baseOption', () => {
    expect(
      isEChartsOptionCode(
        JSON.stringify({
          baseOption: {
            timeline: { data: ['2025', '2026'] },
            xAxis: {},
            series: [{ type: 'bar', data: [1] }],
          },
          options: [{ series: [{ data: [2] }] }],
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['calendar', { calendar: {}, series: [{ type: 'heatmap', data: [] }] }],
    ['parallel', { parallel: {}, series: [{ type: 'parallel', data: [] }] }],
    ['parallelAxis', { parallelAxis: [], series: [{ type: 'parallel', data: [] }] }],
    ['singleAxis', { singleAxis: {}, series: [{ type: 'themeriver', data: [] }] }],
    ['matrix', { matrix: {}, series: [{ type: 'scatter', data: [] }] }],
  ])('detects the registered %s coordinate system', (_name, option) => {
    expect(isEChartsOptionCode(JSON.stringify(option))).toBe(true);
  });

  it('rejects geo coordinates because the safe modular runtime does not register them', () => {
    expect(isEChartsOptionCode('{"geo": {}, "series": [{"type": "scatter", "data": []}]}')).toBe(
      false,
    );
    expect(
      isEChartsOptionCode('{"geo": {}, "series": {"type": "graph", "coordinateSystem": "geo"}}'),
    ).toBe(false);
  });

  it('rejects an unsupported explicit coordinate system before axis-free detection', () => {
    expect(isEChartsOptionCode('{"series": {"type": "graph", "coordinateSystem": "geo"}}')).toBe(
      false,
    );
  });

  it('rejects image-backed options during the synchronous detection pass', () => {
    expect(
      isEChartsOptionCode(
        '{"series": {"type": "pie", "symbol": "image://https://attacker.example/pixel"}}',
      ),
    ).toBe(false);
    expect(
      isEChartsOptionCode(
        '{"series": {"type": "pie"}, "graphic": {"style": {"image": "https://attacker.example/pixel"}}}',
      ),
    ).toBe(false);
  });

  it('rejects plain JSON without a series key', () => {
    expect(isEChartsOptionCode('{"foo": "bar", "baz": 42}')).toBe(false);
  });

  it('rejects axis-only JSON whose types are not chart types', () => {
    expect(isEChartsOptionCode('{"xAxis": {"type": "category"}, "yAxis": {"type": "value"}}')).toBe(
      false,
    );
  });

  it('rejects a series without a type value', () => {
    expect(isEChartsOptionCode('{"series": [{"name": "a", "data": [1]}]}')).toBe(false);
  });

  it('rejects strings too short to be complete', () => {
    expect(isEChartsOptionCode('{"series":[]}')).toBe(false);
  });
});

describe('parseEChartsOption', () => {
  it('parses a plain JSON option', async () => {
    const parsed = await parseEChartsOption(BAR_OPTION);
    expect(parsed).toEqual(JSON.parse(BAR_OPTION));
  });

  it('keeps the full timeline option after validating baseOption', async () => {
    const option = {
      baseOption: {
        timeline: { data: ['2025', '2026'] },
        xAxis: {},
        series: [{ type: 'bar', data: [1] }],
      },
      options: [{ series: [{ data: [2] }] }],
    };

    expect(await parseEChartsOption(JSON.stringify(option))).toEqual(option);
  });

  it('parses JSON5 comments and trailing commas', async () => {
    const code = `{
  // monthly sales
  "xAxis": { "type": "category", "data": ["A", "B"], },
  "series": [{ "type": "bar", "data": [1, 2], }],
}`;
    const parsed = await parseEChartsOption(code);
    expect(parsed).not.toBeNull();
    expect((parsed as Record<string, unknown>)['series']).toEqual([{ type: 'bar', data: [1, 2] }]);
  });

  it('extracts the object literal from a broken assignment prefix', async () => {
    // `export const` is not stripped by the assignment regex; the brace
    // extraction fallback must still find the option.
    const parsed = await parseEChartsOption(`export const option = ${PIE_OPTION};`);
    expect(parsed).toEqual(JSON.parse(PIE_OPTION));
  });

  it('returns null for non-chart JSON', async () => {
    expect(await parseEChartsOption('{"foo": "bar"}')).toBeNull();
  });

  it('returns null for unparseable input', async () => {
    expect(await parseEChartsOption('{not valid json')).toBeNull();
  });
});
