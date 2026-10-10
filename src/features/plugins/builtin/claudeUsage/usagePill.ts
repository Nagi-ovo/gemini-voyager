import { StorageKeys } from '@/core/types/common';

import {
  type ClaudeUsageMetric,
  type ClaudeUsageSnapshot,
  asRecord,
  metricDisplayLabel,
} from './usageSnapshot';

export const CLAUDE_USAGE_PILL_ID = 'gv-claude-usage-pill';
const OPEN_ICON = `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z"/></svg>`;

function metricTitle(metric: ClaudeUsageMetric): string {
  const label = metricDisplayLabel(metric);
  return metric.resetLabel ? `${label} resets ${metric.resetLabel}` : label;
}

function formatResetCountdown(epochSec: number | undefined, now: number): string {
  if (typeof epochSec !== 'number') return '';
  const diffMs = epochSec * 1000 - now;
  if (diffMs <= 0) return '';
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const restMins = mins % 60;
  if (hours < 1) return `${mins}m`;
  if (hours < 24) return restMins > 0 ? `${hours}h${restMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days}d${rest}h`;
}

function buildMetric(doc: Document, metric: ClaudeUsageMetric): HTMLElement {
  const seg = doc.createElement('div');
  seg.className = 'gv-usage-metric';
  if (metric.percent >= 90) seg.classList.add('gv-usage-high');
  else if (metric.percent >= 70) seg.classList.add('gv-usage-mid');
  seg.title = metricTitle(metric);

  const name = doc.createElement('span');
  name.className = 'gv-usage-label';
  name.textContent = metricDisplayLabel(metric);
  seg.appendChild(name);

  const track = doc.createElement('span');
  track.className = 'gv-usage-track';
  const fill = doc.createElement('span');
  fill.className = 'gv-usage-fill';
  fill.style.width = `${metric.percent}%`;
  track.appendChild(fill);
  seg.appendChild(track);

  const pct = doc.createElement('span');
  pct.className = 'gv-usage-pct';
  const reset = formatResetCountdown(metric.resetEpoch, Date.now());
  pct.textContent = `${metric.percent}%${reset ? ` (${reset})` : ''}`;
  seg.appendChild(pct);

  return seg;
}

export class ClaudeUsagePill {
  private node: HTMLElement | null = null;
  private dragging = false;
  private dragMoved = false;
  private dragPos: { x: number; y: number } | null = null;
  private dragOffset = { x: 0, y: 0 };
  private dragStart = { x: 0, y: 0 };
  private pillMoveHandler: ((ev: PointerEvent) => void) | null = null;

  constructor(
    private readonly usageUrl: () => string,
    private readonly openUsage: (event: MouseEvent) => void,
  ) {}

  get mounted(): boolean {
    return this.node !== null;
  }

  start(): void {
    window.addEventListener('resize', this.onResize);
  }

  position(): void {
    if (this.node) this.positionPill(this.node);
  }

  applyStoredPosition(raw: unknown): void {
    const pos = asRecord(raw);
    this.dragPos =
      typeof pos?.x === 'number' && typeof pos?.y === 'number' ? { x: pos.x, y: pos.y } : null;
    this.position();
  }

  dispose(): void {
    if (this.pillMoveHandler) {
      window.removeEventListener('pointermove', this.pillMoveHandler);
      this.pillMoveHandler = null;
    }
    this.dragging = false;
    window.removeEventListener('resize', this.onResize);
    this.node?.remove();
    this.node = null;
    this.dragPos = null;
    document.getElementById(CLAUDE_USAGE_PILL_ID)?.remove();
  }

  build(doc: Document = document): HTMLElement {
    const el = doc.createElement('div');
    el.id = CLAUDE_USAGE_PILL_ID;
    el.className = 'gv-usage-pill gv-claude-usage-pill';
    el.setAttribute('role', 'group');
    el.addEventListener('pointerdown', this.onPillPointerDown);
    return el;
  }

  private ensure(): HTMLElement {
    const existing = document.getElementById(CLAUDE_USAGE_PILL_ID);
    if (existing instanceof HTMLElement) {
      this.node = existing;
      return existing;
    }

    const el = this.build(document);
    document.body.appendChild(el);
    this.node = el;
    return el;
  }

  render(snapshot: ClaudeUsageSnapshot | null): void {
    const el = this.ensure();
    el.textContent = '';
    el.setAttribute('aria-label', 'Claude usage limits');
    el.title = snapshot?.lastUpdatedLabel
      ? `Last updated: ${snapshot.lastUpdatedLabel}`
      : 'Open Claude usage';

    if (snapshot?.plan) {
      const tier = document.createElement('span');
      tier.className = 'gv-usage-tier';
      tier.textContent = snapshot.plan;
      el.appendChild(tier);
    }

    const metrics = snapshot?.metrics ?? [];
    if (metrics.length) {
      for (const metric of metrics) el.appendChild(buildMetric(document, metric));
    } else {
      const label = document.createElement('span');
      label.className = 'gv-usage-label';
      label.textContent = 'Open usage';
      el.appendChild(label);
    }

    const open = document.createElement('a');
    open.className = 'gv-usage-open';
    open.href = this.usageUrl();
    open.setAttribute('aria-label', 'Open Claude usage');
    open.title = 'Open Claude usage';
    open.innerHTML = OPEN_ICON;
    open.addEventListener('click', this.openUsage);
    el.appendChild(open);

    this.positionPill(el);
  }

  private clampPos(x: number, y: number): { x: number; y: number } {
    const width = this.node?.offsetWidth ?? 240;
    const height = this.node?.offsetHeight ?? 32;
    return {
      x: Math.max(8, Math.min(window.innerWidth - width - 8, x)),
      y: Math.max(8, Math.min(window.innerHeight - height - 8, y)),
    };
  }

  private positionPill(el: HTMLElement): void {
    if (this.dragging) return;
    if (this.dragPos) {
      const { x, y } = this.clampPos(this.dragPos.x, this.dragPos.y);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
      return;
    }
    el.style.left = '50%';
    el.style.top = 'auto';
    el.style.right = 'auto';
    el.style.bottom = '20px';
    el.style.transform = 'translateX(-50%)';
  }

  private onPillPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.node) return;
    if ((event.target as Element | null)?.closest('.gv-usage-open')) return;
    this.dragging = true;
    this.dragMoved = false;
    const rect = this.node.getBoundingClientRect();
    this.dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.dragStart = { x: event.clientX, y: event.clientY };
    try {
      this.node.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    this.node.classList.add('gv-usage-dragging');
    this.pillMoveHandler = this.onPillPointerMove;
    window.addEventListener('pointermove', this.pillMoveHandler);
    window.addEventListener('pointerup', this.onPillPointerUp, { once: true });
    event.preventDefault();
  };

  private onPillPointerMove = (event: PointerEvent): void => {
    if (!this.dragging || !this.node) return;
    if (
      Math.abs(event.clientX - this.dragStart.x) + Math.abs(event.clientY - this.dragStart.y) >
      3
    ) {
      this.dragMoved = true;
    }
    const { x, y } = this.clampPos(
      event.clientX - this.dragOffset.x,
      event.clientY - this.dragOffset.y,
    );
    this.node.style.left = `${x}px`;
    this.node.style.top = `${y}px`;
    this.node.style.right = 'auto';
    this.node.style.bottom = 'auto';
    this.node.style.transform = 'none';
  };

  private onPillPointerUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.pillMoveHandler) {
      window.removeEventListener('pointermove', this.pillMoveHandler);
      this.pillMoveHandler = null;
    }
    this.node?.classList.remove('gv-usage-dragging');
    if (!this.dragMoved || !this.node) return;
    const rect = this.node.getBoundingClientRect();
    this.dragPos = { x: Math.round(rect.left), y: Math.round(rect.top) };
    void this.saveDragPos(this.dragPos);
  };

  async loadPosition(): Promise<void> {
    try {
      const result = await chrome.storage?.local?.get({ [StorageKeys.GV_CLAUDE_USAGE_POS]: null });
      const raw = result?.[StorageKeys.GV_CLAUDE_USAGE_POS];
      const pos = asRecord(raw);
      if (typeof pos?.x === 'number' && typeof pos?.y === 'number') {
        this.dragPos = { x: pos.x, y: pos.y };
      }
    } catch {
      // ignore
    }
  }

  private async saveDragPos(pos: { x: number; y: number }): Promise<void> {
    try {
      await chrome.storage?.local?.set({ [StorageKeys.GV_CLAUDE_USAGE_POS]: pos });
    } catch {
      // ignore
    }
  }

  private onResize = (): void => {
    if (this.node) this.positionPill(this.node);
  };
}
