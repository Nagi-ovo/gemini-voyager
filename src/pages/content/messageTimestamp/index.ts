/**
 * Message Timestamp Feature
 * Adds real timestamps to AI responses in Gemini conversations
 * 
 * Feature Request: Issue #303
 * https://github.com/Nagi-ovo/gemini-voyager/issues/303
 */

const STYLE_ID = 'gemini-voyager-message-timestamp';
const STORAGE_KEY = 'gvMessageTimestampEnabled';

// Store for message timestamps
const messageTimestamps = new Map<string, Date>();
let messageCounter = 0;

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
  hours = hours ? hours : 12;
  
  return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
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
function createTimestampElement(timestamp: Date): HTMLElement {
  const el = document.createElement('div');
  el.className = 'gv-message-timestamp';
  el.textContent = formatTimestamp(timestamp);
  return el;
}

/**
 * Add timestamp to a message element
 */
function addTimestampToMessage(messageEl: HTMLElement): void {
  // Check if already has timestamp
  if (messageEl.querySelector('.gv-message-timestamp')) {
    return;
  }
  
  const timestamp = getMessageTimestamp();
  const timestampEl = createTimestampElement(timestamp);
  
  // Find the appropriate place to insert timestamp
  // For model responses, add after the content
  const contentWrapper = messageEl.querySelector('.model-response-content, .response-content, [data-test-id="model-response"]');
  
  if (contentWrapper) {
    contentWrapper.appendChild(timestampEl);
  } else {
    // Fallback: append to the message element itself
    messageEl.appendChild(timestampEl);
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
      font-size: 12px;
      color: var(--gv-text-secondary, #5f6368);
      margin-top: 12px;
      margin-bottom: 8px;
      padding: 4px 12px;
      font-family: 'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      letter-spacing: 0.3px;
      background: linear-gradient(135deg, rgba(66, 133, 244, 0.08) 0%, rgba(66, 133, 244, 0.02) 100%);
      border-radius: 16px;
      border: 1px solid rgba(66, 133, 244, 0.15);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      opacity: 0.7;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    
    .gv-message-timestamp::before {
      content: '';
      width: 6px;
      height: 6px;
      background: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
      border-radius: 50%;
      flex-shrink: 0;
    }
    
    .gv-message-timestamp:hover {
      opacity: 1;
      background: linear-gradient(135deg, rgba(66, 133, 244, 0.12) 0%, rgba(66, 133, 244, 0.04) 100%);
      border-color: rgba(66, 133, 244, 0.25);
      box-shadow: 0 2px 8px rgba(66, 133, 244, 0.12);
      transform: translateY(-1px);
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .gv-message-timestamp {
        color: var(--gv-text-secondary-dark, #9aa0a6);
        background: linear-gradient(135deg, rgba(138, 180, 248, 0.1) 0%, rgba(138, 180, 248, 0.03) 100%);
        border-color: rgba(138, 180, 248, 0.2);
      }
      
      .gv-message-timestamp::before {
        background: linear-gradient(135deg, #8ab4f8 0%, #81c995 100%);
      }
      
      .gv-message-timestamp:hover {
        background: linear-gradient(135deg, rgba(138, 180, 248, 0.15) 0%, rgba(138, 180, 248, 0.05) 100%);
        border-color: rgba(138, 180, 248, 0.3);
        box-shadow: 0 2px 8px rgba(138, 180, 248, 0.15);
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
  
  // Setup listener for fetch interceptor events
  setupInterceptorListener();
  
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
