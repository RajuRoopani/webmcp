# WebMCP - Any Website to AI Chat

A browser extension that captures any website's network traffic, auto-generates virtual MCP tools from its API calls, and provides a rich AI chat interface powered by Claude or OpenAI.

## How It Works

```
Website navigation
      ↓
Chrome DevTools Network API
      ↓
Captured API endpoints (auto-detected JSON/REST/GraphQL)
      ↓
Virtual MCP tools generated on-the-fly
      ↓
LLM (Claude / OpenAI) uses tools to fetch live data
      ↓
Rich streaming chat response (markdown + images)
```

## Features

- **Auto-capture**: Just navigate the website — API calls appear automatically
- **Smart deduplication**: Groups similar URLs into single tools
- **Live replaying**: Re-executes API calls with your existing session/auth
- **Streaming responses**: Real-time streaming from Claude or OpenAI
- **Rich markdown**: Tables, code blocks, images, headers all rendered beautifully
- **Tool call visibility**: See exactly which API calls the AI is making
- **Conversation history**: Multi-turn conversations remembered per tab
- **Claude + OpenAI**: Works with Anthropic API, OpenAI, or GitHub Copilot

## Install

### Load as Unpacked Extension (Chrome / Edge)

1. Open Chrome/Edge and go to `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. Pin the extension to your toolbar

### Configure API Key

1. Click the **WebMCP** extension icon in toolbar
2. Click **Open Chat Panel** → Settings tab (⚙)
3. Choose your provider:
   - **Claude**: Enter your Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
   - **OpenAI / GitHub Copilot**: Enter your API key and endpoint
4. Click **Save Settings**

### For GitHub Copilot

Use these settings:
- API Endpoint: `https://api.githubcopilot.com`
- API Key: Your GitHub personal access token with `copilot` scope
- Model: `gpt-4o` or `claude-3.5-sonnet`

## Usage

1. **Navigate** to any website (e.g. eufy.com, Amazon, etc.)
2. **Open DevTools** (F12) → click the **WebMCP** tab
3. **Browse the site** — API calls are captured automatically in the panel
4. **Open the side panel**: Click the WebMCP toolbar icon → "Open Chat Panel"
5. **Chat away**: Ask questions, the AI uses live APIs to answer

### Example Questions

On eufy.com:
- "What cameras are on sale right now?"
- "Find the best bundle deal for an outdoor camera system"
- "What's the price of the HomeBase S380?"
- "Show me all indoor cameras under $100"

On Amazon:
- "Search for wireless earbuds under $50"
- "What are the top-rated items in this category?"

On any site:
- "What APIs did you capture from this website?"
- "Show me all the data available from this page"

## File Structure

```
extension/
├── manifest.json       # Extension config (MV3)
├── background.js       # Service worker: LLM calls, tool execution, state
├── devtools.html       # DevTools panel entry
├── devtools.js         # Registers DevTools panel
├── panel.html          # API capture UI (inside DevTools)
├── panel.js            # Network capture + endpoint display
├── sidepanel.html      # Main chat UI (side panel)
├── popup.html          # Toolbar popup
└── content.js          # Page context helper
```

## Architecture Notes

- **No server required**: Runs entirely in the browser
- **Auth preservation**: API calls replay within your existing browser session, so cookies and session tokens work automatically
- **Custom headers**: Captured `Authorization` and `x-*` headers are stored and replayed
- **GraphQL support**: POST requests to `/graphql` endpoints are captured and replayed
- **Storage**: Endpoints stored in `chrome.storage.session` (cleared on browser close), settings in `chrome.storage.local`

## Limitations

- API capture requires the **DevTools panel** to be open during navigation
- Some APIs use server-side auth that can't be replayed from the extension
- Service workers (background.js) may restart between sessions — captured endpoints persist via storage
- Cross-origin requests work because the extension has `<all_urls>` host permission
