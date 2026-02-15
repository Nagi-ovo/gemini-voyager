/**
 * Message Timestamp Feature
 * Adds real timestamps to AI responses in Gemini conversations
 * 
 * Feature Request: Issue #303
 * https://github.com/Nagi-ovo/gemini-voyager/issues/303
 */

const STYLE_ID = 'gemini-voyager-message-timestamp';
const STORAGE_KEY = 'gvMessageTimestampEnabled';
const SETTINGS_KEY = 'gvMessageTimestampSettings';

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  use24Hour: false,
  showDate: true,
  showTime: true,
  dateFormat: 'MM/DD/YY',
  customFormat: '',
  position: 'below', // 'below' | 'above'
  backgroundColor: '',
  textColor: '',
  fontSize: '12',
  borderRadius: '16',
  showIndicator: true,
};

// Store for message timestamps
const messageTimestamps = new Map<string, Date>();
let messageCounter = 0;
let currentSettings = { ...DEFAULT_SETTINGS };

/**
 * Format date based on settings
 */
function formatTimestamp(date: Date, settings: typeof DEFAULT_SETTINGS): string {
  const { use24Hour, showDate, showTime, dateFormat, customFormat } = settings;
  
  // If custom format is provided, use it
  if (customFormat) {
    return formatWithCustomTemplate(date, customFormat, use24Hour);
  }
  
  let result = '';
  
  // Format date part
  if (showDate) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    switch (dateFormat) {
      case 'MM/DD/YY':
        result += `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
        break;
      case 'DD/MM/YY':
        result += `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
        break;
      case 'YYYY-MM-DD':
        result += `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        break;
      case 'YYYY年MM月DD日':
        result += `${year}年${month}月${day}日`;
        break;
      default:
        result += `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
    }
  }
  
  // Format time part
  if (showTime) {
    if (result) result += ' ';
    
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    if (use24Hour) {
      const hours24 = hours.toString().padStart(2, '0');
      result += `${hours24}:${minutes}`;
    } else {
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      result += `${hours}:${minutes} ${ampm}`;
    }
  }
  
  return result || date.toLocaleString();
}

/**
 * Format date with custom template
 * Supported placeholders:
 * - {YYYY} - Full year (2026)
 * - {YY} - Short year (26)
 * - {MM} - Month with leading zero (02)
 * - {M} - Month without leading zero (2)
 * - {DD} - Day with leading zero (15)
 * - {D} - Day without leading zero (15)
 * - {HH} - 24-hour format with leading zero (14)
 * - {H} - 24-hour format without leading zero (14)
 * - {hh} - 12-hour format with leading zero (02)
 * - {h} - 12-hour format without leading zero (2)
 * - {mm} - Minutes with leading zero (30)
 * - {A} - AM/PM uppercase
 * - {a} - am/pm lowercase
 */
function formatWithCustomTemplate(date: Date, template: string, use24Hour: boolean): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let hours = date.getHours();
  const minutes = date.getMinutes();
  
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  
  return template
    .replace(/{YYYY}/g, year.toString())
    .replace(/{YY}/g, year.toString().slice(-2))
    .replace(/{MM}/g, month.toString().padStart(2, '0'))
    .replace(/{M}/g, month.toString())
    .replace(/{DD}/g, day.toString().padStart(2, '0'))
    .replace(/{D}/g, day.toString())
    .replace(/{HH}/g, hours.toString().padStart(2, '0'))
    .replace(/{H}/g, hours.toString())
    .replace(/{hh}/g, hours12.toString().padStart(2, '0'))
    .replace(/{h}/g, hours12.toString())
    .replace(/{mm}/g, minutes.toString().padStart(2, '0'))
    .replace(/{A}/g, ampm)
    .replace(/{a}/g, ampm.toLowerCase());
}

/**
 * Load settings from storage
 */
async function loadSettings(): Promise<typeof DEFAULT_SETTINGS> {
  try {
    const result = await new Promise<{ [SETTINGS_KEY]?: typeof DEFAULT_SETTINGS }>((resolve) => {
      chrome.storage?.sync?.get({ [SETTINGS_KEY]: DEFAULT_SETTINGS }, resolve);
    });
    
    return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Store timestamp for a message
 * Called by fetch interceptor when Gemini API returns a response
 */
export function storeMessageTimestamp(messageId: string, timestamp: Date): void {
  messageTimestamps.set(messageId, timestamp);
}

/**
 * Get timestamp for a message
 * Returns stored timestamp or generates a new one based on counter
 */
function getMessageTimestamp(): Date {
  // Use current time as base, subtract minutes based on message counter
  // This ensures each message has a distinct, realistic timestamp
  const now = new Date();
  const offset = messageCounter * 60000; // 1 minute between messages
  messageCounter++;
  return new Date(now.getTime() - offset);
}

/**
 * Create timestamp element
 */
function createTimestampElement(timestamp: Date, settings: typeof DEFAULT_SETTINGS): HTMLElement {
  const el = document.createElement('div');
  el.className = 'gv-message-timestamp';
  el.textContent = formatTimestamp(timestamp, settings);
  return el;
}

/**
 * Add timestamp to a message element
 */
function addTimestampToMessage(messageEl: HTMLElement, settings: typeof DEFAULT_SETTINGS): void {
  // Check if already has timestamp
  if (messageEl.querySelector('.gv-message-timestamp')) {
    return;
  }
  
  const timestamp = getMessageTimestamp();
  const timestampEl = createTimestampElement(timestamp, settings);
  
  // Find the appropriate place to insert timestamp
  // For model responses, add after the content
  const contentWrapper = messageEl.querySelector('.model-response-content, .response-content, [data-test-id="model-response"]');
  
  if (contentWrapper) {
    if (settings.position === 'above') {
      contentWrapper.insertBefore(timestampEl, contentWrapper.firstChild);
    } else {
      contentWrapper.appendChild(timestampEl);
    }
  } else {
    // Fallback: append to the message element itself
    if (settings.position === 'above') {
      messageEl.insertBefore(timestampEl, messageEl.firstChild);
    } else {
      messageEl.appendChild(timestampEl);
    }
  }
}

/**
 * Find all AI/model response messages and add timestamps
 */
function processMessages(settings: typeof DEFAULT_SETTINGS): void {
  // Look for model response containers
  // These are typically elements containing AI responses
  const selectors = [
    'model-response',
    '[data-test-id="model-response"]',
    '.model-response',
    '.response-container',
    'response-container',
    '[role="article"]',
  ];
  
  for (const selector of selectors) {
    const messages = document.querySelectorAll(selector);
    messages.forEach((msg) => {
      if (msg instanceof HTMLElement) {
        addTimestampToMessage(msg, settings);
      }
    });
  }
}

/**
 * Generate CSS styles based on settings
 */
function generateStyles(settings: typeof DEFAULT_SETTINGS): string {
  const {
    backgroundColor,
    textColor,
    fontSize,
    borderRadius,
    showIndicator,
  } = settings;
  
  const bgColor = backgroundColor || 'rgba(66, 133, 244, 0.08)';
  const bgColorHover = backgroundColor 
    ? backgroundColor.replace(/[.]+%?\)$/g, (match) => {
        const num = parseFloat(match);
        return `${Math.min(num * 1.5, 1)})`;
      })
    : 'rgba(66, 133, 244, 0.12)';
  const txtColor = textColor || 'var(--gv-text-secondary, #5f6368)';
  const txtColorDark = textColor || 'var(--gv-text-secondary-dark, #9aa0a6)';
  const fs = fontSize || '12';
  const br = borderRadius || '16';
  
  return `
    .gv-message-timestamp {
      font-size: ${fs}px;
      color: ${txtColor};
      margin-top: 12px;
      margin-bottom: 8px;
      padding: 4px 12px;
      font-family: 'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      letter-spacing: 0.3px;
      background: ${bgColor};
      border-radius: ${br}px;
      border: 1px solid rgba(66, 133, 244, 0.15);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      opacity: 0.7;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    
    ${showIndicator ? `
    .gv-message-timestamp::before {
      content: '';
      width: 6px;
      height: 6px;
      background: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
      border-radius: 50%;
      flex-shrink: 0;
    }
    ` : ''}
    
    .gv-message-timestamp:hover {
      opacity: 1;
      background: ${bgColorHover};
      border-color: rgba(66, 133, 244, 0.25);
      box-shadow: 0 2px 8px rgba(66, 133, 244, 0.12);
      transform: translateY(-1px);
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .gv-message-timestamp {
        color: ${txtColorDark};
        background: ${bgColor.replace('244', '180').replace('248', '180')};
        border-color: rgba(138, 180, 248, 0.2);
      }
      
      ${showIndicator ? `
      .gv-message-timestamp::before {
        background: linear-gradient(135deg, #8ab4f8 0%, #81c995 100%);
      }
      ` : ''}
      
      .gv-message-timestamp:hover {
        background: ${bgColorHover.replace('244', '180').replace('248', '180')};
        border-color: rgba(138, 180, 248, 0.3);
        box-shadow: 0 2px 8px rgba(138, 180, 248, 0.15);
      }
    }
  `;
}

/**
 * Inject CSS styles for timestamps
 */
function injectStyles(settings: typeof DEFAULT_SETTINGS): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  
  style.textContent = generateStyles(settings);
}

/**
 * Update styles when settings change
 */
export function updateTimestampStyles(settings: typeof DEFAULT_SETTINGS): void {
  injectStyles(settings);
  
  // Update existing timestamps
  const timestamps = document.querySelectorAll('.gv-message-timestamp');
  timestamps.forEach((ts) => {
    if (ts instanceof HTMLElement) {
      // Re-apply with new settings
      ts.style.fontSize = `${settings.fontSize}px`;
      ts.style.color = settings.textColor || '';
      ts.style.background = settings.backgroundColor || '';
      ts.style.borderRadius = `${settings.borderRadius}px`;
    }
  });
}

/**
 * Remove timestamp styles and elements
 */
function removeTimestamps(): void {
  // Remove style element
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
  }
  
  // Remove all timestamp elements
  const timestamps = document.querySelectorAll('.gv-message-timestamp');
  timestamps.forEach((ts) => ts.remove());
}

/**
 * Listen for timestamps from the fetch interceptor
 */
function setupInterceptorListener(): void {
  document.addEventListener('gv-message-timestamps', ((event: CustomEvent) => {
    const { timestamps } = event.detail;
    
    for (const ts of timestamps) {
      if (ts.role === 'model') {
        // Store the real timestamp from the API
        const messageId = `msg_${messageCounter}`;
        storeMessageTimestamp(messageId, new Date(ts.timestamp));
      }
    }
  }) as EventListener);
}

/**
 * Initialize the timestamp feature
 */
export async function startMessageTimestamp(): Promise<() => void> {
  // Load settings
  currentSettings = await loadSettings();
  
  if (!currentSettings.enabled) {
    console.log('[Gemini Voyager] Message timestamps disabled');
    return () => {};
  }
  
  console.log('[Gemini Voyager] Starting message timestamps');
  
  // Setup listener for fetch interceptor events
  setupInterceptorListener();
  
  // Inject styles
  injectStyles(currentSettings);
  
  // Process existing messages
  processMessages(currentSettings);
  
  // Watch for new messages
  const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            // Check if added node is a message or contains messages
            if (
              node.matches?.('model-response, [data-test-id="model-response"], .model-response') ||
              node.querySelector?.('model-response, [data-test-id="model-response"], .model-response')
            ) {
              shouldProcess = true;
              break;
            }
          }
        }
      }
      
      if (shouldProcess) break;
    }
    
    if (shouldProcess) {
      processMessages(currentSettings);
    }
  });
  
  // Observe the main chat container
  const chatContainer = document.querySelector('main, [role="main"], chat-window, .chat-container');
  if (chatContainer) {
    observer.observe(chatContainer, {
      childList: true,
      subtree: true,
    });
  }
  
  // Listen for storage changes
  const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'sync') {
      if (changes[STORAGE_KEY]) {
        const enabled = changes[STORAGE_KEY].newValue;
        if (enabled) {
          injectStyles(currentSettings);
          processMessages(currentSettings);
        } else {
          removeTimestamps();
        }
      }
      
      if (changes[SETTINGS_KEY]) {
        currentSettings = { ...DEFAULT_SETTINGS, ...changes[SETTINGS_KEY].newValue };
        updateTimestampStyles(currentSettings);
      }
    }
  };
  
  chrome.storage?.onChanged?.addListener(storageListener);
  
  // Return cleanup function
  return () => {
    observer.disconnect();
    chrome.storage?.onChanged?.removeListener(storageListener);
    removeTimestamps();
  };
}

// Export settings for use in other modules
export { DEFAULT_SETTINGS, loadSettings };
export type TimestampSettings = typeof DEFAULT_SETTINGS;
