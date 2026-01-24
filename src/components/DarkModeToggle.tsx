import React from 'react';

import { Moon, Sun } from 'lucide-react';

import { useDarkMode } from '../hooks/useDarkMode';
import { Button } from './ui/button';

export const DarkModeToggle: React.FC = () => {
  const { isDark, toggleDarkMode } = useDarkMode();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleDarkMode}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="h-9 w-9"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="sr-only">Toggle dark mode</span>
    </Button>
  );
};
