import { useEffect, useRef, useState } from 'react';

interface UseWidthAdjusterOptions {
  storageKey: string;
  defaultValue: number;
  onApply: (value: number) => void;
  /**
   * Optional normalization hook (e.g., migrate legacy px to %)
   */
  normalize?: (value: number) => number;
}

/**
 * Custom hook for managing width adjustment with debounced storage writes
 * Follows DRY principle by extracting common width adjustment logic
 */
export function useWidthAdjuster({
  storageKey,
  defaultValue,
  onApply,
  normalize,
}: UseWidthAdjusterOptions) {
  const initial = normalize ? normalize(defaultValue) : defaultValue;
  const [width, setWidth] = useState<number>(initial);
  const pendingWidth = useRef<number | null>(null);
  const hydrated = useRef(false);
  const isInteracting = useRef(false);

  // Load initial width from storage
  useEffect(() => {
    try {
      chrome.storage?.sync?.get({ [storageKey]: defaultValue }, (res) => {
        const storedWidth = res?.[storageKey];
        if (typeof storedWidth === 'number') {
          const normalized = normalize ? normalize(storedWidth) : storedWidth;
          if (Number.isFinite(normalized)) {
            // Avoid overriding user drag in progress
            if (!isInteracting.current) {
              setWidth(normalized);
            }
          }
        }
        hydrated.current = true;
      });
    } catch {}
  }, [storageKey, defaultValue, normalize]);

  // Cleanup and save pending changes on unmount
  useEffect(() => {
    return () => {
      if (pendingWidth.current !== null) {
        onApply(pendingWidth.current);
      }
    };
  }, [onApply]);

  const handleChange = (newWidth: number) => {
    isInteracting.current = true;
    setWidth(newWidth);
    pendingWidth.current = newWidth;
  };

  const handleChangeComplete = () => {
    // Save once when user releases the slider
    if (pendingWidth.current !== null) {
      onApply(pendingWidth.current);
      pendingWidth.current = null;
    }
    // Allow future external sync after interaction ends
    isInteracting.current = false;
  };

  return {
    width,
    handleChange,
    handleChangeComplete,
  };
}
