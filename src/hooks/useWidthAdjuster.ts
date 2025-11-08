import { useRef, useEffect, useState } from 'react';

interface UseWidthAdjusterOptions {
  storageKey: string;
  defaultValue: number;
  debounceMs?: number;
  onApply: (value: number) => void;
}

/**
 * Custom hook for managing width adjustment with debounced storage writes
 * Follows DRY principle by extracting common width adjustment logic
 */
export function useWidthAdjuster({
  storageKey,
  defaultValue,
  debounceMs = 300,
  onApply,
}: UseWidthAdjusterOptions) {
  const [width, setWidth] = useState<number>(defaultValue);
  const debounceTimer = useRef<number | null>(null);
  const pendingWidth = useRef<number | null>(null);

  // Load initial width from storage
  useEffect(() => {
    try {
      chrome.storage?.sync?.get({ [storageKey]: defaultValue }, (res) => {
        const storedWidth = res?.[storageKey];
        if (typeof storedWidth === 'number') {
          setWidth(storedWidth);
        }
      });
    } catch {}
  }, [storageKey, defaultValue]);

  // Cleanup and save pending changes on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
      if (pendingWidth.current !== null) {
        onApply(pendingWidth.current);
      }
    };
  }, [onApply]);

  const handleChange = (newWidth: number) => {
    setWidth(newWidth);
    pendingWidth.current = newWidth;

    // Debounce the storage write to avoid quota limits
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = window.setTimeout(() => {
      onApply(newWidth);
      pendingWidth.current = null;
      debounceTimer.current = null;
    }, debounceMs);
  };

  const handleChangeComplete = () => {
    // Save immediately when user releases the slider
    if (pendingWidth.current !== null) {
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      onApply(pendingWidth.current);
      pendingWidth.current = null;
    }
  };

  return {
    width,
    handleChange,
    handleChangeComplete,
  };
}
