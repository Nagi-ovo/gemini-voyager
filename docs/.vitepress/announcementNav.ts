import { ENABLED as ANNOUNCEMENT_ENABLED } from './theme/composables/announcement';

// Inject a "Notice" nav entry next to the main menu items when an
// announcement is active. The hash link is intercepted by AnnouncementModal,
// which opens the modal and clears the hash. Toggle ENABLED in
// theme/composables/announcement.ts to remove the entry from every locale.
export function announcementNav(text: string) {
  return ANNOUNCEMENT_ENABLED ? [{ text, link: '#announcement' }] : [];
}
