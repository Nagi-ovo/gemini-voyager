export type DotElement = HTMLButtonElement & {
  dataset: DOMStringMap & {
    targetTurnId?: string;
    markerIndex?: string;
  };
};

export type MarkerLevel = 1 | 2 | 3;
