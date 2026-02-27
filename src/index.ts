import * as restify from 'restify';
import * as dotenv from 'dotenv';
import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  ConfigurationBotFrameworkAuthentication,
  TurnContext,
  MemoryStorage,
  ConversationState,
  UserState
} from 'botbuilder';
import { ClaudeBot } from './bot/claudeBot';

// Load environment variables
dotenv.config();

// Create HTTP server
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

const port = process.env.PORT || 3978;
server.listen(port, () => {
  console.log(`\n🤖 Claude Code Bot is running`);
  console.log(`\n📍 Bot endpoint: http://localhost:${port}/api/messages`);
  console.log(`\n🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Create adapter
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.BOT_ID,
  MicrosoftAppPassword: process.env.BOT_PASSWORD,
  MicrosoftAppType: 'MultiTenant'
});

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(
  {},
  credentialsFactory
);

const adapter = new CloudAdapter(botFrameworkAuthentication);

// Error handler
adapter.onTurnError = async (context: TurnContext, error: Error) => {
  console.error(`\n [onTurnError] unhandled error: ${error}`);
  console.error(error.stack);

  // Send error message to user
  await context.sendActivity('❌ The bot encountered an error. Please try again.');

  // Clear conversation state
  await conversationState.delete(context);
};

// Create storage and state
const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);
const userState = new UserState(memoryStorage);

// Create the bot
const bot = new ClaudeBot(conversationState, userState);

// Listen for incoming requests
server.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, (context) => bot.run(context));
});

// Health check endpoint
server.get('/health', (req, res) => {
  res.send(200, { status: 'healthy', timestamp: new Date().toISOString() });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
