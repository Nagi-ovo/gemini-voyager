import { describe, expect, it } from 'vitest';

import {
  DOWNLOAD_ICON_SELECTOR,
  findGeneratedImageForDownloadButton,
  findNativeDownloadButton,
} from '../downloadButton';

describe('findNativeDownloadButton', () => {
  it('finds button by data-test-id within generated-image container', () => {
    document.body.innerHTML = `
      <generated-image>
        <button data-test-id="download-generated-image-button">
          <span class="child"></span>
        </button>
      </generated-image>
    `;
    const target = document.querySelector('.child');
    const button = findNativeDownloadButton(target);
    expect(button?.getAttribute('data-test-id')).toBe('download-generated-image-button');
  });

  it('finds button inside download-generated-image-button host within container', () => {
    document.body.innerHTML = `
      <div class="generated-image-container">
        <download-generated-image-button>
          <button class="inner">
            <span class="target"></span>
          </button>
        </download-generated-image-button>
      </div>
    `;
    const target = document.querySelector('.target');
    const button = findNativeDownloadButton(target);
    expect(button?.classList.contains('inner')).toBe(true);
  });

  it('finds button via download icon selector within generated-image container', () => {
    document.body.innerHTML = `
      <generated-image>
        <button class="icon-button">
          <span class="button-icon-wrapper">
            <mat-icon fonticon="download" class="mat-icon"></mat-icon>
          </span>
        </button>
      </generated-image>
    `;
    const icon = document.querySelector(DOWNLOAD_ICON_SELECTOR);
    const button = findNativeDownloadButton(icon);
    expect(button?.classList.contains('icon-button')).toBe(true);
  });

  it('returns null for download button outside generated-image container', () => {
    document.body.innerHTML = `
      <div class="user-uploaded-image">
        <button data-test-id="download-generated-image-button">
          <span class="child"></span>
        </button>
      </div>
    `;
    const target = document.querySelector('.child');
    const button = findNativeDownloadButton(target);
    expect(button).toBeNull();
  });

  it('returns null for download icon outside generated-image container', () => {
    document.body.innerHTML = `
      <div class="image-preview-dialog">
        <button class="icon-button">
          <mat-icon fonticon="download" class="mat-icon"></mat-icon>
        </button>
      </div>
    `;
    const icon = document.querySelector(DOWNLOAD_ICON_SELECTOR);
    const button = findNativeDownloadButton(icon);
    expect(button).toBeNull();
  });

  it('returns null for click on user-uploaded image area', () => {
    document.body.innerHTML = `
      <div class="uploaded-image-container">
        <img src="user-image.jpg" class="user-image" />
        <button class="preview-button">
          <span class="click-target"></span>
        </button>
      </div>
    `;
    const target = document.querySelector('.click-target');
    const button = findNativeDownloadButton(target);
    expect(button).toBeNull();
  });

  it('finds the lightbox download button (inside expansion-dialog, no generated-image ancestor)', () => {
    // Mirrors the real lightbox DOM: the same `<download-generated-image-button>`
    // custom element is reused here, but it lives under <expansion-dialog> in
    // cdk-overlay-container — NOT inside any <generated-image>.
    document.body.innerHTML = `
      <div class="cdk-overlay-container">
        <div class="mat-dialog-container">
          <expansion-dialog>
            <div class="arrow-back-container">
              <download-generated-image-button>
                <gem-icon-button>
                  <button class="lightbox-btn" aria-label="Download full size image">
                    <mat-icon fonticon="download" class="target"></mat-icon>
                  </button>
                </gem-icon-button>
              </download-generated-image-button>
            </div>
          </expansion-dialog>
        </div>
      </div>
    `;
    const target = document.querySelector('.target');
    const button = findNativeDownloadButton(target);
    expect(button?.classList.contains('lightbox-btn')).toBe(true);
  });

  it('finds the image paired with an in-message download button', () => {
    document.body.innerHTML = `
      <generated-image>
        <img src="https://lh3.googleusercontent.com/example=s512" />
        <download-generated-image-button><button></button></download-generated-image-button>
      </generated-image>
    `;

    const button = document.querySelector('button')!;
    expect(findGeneratedImageForDownloadButton(button)?.src).toContain('googleusercontent.com');
  });

  it('finds the displayed image paired with a lightbox download button', () => {
    document.body.innerHTML = `
      <expansion-dialog>
        <img src="blob:https://gemini.google.com/processed" data-processed-url="blob:https://gemini.google.com/processed" />
        <download-generated-image-button><button></button></download-generated-image-button>
      </expansion-dialog>
    `;

    const button = document.querySelector('button')!;
    expect(findGeneratedImageForDownloadButton(button)?.dataset.processedUrl).toBe(
      'blob:https://gemini.google.com/processed',
    );
  });
});
