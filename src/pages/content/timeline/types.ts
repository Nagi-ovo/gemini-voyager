export type DotElement = HTMLButtonElement & { 
    dataset: DOMStringMap & { 
        targetTurnId?: string; markerIndex?: string 
    } 
};

export type MarkerLevel = 1 | 2 | 3 | 4;

export interface MarkerLevelsData {
  [conversationId: string]: {
    [turnId: string]: MarkerLevel;
  };
}

export interface CollapsedMarkersData {
  [conversationId: string]: string[];
}
