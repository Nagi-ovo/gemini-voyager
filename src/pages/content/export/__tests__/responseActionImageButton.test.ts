import { afterEach, describe, expect, it, vi } from 'vitest';

import { injectResponseActionCopyImageButtons } from '../responseActionImageButton';

function createNativeActionButton({
  testId,
  iconName,
  ariaLabel,
}: {
  testId: string;
  iconName: string;
  ariaLabel: string;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'mdc-icon-button mat-mdc-icon-button gds-icon-button';
  button.setAttribute('type', 'button');
  button.setAttribute('data-test-id', testId);
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
    const copyIcon = bar.querySelector('[data-test-id="copy-button"] mat-icon') as HTMLElement;
    const insertedIcon = inserted.querySelector('mat-icon') as HTMLElement;

    expect(inserted.className).toBe(
      (bar.querySelector('[data-test-id="copy-button"]') as HTMLElement).className,
    );
    expect(insertedIcon.className).toBe(copyIcon.className);
    expect(insertedIcon.getAttribute('fonticon')).toBe('image');
    expect((insertedIcon.textContent || '').trim()).toBe('image');

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
});
