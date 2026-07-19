/**
 * DOMContentExtractor unit tests
 */
import { describe, expect, it } from 'vitest';

import { DOMContentExtractor } from '../DOMContentExtractor';

describe('DOMContentExtractor', () => {
  it('exports non-image user uploads as filename placeholders', () => {
    const user = document.createElement('div');
    user.innerHTML = `
      <user-query-file-carousel>
        <user-query-file-preview>
          <div data-test-id="uploaded-file">
            <button class="new-file-preview-file" aria-label="Agent notes &amp; review.pdf">
              <span>PDF</span>
              <span>Agent notes &amp; review</span>
            </button>
          </div>
        </user-query-file-preview>
      </user-query-file-carousel>
      <p class="query-text-line">Please review this file</p>
    `;

    const extracted = DOMContentExtractor.extractUserContent(user);

    expect(extracted.attachments).toEqual([{ name: 'Agent notes & review.pdf', type: 'pdf' }]);
    expect(extracted.text).toContain('📎 Agent notes & review.pdf');
    expect(extracted.text).toContain('Please review this file');
    expect(extracted.html).toContain('class="gv-export-attachment"');
    expect(extracted.html).toContain('Agent notes &amp; review.pdf');
    expect(extracted.hasImages).toBe(false);
  });

  it('does not duplicate image uploads as file placeholders', () => {
    const user = document.createElement('div');
    user.innerHTML = `
      <user-query-file-preview>
        <div data-test-id="uploaded-file">
          <button class="new-file-preview-file" aria-label="photo.png">Image</button>
          <img src="https://example.com/photo.png" alt="Photo" />
        </div>
      </user-query-file-preview>
    `;

    const extracted = DOMContentExtractor.extractUserContent(user);

    expect(extracted.hasImages).toBe(true);
    expect(extracted.attachments).toEqual([]);
    expect(extracted.text).toContain('![Photo](https://example.com/photo.png)');
    expect(extracted.text).not.toContain('📎 photo.png');
  });

  it('should strip Gemini inline source chips (link icons) from assistant export', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <p>Hello</p>
          <sources-carousel-inline>
            <source-inline-chips>
              <source-inline-chip>
                <div class="source-inline-chip-container">
                  <button aria-label="View source details. Opens side panel.">
                    <mat-icon fonticon="link">link</mat-icon>
                  </button>
                </div>
              </source-inline-chip>
            </source-inline-chips>
          </sources-carousel-inline>
          <p>World</p>
        </div>
      </message-content>
    `;

    const extracted = DOMContentExtractor.extractAssistantContent(assistant);

    expect(extracted.text).toContain('Hello');
    expect(extracted.text).toContain('World');
    expect(extracted.text).not.toMatch(/\blink\b/i);

    expect(extracted.html).toContain('<p>Hello</p>');
    expect(extracted.html).toContain('<p>World</p>');
    expect(extracted.html).not.toContain('sources-carousel-inline');
    expect(extracted.html).not.toContain('source-inline-chip');
    expect(extracted.html).not.toContain('mat-icon');
  });

  it('should strip source chips nested in lists from exported HTML', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <ul>
            <li>
              Item 1
              <sources-carousel-inline>
                <mat-icon fonticon="link">link</mat-icon>
              </sources-carousel-inline>
            </li>
            <li>Item 2</li>
          </ul>
        </div>
      </message-content>
    `;

    const extracted = DOMContentExtractor.extractAssistantContent(assistant);

    expect(extracted.text).toContain('Item 1');
    expect(extracted.text).toContain('Item 2');
    expect(extracted.text).not.toMatch(/\blink\b/i);

    expect(extracted.html).toContain('<ul>');
    expect(extracted.html).toMatch(/<li[^>]*>\s*Item 1/i);
    expect(extracted.html).toMatch(/<li[^>]*>\s*Item 2/i);
    expect(extracted.html).not.toContain('sources-carousel-inline');
    expect(extracted.html).not.toContain('mat-icon');
  });

  it('preserves Gemini KaTeX radical image nodes nested in lists', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <ul>
            <li>
              <b>积的开方：</b>
              <span class="math-inline" data-math="\\sqrt{ab} = \\sqrt{a}">
                <span class="katex">
                  <span class="katex-html" aria-hidden="true">
                    <span class="base">
                      <span class="mord sqrt">
                        <span class="vlist-t">
                          <span class="vlist">
                            <span class="hide-tail">
                              <img class="katex-svg" style="display:block;position:absolute;width:100%;height:inherit;" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" />
                            </span>
                          </span>
                        </span>
                      </span>
                    </span>
                  </span>
                </span>
              </span>
            </li>
          </ul>
        </div>
      </message-content>
    `;

    const extracted = DOMContentExtractor.extractAssistantContent(assistant);

    expect(extracted.hasFormulas).toBe(true);
    expect(extracted.text).toContain('$\\sqrt{ab} = \\sqrt{a}$');
    expect(extracted.html).toContain('class="katex-svg"');
    expect(extracted.html).toContain('data:image/svg+xml');
    expect(extracted.html).toContain('hide-tail');
  });

  it('should extract assistant images as markdown and html', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <p>Hello</p>
          <img src="https://example.com/a.png" alt="A" />
          <p>World</p>
        </div>
      </message-content>
    `;

    const extracted = DOMContentExtractor.extractAssistantContent(assistant);

    expect(extracted.hasImages).toBe(true);
    expect(extracted.text).toContain('Hello');
    expect(extracted.text).toContain('World');
    expect(extracted.text).toContain('![A](https://example.com/a.png)');
    expect(extracted.html).toContain('<img');
    expect(extracted.html).toContain('https://example.com/a.png');
  });

  it('should skip about:blank images while preserving valid images', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <img src="about:blank" alt="placeholder" />
          <img src="https://example.com/real.png" alt="Real" />
        </div>
      </message-content>
    `;

    const extracted = DOMContentExtractor.extractAssistantContent(assistant);

    expect(extracted.text).not.toContain('about:blank');
    expect(extracted.html).not.toContain('about:blank');
    expect(extracted.text).toContain('![Real](https://example.com/real.png)');
    expect(extracted.html).toContain('https://example.com/real.png');
  });

  it('escapes generated image src/alt when rendered into html attributes', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="attachment-container generated-images">
            <generated-image><img /></generated-image>
          </div>
        </div>
      </message-content>
    `;

    const generated = assistant.querySelector('img') as HTMLImageElement;
    generated.setAttribute('src', 'https://example.com/a"b.png');
    generated.setAttribute('alt', 'A "quoted" image');

    const extracted = DOMContentExtractor.extractAssistantContent(assistant);

    expect(extracted.html).toContain('src="https://example.com/a%22b.png"');
    expect(extracted.html).toContain('alt="A &quot;quoted&quot; image"');
  });

  describe('YouTube video covers', () => {
    // Mirrors Gemini's live DOM: .attachment-container.youtube > … > youtube-block
    // > single-video > … > img.thumbnail, plus the <iframe> player.
    const youtubeCard = `
      <message-content>
        <div class="markdown">
          <p>Here is a relevant clip.</p>
          <div class="attachment-container youtube">
            <response-element>
              <youtube-block>
                <attribution-container>
                  <single-video class="youtube-item">
                    <default-player>
                      <div class="single-video-container">
                        <div class="single-video-thumbnail">
                          <img class="thumbnail" src="https://i.ytimg.com/vi/ttkd0t5qTD4/hqdefault.jpg" alt="Sample Video" />
                        </div>
                        <iframe class="single-video-player" src="https://www.youtube.com/embed/ttkd0t5qTD4"></iframe>
                      </div>
                    </default-player>
                  </single-video>
                </attribution-container>
              </youtube-block>
            </response-element>
          </div>
        </div>
      </message-content>
    `;

    it('emits the cover thumbnail as a clickable image in markdown', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = youtubeCard;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      expect(extracted.hasImages).toBe(true);
      expect(extracted.text).toContain('Here is a relevant clip.');
      expect(extracted.text).toContain(
        '[![Sample Video](https://i.ytimg.com/vi/ttkd0t5qTD4/hqdefault.jpg)](https://www.youtube.com/watch?v=ttkd0t5qTD4)',
      );
    });

    it('emits the cover as a linked <img> in the html output', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = youtubeCard;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      expect(extracted.html).toMatch(
        /<a href="https:\/\/www\.youtube\.com\/watch\?v=ttkd0t5qTD4"><img src="https:\/\/i\.ytimg\.com\/vi\/ttkd0t5qTD4\/hqdefault\.jpg" alt="Sample Video" \/><\/a>/,
      );
    });

    it('does not duplicate the cover (processNodes + fallback pass dedupe)', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = youtubeCard;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      expect(extracted.text.split('hqdefault.jpg').length - 1).toBe(1);
    });

    it('derives the video id from an embed iframe when the thumbnail src lacks one', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <youtube-block>
              <single-video>
                <div class="single-video-thumbnail">
                  <img class="thumbnail" src="https://lh3.googleusercontent.com/opaque-thumb" alt="No-Id Thumb" />
                </div>
                <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
              </single-video>
            </youtube-block>
          </div>
        </message-content>
      `;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      // Falls back to a stable hqdefault cover built from the embed id.
      expect(extracted.text).toContain(
        '[![No-Id Thumb](https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg)](https://www.youtube.com/watch?v=dQw4w9WgXcQ)',
      );
    });
  });

  describe('Canvas export support', () => {
    it('extracts injected canvas-export-section content correctly', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <p>Here is my canvas doc:</p>
            <div class="gv-canvas-export-section">
              <h3>📄 Canvas Document: Doc Title</h3>
              <div class="gv-canvas-content"># Heading 1\nThis is canvas content.</div>
            </div>
          </div>
        </message-content>
      `;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      expect(extracted.text).toContain('Here is my canvas doc:');
      expect(extracted.text).toContain('### 📄 Canvas Document: Doc Title');
      expect(extracted.text).toContain('# Heading 1\nThis is canvas content.');

      expect(extracted.html).toContain('gv-canvas-export-section');
      expect(extracted.html).toContain('<h3>📄 Canvas Document: Doc Title</h3>');
      expect(extracted.html).toContain(
        '<pre style="white-space: pre-wrap;"># Heading 1\nThis is canvas content.</pre>',
      );
    });
  });

  describe('Generated UI screenshot export', () => {
    it('exports injected generated UI screenshots as images', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <p>Here is the app:</p>
            <div class="gv-generated-ui-screenshot-section">
              <img src="data:image/png;base64,abc123" alt="Gemini interactive UI screenshot">
            </div>
          </div>
        </message-content>
      `;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      expect(extracted.hasImages).toBe(true);
      expect(extracted.text).toContain(
        '![Gemini interactive UI screenshot](data:image/png;base64,abc123)',
      );
      expect(extracted.html).toContain(
        '<img src="data:image/png;base64,abc123" alt="Gemini interactive UI screenshot" />',
      );
    });
  });

  describe('Mermaid export', () => {
    it('exports the rendered SVG as HTML and keeps fenced source as text', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <response-element>
              <div class="gv-mermaid-wrapper">
                <code-block style="display: none">
                  <div class="code-block-decoration">mermaid</div>
                  <code role="text">graph TD;\nA--&gt;B;</code>
                </code-block>
                <div class="gv-mermaid-toggle">
                  <button>Diagram</button>
                  <button>Code</button>
                </div>
                <div class="gv-mermaid-diagram">
                  <svg id="diagram" viewBox="0 0 100 50">
                    <path d="M0 0 L100 50"></path>
                  </svg>
                </div>
              </div>
            </response-element>
          </div>
        </message-content>
      `;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      expect(extracted.hasCode).toBe(true);
      expect(extracted.html).toContain('<div class="gv-export-mermaid"><svg');
      expect(extracted.html).toContain('id="diagram"');
      expect(extracted.html).not.toContain('gv-mermaid-toggle');
      expect(extracted.html).not.toContain('<button');
      expect(extracted.html).not.toContain('<pre>');
      expect(extracted.text).toContain('```mermaid\ngraph TD;\nA-->B;\n```');
    });

    it('falls back to fenced source when no rendered SVG is available', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <response-element>
              <div class="gv-mermaid-wrapper">
                <code-block>
                  <div class="code-block-decoration">mermaid</div>
                  <code role="text">graph TD;\nA--&gt;B;</code>
                </code-block>
                <div class="gv-mermaid-toggle"><button>Code</button></div>
                <div class="gv-mermaid-diagram"></div>
              </div>
            </response-element>
          </div>
        </message-content>
      `;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      expect(extracted.hasCode).toBe(true);
      expect(extracted.html).toContain('<pre><code class="language-mermaid">');
      expect(extracted.html).not.toContain('gv-export-mermaid');
      expect(extracted.html).not.toContain('<button');
      expect(extracted.text).toContain('```mermaid\ngraph TD;\nA-->B;\n```');
    });

    it('preserves list structure when a list item contains rendered Mermaid', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <response-element>
              <ul>
                <li>
                  Diagram
                  <div class="gv-mermaid-wrapper">
                    <code-block style="display: none">
                      <div class="code-block-decoration">mermaid</div>
                      <code role="text">graph TD;\nA--&gt;B;</code>
                    </code-block>
                    <div class="gv-mermaid-toggle"><button>Code</button></div>
                    <div class="gv-mermaid-diagram">
                      <svg id="list-diagram" viewBox="0 0 100 50"></svg>
                    </div>
                  </div>
                </li>
              </ul>
            </response-element>
          </div>
        </message-content>
      `;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      expect(extracted.hasCode).toBe(true);
      expect(extracted.html).toContain('<ul>');
      expect(extracted.html).toContain('<li>');
      expect(extracted.html).toContain('<div class="gv-export-mermaid"><svg');
      expect(extracted.html).toContain('id="list-diagram"');
      expect(extracted.html).not.toContain('<button');
      expect(extracted.html).not.toContain('<code-block');
      expect(extracted.text).toMatch(/-\s+Diagram/);
      expect(extracted.text).toContain('```mermaid\ngraph TD;\nA-->B;\n```');
    });

    it('preserves regular code blocks inside list items', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <response-element>
              <ul>
                <li>
                  Example
                  <code-block>
                    <div class="code-block-decoration">js</div>
                    <code role="text">const answer = 42;</code>
                  </code-block>
                </li>
              </ul>
            </response-element>
          </div>
        </message-content>
      `;

      const extracted = DOMContentExtractor.extractAssistantContent(assistant);

      expect(extracted.hasCode).toBe(true);
      expect(extracted.html).toContain('<ul>');
      expect(extracted.html).toContain('<li>');
      expect(extracted.html).toContain(
        '<pre><code class="language-js">const answer = 42;</code></pre>',
      );
      expect(extracted.html).not.toContain('<code-block');
      expect(extracted.text).toMatch(/-\s+Example/);
      expect(extracted.text).toContain('```js\nconst answer = 42;\n```');
    });
  });
});
