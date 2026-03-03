import { StorageKeys } from '@/core/types/common';

const STYLES_ID = 'gemini-voyager-upsell-hider-styles';

const selectors = [
  'button.gds-upsell-button', // Sidebar upgrade button
  '[data-test-id="bard-g1-dynamic-upsell-menu-button"]', // Sidebar upgrade button (robust)
  '.upgrade-container.g1-upsell-container', // Model menu upgrade block
  '.upgrade-button-container', // Model menu upgrade button row
];

const styles = `
${selectors.join(',\n')} {
  display: none !important;
}
`;

function injectStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const styleElement = document.createElement('style');
  styleElement.id = STYLES_ID;
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}

function removeStyles() {
  const styleElement = document.getElementById(STYLES_ID);
  styleElement?.remove();
}

export const startUpsellHider = async () => {
  try {
    const res = await chrome.storage?.sync?.get({ [StorageKeys.UPSELL_HIDER_ENABLED]: true });
    const enabled = res?.[StorageKeys.UPSELL_HIDER_ENABLED] === true;

    if (enabled) {
      injectStyles();
    }
  } catch {
    // Extension context may have been invalidated
  }

  try {
    chrome.storage?.onChanged?.addListener((changes) => {
      if (changes[StorageKeys.UPSELL_HIDER_ENABLED]) {
        if (changes[StorageKeys.UPSELL_HIDER_ENABLED].newValue === true) {
          injectStyles();
        } else {
          removeStyles();
        }
      }
    });
  } catch {
    // Extension context may have been invalidated
  }
};
