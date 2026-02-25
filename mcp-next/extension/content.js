/**
 * WebMCP Content Script
 * Lightweight - just injects a helper to report page context to the extension.
 * The heavy lifting (network capture) is done in the DevTools panel.
 */

// Report page metadata to background when page loads
function reportPageContext() {
  try {
    chrome.runtime.sendMessage(
      { type: 'PAGE_CONTEXT', url: window.location.href, title: document.title },
      () => { void chrome.runtime.lastError; } // suppress "no listener" error
    );
  } catch (e) { /* extension may not be active */ }
}

// Run on load
reportPageContext();
document.addEventListener('DOMContentLoaded', reportPageContext);
