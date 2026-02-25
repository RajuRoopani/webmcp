// ── Minimal Markdown renderer ──────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
  if (!text) return '';

  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });

  text = text.replace(/`([^`\n]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
  text = text.replace(/^#{4}\s+(.*)$/gm, '<h4>$1</h4>');
  text = text.replace(/^#{3}\s+(.*)$/gm, '<h3>$1</h3>');
  text = text.replace(/^#{2}\s+(.*)$/gm, '<h2>$1</h2>');
  text = text.replace(/^#{1}\s+(.*)$/gm, '<h1>$1</h1>');

  text = text.replace(/(?:^\|.+\|\n)+/gm, tableBlock => {
    const rows = tableBlock.trim().split('\n');
    let html = '<table>';
    rows.forEach((row, i) => {
      if (row.match(/^\|[\s\-:|]+\|/)) return;
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      const tag = i === 0 ? 'th' : 'td';
      html += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    });
    html += '</table>';
    return html;
  });

  text = text.replace(/^---+$/gm, '<hr>');
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.*?)_/g, '<em>$1</em>');
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  text = text.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');
  text = text.replace(/^[\*\-]\s+(.*)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  text = text.replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>');
  text = text.replace(/\n\n+/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  text = `<p>${text}</p>`;

  codeBlocks.forEach((block, i) => {
    text = text.replace(`\x00CODE${i}\x00`, block);
  });

  text = text.replace(/<p>\s*<\/p>/g, '');
  text = text.replace(/<p>(<[hH][1-6]>)/g, '$1');
  text = text.replace(/(<\/[hH][1-6]>)<\/p>/g, '$1');
  text = text.replace(/<p>(<pre)/g, '$1');
  text = text.replace(/(<\/pre>)<\/p>/g, '$1');
  text = text.replace(/<p>(<ul>)/g, '$1');
  text = text.replace(/(<\/ul>)<\/p>/g, '$1');
  text = text.replace(/<p>(<blockquote>)/g, '$1');
  text = text.replace(/(<\/blockquote>)<\/p>/g, '$1');
  text = text.replace(/<p>(<hr>)<\/p>/g, '$1');
  text = text.replace(/<p>(<table>)/g, '$1');
  text = text.replace(/(<\/table>)<\/p>/g, '$1');

  return text;
}

// ── State ───────────────────────────────────────────────────────────────────

let currentProvider = 'claude';
let currentTab = 'chat';
let isStreaming = false;
let chatPort = null;
let endpoints = [];
let currentTabId = null;
let currentPageUrl = '';
let currentPageTitle = '';
let conversationEl = null;
let rawText = '';

// ── Tab management ─────────────────────────────────────────────────────────

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  if (tab === 'endpoints') refreshEndpoints();
  if (tab === 'settings') refreshStats();
}

function setProvider(p) {
  currentProvider = p;
  document.getElementById('btn-claude').classList.toggle('active', p === 'claude');
  document.getElementById('btn-openai').classList.toggle('active', p === 'openai');
  document.getElementById('claude-fields').style.display = p === 'claude' ? '' : 'none';
  document.getElementById('openai-fields').style.display = p === 'openai' ? '' : 'none';
}

// ── Safe sendMessage ─────────────────────────────────────────────────────────

function safeSend(msg, cb) {
  try {
    chrome.runtime.sendMessage(msg, res => {
      if (chrome.runtime.lastError) {
        console.warn('[WebMCP]', chrome.runtime.lastError.message);
        cb && cb(null);
        return;
      }
      cb && cb(res);
    });
  } catch (e) {
    console.warn('[WebMCP] sendMessage failed:', e);
    cb && cb(null);
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

function loadSettings() {
  safeSend({ type: 'GET_SETTINGS' }, res => {
    const s = res?.settings;
    document.getElementById('no-key-banner').style.display = (!s || !s.apiKey) ? 'block' : 'none';
    if (!s) return;
    currentProvider = s.provider || 'claude';
    setProvider(currentProvider);
    document.getElementById('claude-key').value = s.provider === 'claude' ? (s.apiKey || '') : '';
    document.getElementById('openai-key').value = s.provider === 'openai' ? (s.apiKey || '') : '';
    document.getElementById('claude-model').value = s.model || 'claude-opus-4-6';
    document.getElementById('openai-endpoint').value = s.openaiEndpoint || 'https://api.openai.com/v1';
    document.getElementById('openai-model').value = s.provider === 'openai' ? (s.model || 'gpt-4o') : 'gpt-4o';
    document.getElementById('model-label').textContent = s.model || 'claude-opus-4-6';
  });
}

function saveSettings() {
  const provider = currentProvider;
  const apiKey = provider === 'claude'
    ? document.getElementById('claude-key').value.trim()
    : document.getElementById('openai-key').value.trim();
  const model = provider === 'claude'
    ? document.getElementById('claude-model').value
    : document.getElementById('openai-model').value.trim() || 'gpt-4o';
  const openaiEndpoint = document.getElementById('openai-endpoint').value.trim() || 'https://api.openai.com/v1';

  const settings = { provider, apiKey, model, openaiEndpoint };
  safeSend({ type: 'SAVE_SETTINGS', settings }, () => {
    document.getElementById('model-label').textContent = model;
    document.getElementById('no-key-banner').style.display = apiKey ? 'none' : 'block';
    const status = document.getElementById('save-status');
    status.textContent = '✓ Settings saved';
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
}

// ── Endpoint display ──────────────────────────────────────────────────────────

function refreshEndpoints() {
  safeSend({ type: 'GET_ENDPOINTS' }, res => {
    if (!res?.endpoints) return;
    endpoints = res.endpoints.sort((a, b) => b.lastSeen - a.lastSeen);
    renderEndpoints();
    updateEpPill();
  });
}

function renderEndpoints() {
  const list = document.getElementById('ep-list');
  const empty = document.getElementById('ep-empty');

  if (endpoints.length === 0) {
    empty.style.display = 'flex';
    list.querySelectorAll('.ep-item').forEach(e => e.remove());
    return;
  }
  empty.style.display = 'none';
  list.querySelectorAll('.ep-item').forEach(e => e.remove());

  endpoints.forEach(ep => {
    const item = document.createElement('div');
    item.className = 'ep-item';
    item.innerHTML = `
      <span class="ep-method ep-${ep.method}">${ep.method}</span>
      <div class="ep-details">
        <div class="ep-path-text">${ep.path || '/'}</div>
        <div class="ep-host-text">${ep.host || ep.baseUrl || ''}</div>
      </div>
      <span class="ep-hits">${ep.hitCount}×</span>
    `;
    list.insertBefore(item, empty);
  });
}

function updateEpPill() {
  const count = endpoints.length;
  document.getElementById('ep-pill-count').textContent = `${count} API${count !== 1 ? 's' : ''}`;
  document.getElementById('ep-dot').className = count > 0 ? 'dot' : 'dot empty';
}

function clearEndpoints() {
  safeSend({ type: 'CLEAR_ENDPOINTS' }, () => {
    endpoints = [];
    renderEndpoints();
    updateEpPill();
  });
}

function refreshStats() {
  safeSend({ type: 'GET_ENDPOINTS' }, res => {
    const eps = res?.endpoints || [];
    const hosts = [...new Set(eps.map(e => e.host))];
    const totalHits = eps.reduce((sum, e) => sum + (e.hitCount || 1), 0);
    document.getElementById('stats-display').innerHTML = `
      <div>📡 <strong>${eps.length}</strong> unique endpoints captured</div>
      <div>🌐 <strong>${hosts.length}</strong> host${hosts.length !== 1 ? 's' : ''}: ${hosts.slice(0,3).join(', ')}${hosts.length > 3 ? '...' : ''}</div>
      <div>🔄 <strong>${totalHits}</strong> total API calls observed</div>
    `;
  });
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function clearConversation() {
  const messages = document.getElementById('messages');
  messages.innerHTML = '';
  const welcome = createWelcome();
  messages.appendChild(welcome);
  safeSend({ type: 'CLEAR_HISTORY', tabId: currentTabId }, null);
}

function createWelcome() {
  const div = document.createElement('div');
  div.className = 'welcome';
  div.id = 'welcome';
  div.innerHTML = `
    <div class="glow-icon">🤖</div>
    <h2>WebMCP Chat</h2>
    <p>I can fetch live data from this website using its captured APIs.</p>
    <div class="suggestion-chips">
      <div class="chip">What data is on this page?</div>
      <div class="chip">Show me all captured APIs</div>
      <div class="chip">Search for products</div>
      <div class="chip">What deals are available?</div>
    </div>
  `;
  // Wire up chip clicks without inline handlers (CSP-safe)
  div.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => sendSuggestion(chip));
  });
  return div;
}

function sendSuggestion(el) {
  document.getElementById('chat-input').value = el.textContent;
  sendMessage();
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function addUserMessage(text) {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.style.display = 'none';

  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `<div class="msg-bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
  msgs.appendChild(div);
  scrollBottom();
}

function addTypingIndicator() {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  msgs.appendChild(div);
  scrollBottom();
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

function createAssistantBubble() {
  removeTypingIndicator();
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  div.appendChild(bubble);
  msgs.appendChild(div);
  scrollBottom();
  return bubble;
}

function addToolCard(toolName) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  const id = `tool-${toolName}-${Date.now()}`;
  div.innerHTML = `
    <div class="tool-card" id="${id}">
      <div class="tool-card-header">
        <span class="tool-icon">🔧</span>
        <span class="tool-name">${toolName}()</span>
        <span class="tool-status"><div class="tool-spinner"></div></span>
      </div>
      <div class="tool-body" id="${id}-body"></div>
    </div>
  `;
  // Wire header click without inline handler (CSP-safe)
  div.querySelector('.tool-card-header').addEventListener('click', () => toggleToolBody(id));
  msgs.appendChild(div);
  scrollBottom();
  return id;
}

function updateToolCard(id, input, result) {
  const card = document.getElementById(id);
  if (!card) return;
  card.querySelector('.tool-status').innerHTML = '✅';
  const body = document.getElementById(`${id}-body`);
  body.textContent = `Input: ${JSON.stringify(input, null, 2)}\n\nResult: ${typeof result === 'object' ? JSON.stringify(result, null, 2).slice(0, 500) : String(result).slice(0, 500)}`;
}

function toggleToolBody(id) {
  document.getElementById(`${id}-body`)?.classList.toggle('open');
}

function addErrorMessage(text) {
  removeTypingIndicator();
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.innerHTML = `<div class="msg-error">⚠️ ${escapeHtml(text)}</div>`;
  msgs.appendChild(div);
  scrollBottom();
}

function scrollBottom() {
  const msgs = document.getElementById('messages');
  msgs.scrollTop = msgs.scrollHeight;
}

function sendMessage() {
  if (isStreaming) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  switchTab('chat');

  addUserMessage(text);
  addTypingIndicator();
  document.getElementById('send-btn').disabled = true;
  isStreaming = true;
  rawText = '';
  conversationEl = null;

  let gotResponse = false;
  try {
    chatPort = chrome.runtime.connect({ name: 'chat' });
  } catch (e) {
    addErrorMessage('Could not connect to extension background. Reload the extension at chrome://extensions');
    finish();
    return;
  }

  chatPort.onMessage.addListener(msg => {
    gotResponse = true;
    if (msg.type === 'chunk') {
      if (!conversationEl) conversationEl = createAssistantBubble();
      rawText += msg.content;
      conversationEl.innerHTML = renderMarkdown(rawText);
      scrollBottom();
    } else if (msg.type === 'tool_start') {
      addToolCard(msg.toolName);
    } else if (msg.type === 'tool_exec') {
      const cards = document.querySelectorAll('.tool-card');
      const last = cards[cards.length - 1];
      if (last) last.dataset.input = JSON.stringify(msg.input);
    } else if (msg.type === 'tool_result') {
      const cards = document.querySelectorAll('.tool-card');
      const last = cards[cards.length - 1];
      if (last) {
        updateToolCard(last.id, JSON.parse(last.dataset.input || '{}'), msg.result);
        conversationEl = null;
      }
    } else if (msg.type === 'error') {
      addErrorMessage(msg.error);
      finish();
    } else if (msg.type === 'done') {
      finish();
    }
  });

  chatPort.onDisconnect.addListener(() => {
    if (!gotResponse) {
      addErrorMessage(
        'Extension background did not respond. ' +
        'Go to chrome://extensions, find WebMCP, click the refresh icon, then try again.'
      );
    }
    finish();
  });

  chatPort.postMessage({
    type: 'chat',
    userMessage: text,
    tabId: currentTabId,
    pageUrl: currentPageUrl,
    pageTitle: currentPageTitle,
  });
}

function finish() {
  isStreaming = false;
  document.getElementById('send-btn').disabled = false;
  removeTypingIndicator();
  if (chatPort) { try { chatPort.disconnect(); } catch { /* ignore */ } chatPort = null; }
  conversationEl = null;
  scrollBottom();
}

// ── Page info ─────────────────────────────────────────────────────────────────

function updatePageInfo() {
  const titleEl = document.getElementById('page-title');
  if (!titleEl) return;
  safeSend({ type: 'GET_CURRENT_TAB' }, res => {
    if (!res) { titleEl.textContent = 'Ready'; return; }
    currentTabId = res.tabId;
    currentPageUrl = res.url || '';
    currentPageTitle = res.title || '';
    try {
      const host = new URL(currentPageUrl).hostname;
      titleEl.textContent = host || 'Ready';
    } catch {
      titleEl.textContent = (currentPageTitle || 'Ready').slice(0, 30) || 'Ready';
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Detect invalidated extension context (happens when the extension is reloaded while
// this sidepanel is still open). chrome API callbacks silently never fire in that state.
(function checkExtensionContext() {
  try {
    if (!chrome?.runtime?.id) {
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    height:100vh;padding:24px;text-align:center;background:#0a0a12;">
          <div style="font-size:36px;margin-bottom:16px;">🔄</div>
          <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:8px;">Extension Reloaded</h2>
          <p style="font-size:12px;color:#6b7280;line-height:1.8;">
            The WebMCP extension was updated.<br>
            Close this panel and click the<br>
            <strong style="color:#a78bfa;">WebMCP icon</strong> in the toolbar to reopen it.
          </p>
        </div>`;
      return; // Stop init if context is invalid
    }
  } catch (e) {
    document.body.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a12;color:#fca5a5;font-size:13px;padding:20px;text-align:center;';
    document.body.textContent = 'Extension context lost. Close and reopen this panel.';
    return;
  }

  // Wire up all static element event listeners (no inline onclick in HTML — CSP-safe)
  document.getElementById('ep-pill').addEventListener('click', () => switchTab('endpoints'));
  document.getElementById('btn-clear-conv').addEventListener('click', clearConversation);
  document.getElementById('btn-open-settings').addEventListener('click', () => switchTab('settings'));
  document.getElementById('no-key-banner').addEventListener('click', () => switchTab('settings'));

  document.querySelectorAll('.tab[data-tab]').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  // Wire static suggestion chips in the welcome section
  document.querySelectorAll('#suggestions .chip').forEach(chip => {
    chip.addEventListener('click', () => sendSuggestion(chip));
  });

  const chatInput = document.getElementById('chat-input');
  chatInput.addEventListener('keydown', handleKeydown);
  chatInput.addEventListener('input', () => autoResize(chatInput));

  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.querySelector('.model-badge').addEventListener('click', () => switchTab('settings'));
  document.getElementById('btn-clear-endpoints').addEventListener('click', clearEndpoints);
  document.getElementById('btn-claude').addEventListener('click', () => setProvider('claude'));
  document.getElementById('btn-openai').addEventListener('click', () => setProvider('openai'));
  document.getElementById('btn-preset-openai').addEventListener('click', () => {
    document.getElementById('openai-endpoint').value = 'https://api.openai.com/v1';
    document.getElementById('openai-model').value = 'gpt-4o';
  });
  document.getElementById('btn-preset-copilot').addEventListener('click', () => {
    document.getElementById('openai-endpoint').value = 'https://api.githubcopilot.com';
    document.getElementById('openai-model').value = 'gpt-4o';
  });
  document.querySelector('.save-btn').addEventListener('click', saveSettings);

  // Kick off initialization
  updatePageInfo();
  loadSettings();
  refreshEndpoints();

  setInterval(() => {
    refreshEndpoints();
    updatePageInfo();
  }, 3000);
})();
