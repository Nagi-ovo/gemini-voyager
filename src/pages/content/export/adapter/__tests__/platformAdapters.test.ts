import { describe, expect, it } from 'vitest';

import {
  type ContentExtractor,
  createContentExtractor,
} from '@/features/export/services/DOMContentExtractor';

import {
  chatgptExtractFormula,
  chatgptExtractInlineFormula,
  chatgptExtractUserText,
} from '../platform/chatgpt';
import { type ExportPlatformAdapter, resolveExportAdapter } from '../platformAdapters';

let extractor: ContentExtractor;

describe('Gemini export adapter contract', () => {
  const extractWithProductionAdapter = (html: string) => {
    extractor = createContentExtractor(resolveExportAdapter());
    const assistant = document.createElement('div');
    assistant.className = 'markdown';
    assistant.innerHTML = html;
    return extractor.extractAssistantContent(assistant);
  };

  it('preserves standalone assistant images', () => {
    const extracted = extractWithProductionAdapter(
      '<img src="https://example.com/generated-ui.png" alt="UI capture">',
    );

    expect(extracted).toMatchObject({ hasImages: true });
    expect(extracted.text).toContain('![UI capture](https://example.com/generated-ui.png)');
    expect(extracted.html).toContain(
      '<img src="https://example.com/generated-ui.png" alt="UI capture" />',
    );
  });

  it('exports licensed hero search images wrapped in Gemini image-buttons', () => {
    const extracted = extractWithProductionAdapter(`
      <p>Intro</p>
      <div class="attachment-container search-images">
        <response-element>
          <single-image class="spark-licensed-center-host">
            <div class="image-container spark-licensed-center hide-from-message-actions" data-full-size-image-uri="https://www.apple.com/newsroom/hero.jpg">
              <button class="image-button">
                <img class="spark-licensed-portrait hero-image loaded" alt="iPhone 18 Pro, AI generated" src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcHero" width="267" height="374" />
              </button>
              <div class="hero-caption-row">
                <div class="caption gds-extended-caption hero-caption">iPhone 18 Pro 酒红配色与全新外观. Source: Apple</div>
              </div>
            </div>
          </single-image>
        </response-element>
      </div>
      <p>After</p>
    `);

    expect(extracted.hasImages).toBe(true);
    expect(extracted.html).toContain('encrypted-tbn0.gstatic.com');
    expect(extracted.html).toContain('iPhone 18 Pro 酒红配色与全新外观. Source: Apple');
    expect(extracted.text).toContain('Intro');
    expect(extracted.text).toContain('After');
    expect(extracted.text).toContain('Source: Apple');
  });

  it('preserves classic Gemini search images and their source caption', () => {
    const extracted = extractWithProductionAdapter(`
      <p>Look:</p>
      <div class="attachment-container search-images">
        <response-element>
          <single-image>
            <div class="image-container" data-full-size-image-uri="https://example.com/full.jpg">
              <img class="image" src="https://gstatic.example/thumb.jpg" alt="iCloud settings" />
              <a class="source" href="https://www.dcard.tw/f/example">
                <span class="label">Dcard</span>
              </a>
            </div>
          </single-image>
        </response-element>
      </div>
      <p>Next step</p>
    `);

    expect(extracted.hasImages).toBe(true);
    expect(extracted.html).toContain('https://gstatic.example/thumb.jpg');
    expect(extracted.html).toContain('gv-export-figure');
    expect(extracted.html).toContain('Dcard');
    expect(extracted.text).toContain('Look:');
    expect(extracted.text).toContain('Next step');
    expect(extracted.text).toContain('![iCloud settings](https://gstatic.example/thumb.jpg)');
    expect(extracted.text.indexOf('Look:')).toBeLessThan(extracted.text.indexOf('gstatic.example'));
    expect(extracted.text.indexOf('gstatic.example')).toBeLessThan(
      extracted.text.indexOf('Next step'),
    );
  });

  it('does not drop surrounding prose when a wrapper also contains a search image', () => {
    const extracted = extractWithProductionAdapter(`
      <div>
        <p>before</p>
        <div class="attachment-container search-images">
          <div class="image-container" data-full-size-image-uri="https://example.com/full.jpg">
            <img class="image" src="https://gstatic.example/phone.jpg" alt="Phone" />
          </div>
        </div>
        <p>after</p>
      </div>
    `);

    expect(extracted.hasImages).toBe(true);
    expect(extracted.text).toContain('before');
    expect(extracted.text).toContain('after');
    expect(extracted.html).toContain('https://gstatic.example/phone.jpg');
    expect(extracted.html).toContain('<p>before</p>');
    expect(extracted.html).toContain('<p>after</p>');
  });

  it('keeps inline single-image illustrations between lists, including captions', () => {
    const extracted = extractWithProductionAdapter(`
      <ul><li>Enable iCloud Photos first.</li></ul>
      <single-image>
        <img src="https://gstatic.example/icloud.png" alt="iCloud Photos settings" />
        <figcaption>iCloud 照片设置界面, 来源: Dcard</figcaption>
      </single-image>
      <ol><li>Confirm every photo is uploaded.</li></ol>
    `);

    expect(extracted.hasImages).toBe(true);
    expect(extracted.html).toContain('https://gstatic.example/icloud.png');
    expect(extracted.html).toContain('iCloud 照片设置界面, 来源: Dcard');
    expect(extracted.text).toContain('Enable iCloud Photos first.');
    expect(extracted.text).toContain('Confirm every photo is uploaded.');
    expect(extracted.text).toContain('iCloud 照片设置界面, 来源: Dcard');
  });

  it('resolves lazy search-image placeholders via data-src', () => {
    const extracted = extractWithProductionAdapter(`
      <single-image>
        <img src="about:blank" data-src="https://gstatic.example/lazy.jpg" alt="Lazy shot" />
      </single-image>
    `);

    expect(extracted.hasImages).toBe(true);
    expect(extracted.html).toContain('https://gstatic.example/lazy.jpg');
    expect(extracted.html).not.toContain('about:blank');
  });

  it('picks up search images rendered beside the markdown container', () => {
    extractor = createContentExtractor(resolveExportAdapter());
    const assistant = document.createElement('message-content');
    assistant.innerHTML = `
      <div class="markdown">
        <p>Intro</p>
      </div>
      <div class="attachment-container search-images">
        <div class="image-container" data-full-size-image-uri="https://example.com/full.jpg">
          <img class="image" src="https://gstatic.example/side.jpg" alt="Beside markdown" />
        </div>
      </div>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.hasImages).toBe(true);
    expect(extracted.text).toContain('Intro');
    expect(extracted.html).toContain('https://gstatic.example/side.jpg');
  });

  it('preserves prose around a nested code block in DOM order', () => {
    const extracted = extractWithProductionAdapter(`
      <div>
        <p>before</p>
        <code-block><pre><code>const x = 1;</code></pre></code-block>
        <p>after</p>
      </div>
    `);

    expect(extracted.text).toContain('before');
    expect(extracted.text).toContain('```\nconst x = 1;\n```');
    expect(extracted.text).toContain('after');
    expect(extracted.text.indexOf('before')).toBeLessThan(extracted.text.indexOf('```'));
    expect(extracted.text.indexOf('```')).toBeLessThan(extracted.text.indexOf('after'));
    expect(extracted.html).toContain('<p>before</p>');
    expect(extracted.html).toContain('<p>after</p>');
  });
});

describe('ChatGPT export adapter HTML safety', () => {
  it('preserves line breaks in multiline user prompts', () => {
    const message = document.createElement('div');
    message.innerHTML = '<div>First line<br>Second line</div><p>Third paragraph</p>';
    const text: string[] = [];

    chatgptExtractUserText(message.querySelectorAll('.query-text-line'), text, message);

    expect(text).toEqual(['First line\nSecond line\nThird paragraph']);
  });

  it('renders multiline user prompts with explicit HTML line breaks', () => {
    extractor = createContentExtractor({
      extractUserImage: (element: HTMLElement) => element.querySelectorAll('img'),
      extractUserText: chatgptExtractUserText,
      getUserAttachmentCandidates: () => [],
      extractAssistantImage: () => undefined,
      extractFormula: () => undefined,
      extractCodeBlock: () => undefined,
      extractInlineFormula: () => undefined,
    } as unknown as ExportPlatformAdapter);
    const message = document.createElement('div');
    message.innerHTML = '<div>First line<br>Second line</div><p>Third paragraph</p>';

    const extracted = extractor.extractUserContent(message);

    expect(extracted.text).toBe('First line\nSecond line\nThird paragraph');
    expect(extracted.html).toBe('<p>First line<br />Second line<br />Third paragraph</p>');
  });

  it('escapes block formula source in attribute context', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-math-source', 'x" onpointerover="alert(1)');
    wrapper.innerHTML = '<span class="katex-display">rendered</span>';
    const formula = wrapper.firstElementChild!;
    const html: string[] = [];

    chatgptExtractFormula(
      formula,
      { hasImages: false, hasFormulas: false, hasTables: false, hasCode: false },
      html,
      [],
    );

    expect(html.join('')).toContain('data-math="x&quot; onpointerover=&quot;alert(1)"');
    expect(html.join('')).not.toContain('data-math="x" onpointerover=');
  });

  it('escapes inline formula source in attribute context', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-math-source', 'x" onload="alert(1)');
    wrapper.innerHTML = '<span class="katex">rendered</span>';
    const formula = wrapper.firstElementChild!;
    const html: string[] = [];

    chatgptExtractInlineFormula(formula, html, []);

    expect(html.join('')).toContain('data-math="x&quot; onload=&quot;alert(1)"');
    expect(html.join('')).not.toContain('data-math="x" onload=');
  });

  it('keeps display KaTeX as block math during inline paragraph traversal', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-math-source', '\\frac{1}{2}');
    wrapper.innerHTML = '<span class="katex-display"><span class="katex">rendered</span></span>';
    const html: string[] = [];
    const text: string[] = [];

    chatgptExtractInlineFormula(wrapper.firstElementChild!, html, text);

    expect(html.join('')).toContain('class="math-block"');
    expect(text.join('')).toBe('\n$$\n\\frac{1}{2}\n$$\n');
  });
});
