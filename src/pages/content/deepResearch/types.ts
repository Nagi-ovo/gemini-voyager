/**
 * Type definitions for Deep Research thinking content extraction
 */

export interface ThoughtItem {
  type: 'thought';
  header: string;
  content: string;
}

export interface BrowseChip {
  url: string;
  domain: string;
  title: string;
}

export interface BrowseChipGroup {
  type: 'browse-chips';
  chips: BrowseChip[];
}

export type ThinkingItem = ThoughtItem | BrowseChipGroup;

export interface ThinkingSection {
  items: ThinkingItem[]; // Ordered mix of thoughts and browse chips
}

export interface ThinkingContent {
  sections: ThinkingSection[];
  exportedAt: string;
  title: string;
}
