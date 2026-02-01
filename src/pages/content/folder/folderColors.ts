/**
 * Folder Color Configuration
 *
 * Provides semantic color options for folder organization.
 * Colors are designed to indicate priority/urgency levels.
 *
 * Design Principles:
 * - Limited to 8 colors to avoid choice paralysis
 * - Each color has semantic meaning for priority/urgency
 * - Supports both light and dark modes
 * - Colors are WCAG AA compliant for accessibility
 */

export interface FolderColorConfig {
  /** Unique identifier for the color */
  id: string;

  /** Display name for the color (i18n key) */
  nameKey: string;

  /** Color value for light mode */
  lightColor: string;

  /** Color value for dark mode */
  darkColor: string;

  /** Semantic meaning/priority level */
  priority: 'critical' | 'high' | 'medium' | 'low' | 'neutral';
}

/**
 * Available folder colors with semantic meanings:
 * - Red: Critical/Urgent
 * - Orange: High Priority/Warning
 * - Yellow: Needs Attention
 * - Green: Completed/Safe
 * - Blue: Information/Reference
 * - Purple: Creative/Ideas
 * - Pink: Personal/Special
 * - Gray: Default/Archived
 */
export const FOLDER_COLORS: FolderColorConfig[] = [
  {
    id: 'default',
    nameKey: 'folder_color_default',
    lightColor: '#6b7280', // gray-500
    darkColor: '#9ca3af', // gray-400
    priority: 'neutral',
  },
  {
    id: 'red',
    nameKey: 'folder_color_red',
    lightColor: '#ef4444', // red-500
    darkColor: '#f87171', // red-400
    priority: 'critical',
  },
  {
    id: 'orange',
    nameKey: 'folder_color_orange',
    lightColor: '#f97316', // orange-500
    darkColor: '#fb923c', // orange-400
    priority: 'high',
  },
  {
    id: 'yellow',
    nameKey: 'folder_color_yellow',
    lightColor: '#eab308', // yellow-500
    darkColor: '#fbbf24', // yellow-400
    priority: 'high',
  },
  {
    id: 'green',
    nameKey: 'folder_color_green',
    lightColor: '#22c55e', // green-500
    darkColor: '#4ade80', // green-400
    priority: 'medium',
  },
  {
    id: 'blue',
    nameKey: 'folder_color_blue',
    lightColor: '#3b82f6', // blue-500
    darkColor: '#60a5fa', // blue-400
    priority: 'medium',
  },
  {
    id: 'purple',
    nameKey: 'folder_color_purple',
    lightColor: '#a855f7', // purple-500
    darkColor: '#c084fc', // purple-400
    priority: 'low',
  },
];

/**
 * Get color value for a given color ID based on theme
 * @param colorId Color identifier (e.g., 'red', 'blue') or hex code
 * @param isDarkMode Whether dark mode is active
 * @returns Hex color string
 */
export function getFolderColor(colorId: string | undefined, isDarkMode: boolean): string {
  if (!colorId || colorId === 'default') {
    return isDarkMode ? '#9ca3af' : '#6b7280';
  }

  // Support custom hex colors
  if (colorId.startsWith('#')) {
    return colorId;
  }

  // Legacy support for 'pink'
  if (colorId === 'pink') {
    return isDarkMode ? '#f472b6' : '#ec4899';
  }

  const config = FOLDER_COLORS.find((c) => c.id === colorId);
  if (!config) {
    // Fallback to default if color not found
    return isDarkMode ? '#9ca3af' : '#6b7280';
  }

  return isDarkMode ? config.darkColor : config.lightColor;
}

/**
 * Get color configuration by ID
 * @param colorId Color identifier
 * @returns Color configuration or undefined if not found
 */
export function getFolderColorConfig(colorId: string): FolderColorConfig | undefined {
  return FOLDER_COLORS.find((c) => c.id === colorId);
}

/**
 * Check if dark mode is currently active
 * @returns true if dark mode is active
 */
export function isDarkMode(): boolean {
  // Check multiple sources for dark mode
  // 1. Document root class
  if (document.documentElement.classList.contains('dark-mode')) {
    return true;
  }

  // 2. Check data attribute
  if (document.documentElement.getAttribute('data-theme') === 'dark') {
    return true;
  }

  // 3. Check prefers-color-scheme
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return true;
  }

  return false;
}
