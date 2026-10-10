import { describe, expect, it } from 'vitest';

import { createContentExtractor } from '../DOMContentExtractor';
import { domExtractorTestAdapter } from './domExtractorTestAdapter';

const extractor = createContentExtractor(domExtractorTestAdapter);

describe('exportRichText.inline', () => {
  it('preserves direct text around nested inline elements', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown"><div>Amount: <strong>42</strong> total</div></div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.text).toContain('Amount: **42** total');
    expect(extracted.html).toContain('Amount:');
    expect(extracted.html).toContain('total');
  });

  it.each([
    ['<span>First <strong>bold</strong> </span><span>Second.</span>', 'First **bold** Second.'],
    ['<span>First <strong>bold</strong></span><span> Second.</span>', 'First **bold** Second.'],
  ])('preserves whitespace between adjacent inline containers', (content, expected) => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div>${content}</div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.text).toBe(expected);
  });

  it('does not invent whitespace between adjacent inline containers', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div><span>Hello</span><span>, world.</span></div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.text).toBe('Hello, world.');
  });

  it('preserves a whitespace-only inline container between text containers', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content>
        <div class="markdown">
          <div><span>First</span><span> </span><span>Second</span></div>
        </div>
      </message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.text).toBe('First Second');
    expect(extracted.html).toContain('<span> </span>');
  });
});
