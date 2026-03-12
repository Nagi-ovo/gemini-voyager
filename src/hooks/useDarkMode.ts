import React, { useCallback, useEffect, useState } from 'react';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    // Check saved preference first
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return saved === 'true';
    }
    // Fall back to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Apply dark class to document
    document.documentElement.classList.toggle('dark', isDark);

    // Save preference
    localStorage.setItem('darkMode', String(isDark));
  }, [isDark]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't set a preference
      const saved = localStorage.getItem('darkMode');
      if (saved === null) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = useCallback(
    (event?: React.MouseEvent) => {
      const newIsDark = !isDark;

      const applyTheme = () => {
        document.documentElement.classList.toggle('dark', newIsDark);
        localStorage.setItem('darkMode', String(newIsDark));
        setIsDark(newIsDark);
      };

      // Skip animation if no event, no View Transition API, or user prefers reduced motion
      const startViewTransition = (document as { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }).startViewTransition;
      if (
        !event ||
        !startViewTransition ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        applyTheme();
        return;
      }

      const x = event.clientX;
      const y = event.clientY;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );

      const transition = startViewTransition.call(document, applyTheme);

      transition.ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 500,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      });
    },
    [isDark],
  );

  return { isDark, toggleDarkMode };
}
