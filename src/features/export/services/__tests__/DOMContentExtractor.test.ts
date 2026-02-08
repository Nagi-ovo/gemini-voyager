/**
 * DOMContentExtractor unit tests
 */
import { describe, expect, it } from 'vitest';

import { DOMContentExtractor } from '../DOMContentExtractor';

describe('DOMContentExtractor', () => {
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
});
