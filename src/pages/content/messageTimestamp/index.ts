/**
 * Message Timestamp Feature
 * Adds timestamps to AI responses in Gemini conversations
 * 
 * Feature Request: Issue #303
 * https://github.com/Nagi-ovo/gemini-voyager/issues/303
 */

const STYLE_ID = 'gemini-voyager-message-timestamp';
const STORAGE_KEY = 'gvMessageTimestampEnabled';

/**
 * Format date to MM/DD/YY h:mm TT format
 */
function formatTimestamp(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
}

/**
 * Get conversation start time from the page
 * This is a fallback when we can't determine individual message times
 */
function getConversationTime(): Date {
  // Try to find any existing timestamp on the page
  const timeElements = document.querySelectorAll('time');
  for (const el of timeElements) {
    const datetime = el.getAttribute('datetime');
    if (datetime) {
      return new Date(datetime);
    }
  }
  
  // Fallback to current time
  return new Date();
}

/**
 * Create timestamp element
 */
function createTimestampElement(): HTMLElement {
  const timestamp = document.createElement('div');
  timestamp.className = 'gv-message-timestamp';
  timestamp.textContent = formatTimestamp(getConversationTime());
  return timestamp;
}

/**
 * Add timestamp to a message element
 */
function addTimestampToMessage(messageEl: HTMLElement): void {
  // Check if already has timestamp
  if (messageEl.querySelector('.gv-message-timestamp')) {
    return;
  }
  
  const timestamp = createTimestampElement();
  
  // Find the appropriate place to insert timestamp
  // For model responses, add after the content
  const contentWrapper = messageEl.querySelector('.model-response-content, .response-content, [data-test-id="model-response"]');
  
  if (contentWrapper) {
    contentWrapper.appendChild(timestamp);
  } else {
    // Fallback: append to the message element itself
    messageEl.appendChild(timestamp);
  }
}

/**
 * Find all AI/model response messages and add timestamps
 */
function processMessages(): void {
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
        addTimestampToMessage(msg);
      }
    });
  }
}

/**
 * Inject CSS styles for timestamps
 */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gv-message-timestamp {
      font-size: 11px;
      color: var(--gv-text-secondary, #9aa0a6);
      margin-top: 8px;
      margin-bottom: 4px;
      padding-left: 4px;
      font-family: 'Google Sans', 'Roboto', sans-serif;
      opacity: 0.8;
      transition: opacity 0.2s ease;
    }
    
    .gv-message-timestamp:hover {
      opacity: 1;
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .gv-message-timestamp {
        color: var(--gv-text-secondary-dark, #9aa0a6);
      }
    }
  `;
  
  document.head.appendChild(style);
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
 * Initialize the timestamp feature
 */
export async function startMessageTimestamp(): Promise<() => void> {
  // Check if feature is enabled
  const result = await new Promise<{ [STORAGE_KEY]?: boolean }>((resolve) => {
    try {
      chrome.storage?.sync?.get({ [STORAGE_KEY]: true }, resolve);
    } catch {
      resolve({ [STORAGE_KEY]: true });
    }
  });
  
  const isEnabled = result[STORAGE_KEY] !== false;
  
  if (!isEnabled) {
    console.log('[Gemini Voyager] Message timestamps disabled');
    return () => {};
  }
  
  console.log('[Gemini Voyager] Starting message timestamps');
  
  // Inject styles
  injectStyles();
  
  // Process existing messages
  processMessages();
  
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
      processMessages();
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
  
  // Listen for storage changes to enable/disable feature
  const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'sync' && changes[STORAGE_KEY]) {
      const enabled = changes[STORAGE_KEY].newValue;
      if (enabled) {
        injectStyles();
        processMessages();
      } else {
        removeTimestamps();
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
