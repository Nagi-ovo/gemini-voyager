import { describe, expect, it } from 'vitest';

import type { ModelPickerSection } from '@/features/plugins/sites/sections/modelPickerData';

import { readStatus } from './pickerDom';

function menuWithStatus(text: string): HTMLElement {
  const menu = document.createElement('div');
  menu.innerHTML = `<span role="status">${text}</span>`;
  return menu;
}

function data(template: string): ModelPickerSection {
  return {
    format: 1,
    triggerLabels: { 'zh-CN': ['选择 ChatGPT 模型'] },
    effortStatus: { 'zh-CN': template },
    models: {},
    presets: {},
  } as ModelPickerSection;
}

describe('readStatus', () => {
  it('reads the step name and leaves the position unknown when the template has no position', () => {
    const status = readStatus(menuWithStatus('Pro，共 5 项。'), data('{label}，共 {count} 项。'));

    expect(status).toMatchObject({ label: 'Pro', position: null });
  });

  it('reads the position when the template names it', () => {
    const status = readStatus(
      menuWithStatus('Pro，第 5 项，共 5 项。'),
      data('{label}，第 {position} 项，共 {count} 项。'),
    );

    expect(status).toMatchObject({ label: 'Pro', position: 5 });
  });
});
