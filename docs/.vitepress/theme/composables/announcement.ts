import { ref } from 'vue';

// Toggle ENABLED to show or hide the announcement globally
// (both the auto-popup on first visit and the "重要通知" nav entry).
// When re-enabling for a NEW announcement, also bump STORAGE_KEY's date
// so users who dismissed the previous one see the new one.
export const ENABLED = true;
export const STORAGE_KEY = 'gv-announce-2026-06-16-gemini-sidebar';

const visible = ref(false);

export function useAnnouncement() {
  function hasDismissed(): boolean {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  }

  function open() {
    visible.value = true;
  }

  function dismiss() {
    visible.value = false;
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* private mode / disabled storage — ignore */
    }
  }

  return { visible, open, dismiss, hasDismissed };
}
