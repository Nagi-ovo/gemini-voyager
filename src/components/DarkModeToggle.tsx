import React from 'react';

import { Monitor, Moon, Sun } from 'lucide-react';

import { useLanguage } from '../contexts/LanguageContext';
import { getNextThemeMode, useDarkMode } from '../hooks/useDarkMode';
import { Button } from './ui/button';

export const DarkModeToggle: React.FC = () => {
  const { themeMode, toggleDarkMode } = useDarkMode();
  const { t } = useLanguage();

  const nextMode = getNextThemeMode(themeMode);

  const getTooltip = () => {
    if (nextMode === 'auto') return t('pm_theme_auto');
    if (nextMode === 'dark') return t('pm_theme_dark');
    return t('pm_theme_light');
  };

  const tooltip = getTooltip();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => toggleDarkMode(e)}
      title={tooltip}
      aria-label={tooltip}
      className="h-9 w-9"
    >
      {themeMode === 'auto' ? (
        <Monitor className="h-4 w-4" />
      ) : themeMode === 'dark' ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
      <span className="sr-only">{tooltip}</span>
    </Button>
  );
};
