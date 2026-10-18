/**
 * The "Pro this week" label beside ChatGPT's chat-mode model picker.
 *
 * Measured on chatgpt.com (zh-CN, 2026-10-18): the picker trigger is a
 * `button[aria-haspopup=menu]` in the composer form whose `aria-label` is in
 * the site data's `modelPicker.triggerLabels`, and its visible text (without
 * the `aria-hidden` caption) is the selected effort, "Pro" for GPT-6 Pro.
 * Work mode has its own picker without a Pro step, so a trigger reading
 * Pro means chat mode with Pro selected.
 */
import { chatgptAdapter } from '@/features/plugins/sites/adapters/chatgpt';
import type { ModelPickerSection } from '@/features/plugins/sites/sections/modelPickerData';
import type { SiteAdapter } from '@/features/plugins/types';
import { getCachedLocale, getTranslationSync } from '@/utils/i18n';

import { findTrigger, mergedLabels, triggerText } from '../chatgptModelSelect/pickerDom';
import type { ProUsageSummary } from './usageStore';

export const PRO_USAGE_BADGE_ID = 'gv-chatgpt-pro-usage';
const BADGE_CLASS = 'gv-chatgpt-pro-usage';
/** The effort id the site data gives the Pro step. */
const PRO_EFFORT_ID = 'pro';

function pickerData(adapter: SiteAdapter | null): ModelPickerSection | null {
  return adapter?.modelPicker ?? chatgptAdapter.modelPicker ?? null;
}

function proLabels(data: ModelPickerSection): Set<string> {
  const table: Record<string, string[]> = {};
  for (const model of Object.values(data.models)) {
    for (const effort of model.efforts ?? []) {
      if (effort.id !== PRO_EFFORT_ID) continue;
      for (const [locale, labels] of Object.entries(effort.labels)) {
        table[locale] = [...(table[locale] ?? []), ...labels];
      }
    }
  }
  return mergedLabels(table);
}

/** The composer's picker trigger while it shows Pro, else null. */
export function findProTrigger(adapter: SiteAdapter | null): HTMLElement | null {
  const data = pickerData(adapter);
  if (!data) return null;
  const trigger = findTrigger(document, data);
  if (!trigger?.closest('form')) return null;
  return proLabels(data).has(triggerText(trigger)) ? trigger : null;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

function formatTime(ms: number): string {
  try {
    return new Intl.DateTimeFormat(getCachedLocale(), {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ms);
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export function badgeText(summary: ProUsageSummary): string {
  let main: string;
  if (summary.limit !== null && summary.remaining !== null) {
    main = fill(getTranslationSync('chatgptProUsageLeft'), {
      left: summary.remaining,
      limit: summary.limit,
    });
  } else if (summary.blocked) {
    main = getTranslationSync('chatgptProUsageNoneLeft');
  } else {
    main = fill(getTranslationSync('chatgptProUsageWeek'), { count: summary.usedThisWeek });
  }
  if (summary.resetsAt === null) return main;
  const reset = fill(getTranslationSync('chatgptProUsageResets'), {
    time: formatTime(summary.resetsAt),
  });
  return `${main} · ${reset}`;
}

export function isBadgeNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest(`#${PRO_USAGE_BADGE_ID}`));
}

/** Show the label right after `trigger`, or remove it when there is none. */
export function renderBadge(trigger: HTMLElement | null, summary: ProUsageSummary | null): void {
  let badge = document.getElementById(PRO_USAGE_BADGE_ID);
  if (!trigger || !summary) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.id = PRO_USAGE_BADGE_ID;
    badge.className = BADGE_CLASS;
  }
  const text = badgeText(summary);
  if (badge.textContent !== text) badge.textContent = text;
  const hint = getTranslationSync('chatgptProUsageHint');
  if (badge.title !== hint) badge.title = hint;
  if (trigger.nextElementSibling !== badge) trigger.insertAdjacentElement('afterend', badge);
}
