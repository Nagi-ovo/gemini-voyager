import { describe, expect, it } from 'vitest';

import { DOWNLOAD_ICON_SELECTOR, findNativeDownloadButton } from '../downloadButton';

describe('findNativeDownloadButton', () => {
  it('finds button by data-test-id', () => {
    document.body.innerHTML = `
      <button data-test-id="download-generated-image-button">
        <span class="child"></span>
      </button>
    `;
    const target = document.querySelector('.child');
    const button = findNativeDownloadButton(target);
    expect(button?.getAttribute('data-test-id')).toBe('download-generated-image-button');
  });

  it('finds button inside download-generated-image-button host', () => {
    document.body.innerHTML = `
      <download-generated-image-button>
        <button class="inner">
          <span class="target"></span>
        </button>
      </download-generated-image-button>
    `;
    const target = document.querySelector('.target');
    const button = findNativeDownloadButton(target);
    expect(button?.classList.contains('inner')).toBe(true);
  });

  it('finds button via download icon selector', () => {
    document.body.innerHTML = `
      <button class="icon-button">
        <span class="button-icon-wrapper">
          <mat-icon fonticon="download" class="mat-icon"></mat-icon>
        </span>
      </button>
    `;
    const icon = document.querySelector(DOWNLOAD_ICON_SELECTOR);
    const button = findNativeDownloadButton(icon);
    expect(button?.classList.contains('icon-button')).toBe(true);
  });
});
