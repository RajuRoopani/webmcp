/**
 * WebMCP Background Service Worker - v2
 *
 * Architecture:
 *  1. DevTools panel captures network requests → sends here via chrome.runtime.sendMessage
 *  2. We store captured endpoints as "virtual MCP tools" in chrome.storage.local
 *  3. Side panel connects via port, sends chat messages
 *  4. We call LLM (Claude or OpenAI-compatible) with tools derived from captured endpoints
 *  5. When LLM calls a tool, we replay the original API request with captured headers
 *  6. Stream results back to the side panel via port messages
 *
 * v2 changes vs v1:
 *  - Replaced ALL chrome.storage.session with chrome.storage.local (session unreliable in MV3)
 *  - Replaced async generators (async function*) with callback-based streaming (more reliable)
 *  - Added ping handler so sidepanel can verify background is alive
 *  - Added console logging for easier debugging
 */

// ─── Storage helpers (all chrome.storage.local — session not reliable) ─────────

async function getEndpoints() {
  try {
    const result = await chrome.storage.local.get('webmcp_endpoints');
    return result.webmcp_endpoints || {};
  } catch (e) {
    console.error('[WebMCP] getEndpoints error:', e);
    return {};
  }
}

async function saveEndpoints(endpoints) {
  try {
    await chrome.storage.local.set({ webmcp_endpoints: endpoints });
  } catch (e) {
    console.error('[WebMCP] saveEndpoints error:', e);
  }
}

async function getSettings() {
  try {
    const result = await chrome.storage.local.get('settings');
    return result.settings || {
      provider: 'claude',
      apiKey: '',
      openaiEndpoint: 'https://api.openai.com/v1',
      model: 'claude-opus-4-6',
    };
  } catch (e) {
    console.error('[WebMCP] getSettings error:', e);
    return { provider: 'claude', apiKey: '', openaiEndpoint: 'https://api.openai.com/v1', model: 'claude-opus-4-6' };
  }
}

async function getHistory(tabId) {
  try {
    const key = `history_${tabId || 'default'}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || [];
  } catch (e) {
    console.error('[WebMCP] getHistory error:', e);
    return [];
  }
}

async function saveHistory(tabId, history) {
  try {
    await chrome.storage.local.set({ [`history_${tabId || 'default'}`]: history });
  } catch (e) {
    console.error('[WebMCP] saveHistory error:', e);
  }
}

// ─── URL normalization → tool name + schema ───────────────────────────────────

function urlToToolName(url, method) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname
      .replace(/\/\d+/g, '/{id}')
      .replace(/[^a-zA-Z0-9_/{}]/g, '_')
      .replace(/^\//, '')
      .replace(/\/$/, '')
      .replace(/\//g, '_')
      .slice(0, 40) || 'api';
    return `${method.toLowerCase()}_${path}`.replace(/__+/g, '_');
  } catch {
    return `${method.toLowerCase()}_api_${Date.now()}`;
  }
}

function extractParams(url) {
  try {
    const parsed = new URL(url);
    const params = {};
    parsed.searchParams.forEach((val, key) => {
      if (!isNaN(Number(val))) params[key] = { type: 'number', example: Number(val) };
      else params[key] = { type: 'string', example: val };
    });
    return params;
  } catch {
    return {};
  }
}

function extractBodyParams(bodyText) {
  try {
    const body = JSON.parse(bodyText);
    const params = {};
    for (const [key, val] of Object.entries(body)) {
      if (typeof val === 'number') params[key] = { type: 'number', example: val };
      else if (typeof val === 'boolean') params[key] = { type: 'boolean', example: val };
      else if (Array.isArray(val)) params[key] = { type: 'array', example: val };
      else if (typeof val === 'object' && val !== null) params[key] = { type: 'object', example: val };
      else params[key] = { type: 'string', example: String(val).slice(0, 50) };
    }
    return params;
  } catch {
    return {};
  }
}

function buildToolKey(method, url) {
  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/\/\d+/g, '/{id}');
    return `${method}:${parsed.origin}${normalizedPath}`;
  } catch {
    return `${method}:${url}`;
  }
}

// ─── Capture incoming request ─────────────────────────────────────────────────

async function handleCapturedRequest(req) {
  const { method, url, requestHeaders, responseHeaders, requestBody, responseBody, status, contentType } = req;

  const isApi = (contentType && (contentType.includes('json') || contentType.includes('graphql'))) ||
    url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') ||
    url.includes('graphql') || (responseBody && responseBody.trim().startsWith('{'));

  if (!isApi) return;

  const skipPatterns = ['analytics', 'tracking', 'telemetry', 'fonts', 'cdn.', 'static.', '.png', '.jpg', '.svg', '.woff', 'hotjar', 'mixpanel', 'segment.io', 'google-analytics', 'amplitude'];
  if (skipPatterns.some(p => url.toLowerCase().includes(p))) return;

  const key = buildToolKey(method, url);
  const toolName = urlToToolName(url, method);
  const queryParams = extractParams(url);
  const bodyParams = requestBody ? extractBodyParams(requestBody) : {};

  const replayHeaders = {};
  // Skip browser-controlled headers that cannot/should not be set manually.
  // Cookies are handled via credentials:'include' at fetch time (uses current live session).
  const skipHeaders = new Set([
    'cookie', 'cookie2', 'content-length', 'host', 'connection',
    'accept-encoding', 'transfer-encoding', 'upgrade', 'te',
  ]);
  // Auth-related header name fragments to capture
  const authPatterns = ['authorization', 'auth', 'token', 'api-key', 'apikey',
    'bearer', 'x-', 'client-id', 'client_id', 'session', 'csrf', 'xsrf',
    'ms-', 'microsoftteams', 'teams-', 'graph-', 'ocp-apim'];
  for (const [k, v] of Object.entries(requestHeaders || {})) {
    const kl = k.toLowerCase();
    if (skipHeaders.has(kl)) continue;
    if (authPatterns.some(p => kl.includes(p)) || kl === 'content-type' || kl === 'accept') {
      replayHeaders[k] = v;
    }
  }

  const endpoints = await getEndpoints();

  if (endpoints[key]) {
    endpoints[key].queryParams = { ...queryParams, ...endpoints[key].queryParams };
    endpoints[key].bodyParams = { ...bodyParams, ...endpoints[key].bodyParams };
    // Always update replayHeaders so we get the freshest auth tokens
    endpoints[key].replayHeaders = { ...endpoints[key].replayHeaders, ...replayHeaders };
    endpoints[key].hitCount = (endpoints[key].hitCount || 1) + 1;
    endpoints[key].lastSeen = Date.now();
  } else {
    try {
      const parsed = new URL(url);
      endpoints[key] = {
        key,
        toolName,
        method,
        baseUrl: `${parsed.origin}${parsed.pathname}`,
        fullUrl: url,
        queryParams,
        bodyParams,
        replayHeaders,
        status,
        contentType: contentType || '',
        sampleResponse: responseBody ? responseBody.slice(0, 1500) : '',
        hitCount: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        host: parsed.hostname,
        path: parsed.pathname,
      };
    } catch (e) {
      console.warn('[WebMCP] Failed to parse URL:', url, e);
    }
  }

  await saveEndpoints(endpoints);
}

// ─── Build LLM tools from captured endpoints ──────────────────────────────────

function buildJsonSchemaProp(info, label) {
  const desc = `${label} (example: ${JSON.stringify(info.example).slice(0, 60)})`;
  if (info.type === 'array') {
    // OpenAI requires arrays to have an `items` definition
    const first = Array.isArray(info.example) && info.example.length > 0 ? info.example[0] : null;
    const itemType = first === null ? 'string'
      : typeof first === 'object' ? 'object'
      : typeof first;
    return { type: 'array', items: { type: itemType }, description: desc };
  }
  if (info.type === 'object') {
    return { type: 'object', additionalProperties: {}, description: desc };
  }
  return { type: info.type || 'string', description: desc };
}

function buildClaudeTools(endpoints) {
  return Object.values(endpoints).slice(0, 20).map(ep => {
    const properties = {};
    const required = [];

    for (const [name, info] of Object.entries(ep.queryParams || {})) {
      // Skip numeric keys (can appear when request body was an array)
      if (/^\d+$/.test(name)) continue;
      properties[name] = buildJsonSchemaProp(info, 'Query parameter');
    }

    for (const [name, info] of Object.entries(ep.bodyParams || {})) {
      if (/^\d+$/.test(name)) continue;
      properties[name] = buildJsonSchemaProp(info, 'Request body field');
    }

    if (Object.keys(properties).length === 0) {
      properties['query'] = { type: 'string', description: 'Search query or filter' };
    }

    return {
      name: ep.toolName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64),
      description: `${ep.method} ${ep.path} on ${ep.host} (hit ${ep.hitCount}x). Sample: ${ep.sampleResponse.slice(0, 100)}`,
      input_schema: {
        type: 'object',
        properties,
        required,
      },
    };
  });
}

function buildOpenAITools(endpoints) {
  return buildClaudeTools(endpoints).map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// ─── Execute a tool call ───────────────────────────────────────────────────────

async function executeTool(toolName, toolInput, endpoints) {
  const ep = Object.values(endpoints).find(e =>
    e.toolName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64) === toolName
  );

  if (!ep) {
    return { error: `No captured endpoint for tool: ${toolName}`, available: Object.values(endpoints).map(e => e.toolName) };
  }

  try {
    const url = new URL(ep.baseUrl);

    try {
      const origUrl = new URL(ep.fullUrl);
      origUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
    } catch { /* ignore */ }

    for (const [k, v] of Object.entries(toolInput || {})) {
      if (ep.bodyParams && ep.bodyParams[k]) continue;
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }

    const fetchOptions = {
      method: ep.method,
      headers: { 'Accept': 'application/json', ...ep.replayHeaders },
      credentials: 'include', // send the user's live session cookies automatically
    };

    if (['POST', 'PUT', 'PATCH'].includes(ep.method) && Object.keys(ep.bodyParams || {}).length > 0) {
      const body = {};
      for (const [k, v] of Object.entries(toolInput || {})) body[k] = v;
      fetchOptions.body = JSON.stringify(body);
      fetchOptions.headers['Content-Type'] = 'application/json';
    }

    console.log('[WebMCP] executeTool:', toolName, url.toString());
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    let response;
    try {
      response = await fetch(url.toString(), { ...fetchOptions, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    return {
      status: response.status,
      url: url.toString(),
      data: typeof data === 'object' ? JSON.stringify(data).slice(0, 8000) : String(data).slice(0, 8000),
    };
  } catch (err) {
    const msg = err.name === 'AbortError' ? `Tool call timed out after 15s: ${toolName}` : String(err);
    return { error: msg, tool: toolName };
  }
}

// ─── LLM streaming (callback-based, NOT async generators) ─────────────────────
// Using callbacks instead of async generators for reliability in MV3 service workers.

async function streamClaude(settings, messages, tools, onEvent, forceToolUse = false) {
  const systemMsg = messages.find(m => m.role === 'system');
  const claudeMessages = messages.filter(m => m.role !== 'system');

  const body = {
    model: settings.model || 'claude-opus-4-6',
    max_tokens: 4096,
    messages: claudeMessages,
    stream: true,
  };
  if (systemMsg) body.system = systemMsg.content;
  if (tools && tools.length > 0) {
    body.tools = tools;
    if (forceToolUse) body.tool_choice = { type: 'any' }; // only force on first pass
  }

  console.log('[WebMCP] Calling Claude API, model:', body.model, 'messages:', claudeMessages.length);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 300)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try { onEvent(JSON.parse(data)); } catch { /* skip malformed */ }
    }
  }
}

// ─── GitHub Copilot PAT → short-lived token exchange ─────────────────────────
// A raw ghp_* PAT cannot be used with api.githubcopilot.com directly.
// GitHub requires exchanging it for a session token first.

let _copilotTokenCache = null; // { token, expiresAt }

async function resolveBearerToken(settings) {
  const key = settings.apiKey || '';
  const endpoint = settings.openaiEndpoint || '';

  // Only do the exchange when endpoint is GitHub Copilot AND key is a GitHub PAT
  if (!endpoint.includes('githubcopilot.com') || !key.startsWith('ghp_')) {
    return key;
  }

  // Return cached token if still valid (with 60s buffer)
  if (_copilotTokenCache && _copilotTokenCache.expiresAt > Date.now() + 60_000) {
    console.log('[WebMCP] Using cached Copilot token');
    return _copilotTokenCache.token;
  }

  console.log('[WebMCP] Exchanging GitHub PAT for Copilot token...');
  const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      'Authorization': `Bearer ${key}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub Copilot token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.token) throw new Error('GitHub Copilot token exchange returned no token');

  // expires_at is a Unix timestamp in seconds
  _copilotTokenCache = {
    token: data.token,
    expiresAt: (data.expires_at || 0) * 1000 || Date.now() + 25 * 60 * 1000,
  };
  console.log('[WebMCP] Copilot token obtained, expires:', new Date(_copilotTokenCache.expiresAt).toISOString());
  return _copilotTokenCache.token;
}

async function streamOpenAI(settings, messages, tools, onEvent, forceToolUse = false) {
  const endpoint = (settings.openaiEndpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
  const isGitHubCopilot = endpoint.includes('githubcopilot.com');

  // Resolve the actual bearer token (handles GitHub PAT → Copilot token exchange)
  const bearerToken = await resolveBearerToken(settings);

  const body = {
    model: settings.model || 'gpt-4o',
    messages,
    stream: true,
    max_tokens: 4096,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    if (forceToolUse) body.tool_choice = 'required'; // only force on first pass
  }

  // Build headers explicitly — avoid object spread which can behave unexpectedly
  // in MV3 service workers for cross-origin requests
  const reqHeaders = {
    'Authorization': `Bearer ${bearerToken}`,
    'Content-Type': 'application/json',
  };
  if (isGitHubCopilot) {
    reqHeaders['Copilot-Integration-Id'] = 'vscode-chat';
    reqHeaders['Editor-Version'] = 'vscode/1.85.0';
    reqHeaders['Editor-Plugin-Version'] = 'copilot-chat/0.16.0';
    reqHeaders['Openai-Organization'] = 'github-copilot';
    reqHeaders['Openai-Intent'] = 'conversation-panel';
  }

  console.log('[WebMCP] Calling', isGitHubCopilot ? 'GitHub Copilot' : 'OpenAI', 'API');
  console.log('[WebMCP] endpoint:', endpoint, 'model:', body.model);
  console.log('[WebMCP] headers keys:', Object.keys(reqHeaders));

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${err.slice(0, 300)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try { onEvent(JSON.parse(data)); } catch { /* skip */ }
    }
  }
}

// ─── Main chat handler ────────────────────────────────────────────────────────

async function handleChat(port, message) {
  const { userMessage, tabId, pageUrl, pageTitle } = message;
  console.log('[WebMCP] handleChat start, tabId:', tabId, 'msg:', userMessage?.slice(0, 50));

  const settings = await getSettings();
  console.log('[WebMCP] settings: provider=', settings.provider, 'hasKey=', !!settings.apiKey, 'model=', settings.model);

  if (!settings.apiKey) {
    port.postMessage({ type: 'error', error: 'No API key configured. Go to the Settings tab and enter your Claude or OpenAI API key.' });
    return;
  }

  const endpoints = await getEndpoints();
  const endpointCount = Object.keys(endpoints).length;
  console.log('[WebMCP] endpoints loaded:', endpointCount);

  // If no APIs captured yet, immediately tell the user — don't waste an LLM call
  if (endpointCount === 0) {
    port.postMessage({
      type: 'chunk',
      content: '**No APIs captured yet.**\n\nTo use WebMCP:\n1. Open **DevTools** (F12) and click the **WebMCP** tab\n2. Navigate/interact with the page — API calls will appear automatically\n3. Come back here and ask your question\n\nThe more you interact with the page, the more API tools become available.',
    });
    port.postMessage({ type: 'done' });
    return;
  }

  const history = await getHistory(tabId);
  console.log('[WebMCP] history:', history.length, 'messages');

  const endpointList = Object.values(endpoints).slice(0, 15).map(e =>
    `- ${e.method} ${e.path} (${e.host}, ${e.hitCount}x hits)`
  ).join('\n');

  const systemPrompt = `You are WebMCP, an AI assistant that fetches live data from the current website using captured API tools.

Current page: ${pageTitle || 'Unknown'} (${pageUrl || 'Unknown'})
Available API tools: ${endpointCount}
${endpointList ? `\nCaptured endpoints:\n${endpointList}` : ''}

CRITICAL RULES:
- You MUST call one or more tools to answer questions about this website's data. Do NOT answer from memory or training data.
- NEVER say "I don't have access" or "I can't search" — you have live API tools. USE THEM.
- If one tool returns an error or an auth failure (401/403), report that specific error and show whatever data the tool DID return.
- If a tool returns data, ALWAYS display that data to the user — never say you couldn't retrieve it.
- When you receive tool results, immediately present them as formatted output.

DISPLAYING RESULTS:
- For product searches: show each item as: image (![name](imageUrl)), **name**, price, rating, and a link if available.
- Look for fields like: title/name, price/cost/amount, image/img/thumbnail/picture, rating/stars, url/link/href, description/summary.
- Use markdown tables for comparisons, or a visual card list (image + bold name + price on same line).
- Always show at least 5 results when available.
- Extract and display ALL images found in tool results using markdown: ![alt](url)
- If a tool returns a status 401 or 403, say: "Auth error on [endpoint] — try navigating to that page first so the browser can refresh auth tokens."`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const tools = settings.provider === 'claude'
    ? buildClaudeTools(endpoints)
    : buildOpenAITools(endpoints);

  try {
    if (settings.provider === 'claude') {
      await handleClaudeChat(port, settings, messages, tools, endpoints, tabId);
    } else {
      await handleOpenAIChat(port, settings, messages, tools, endpoints, tabId);
    }
  } catch (err) {
    console.error('[WebMCP] handleChat error:', err);
    try { port.postMessage({ type: 'error', error: err.message }); } catch { /* port may be closed */ }
  }
}

async function handleClaudeChat(port, settings, messages, tools, endpoints, tabId) {
  let fullText = '';
  let toolCalls = [];
  let inputBuffer = '';
  let currentToolName = '';
  let currentToolId = '';
  let inTool = false;

  // First streaming pass — collect text and tool calls (force tool use so the model always fetches live data)
  await streamClaude(settings, messages, tools, event => {
    if (event.type === 'content_block_start') {
      if (event.content_block?.type === 'tool_use') {
        inTool = true;
        currentToolName = event.content_block.name;
        currentToolId = event.content_block.id;
        inputBuffer = '';
        port.postMessage({ type: 'tool_start', toolName: currentToolName });
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta') {
        fullText += event.delta.text;
        port.postMessage({ type: 'chunk', content: event.delta.text });
      } else if (event.delta?.type === 'input_json_delta') {
        inputBuffer += event.delta.partial_json;
      }
    } else if (event.type === 'content_block_stop' && inTool) {
      let toolInput = {};
      try { toolInput = JSON.parse(inputBuffer); } catch { /* ignore */ }
      toolCalls.push({ id: currentToolId, name: currentToolName, input: toolInput });
      inTool = false;
    }
  }, true /* forceToolUse on first pass */);

  console.log('[WebMCP] First pass done. text:', fullText.length, 'chars. toolCalls:', toolCalls.length);

  // Execute tool calls if any
  if (toolCalls.length > 0) {
    const toolResults = [];
    for (const tc of toolCalls) {
      port.postMessage({ type: 'tool_exec', toolName: tc.name, input: tc.input });
      const result = await executeTool(tc.name, tc.input, endpoints);
      port.postMessage({ type: 'tool_result', toolName: tc.name, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    // Second streaming pass — continue after tool results
    const continuedMessages = [
      ...messages,
      {
        role: 'assistant',
        content: toolCalls.map(tc => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        })),
      },
      { role: 'user', content: toolResults },
    ];

    port.postMessage({ type: 'chunk', content: '\n\n' });

    // Second pass: summarize tool results — do NOT force tool use, let model write text
    await streamClaude(settings, continuedMessages, tools, event => {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullText += event.delta.text;
        port.postMessage({ type: 'chunk', content: event.delta.text });
      }
    }, false /* forceToolUse=false: allow text response */);
  }

  // Save history
  const updatedHistory = [
    ...messages.filter(m => m.role !== 'system'),
    { role: 'assistant', content: fullText || '(no text response)' },
  ].slice(-20);
  await saveHistory(tabId, updatedHistory);

  port.postMessage({ type: 'done' });
  console.log('[WebMCP] handleClaudeChat done');
}

async function handleOpenAIChat(port, settings, messages, tools, endpoints, tabId) {
  let fullText = '';
  const toolCallsMap = {};

  await streamOpenAI(settings, messages, tools, event => {
    const delta = event.choices?.[0]?.delta;
    if (!delta) return;

    if (delta.content) {
      fullText += delta.content;
      port.postMessage({ type: 'chunk', content: delta.content });
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!toolCallsMap[tc.index]) {
          toolCallsMap[tc.index] = { id: '', name: '', arguments: '' };
          if (tc.function?.name) port.postMessage({ type: 'tool_start', toolName: tc.function.name });
        }
        if (tc.id) toolCallsMap[tc.index].id = tc.id;
        if (tc.function?.name) toolCallsMap[tc.index].name = tc.function.name;
        if (tc.function?.arguments) toolCallsMap[tc.index].arguments += tc.function.arguments;
      }
    }
  }, true /* forceToolUse on first pass */);

  const toolCalls = Object.values(toolCallsMap);
  console.log('[WebMCP] OpenAI first pass done. text:', fullText.length, 'toolCalls:', toolCalls.length);

  if (toolCalls.length > 0) {
    const toolMessages = [];
    for (const tc of toolCalls) {
      let toolInput = {};
      try { toolInput = JSON.parse(tc.arguments); } catch { /* ignore */ }
      port.postMessage({ type: 'tool_exec', toolName: tc.name, input: toolInput });
      const result = await executeTool(tc.name, toolInput, endpoints);
      port.postMessage({ type: 'tool_result', toolName: tc.name, result });
      toolMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    const continuedMessages = [
      ...messages,
      {
        role: 'assistant',
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      },
      ...toolMessages,
    ];

    port.postMessage({ type: 'chunk', content: '\n\n' });

    // Second pass: summarize tool results — do NOT force tool use, let model write text
    await streamOpenAI(settings, continuedMessages, tools, event => {
      const content = event.choices?.[0]?.delta?.content;
      if (content) {
        fullText += content;
        port.postMessage({ type: 'chunk', content });
      }
    }, false /* forceToolUse=false: allow text response */);
  }

  const updatedHistory = [
    ...messages.filter(m => m.role !== 'system'),
    { role: 'assistant', content: fullText || '(no text response)' },
  ].slice(-20);
  await saveHistory(tabId, updatedHistory);

  port.postMessage({ type: 'done' });
  console.log('[WebMCP] handleOpenAIChat done');
}

// ─── Side panel setup ─────────────────────────────────────────────────────────

function setupSidePanel() {
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
  } catch (e) {
    console.warn('[WebMCP] sidePanel API unavailable:', e.message);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupSidePanel();
  console.log('[WebMCP] Extension installed/updated');
});

setupSidePanel();

chrome.action.onClicked.addListener(tab => {
  try {
    chrome.sidePanel?.open({ tabId: tab.id })?.catch(() => {});
  } catch (e) { /* older Chrome */ }
});

// ─── Message handlers (sendMessage-based) ─────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ ok: true, version: 2 });
    return false;
  }

  if (message.type === 'CAPTURE_REQUEST') {
    handleCapturedRequest(message.request).catch(e => console.error('[WebMCP] CAPTURE_REQUEST error:', e));
    return false;
  }

  if (message.type === 'GET_ENDPOINTS') {
    getEndpoints().then(eps => sendResponse({ endpoints: Object.values(eps) }));
    return true;
  }

  if (message.type === 'CLEAR_ENDPOINTS') {
    chrome.storage.local.remove('webmcp_endpoints').then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'CLEAR_HISTORY') {
    const key = `history_${message.tabId || 'default'}`;
    chrome.storage.local.remove(key).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ settings: message.settings }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    getSettings().then(s => sendResponse({ settings: s }));
    return true;
  }

  // Side panel pages have unreliable chrome.tabs.query — proxy it through the service worker
  if (message.type === 'GET_CURRENT_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs?.[0] || null;
      sendResponse({ tabId: tab?.id || null, url: tab?.url || '', title: tab?.title || '' });
    });
    return true;
  }

  if (message.type === 'OPEN_SIDE_PANEL') {
    try {
      chrome.sidePanel?.open({ tabId: message.tabId })?.catch(() => {});
    } catch { /* ignore */ }
    return false;
  }
});

// ─── Port-based streaming for chat ────────────────────────────────────────────

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'chat') return;
  console.log('[WebMCP] Chat port connected');

  port.onMessage.addListener(message => {
    console.log('[WebMCP] Port message received:', message.type);
    if (message.type === 'chat') {
      handleChat(port, message).catch(err => {
        console.error('[WebMCP] handleChat uncaught error:', err);
        try { port.postMessage({ type: 'error', error: err.message }); } catch { /* port may be closed */ }
      });
    } else if (message.type === 'ping') {
      try { port.postMessage({ type: 'pong' }); } catch { /* ignore */ }
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[WebMCP] Chat port disconnected');
  });
});

console.log('[WebMCP] Service worker started');
