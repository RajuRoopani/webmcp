// Register DevTools panel
chrome.devtools.panels.create(
  'WebMCP',
  null,
  'panel.html',
  panel => {
    console.log('[WebMCP] DevTools panel registered');
  }
);
