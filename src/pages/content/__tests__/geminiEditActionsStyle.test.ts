import { describe, expect, it } from 'vitest';

import { readContentStyle } from '@/tests/contentStyle';

function contentStyle(): string {
  return readContentStyle();
}

function ruleFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[2];
  if (!body) throw new Error(`Missing rule for ${selector}`);
  return body;
}

describe('Gemini edit-mode action row', () => {
  it('right-aligns the row with properties every engine implements', () => {
    const body = ruleFor(contentStyle(), '.user-query-container .edit-button-area');

    // Gemini uses `justify-self: flex-end` on a block-level box. Self-alignment
    // in block layout is Chrome-only today, so Safari drops it and the row
    // stretches full width with both buttons parked at the far left.
    expect(body).toMatch(/width:\s*fit-content\s*!important/);
    expect(body).toMatch(/margin-inline-start:\s*auto\s*!important/);

    // Gemini's own rule sets `margin: 0` through two attribute selectors, so it
    // outranks a plain declaration here.
    expect(body).not.toMatch(/margin-inline-start:\s*auto\s*;/);

    // Logical, not physical, so the row still lands on the inline end in RTL.
    expect(body).not.toMatch(/margin-left/);
  });

  it('targets only the edit-mode action row', () => {
    const css = contentStyle();
    const selector = '.user-query-container .edit-button-area';
    expect(css).toContain(selector);

    // Gemini's real edit-mode shape, captured from the live page.
    document.body.innerHTML = `
      <user-query-content class="user-query-container">
        <div class="user-query-container edit-mode">
          <div class="edit-container">
            <div class="query-content edit-mode">
              <div class="edit-container">
                <mat-form-field class="mat-mdc-form-field edit-form"></mat-form-field>
              </div>
            </div>
            <div class="edit-button-area" id="actions">
              <button type="button">取消</button>
              <button type="button">更新</button>
            </div>
          </div>
        </div>
      </user-query-content>
      <div class="edit-button-area" id="orphan"></div>
    `;

    const matched = [...document.querySelectorAll(selector)].map((el) => el.id);
    expect(matched).toEqual(['actions']);
  });
});
