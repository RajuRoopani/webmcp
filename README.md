# Claude Code Bot for Microsoft Teams

An intelligent AI-powered coding assistant for Microsoft Teams that helps developers with code explanations, bug fixes, code reviews, and programming questions using Claude AI by Anthropic.

## Features

- 💬 **Ask Coding Questions** - Get instant answers to programming questions
- 🔍 **Code Analysis** - Paste code snippets for intelligent analysis
- 🐛 **Error Explanations** - Understand and fix errors with AI guidance
- 💡 **Smart Suggestions** - Get code improvement recommendations
- 📝 **Interactive Cards** - Beautiful adaptive cards for rich interactions
- 🤝 **Team Collaboration** - Share insights with your team in channels

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18.x or higher ([Download](https://nodejs.org/))
- **Microsoft Teams** account
- **Visual Studio Code** ([Download](https://code.visualstudio.com/))
- **Teams Toolkit Extension** for VS Code ([Install](https://marketplace.visualstudio.com/items?itemName=TeamsDevApp.ms-teams-vscode-extension))
- **Claude API Key** from Anthropic ([Get Key](https://console.anthropic.com/))

## Quick Start

### 1. Install Teams Toolkit Extension

1. Open Visual Studio Code
2. Go to Extensions (Cmd/Ctrl + Shift + X)
3. Search for "Teams Toolkit"
4. Install the extension by Microsoft

### 2. Clone and Setup

```bash
cd claude-teams-bot
npm install
```

### 3. Configure Claude API Key

Edit `env/.env.local` and add your Claude API key:

```env
CLAUDE_API_KEY=sk-ant-your-api-key-here
```

### 4. Run with Teams Toolkit

1. Open the project in VS Code
2. Click on **Teams Toolkit** icon in the sidebar
3. Under "DEVELOPMENT", click **"Provision"** (first time only)
   - This creates your bot registration in Azure
   - Generates BOT_ID and BOT_PASSWORD automatically
4. Click **"Preview Your Teams App"** (F5)
   - Select "Debug in Teams (Edge)" or "Debug in Teams (Chrome)"
   - Teams will open with your bot ready to use

### 5. Test the Bot

Once Teams opens:

1. Your bot will be automatically installed
2. Start a chat with **Claude Code Bot**
3. Try these commands:
   - Type `help` - See available commands
   - Type `examples` - See example questions
   - Ask a question: "How do I use async/await in JavaScript?"
   - Paste code for analysis

## Usage Examples

### Ask Coding Questions

```
@ClaudeCodeBot how do I handle JWT authentication in Node.js?
```

### Analyze Code

```
@ClaudeCodeBot analyze this code:

function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i <= items.length; i++) {
    total += items[i].price;
  }
  return total;
}
```

### Get Error Help

```
@ClaudeCodeBot I'm getting this error:

TypeError: Cannot read property 'map' of undefined
at processItems (app.js:42)
```

## Project Structure

```
claude-teams-bot/
├── src/
│   ├── index.ts              # Server entry point
│   ├── bot/
│   │   └── claudeBot.ts      # Main bot logic
│   ├── services/
│   │   └── claudeService.ts  # Claude API integration
│   ├── cards/
│   │   └── adaptiveCards.ts  # Teams adaptive cards
│   └── utils/                # Utility functions
├── appPackage/
│   ├── manifest.json         # Teams app manifest
│   ├── color.png             # App icon (192x192)
│   └── outline.png           # App icon outline (32x32)
├── env/
│   └── .env.local            # Local environment variables
├── teamsapp.yml              # Teams Toolkit configuration
├── package.json              # Node.js dependencies
└── tsconfig.json             # TypeScript configuration
```

## Configuration

### Environment Variables

Edit `env/.env.local`:

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_ID` | Bot App ID (auto-generated) | Yes |
| `BOT_PASSWORD` | Bot password (auto-generated) | Yes |
| `CLAUDE_API_KEY` | Your Anthropic API key | Yes |
| `TEAMS_APP_ID` | Teams App ID (auto-generated) | Yes |
| `PORT` | Server port (default: 3978) | No |

### Claude API Models

By default, the bot uses `claude-sonnet-4-20250514` for cost efficiency.

To use a different model, edit `src/services/claudeService.ts`:

```typescript
constructor(apiKey: string, model: string = 'claude-opus-4-5-20251101') {
```

Available models:
- `claude-sonnet-4-20250514` - Balanced performance/cost (recommended)
- `claude-opus-4-5-20251101` - Maximum intelligence
- `claude-haiku-3-5-20250801` - Fastest responses

## Development

### Build

```bash
npm run build
```

### Run Locally (without Teams Toolkit)

```bash
# Start the server
npm start

# Or with auto-reload
npm run dev
```

### Debug in VS Code

1. Set breakpoints in your code
2. Press F5 or click "Debug in Teams"
3. Teams Toolkit handles all tunneling and configuration

## Testing

### Test Bot Locally

Use Bot Framework Emulator:

1. Download [Bot Framework Emulator](https://github.com/Microsoft/BotFramework-Emulator/releases)
2. Open Emulator
3. Connect to `http://localhost:3978/api/messages`
4. Enter BOT_ID and BOT_PASSWORD from `.env.local`
5. Start chatting to test bot responses

### Test in Teams

Teams Toolkit automatically:
- Creates a dev tunnel to your local server
- Updates the Teams app manifest
- Installs the app in Teams
- Enables live debugging

## Deployment

### Deploy to Azure

1. In VS Code, open Teams Toolkit
2. Click **"Provision"** under "DEPLOYMENT"
   - Creates Azure resources
   - Provisions bot in Azure Bot Service
3. Click **"Deploy"** under "DEPLOYMENT"
   - Builds and deploys code to Azure
4. Click **"Publish"** to publish to Teams

### Manual Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for manual Azure deployment steps.

## Troubleshooting

### Bot doesn't respond

1. Check that Claude API key is valid in `env/.env.local`
2. Verify bot is running: `http://localhost:3978/health` should return `{"status":"healthy"}`
3. Check console for errors

### "Unable to reach app" in Teams

1. Ensure dev tunnel is running (Teams Toolkit handles this)
2. Check firewall isn't blocking port 3978
3. Try restarting the debug session (F5)

### Claude API errors

1. Verify API key: Check [Anthropic Console](https://console.anthropic.com/)
2. Check API rate limits
3. Review console logs for detailed error messages

### Teams Toolkit provisioning fails

1. Ensure you're logged into Microsoft 365 account in Teams Toolkit
2. Try signing out and signing back in
3. Check Azure permissions (need app registration rights)

## Architecture

### Bot Flow

```
Teams User → Teams Channel → Bot Framework → Claude Bot Handler → Claude API → Response
```

### Components

1. **Bot Framework** - Handles Teams protocol and messaging
2. **Claude Service** - Wrapper around Anthropic API
3. **Adaptive Cards** - Rich UI for Teams
4. **Conversation State** - Maintains context across messages

## Cost Estimation

### Claude API Pricing (as of 2024)

**Claude Sonnet 4** (recommended):
- Input: $3 per million tokens
- Output: $15 per million tokens

**Estimated monthly cost** (50 users, 20 queries/day):
- ~30,000 queries/month
- ~60M tokens total
- **Cost: ~$500-700/month**

Tips to reduce costs:
- Use Sonnet instead of Opus for most queries
- Implement caching for common questions
- Set rate limits per user

## Security & Privacy

- Bot credentials stored securely in Azure Key Vault (production)
- Code snippets encrypted at rest
- No code is stored permanently
- Claude API communication over HTTPS
- Supports Azure AD authentication

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

- **Issues**: [GitHub Issues](https://github.com/yourorg/claude-teams-bot/issues)
- **Docs**: [Teams Toolkit Docs](https://aka.ms/teamsfx-docs)
- **Claude API**: [Anthropic Documentation](https://docs.anthropic.com/)

## License

MIT License - See [LICENSE](LICENSE) file

## Credits

- Built with [Microsoft Teams Toolkit](https://aka.ms/teams-toolkit)
- Powered by [Claude AI](https://www.anthropic.com/claude) by Anthropic
- Uses [Bot Framework SDK](https://dev.botframework.com/)

---

**Made with ❤️ for developers who love AI-powered productivity**
