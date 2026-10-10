import { describe, expect, it, vi } from 'vitest';

import { provideEChartsDataUrl } from '@/pages/content/echarts/exportBridge';

import { createContentExtractor } from '../DOMContentExtractor';
import { domExtractorTestAdapter } from './domExtractorTestAdapter';

const extractor = createContentExtractor(domExtractorTestAdapter);

describe('exportCodeBlocks', () => {
  it('exports rendered Mermaid SVG in HTML while preserving Mermaid source in text', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-mermaid-wrapper" data-gv-mermaid-theme="dark">
            <code-block style="display: none;">
              <div class="code-block-decoration">Code snippet</div>
              <pre><code role="text">flowchart TD\nA --&gt; B</code></pre>
            </code-block>
            <div class="gv-mermaid-toggle">
              <button class="active">Diagram</button>
              <button>Code</button>
            </div>
            <div class="gv-mermaid-diagram">
              <svg data-render-theme="dark" viewBox="0 0 120 80" aria-label="Flowchart">
                <g><text>A</text><text>B</text></g>
              </svg>
            </div>
            <template class="gv-mermaid-light-export">
              <svg data-export-theme="light" viewBox="0 0 120 80" aria-label="Flowchart">
                <g><text>A</text><text>B</text></g>
              </svg>
            </template>
          </div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.hasCode).toBe(true);
    expect(extracted.html).toContain('class="gv-export-mermaid"');
    expect(extracted.html).toContain('data-export-theme="light"');
    expect(extracted.html).not.toContain('data-render-theme="dark"');
    expect(extracted.html).not.toContain('<pre><code');
    expect(extracted.html).not.toContain('gv-mermaid-toggle');
    expect(extracted.html).toContain('data-gv-mermaid-theme="light"');
    expect(extracted.text).toContain('```mermaid\nflowchart TD\nA --> B\n```');
    expect(extracted.text).not.toContain('```code snippet');
  });

  it('falls back to source for an invalid Mermaid theme marker', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-mermaid-wrapper" data-gv-mermaid-theme="neon">
            <code-block><div class="code-block-decoration">mermaid</div><pre><code role="text">flowchart TD\nA --&gt; B</code></pre></code-block>
            <div class="gv-mermaid-diagram"><svg viewBox="0 0 120 80"><text>Diagram</text></svg></div>
          </div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.html).toContain('<pre><code class="language-mermaid">');
    expect(extracted.html).not.toContain('class="gv-export-mermaid"');
    expect(extracted.html).not.toContain('data-gv-mermaid-theme');
  });

  it('falls back to source when a dark diagram has no light export SVG', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-mermaid-wrapper" data-gv-mermaid-theme="dark">
            <code-block><pre><code role="text">flowchart TD\nA --&gt; B</code></pre></code-block>
            <div class="gv-mermaid-diagram"><svg viewBox="0 0 120 80"></svg></div>
          </div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.html).toContain('<pre><code class="language-mermaid">');
    expect(extracted.html).not.toContain('class="gv-export-mermaid"');
  });

  it('falls back to Mermaid source when a rendered SVG is unavailable', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-mermaid-wrapper">
            <code-block>
              <div class="code-block-decoration">mermaid</div>
              <pre><code role="text">flowchart TD\nA --&gt; B</code></pre>
            </code-block>
            <div class="gv-mermaid-diagram"></div>
          </div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.hasCode).toBe(true);
    expect(extracted.html).toContain('<pre><code class="language-mermaid">');
    expect(extracted.html).not.toContain('class="gv-export-mermaid"');
    expect(extracted.text).toContain('```mermaid\nflowchart TD\nA --> B\n```');
  });

  it('reaches a rendered Mermaid wrapper nested in a response element', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <response-element>
            <div class="gv-mermaid-wrapper" data-gv-mermaid-theme="light">
              <code-block style="display: none;">
                <div class="code-block-decoration">mermaid</div>
                <pre><code role="text">flowchart TD\nA --&gt; B</code></pre>
              </code-block>
              <div class="gv-mermaid-toggle"><button>Diagram</button></div>
              <div class="gv-mermaid-diagram">
                <svg viewBox="0 0 120 80"><text>Rendered diagram</text></svg>
              </div>
            </div>
          </response-element>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.html).toContain('class="gv-export-mermaid"');
    expect(extracted.html).toContain('<svg viewBox="0 0 120 80">');
    expect(extracted.html).not.toContain('<pre><code');
    expect(extracted.text).toContain('```mermaid\nflowchart TD\nA --> B\n```');
  });

  it('exports rendered WaveDrom SVG in HTML while preserving WaveJSON source in text', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-wavedrom-wrapper">
            <code-block style="display: none;">
              <div class="code-block-decoration">wavedrom</div>
              <pre><code role="text">{"signal": [{"name":"clk","wave":"p..."}]}</code></pre>
            </code-block>
            <div class="gv-wavedrom-toggle">
              <button class="active">Diagram</button>
              <button>Code</button>
            </div>
            <div class="gv-wavedrom-diagram">
              <svg viewBox="0 0 800 200" aria-label="Timing diagram">
                <g><text>clk</text></g>
              </svg>
            </div>
          </div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.hasCode).toBe(true);
    expect(extracted.html).toContain('class="gv-export-wavedrom"');
    expect(extracted.html).toContain('<svg viewBox="0 0 800 200"');
    expect(extracted.html).not.toContain('<pre><code');
    expect(extracted.html).not.toContain('gv-wavedrom-toggle');
    expect(extracted.text).toContain(
      '```wavedrom\n{"signal": [{"name":"clk","wave":"p..."}]}\n```',
    );
    expect(extracted.text).not.toContain('```code snippet');
  });

  it('falls back to WaveJSON source when a rendered WaveDrom SVG is unavailable', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-wavedrom-wrapper">
            <code-block>
              <div class="code-block-decoration">wavedrom</div>
              <pre><code role="text">{"signal": [{"name":"clk","wave":"p..."}]}</code></pre>
            </code-block>
            <div class="gv-wavedrom-toggle"><button>Diagram</button></div>
            <div class="gv-wavedrom-diagram"></div>
          </div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.hasCode).toBe(true);
    expect(extracted.html).toContain('<pre><code class="language-wavedrom">');
    expect(extracted.html).not.toContain('class="gv-export-wavedrom"');
    expect(extracted.text).toContain(
      '```wavedrom\n{"signal": [{"name":"clk","wave":"p..."}]}\n```',
    );
  });

  it('reaches a rendered Mermaid wrapper through an intervening container', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <response-element>
            <section>
              <div class="gv-mermaid-wrapper" data-gv-mermaid-theme="light">
                <code-block style="display: none;">
                  <div class="code-block-decoration">mermaid</div>
                  <pre><code role="text">flowchart TD\nA --&gt; B</code></pre>
                </code-block>
                <div class="gv-mermaid-diagram"><svg viewBox="0 0 120 80"><text>Rendered diagram</text></svg></div>
              </div>
            </section>
          </response-element>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.html).toContain('class="gv-export-mermaid"');
    expect(extracted.html).toContain('<svg viewBox="0 0 120 80">');
    expect(extracted.html).not.toContain('<pre><code');
    expect(extracted.text).toContain('```mermaid\nflowchart TD\nA --> B\n```');
  });

  it('exports a rendered ECharts canvas as an image while preserving option source in text', () => {
    const toDataURLSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,TESTDATA');
    try {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <div class="gv-echarts-wrapper">
              <code-block style="display: none;">
                <div class="code-block-decoration">echarts</div>
                <pre><code role="text">{"series": [{"type": "pie", "data": [{"value": 1, "name": "a"}]}]}</code></pre>
              </code-block>
              <div class="gv-echarts-toggle">
                <button class="active">Diagram</button>
                <button>Code</button>
              </div>
              <div class="gv-echarts-diagram">
                <canvas width="800" height="400"></canvas>
              </div>
            </div>
          </div>
        </message-content>
      `;
      const canvas = assistant.querySelector('canvas')!;
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        width: 400,
        height: 200,
        top: 0,
        right: 400,
        bottom: 200,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.hasCode).toBe(true);
      expect(extracted.html).toContain('class="gv-export-echarts"');
      expect(extracted.html).toContain('<img src="data:image/png;base64,TESTDATA"');
      expect(extracted.html).toContain('alt="Chart"');
      expect(extracted.html).toContain('width="400"');
      expect(extracted.html).not.toContain('<pre><code');
      expect(extracted.html).not.toContain('gv-echarts-toggle');
      expect(extracted.text).toContain(
        '```echarts\n{"series": [{"type": "pie", "data": [{"value": 1, "name": "a"}]}]}\n```',
      );
    } finally {
      toDataURLSpy.mockRestore();
    }
  });

  it('uses the live ECharts composited export instead of dropping stacked canvas layers', () => {
    const canvasReadback = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,FIRST_LAYER_ONLY');
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-echarts-wrapper">
            <code-block style="display: none;">
              <div class="code-block-decoration">echarts</div>
              <pre><code role="text">{"series": [{"type": "pie", "zlevel": 2, "data": [1]}]}</code></pre>
            </code-block>
            <div class="gv-echarts-diagram">
              <canvas width="800" height="400"></canvas>
              <canvas width="800" height="400"></canvas>
            </div>
          </div>
        </div>
      </message-content>
    `;
    const diagram = assistant.querySelector<HTMLElement>('.gv-echarts-diagram')!;
    const firstCanvas = assistant.querySelector('canvas')!;
    vi.spyOn(firstCanvas, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 200,
      top: 0,
      right: 400,
      bottom: 200,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const getComposite = vi.fn(() => 'data:image/png;base64,ALL_LAYERS');
    const stopProviding = provideEChartsDataUrl(diagram, getComposite);

    try {
      const extracted = extractor.extractAssistantContent(assistant);

      expect(getComposite).toHaveBeenCalledTimes(1);
      expect(canvasReadback).not.toHaveBeenCalled();
      expect(extracted.html).toContain('src="data:image/png;base64,ALL_LAYERS"');
      expect(extracted.html).toContain('width="400"');
    } finally {
      stopProviding();
      canvasReadback.mockRestore();
    }
  });

  it('exports the live chart while its diagram is moved into fullscreen', () => {
    const canvasReadback = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,FIRST_LAYER_ONLY');
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-echarts-wrapper">
            <code-block style="display: none;">
              <div class="code-block-decoration">echarts</div>
              <pre><code role="text">{"series": [{"type": "pie", "data": [1]}]}</code></pre>
            </code-block>
            <div class="gv-echarts-diagram"><canvas width="800" height="400"></canvas></div>
          </div>
        </div>
      </message-content>
    `;
    const wrapper = assistant.querySelector<HTMLElement>('.gv-echarts-wrapper')!;
    const diagram = assistant.querySelector<HTMLElement>('.gv-echarts-diagram')!;
    const canvas = diagram.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 200,
      top: 0,
      right: 400,
      bottom: 200,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const fullscreen = document.createElement('div');
    document.body.appendChild(fullscreen);
    fullscreen.appendChild(diagram);
    const getComposite = vi.fn(() => 'data:image/png;base64,FULLSCREEN');
    const stopProviding = provideEChartsDataUrl(diagram, getComposite, wrapper);

    try {
      const extracted = extractor.extractAssistantContent(assistant);

      expect(getComposite).toHaveBeenCalledTimes(1);
      expect(canvasReadback).not.toHaveBeenCalled();
      expect(extracted.html).toContain('src="data:image/png;base64,FULLSCREEN"');
      expect(extracted.html).not.toContain('<pre><code');
    } finally {
      stopProviding();
      fullscreen.remove();
      canvasReadback.mockRestore();
    }
  });

  it('uses the generated ECharts description as the exported image alt text', () => {
    const canvasReadback = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,ACCESSIBLE');
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-echarts-wrapper">
            <code-block style="display: none;">
              <div class="code-block-decoration">echarts</div>
              <pre><code role="text">{"series": [{"type": "pie", "data": [1]}]}</code></pre>
            </code-block>
            <div class="gv-echarts-diagram" aria-label="A pie chart showing Cats &amp; Dogs">
              <canvas width="800" height="400"></canvas>
            </div>
          </div>
        </div>
      </message-content>
    `;

    try {
      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.html).toContain('alt="A pie chart showing Cats &amp; Dogs"');
    } finally {
      canvasReadback.mockRestore();
    }
  });

  it('preserves the ECharts CSS width when exporting from code view', () => {
    const toDataURLSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,HIDDEN');
    try {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <div class="gv-echarts-wrapper">
              <code-block>
                <div class="code-block-decoration">echarts</div>
                <pre><code role="text">{"series": {"type": "pie", "data": [{"value": 1}]}}</code></pre>
              </code-block>
              <div class="gv-echarts-diagram" style="display: none;">
                <canvas width="800" height="400" style="width: 400px; height: 200px;"></canvas>
              </div>
            </div>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.html).toContain('src="data:image/png;base64,HIDDEN"');
      expect(extracted.html).toContain('width="400"');
    } finally {
      toDataURLSpy.mockRestore();
    }
  });

  it('falls back to option source when a rendered ECharts canvas is unavailable', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-echarts-wrapper">
            <code-block>
              <div class="code-block-decoration">echarts</div>
              <pre><code role="text">{"series": [{"type": "pie", "data": [{"value": 1, "name": "a"}]}]}</code></pre>
            </code-block>
            <div class="gv-echarts-toggle"><button>Diagram</button></div>
            <div class="gv-echarts-diagram"></div>
          </div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.hasCode).toBe(true);
    expect(extracted.html).toContain('<pre><code class="language-echarts">');
    expect(extracted.html).not.toContain('class="gv-export-echarts"');
    expect(extracted.text).toContain(
      '```echarts\n{"series": [{"type": "pie", "data": [{"value": 1, "name": "a"}]}]}\n```',
    );
  });

  it('falls back to option source when the ECharts canvas is tainted', () => {
    const toDataURLSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation(() => {
        throw new Error('Tainted canvas');
      });
    try {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <div class="gv-echarts-wrapper">
              <code-block style="display: none;">
                <div class="code-block-decoration">echarts</div>
                <pre><code role="text">{"series": [{"type": "pie", "data": [{"value": 1, "name": "a"}]}]}</code></pre>
              </code-block>
              <div class="gv-echarts-diagram"><canvas width="800" height="400"></canvas></div>
            </div>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.html).toContain('<pre><code class="language-echarts">');
      expect(extracted.html).not.toContain('class="gv-export-echarts"');
      expect(extracted.text).toContain(
        '```echarts\n{"series": [{"type": "pie", "data": [{"value": 1, "name": "a"}]}]}\n```',
      );
    } finally {
      toDataURLSpy.mockRestore();
    }
  });
});
