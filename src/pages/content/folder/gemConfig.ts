/**
 * Gemini Gem Configuration
 *
 * This file defines the mapping between Gem IDs and their visual representation.
 * Add new Gems here to support them in the folder system.
 *
 * Contributing:
 * - To add a new Gem, simply add a new entry to the GEM_CONFIG array
 * - The icon should be a valid Google Material Symbols icon name
 * - The id should match the URL slug used by Gemini (e.g., /gem/{id}/...)
 */

export interface GemConfig {
  /** The Gem ID as it appears in URLs (e.g., 'learning-coach') */
  id: string;

  /** The display name of the Gem */
  name: string;

  /** The Google Material Symbols icon name */
  icon: string;

  /** Alternative icon names that might appear in the DOM */
  aliases?: string[];
}

/**
 * Official Gemini Gems configuration
 *
 * Note: This list includes all known Gems as of the implementation date.
 * New Gems released by Google should be added here.
 */
export const GEM_CONFIG: GemConfig[] = [
  {
    id: 'learning-coach',
    name: 'Learning Coach',
    icon: 'auto_stories',
  },
  {
    id: 'brainstormer',
    name: 'Brainstorm Buddy',
    icon: 'lightbulb',
  },
  {
    id: 'career-guide',
    name: 'Career Guide',
    icon: 'work',
  },
  {
    id: 'coding-partner',
    name: 'Coding Partner',
    icon: 'code',
  },
  {
    id: 'writing-editor',
    name: 'Writing Editor',
    icon: 'edit_note',
  },
  {
    id: 'storybook',
    name: 'Storybook',
    icon: 'menu_book',
  },
  {
    id: 'chess-champ',
    name: 'Chess Champ',
    icon: 'chess_pawn',
  },
  {
    id: 'productivity-helper',
    name: 'Productivity Helper',
    icon: 'check_circle',
  },
  {
    id: 'cricket',
    name: 'Cricket',
    icon: 'sports_cricket',
  },
];

/**
 * Default icon for unknown or custom Gems
 */
export const DEFAULT_GEM_ICON = 'stars';

/**
 * Default icon for regular (non-Gem) conversations
 */
export const DEFAULT_CONVERSATION_ICON = 'chat_bubble';

/**
 * Get Gem configuration by ID
 */
export function getGemConfig(gemId: string): GemConfig | undefined {
  return GEM_CONFIG.find((gem) => gem.id === gemId);
}

/**
 * Get Gem ID from icon name (for reverse lookup)
 */
export function getGemIdFromIcon(iconName: string): string | undefined {
  const gem = GEM_CONFIG.find((gem) => gem.icon === iconName);
  return gem?.id;
}

/**
 * Get icon name for a Gem ID
 */
export function getGemIcon(gemId: string): string {
  const config = getGemConfig(gemId);
  return config?.icon || DEFAULT_GEM_ICON;
}

/**
 * Check if a Gem ID is known/configured
 */
export function isKnownGem(gemId: string): boolean {
  return GEM_CONFIG.some((gem) => gem.id === gemId);
}

/**
 * Get all known Gem icons (useful for DOM searching)
 */
export function getAllGemIcons(): string[] {
  return GEM_CONFIG.map((gem) => gem.icon);
}

/**
 * Create a mapping object from icon to Gem ID
 */
export function createIconToGemMap(): Record<string, string> {
  const map: Record<string, string> = {};
  GEM_CONFIG.forEach((gem) => {
    map[gem.icon] = gem.id;
  });
  return map;
}
