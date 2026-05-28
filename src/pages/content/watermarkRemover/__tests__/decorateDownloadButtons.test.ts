import { beforeEach, describe, expect, it, vi } from 'vitest';

import { decorateDownloadButtons } from '../index';

describe('decorateDownloadButtons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // chrome.i18n is referenced inside attachIndicatorToButton for the tooltip;
    // global setup only provides chrome.storage/runtime.
    (chrome as unknown as { i18n: { getMessage: (k: string) => string } }).i18n = {
      getMessage: vi.fn(() => ''),
    };
  });

  const indicator = (root: ParentNode) => root.querySelector('.nanobanana-indicator');

  it('adds the 🍌 indicator to the in-message toolbar button (blob-src preview)', () => {
    document.body.innerHTML = `
      <generated-image>
        <img class="image" src="blob:https://gemini.google.com/abc" />
        <download-generated-image-button>
          <button aria-label="Download full size image">
            <mat-icon fonticon="download"></mat-icon>
          </button>
        </download-generated-image-button>
      </generated-image>
    `;

    decorateDownloadButtons();

    const button = document.querySelector('button')!;
    expect(indicator(button)?.textContent).toBe('🍌');
  });

  it('adds the indicator to the lightbox button even when it is outside any generated-image container', () => {
    // Mirrors the real lightbox DOM: cdk-overlay-container → mat-dialog-container
    // → expansion-dialog → ... → download-generated-image-button, with NO
    // ancestor <generated-image>.
    document.body.innerHTML = `
      <div class="cdk-overlay-container">
        <div class="mat-dialog-container">
          <expansion-dialog>
            <div class="arrow-back-container">
              <div class="generated-image-expansion-dialog-action-buttons">
                <download-generated-image-button>
                  <gem-icon-button>
                    <button aria-label="Download full size image">
                      <mat-icon fonticon="download"></mat-icon>
                    </button>
                  </gem-icon-button>
                </download-generated-image-button>
              </div>
            </div>
          </expansion-dialog>
        </div>
      </div>
    `;

    decorateDownloadButtons();

    const lightboxButton = document.querySelector(
      '.cdk-overlay-container button[aria-label="Download full size image"]',
    )!;
    expect(indicator(lightboxButton)).not.toBeNull();
  });

  it('decorates both toolbar AND lightbox buttons in a single pass', () => {
    document.body.innerHTML = `
      <generated-image>
        <download-generated-image-button class="toolbar-host">
          <button class="toolbar-btn">
            <mat-icon fonticon="download"></mat-icon>
          </button>
        </download-generated-image-button>
      </generated-image>
      <div class="cdk-overlay-container">
        <expansion-dialog>
          <download-generated-image-button class="lightbox-host">
            <button class="lightbox-btn">
              <mat-icon fonticon="download"></mat-icon>
            </button>
          </download-generated-image-button>
        </expansion-dialog>
      </div>
    `;

    decorateDownloadButtons();

    expect(indicator(document.querySelector('.toolbar-btn')!)).not.toBeNull();
    expect(indicator(document.querySelector('.lightbox-btn')!)).not.toBeNull();
  });

  it('does not add an indicator outside any download-generated-image-button host', () => {
    document.body.innerHTML = `
      <div class="user-uploaded-image">
        <img src="blob:https://gemini.google.com/user" />
        <button aria-label="Download">
          <mat-icon fonticon="download"></mat-icon>
        </button>
      </div>
    `;

    decorateDownloadButtons();

    expect(document.querySelector('.nanobanana-indicator')).toBeNull();
  });

  it('is idempotent — running twice does not duplicate the indicator', () => {
    document.body.innerHTML = `
      <generated-image>
        <download-generated-image-button>
          <button>
            <mat-icon fonticon="download"></mat-icon>
          </button>
        </download-generated-image-button>
      </generated-image>
    `;

    decorateDownloadButtons();
    decorateDownloadButtons();

    expect(document.querySelectorAll('.nanobanana-indicator')).toHaveLength(1);
  });

  it('places the indicator INSIDE the button (not in a clipped ancestor)', () => {
    document.body.innerHTML = `
      <generated-image>
        <download-generated-image-button>
          <gem-icon-button style="overflow: hidden">
            <button class="target">
              <mat-icon fonticon="download"></mat-icon>
            </button>
          </gem-icon-button>
        </download-generated-image-button>
      </generated-image>
    `;

    decorateDownloadButtons();

    const button = document.querySelector('.target')!;
    expect(indicator(button)).not.toBeNull();
    // Must not have been appended to the overflow:hidden wrapper.
    expect(document.querySelector('gem-icon-button > .nanobanana-indicator')).toBeNull();
  });
});
