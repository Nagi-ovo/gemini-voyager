import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TranslationKey } from '@/utils/translations';

import {
  TimelineOptions,
  type TimelineOptionsProps,
  type TimelineSettingsValues,
} from '../TimelineOptions';

const translate = (key: TranslationKey): string => key;

const values: TimelineSettingsValues = {
  timelineEnabled: true,
  timelineStyle: 'ruler',
  mode: 'jump',
  hideContainer: false,
  draggableTimeline: true,
  timelinePreviewPinned: false,
  markerLevelEnabled: true,
  showMessageTimestamps: false,
};

describe('TimelineOptions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (overrides: Partial<TimelineOptionsProps> = {}) => {
    const props: TimelineOptionsProps = {
      values,
      onChange: vi.fn(),
      onResetPosition: vi.fn(),
      onViewStarredHistory: vi.fn(),
      isVisible: () => true,
      t: translate,
      ...overrides,
    };
    act(() => {
      root.render(<TimelineOptions {...props} />);
    });
    return props;
  };

  it('renders every value into its control', () => {
    render();
    const checked = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!.checked;
    expect(checked('hide-container')).toBe(false);
    expect(checked('draggable-timeline')).toBe(true);
    expect(checked('timeline-preview-pinned')).toBe(false);
    expect(checked('marker-level-enabled')).toBe(true);
    expect(checked('show-message-timestamps')).toBe(false);

    const active = Array.from(container.querySelectorAll('button.text-primary-foreground')).map(
      (button) => button.textContent,
    );
    expect(active).toEqual(['timelineStyleRuler', 'jump']);
  });

  it('reports one key per change and keeps the reset and history actions separate', () => {
    const props = render();
    const click = (selector: string) =>
      act(() => {
        container.querySelector<HTMLElement>(selector)!.click();
      });

    act(() => {
      const input = container.querySelector<HTMLInputElement>('#timeline-preview-pinned')!;
      input.click();
    });
    expect(props.onChange).toHaveBeenLastCalledWith({ timelinePreviewPinned: true });

    click('button.text-muted-foreground');
    expect(props.onChange).toHaveBeenLastCalledWith({ timelineStyle: 'dots' });

    const buttons = Array.from(container.querySelectorAll('button'));
    buttons.find((b) => b.textContent === 'flow')!.click();
    expect(props.onChange).toHaveBeenLastCalledWith({ mode: 'flow' });

    buttons.find((b) => b.textContent?.includes('resetTimelinePosition'))!.click();
    expect(props.onResetPosition).toHaveBeenCalledOnce();
    buttons.find((b) => b.textContent?.includes('viewStarredHistory'))!.click();
    expect(props.onViewStarredHistory).toHaveBeenCalledOnce();
    expect(props.onChange).toHaveBeenCalledTimes(3);
  });

  it('hides rows the site or the settings search rules out, by search id', () => {
    render({ isVisible: (settingId) => settingId !== 'pinTimelinePreview' });
    const row = container
      .querySelector<HTMLElement>('#timeline-preview-pinned')!
      .closest<HTMLElement>('div.group')!;
    expect(row.hidden).toBe(true);
    expect(
      container.querySelector<HTMLElement>('#hide-container')!.closest<HTMLElement>('div.group')!
        .hidden,
    ).toBe(false);
  });

  it('an off rail disables its controls but message times, auto-scroll and Saved Library still work', () => {
    const props = render({
      values: {
        ...values,
        timelineEnabled: false,
        showMessageTimestamps: true,
        hideContainer: true,
      },
    });
    const input = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;
    for (const id of [
      'hide-container',
      'draggable-timeline',
      'timeline-preview-pinned',
      'marker-level-enabled',
    ]) {
      expect(input(id).disabled).toBe(true);
      act(() => input(id).click());
    }
    const buttons = Array.from(container.querySelectorAll('button'));
    for (const label of [
      'timelineStyleDots',
      'timelineStyleCompact',
      'timelineStyleRuler',
      'flow',
      'jump',
      'resetTimelinePosition',
    ]) {
      const button = buttons.find((b) => b.textContent === label)!;
      expect(button.disabled).toBe(true);
      act(() => button.click());
    }
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onResetPosition).not.toHaveBeenCalled();
    expect(input('hide-container').checked).toBe(true);
    expect(input('draggable-timeline').checked).toBe(true);
    expect(input('show-message-timestamps').disabled).toBe(false);
    act(() => input('show-message-timestamps').click());
    expect(props.onChange).toHaveBeenLastCalledWith({ showMessageTimestamps: false });
    act(() => buttons.find((b) => b.textContent === 'viewStarredHistory')!.click());
    expect(props.onViewStarredHistory).toHaveBeenCalledOnce();
  });

  it.each(['ruler', 'compact'] as const)(
    'the %s style shows hide outer container disabled, with its saved value and why',
    (timelineStyle) => {
      const props = render({ values: { ...values, timelineStyle, hideContainer: true } });
      const toggle = container.querySelector<HTMLInputElement>('#hide-container')!;
      const row = toggle.closest<HTMLElement>('div.group')!;
      expect(row.hidden).toBe(false);
      expect(toggle.disabled).toBe(true);
      expect(toggle.checked).toBe(true);
      expect(row.textContent).toContain('hideOuterContainerDotsOnly');
      act(() => toggle.click());
      expect(props.onChange).not.toHaveBeenCalled();
    },
  );

  it('the dots style lets hide outer container be changed', () => {
    const props = render({ values: { ...values, timelineStyle: 'dots' } });
    const toggle = container.querySelector<HTMLInputElement>('#hide-container')!;
    expect(toggle.disabled).toBe(false);
    expect(toggle.closest('div.group')!.textContent).not.toContain('hideOuterContainerDotsOnly');
    act(() => toggle.click());
    expect(props.onChange).toHaveBeenLastCalledWith({ hideContainer: true });
  });

  it('with node levels on, only the dots style can be chosen', () => {
    const styleButton = (label: string) =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label)!;
    const props = render({
      values: { ...values, timelineStyle: 'dots', markerLevelEnabled: true },
    });
    expect(styleButton('timelineStyleCompact').disabled).toBe(true);
    expect(styleButton('timelineStyleRuler').disabled).toBe(true);
    expect(styleButton('timelineStyleDots').disabled).toBe(false);
    act(() => styleButton('timelineStyleRuler').click());
    expect(props.onChange).not.toHaveBeenCalled();

    render({ values: { ...values, markerLevelEnabled: false } });
    expect(styleButton('timelineStyleCompact').disabled).toBe(false);
    expect(styleButton('timelineStyleRuler').disabled).toBe(false);
  });

  describe('from the keyboard', () => {
    const radios = (group: string) => [
      ...container.querySelectorAll<HTMLButtonElement>(
        `[role="radiogroup"][aria-label="${group}"] [role="radio"]`,
      ),
    ];
    const press = (target: HTMLElement, key: string) =>
      act(() => {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });

    it('each group is one Tab stop, on the checked radio', () => {
      render({ values: { ...values, markerLevelEnabled: false } });
      expect(radios('timelineStyle').map((radio) => radio.tabIndex)).toEqual([-1, 0, -1]);
      expect(radios('scrollMode').map((radio) => radio.tabIndex)).toEqual([-1, 0]);
    });

    it('arrows pick the next radio, wrap, and take focus with them', () => {
      const props = render({ values: { ...values, markerLevelEnabled: false } });
      const [dots, ruler, compact] = radios('timelineStyle');
      press(ruler, 'ArrowRight');
      expect(props.onChange).toHaveBeenLastCalledWith({ timelineStyle: 'compact' });
      expect(document.activeElement).toBe(compact);
      press(ruler, 'ArrowLeft');
      expect(props.onChange).toHaveBeenLastCalledWith({ timelineStyle: 'dots' });
      expect(document.activeElement).toBe(dots);
      const [flow, jump] = radios('scrollMode');
      press(jump, 'ArrowDown');
      expect(props.onChange).toHaveBeenLastCalledWith({ mode: 'flow' });
      expect(document.activeElement).toBe(flow);
    });

    it('skips disabled radios, so node levels keep the keyboard on dots', () => {
      const props = render({
        values: { ...values, timelineStyle: 'dots', markerLevelEnabled: true },
      });
      const [dots] = radios('timelineStyle');
      press(dots, 'ArrowRight');
      press(dots, 'End');
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('in a right-to-left page, the left arrow moves forward', () => {
      const props = render({ values: { ...values, markerLevelEnabled: false } });
      container.setAttribute('dir', 'rtl');
      press(radios('timelineStyle')[1], 'ArrowLeft');
      expect(props.onChange).toHaveBeenLastCalledWith({ timelineStyle: 'compact' });
      container.removeAttribute('dir');
    });
  });

  it('marks the experimental rows with the shared badge', () => {
    render();
    const badges = Array.from(container.querySelectorAll('[title="experimentalLabel"]'));
    expect(badges).toHaveLength(2);
    expect(
      container.querySelector('label[for="marker-level-enabled"] [title="experimentalLabel"]'),
    ).not.toBeNull();
  });
});
