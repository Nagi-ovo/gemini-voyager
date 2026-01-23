/**
 * Example: How to use native messaging in Safari
 *
 * This file demonstrates how to communicate with the Swift native code
 * from your JavaScript extension code.
 */

// Note: Safari uses browser.runtime.sendNativeMessage() differently than Chrome
// In Safari, it's handled through the SafariWebExtensionHandler

/**
 * Send a message to native Swift code
 * @param {string} action - The action to perform
 * @param {object} payload - Data to send
 * @returns {Promise<object>} Response from native code
 */
async function sendNativeMessage(action, payload = {}) {
  return new Promise((resolve, reject) => {
    // Safari's native messaging API expects a single message object.
    browser.runtime.sendNativeMessage({ action, payload }, (response) => {
      if (browser.runtime.lastError) {
        return reject(browser.runtime.lastError);
      }
      if (response && response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'Native messaging failed'));
      }
    });
  });
}

// Example 1: Health check
async function checkNativeHealth() {
  try {
    const response = await sendNativeMessage('ping');
    console.log('Native messaging is working:', response);
    // Output: { status: "ok", message: "pong" }
  } catch (error) {
    console.error('Native messaging not available:', error);
  }
}

// Example 2: Get version info
async function getExtensionVersion() {
  try {
    const info = await sendNativeMessage('getVersion');
    console.log('Extension version:', info.version);
    console.log('Build:', info.build);
    console.log('Platform:', info.platform);
  } catch (error) {
    console.error('Failed to get version:', error);
  }
}

// Example 3: Sync storage (placeholder for future feature)
async function syncStorage(data) {
  try {
    const result = await sendNativeMessage('syncStorage', { data });
    console.log('Storage sync result:', result);
  } catch (error) {
    console.error('Storage sync failed:', error);
  }
}

// Export for use in other modules
export { sendNativeMessage, checkNativeHealth, getExtensionVersion, syncStorage };
