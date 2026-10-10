import { describe, expect, it } from 'vitest';

import { createContentExtractor } from '../DOMContentExtractor';
import { domExtractorTestAdapter } from './domExtractorTestAdapter';

const extractor = createContentExtractor(domExtractorTestAdapter);

describe('exportUserContent', () => {
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

    const extracted = extractor.extractUserContent(user);

    expect(extracted.attachments).toEqual([{ name: 'Agent notes & review.pdf', type: 'pdf' }]);
    expect(extracted.text).toContain('📎 Agent notes & review.pdf');
    expect(extracted.text).toContain('Please review this file');
    expect(extracted.html).toContain('class="gv-export-attachment"');
    expect(extracted.html).toContain('Agent notes &amp; review.pdf');
    expect(extracted.hasImages).toBe(false);
  });

  it('exports ChatGPT file tiles as filename placeholders without duplicating tile text', () => {
    const user = document.createElement('div');
    user.innerHTML = `
      <div class="flex gap-2 flex-wrap">
        <div role="group" aria-label="spring理解.md">
          <div data-default-action="true">
            <button type="button" aria-label="spring理解.md"></button>
          </div>
          <div class="pointer-events-none">
            <div class="truncate font-semibold">spring理解.md</div>
            <div class="truncate text-token-text-secondary">文件</div>
          </div>
        </div>
      </div>
      <div>请解释这个文件。</div>
    `;

    const extracted = extractor.extractUserContent(user);

    expect(extracted.attachments).toEqual([{ name: 'spring理解.md', type: 'md' }]);
    expect(extracted.text).toContain('📎 spring理解.md');
    expect(extracted.text).toContain('请解释这个文件。');
    expect(extracted.text).not.toContain('spring理解.md\n文件');
    expect(extracted.html).toContain('class="gv-export-attachment"');
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

    const extracted = extractor.extractUserContent(user);

    expect(extracted.hasImages).toBe(true);
    expect(extracted.attachments).toEqual([]);
    expect(extracted.text).toContain('![Photo](https://example.com/photo.png)');
    expect(extracted.text).not.toContain('📎 photo.png');
  });

  it('escapes user image attributes in exported HTML', () => {
    const user = document.createElement('div');
    user.innerHTML = `<img class="preview-image" src="https://example.com/photo.png" alt="&quot; onload=&quot;alert(1)" />`;

    const extracted = extractor.extractUserContent(user);

    expect(extracted.html).toContain('alt="&quot; onload=&quot;alert(1)"');
    expect(extracted.html).not.toContain('alt="" onload=');
  });
});
