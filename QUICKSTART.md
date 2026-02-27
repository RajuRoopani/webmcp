# 🚀 Quick Start Guide

## Get Running in 5 Minutes!

### Step 1: Install Teams Toolkit Extension in VS Code

1. Open VS Code
2. Press `Cmd/Ctrl + Shift + X` (Extensions)
3. Search for **"Teams Toolkit"**
4. Click Install

### Step 2: Add Your Claude API Key

Edit `env/.env.local`:

```bash
CLAUDE_API_KEY=sk-ant-your-actual-api-key-here
```

Get your API key from: https://console.anthropic.com/

### Step 3: Open Project in VS Code

```bash
code /Users/rajuroopani/claude-teams-bot
```

### Step 4: Sign in to Microsoft 365

1. Click **Teams Toolkit** icon in VS Code sidebar (looks like Teams logo)
2. Click **"Sign in to Microsoft 365"**
3. Sign in with your Microsoft/Teams account

### Step 5: Provision (First Time Only)

In Teams Toolkit panel:
1. Expand **"DEVELOPMENT"** section
2. Click **"Provision"**
   - This creates bot registration
   - Generates BOT_ID and BOT_PASSWORD automatically
   - Takes 30-60 seconds

### Step 6: Run the Bot!

**Option A: Press F5**
- Select "Debug in Teams (Edge)" or "Debug in Teams (Chrome)"
- Teams will open automatically with your bot

**Option B: Use Teams Toolkit**
1. In Teams Toolkit panel
2. Click **"Preview Your Teams App (F5)"**
3. Select your browser

### Step 7: Test Your Bot

Once Teams opens:

1. Your app "Claude Code Bot" will be installed automatically
2. Click **"Add"** to add the bot
3. Type `help` to see commands
4. Try asking: **"How do I use async/await in JavaScript?"**

## Example Interactions

### Ask a Question
```
How do I create a REST API in Node.js?
```

### Analyze Code
```
Analyze this code:

function add(a, b) {
  return a + b;
}
```

### Get Error Help
```
I'm getting: TypeError: Cannot read property 'map' of undefined
```

## Troubleshooting

### "Claude API Key not found"
- Check `env/.env.local` has your API key
- Key should start with `sk-ant-`

### "Unable to reach app"
- Make sure you pressed F5 and dev tunnel is running
- Check terminal for errors
- Try stopping (Shift+F5) and restarting (F5)

### Bot not responding
1. Check console logs in VS Code terminal
2. Verify health: http://localhost:3978/health
3. Check Claude API key is valid

## Next Steps

- Read [README.md](README.md) for full documentation
- Customize adaptive cards in `src/cards/adaptiveCards.ts`
- Add more features in `src/bot/claudeBot.ts`
- Deploy to Azure when ready

## Need Help?

- Teams Toolkit Docs: https://aka.ms/teamsfx-docs
- Bot Framework Docs: https://dev.botframework.com/
- Claude API Docs: https://docs.anthropic.com/

**Happy Coding! 🎉**
