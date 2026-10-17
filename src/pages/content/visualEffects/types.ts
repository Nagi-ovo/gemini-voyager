export type VisualEffectKind = 'snow' | 'sakura' | 'rain';

export interface VisualEffectRenderer {
  enable(): void;
  drain(): void;
  destroy(): void;
}

/**
 * Above host content but below every Voyager layer: the lowest of those
 * (usage pill, ChatGPT handoff button) sits at 2147483000, and dialogs, toasts
 * and coachmarks go up to 2147483647. Effects are appended last, so sharing a
 * value with an overlay would paint particles over it.
 */
export const EFFECT_Z_INDEX = 2147482000;

export const EFFECT_CANVAS_STYLE = `position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:${EFFECT_Z_INDEX};`;
