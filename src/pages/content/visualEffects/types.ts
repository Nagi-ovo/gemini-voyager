export type VisualEffectKind = 'snow' | 'sakura' | 'rain';

export interface VisualEffectRenderer {
  enable(): void;
  drain(): void;
  destroy(): void;
}
