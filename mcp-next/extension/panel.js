/**
 * WebMCP DevTools Panel
 * - Captures network requests via chrome.devtools.network API
 * - Forwards them to background.js for storage
 * - Displays captured endpoints with schema info
 */

let allEndpoints = [];
let selectedEndpoint = null;
let currentTab = 'schema';

// ─── Network capture ──────────────────────────────────────────────────────────

chrome.devtools.network.onRequestFinished.addListener(request => {
  const { request: req, response } = request;
  const url = req.url;
  const method = req.method;

  // Only capture likely API calls
  const contentType = response.headers?.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
  if (!contentType.includes('json') && !contentType.includes('graphql') &&
      !url.includes('/api/') && !url.includes('/v1/') && !url.includes('/v2/') &&
      !url.includes('graphql')) {
    return;
  }

  // Skip status >= 400 (errors)
  if (response.status >= 400 && response.status !== 401) return;

  // Get response body
  request.getContent((body) => {
    if (!isContextValid()) { handleContextInvalidated(); return; }

    const reqHeaders = {};
    for (const h of req.headers || []) reqHeaders[h.name] = h.value;

    const resHeaders = {};
    for (const h of response.headers || []) resHeaders[h.name.toLowerCase()] = h.value;

    try {
      chrome.runtime.sendMessage({
        type: 'CAPTURE_REQUEST',
        request: {
          method,
          url,
          requestHeaders: reqHeaders,
          responseHeaders: resHeaders,
          requestBody: req.postData?.text || null,
          responseBody: body || '',
          status: response.status,
          contentType,
        },
      }, () => { void chrome.runtime.lastError; });
    } catch (e) {
      if (String(e).includes('context invalidated') || String(e).includes('Extension context')) {
        handleContextInvalidated(); return;
      }
    }

    // Refresh display with slight delay
    setTimeout(refreshEndpoints, 300);
  });
});

// ─── Render endpoints ─────────────────────────────────────────────────────────

function renderEndpoints(endpoints) {
  const filterText = document.getElementById('filter-input').value.toLowerCase();
  const methodFilter = document.getElementById('method-filter').value;

  const filtered = endpoints.filter(ep => {
    if (methodFilter && ep.method !== methodFilter) return false;
    if (filterText) {
      return ep.host?.includes(filterText) ||
        ep.path?.includes(filterText) ||
        ep.method?.includes(filterText.toUpperCase());
    }
    return true;
  });

  const list = document.getElementById('endpoint-list');
  const empty = document.getElementById('empty-state');
  const badge = document.getElementById('ep-count');

  badge.textContent = endpoints.length;

  if (filtered.length === 0) {
    empty.style.display = 'flex';
    // Remove existing items
    list.querySelectorAll('.endpoint-item').forEach(el => el.remove());
    return;
  }

  empty.style.display = 'none';

  // Build a map of existing items
  const existingKeys = new Set();
  list.querySelectorAll('.endpoint-item').forEach(el => existingKeys.add(el.dataset.key));

  // Remove items no longer in filtered list
  list.querySelectorAll('.endpoint-item').forEach(el => {
    if (!filtered.find(ep => ep.key === el.dataset.key)) el.remove();
  });

  // Add/update items
  filtered.forEach((ep, i) => {
    let item = list.querySelector(`[data-key="${CSS.escape(ep.key)}"]`);
    if (!item) {
      item = document.createElement('div');
      item.className = 'endpoint-item';
      item.dataset.key = ep.key;
      item.addEventListener('click', () => selectEndpoint(ep));
      list.appendChild(item);
    }
    if (selectedEndpoint?.key === ep.key) item.classList.add('selected');

    item.innerHTML = `
      <span class="method-badge method-${ep.method}">${ep.method}</span>
      <div class="ep-info">
        <div class="ep-host">${ep.host || ''}</div>
        <div class="ep-path">${ep.path || ep.baseUrl}</div>
        <div class="ep-meta">
          ${Object.keys(ep.queryParams || {}).length} query params ·
          ${Object.keys(ep.bodyParams || {}).length} body params ·
          ${ep.status || '?'}
        </div>
      </div>
      <span class="ep-hit">${ep.hitCount}×</span>
    `;
  });
}

function selectEndpoint(ep) {
  selectedEndpoint = ep;
  document.querySelectorAll('.endpoint-item').forEach(el => el.classList.remove('selected'));
  const item = document.querySelector(`[data-key="${CSS.escape(ep.key)}"]`);
  if (item) item.classList.add('selected');

  document.getElementById('detail-panel').classList.add('open');
  showDetailTab(currentTab);
}

function showDetailTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

  const content = document.getElementById('detail-content');
  if (!selectedEndpoint) return;
  const ep = selectedEndpoint;

  if (tab === 'schema') {
    const schema = {
      name: ep.toolName,
      description: `${ep.method} ${ep.path} on ${ep.host}`,
      input_schema: {
        type: 'object',
        properties: {
          ...Object.fromEntries(
            Object.entries(ep.queryParams || {}).map(([k, v]) => [k, { type: v.type, description: `Query param (e.g. ${JSON.stringify(v.example)})` }])
          ),
          ...Object.fromEntries(
            Object.entries(ep.bodyParams || {}).map(([k, v]) => [k, { type: v.type, description: `Body field (e.g. ${JSON.stringify(v.example).slice(0, 40)})` }])
          ),
        },
      },
    };
    content.textContent = JSON.stringify(schema, null, 2);
  } else if (tab === 'headers') {
    content.textContent = JSON.stringify(ep.replayHeaders || {}, null, 2);
  } else if (tab === 'response') {
    content.textContent = ep.sampleResponse || '(no sample captured)';
  }
}

// ─── Context invalidation guard ────────────────────────────────────────────────

let _contextValid = true;

function isContextValid() {
  try {
    return !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}

function handleContextInvalidated() {
  if (_contextValid) {
    _contextValid = false;
    document.body.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0f0f13;color:#6b7280;font-size:13px;text-align:center;gap:12px;';
    document.body.innerHTML = '<div style="font-size:28px">🔄</div><div style="color:#e2e8f0;font-weight:600">Extension Reloaded</div><div>Close and reopen DevTools to reconnect.</div>';
  }
}

// ─── Refresh loop ──────────────────────────────────────────────────────────────

async function refreshEndpoints() {
  if (!isContextValid()) { handleContextInvalidated(); return; }
  try {
    chrome.runtime.sendMessage({ type: 'GET_ENDPOINTS' }, response => {
      if (chrome.runtime.lastError) return; // service worker waking up, retry on next tick
      if (response?.endpoints) {
        allEndpoints = response.endpoints.sort((a, b) => b.lastSeen - a.lastSeen);
        renderEndpoints(allEndpoints);
      }
    });
  } catch (e) {
    if (String(e).includes('context invalidated') || String(e).includes('Extension context')) {
      handleContextInvalidated();
    }
  }
}

// ─── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('btn-refresh').addEventListener('click', refreshEndpoints);

document.getElementById('btn-clear').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_ENDPOINTS' }, () => {
    void chrome.runtime.lastError;
    allEndpoints = [];
    selectedEndpoint = null;
    document.getElementById('detail-panel').classList.remove('open');
    renderEndpoints([]);
  });
});

document.getElementById('btn-chat').addEventListener('click', () => {
  chrome.runtime.sendMessage({
    type: 'OPEN_SIDE_PANEL',
    tabId: chrome.devtools.inspectedWindow.tabId,
  });
});

document.getElementById('filter-input').addEventListener('input', () => renderEndpoints(allEndpoints));
document.getElementById('method-filter').addEventListener('change', () => renderEndpoints(allEndpoints));

document.querySelectorAll('.detail-tab').forEach(tab => {
  tab.addEventListener('click', () => showDetailTab(tab.dataset.tab));
});

// Update page info
chrome.devtools.inspectedWindow.eval('window.location.hostname + window.location.pathname', (result) => {
  if (result) document.getElementById('page-info').textContent = result;
});

// Initial load + auto-refresh
refreshEndpoints();
const _refreshInterval = setInterval(() => {
  if (!_contextValid) { clearInterval(_refreshInterval); return; }
  refreshEndpoints();
}, 2000);
