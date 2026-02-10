export interface DialogNode {
  url: string;
  className: string;
  text: string;
  images?: string[];
  is_ai_likely: boolean;
  is_user_likely: boolean;
  rect: {
    top: number;
    left: number;
    width: number;
  };
}

export interface SyncResponse {
  status: 'success' | 'error';
  data?: unknown;
  message?: string;
}

export interface AdapterConfig {
  user_selector?: string[];
  ai_selector?: string[];
  selectors?: string[];
  aiMarkers?: string[];
  userMarkers?: string[];
}
