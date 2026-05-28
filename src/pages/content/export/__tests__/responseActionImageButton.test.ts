import { afterEach, describe, expect, it, vi } from 'vitest';

import { injectResponseActionCopyImageButtons } from '../responseActionImageButton';

function createNativeActionButton({
  testId,
  iconName,
  ariaLabel,
}: {
  testId?: string;
  iconName: string;
  ariaLabel: string;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'mdc-icon-button mat-mdc-icon-button gds-icon-button';
  button.setAttribute('type', 'button');
  if (testId) button.setAttribute('data-test-id', testId);
  button.setAttribute('aria-label', ariaLabel);
  button.title = ariaLabel;

  const icon = document.createElement('mat-icon');
  icon.className =
    'mat-icon notranslate gds-icon-m google-symbols mat-ligature-font mat-icon-no-color';
  icon.setAttribute('fonticon', iconName);
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = iconName;

  button.appendChild(icon);
  return button;
}

function createAssistantActionBar(): HTMLElement {
  const host = document.createElement('div');
  host.setAttribute('data-message-author-role', 'assistant');

  const bar = document.createElement('div');
  bar.className = 'message-actions';

  const like = createNativeActionButton({
    testId: 'rate-up-button',
    iconName: 'thumb_up',
    ariaLabel: 'Good response',
  });
  const copy = createNativeActionButton({
    testId: 'copy-button',
    iconName: 'content_copy',
    ariaLabel: 'Copy response',
  });
  const more = createNativeActionButton({
    testId: 'more-menu-button',
    iconName: 'more_vert',
    ariaLabel: 'More options',
  });

  bar.appendChild(like);
  bar.appendChild(copy);
  bar.appendChild(more);
  host.appendChild(bar);
  document.body.appendChild(host);
  return bar;
}

function createNestedAssistantActionBar(): HTMLElement {
  const modelResponse = document.createElement('model-response');
  const responseContainer = document.createElement('div');
  responseContainer.className = 'response-container';
  const messageActions = document.createElement('message-actions');
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'actions-container-v2';
  const buttons = document.createElement('div');
  buttons.className = 'buttons-container-v2';

  const copy = createNativeActionButton({
    testId: 'copy-button',
    iconName: 'content_copy',
    ariaLabel: 'Copy response',
  });
  const moreWrapper = document.createElement('div');
  moreWrapper.className = 'more-menu-button-container';
  const more = createNativeActionButton({
    testId: 'more-menu-button',
    iconName: 'more_vert',
    ariaLabel: 'Show more options',
  });
  moreWrapper.appendChild(more);

  buttons.appendChild(copy);
  buttons.appendChild(moreWrapper);
  actionsContainer.appendChild(buttons);
  messageActions.appendChild(actionsContainer);
  responseContainer.appendChild(messageActions);
  modelResponse.appendChild(responseContainer);
  document.body.appendChild(modelResponse);

  return buttons;
}

describe('responseActionImageButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('injects copy-image button between native copy and more buttons', () => {
    const bar = createAssistantActionBar();
    const onClick = vi.fn();

    const injected = injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick,
    });

    expect(injected).toHaveLength(1);

    const children = Array.from(bar.children);
    const copyIndex = children.findIndex((el) => el.getAttribute('data-test-id') === 'copy-button');
    const insertedIndex = children.findIndex(
      (el) => el.getAttribute('data-test-id') === 'gv-copy-image-button',
    );
    const moreIndex = children.findIndex(
      (el) => el.getAttribute('data-test-id') === 'more-menu-button',
    );

    expect(copyIndex).toBeGreaterThanOrEqual(0);
    expect(insertedIndex).toBe(copyIndex + 1);
    expect(moreIndex).toBe(insertedIndex + 1);

    const inserted = children[insertedIndex] as HTMLButtonElement;
    const insertedIcon = inserted.querySelector('mat-icon') as HTMLElement;

    expect(inserted.className).toBe(
      (bar.querySelector('[data-test-id="copy-button"]') as HTMLElement).className,
    );
    // The icon swap is now SVG-based, so font-icon hooks must be cleared
    // and an SVG must take their place. (See the SVG-replacement test below
    // for the broken-rendering reason.)
    expect(insertedIcon.hasAttribute('fonticon')).toBe(false);
    expect(insertedIcon.querySelector('svg')).not.toBeNull();

    inserted.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('avoids duplicate injection and updates tooltip/label on reinjection', () => {
    createAssistantActionBar();
    const onClick = vi.fn();

    const first = injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick,
    });
    const second = injectResponseActionCopyImageButtons(document, {
      label: '复制回复为图片',
      tooltip: '复制回复为图片',
      onClick,
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]).toBe(first[0]);
    expect(second[0].getAttribute('aria-label')).toBe('复制回复为图片');
    expect(second[0].title).toBe('复制回复为图片');
  });

  it('does not duplicate click handlers after repeated reinjection', () => {
    createAssistantActionBar();
    const onClick = vi.fn();

    injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick,
    });
    const second = injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick,
    });
    const third = injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick,
    });

    expect(second).toHaveLength(1);
    expect(third).toHaveLength(1);
    const button = document.querySelector('[data-test-id="gv-copy-image-button"]');
    expect(button).toBeTruthy();

    (button as HTMLButtonElement).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not inject when action row has no more-options button', () => {
    const host = document.createElement('div');
    host.setAttribute('data-message-author-role', 'assistant');
    const bar = document.createElement('div');
    const copy = createNativeActionButton({
      testId: 'copy-button',
      iconName: 'content_copy',
      ariaLabel: 'Copy response',
    });
    bar.appendChild(copy);
    host.appendChild(bar);
    document.body.appendChild(host);

    const injected = injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick: vi.fn(),
    });
    expect(injected).toHaveLength(0);
  });

  it('injects when copy/more buttons are nested under buttons-container-v2', () => {
    const buttons = createNestedAssistantActionBar();
    const injected = injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick: vi.fn(),
    });

    expect(injected).toHaveLength(1);
    expect(buttons.querySelector('[data-test-id="gv-copy-image-button"]')).toBeTruthy();
  });

  it('finds gem copy buttons by icon without broad action-button scans', () => {
    const host = document.createElement('model-response');
    const bar = document.createElement('div');
    bar.className = 'message-actions';
    const copy = createNativeActionButton({
      iconName: 'content_copy',
      ariaLabel: 'Copy response',
    });
    const more = createNativeActionButton({
      testId: 'more-menu-button',
      iconName: 'more_vert',
      ariaLabel: 'More options',
    });
    bar.append(copy, more);
    host.appendChild(bar);
    document.body.appendChild(host);

    const querySpy = vi.spyOn(Element.prototype, 'querySelectorAll');
    const injected = injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick: vi.fn(),
    });

    expect(injected).toHaveLength(1);
    expect(bar.querySelector('[data-test-id="gv-copy-image-button"]')).toBeTruthy();
    expect(querySpy).not.toHaveBeenCalledWith('button, gem-icon-button, [role="button"]');
  });

  it('clones a sibling action button when no copy-button is in the bar (image-gen response)', () => {
    // Reproduces the image-response layout: no copy-button in the bar. The
    // injector must clone a sibling (e.g., share-button) instead of walking
    // to a hidden/template copy-button elsewhere in the DOM — otherwise it
    // ends up with stock Material classes that don't match Gemini's
    // gem-button sizing and the result looks wrong + has the pointer-events
    // problem.
    const host = document.createElement('div');
    host.setAttribute('data-message-author-role', 'assistant');
    const bar = document.createElement('div');
    bar.className = 'message-actions';

    const share = createNativeActionButton({
      testId: 'share-button',
      iconName: 'share',
      ariaLabel: 'Share image',
    });
    // Mirror production: gem-button family does NOT carry the stock Material
    // `mdc-icon-button` classes. Reset to a clean gem-button-only set.
    share.className = 'gem-button gem-button-size-small gem-button-type-translucent';
    const more = createNativeActionButton({
      testId: 'more-menu-button',
      iconName: 'more_vert',
      ariaLabel: 'More options',
    });
    bar.append(share, more);
    host.appendChild(bar);
    document.body.appendChild(host);

    // Plant a hidden "stock Material" copy-button elsewhere — this is what
    // the OLD code accidentally cloned. The new code must NOT walk to it.
    const decoy = createNativeActionButton({
      iconName: 'content_copy',
      ariaLabel: 'Copy',
    });
    decoy.className = 'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base';
    document.body.appendChild(decoy);

    const injected = injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick: vi.fn(),
    });
    expect(injected).toHaveLength(1);

    const ours = bar.querySelector('[data-test-id="gv-copy-image-button"]') as HTMLElement;
    expect(ours).not.toBeNull();
    // Must carry Gemini's gem-button family (cloned from share), NOT stock
    // Material icon-button classes (cloned from the decoy).
    expect(ours.classList.contains('gem-button')).toBe(true);
    expect(ours.classList.contains('mdc-icon-button')).toBe(false);
    expect(ours.classList.contains('mat-mdc-icon-button')).toBe(false);
  });

  it('clears disabled state inherited from the cloned native Copy button so clicks fire', () => {
    // If the native Copy button is in a disabled state at clone time (e.g.,
    // mid-stream), the clone inherits `disabled` + `aria-disabled="true"`,
    // looks dim, and swallows clicks with only the ripple. We must clear it.
    const host = document.createElement('div');
    host.setAttribute('data-message-author-role', 'assistant');
    const bar = document.createElement('div');
    bar.className = 'message-actions';

    const copy = document.createElement('button');
    copy.className = 'mdc-icon-button mat-mdc-icon-button';
    copy.setAttribute('data-test-id', 'copy-button');
    copy.setAttribute('aria-label', 'Copy response');
    copy.disabled = true;
    copy.setAttribute('aria-disabled', 'true');
    // Material's CSS uses these classes to enforce `pointer-events: none` even
    // when `disabled` itself is absent — they must be stripped too.
    copy.classList.add('mat-mdc-button-disabled', 'mdc-icon-button--disabled');
    const copyIcon = document.createElement('mat-icon');
    copyIcon.setAttribute('fonticon', 'content_copy');
    copyIcon.textContent = 'content_copy';
    copy.appendChild(copyIcon);

    const more = createNativeActionButton({
      testId: 'more-menu-button',
      iconName: 'more_vert',
      ariaLabel: 'More options',
    });

    bar.append(copy, more);
    host.appendChild(bar);
    document.body.appendChild(host);

    const onClick = vi.fn();
    injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick,
    });

    const injected = bar.querySelector(
      '[data-test-id="gv-copy-image-button"]',
    ) as HTMLButtonElement;
    expect(injected).not.toBeNull();
    expect(injected.disabled).toBe(false);
    expect(injected.hasAttribute('disabled')).toBe(false);
    expect(injected.getAttribute('aria-disabled')).toBe('false');
    expect(injected.classList.contains('mat-mdc-button-disabled')).toBe(false);
    expect(injected.classList.contains('mdc-icon-button--disabled')).toBe(false);

    injected.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('replaces the cloned font-icon with an inline SVG to dodge Gemini font absence', () => {
    // Reproduces issue #711: on lr26+ Gemini, the native Copy button uses
    // Gemini's lumi-symbols font (no `image` glyph) AND the page never loads
    // Google Symbols, so swapping the font-family doesn't help either. The
    // only reliable rendering path is an inline SVG that inherits currentColor.
    const host = document.createElement('div');
    host.setAttribute('data-message-author-role', 'assistant');
    const bar = document.createElement('div');
    bar.className = 'message-actions';

    const copy = document.createElement('button');
    copy.className = 'mdc-icon-button mat-mdc-icon-button';
    copy.setAttribute('data-test-id', 'copy-button');
    copy.setAttribute('aria-label', 'Copy response');
    const copyIcon = document.createElement('mat-icon');
    copyIcon.className =
      'mat-icon notranslate lm-icon-l mat-ligature-font mat-icon-no-color google-symbols';
    copyIcon.style.fontFamily = '"Luminous Symbols"';
    copyIcon.setAttribute('fonticon', 'content_copy');
    copyIcon.setAttribute('data-mat-icon-name', 'content_copy');
    copyIcon.setAttribute('data-mat-icon-namespace', 'lumi-symbols');
    copyIcon.textContent = 'content_copy';
    copy.appendChild(copyIcon);

    const more = createNativeActionButton({
      testId: 'more-menu-button',
      iconName: 'more_vert',
      ariaLabel: 'More options',
    });

    bar.append(copy, more);
    host.appendChild(bar);
    document.body.appendChild(host);

    const injected = injectResponseActionCopyImageButtons(document, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick: vi.fn(),
    });
    expect(injected).toHaveLength(1);

    const insertedIcon = bar.querySelector(
      '[data-test-id="gv-copy-image-button"] mat-icon',
    ) as HTMLElement;
    // No font-family / font-icon hooks left to disagree about.
    expect(insertedIcon.style.fontFamily).toBe('');
    expect(insertedIcon.hasAttribute('fonticon')).toBe(false);
    expect(insertedIcon.hasAttribute('data-mat-icon-name')).toBe(false);
    expect(insertedIcon.hasAttribute('data-mat-icon-namespace')).toBe(false);
    expect(insertedIcon.classList.contains('lm-icon-l')).toBe(false);
    expect(insertedIcon.classList.contains('mat-ligature-font')).toBe(false);
    // SVG replaces the text ligature entirely.
    const svg = insertedIcon.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 -960 960 960');
    expect(svg?.querySelector('path')).not.toBeNull();
    // Sanity: the literal letters of `image` must NOT survive — that was the bug.
    expect(insertedIcon.textContent || '').not.toContain('image');
    // mat-icon (and the SVG inside) must be click-through so clicks always
    // land on the button. Otherwise users can only trigger clicks on the
    // padding around the icon, never on the glyph itself.
    expect(insertedIcon.style.pointerEvents).toBe('none');
    expect((svg as SVGElement).style.pointerEvents).toBe('none');
  });

  it('does not probe unrelated sidebar mutations with broad action-button scans', () => {
    const sidebar = document.createElement('bard-sidenav');
    for (let i = 0; i < 50; i += 1) {
      sidebar.appendChild(
        createNativeActionButton({
          testId: `sidebar-button-${i}`,
          iconName: 'folder',
          ariaLabel: `Sidebar button ${i}`,
        }),
      );
    }
    document.body.appendChild(sidebar);

    const querySpy = vi.spyOn(Element.prototype, 'querySelectorAll');
    const injected = injectResponseActionCopyImageButtons(sidebar, {
      label: 'Copy response as image',
      tooltip: 'Copy response as image',
      onClick: vi.fn(),
    });

    expect(injected).toHaveLength(0);
    expect(querySpy).not.toHaveBeenCalled();
  });
});
