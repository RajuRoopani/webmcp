import {
  ActivityHandler,
  TurnContext,
  MessageFactory,
  ConversationState,
  UserState,
  TeamsInfo,
  CardFactory
} from 'botbuilder';
import { ClaudeService } from '../services/claudeService';
import { AdaptiveCards } from '../cards/adaptiveCards';

export class ClaudeBot extends ActivityHandler {
  private claudeService: ClaudeService;
  private conversationState: ConversationState;
  private userState: UserState;

  constructor(conversationState: ConversationState, userState: UserState) {
    super();

    this.conversationState = conversationState;
    this.userState = userState;

    // Initialize Claude service
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error('CLAUDE_API_KEY environment variable is required');
    }
    this.claudeService = new ClaudeService(apiKey);

    // Handle incoming messages
    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });

    // Handle members added (welcome message)
    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      for (const member of membersAdded || []) {
        if (member.id !== context.activity.recipient.id) {
          await this.sendWelcomeMessage(context);
        }
      }
      await next();
    });

    // Note: Adaptive card actions will be handled through message activity with value property
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(context: TurnContext): Promise<void> {
    // Check if this is a card action
    if (context.activity.value) {
      await this.handleCardAction(context);
      return;
    }

    const text = context.activity.text?.trim() || '';

    // Remove bot mention from text
    const cleanText = this.removeBotMention(context);

    if (!cleanText) {
      await this.sendWelcomeMessage(context);
      return;
    }

    console.log(`Processing message: "${cleanText}"`);

    try {
      // Show typing indicator
      await context.sendActivities([
        { type: 'typing' },
        { type: 'delay', value: 1000 }
      ]);

      // Detect what type of request this is
      const messageType = this.detectMessageType(cleanText);

      switch (messageType) {
        case 'code_analysis':
          await this.handleCodeAnalysis(context, cleanText);
          break;
        case 'error_help':
          await this.handleErrorHelp(context, cleanText);
          break;
        case 'help':
          await this.sendWelcomeMessage(context);
          break;
        case 'examples':
          await context.sendActivity(MessageFactory.attachment(AdaptiveCards.createExamplesCard()));
          break;
        default:
          await this.handleQuestion(context, cleanText);
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      await context.sendActivity(
        MessageFactory.attachment(AdaptiveCards.createErrorCard(errorMessage))
      );
    }

    // Save state
    await this.conversationState.saveChanges(context);
    await this.userState.saveChanges(context);
  }

  /**
   * Detect what type of message this is
   */
  private detectMessageType(text: string): string {
    const lowerText = text.toLowerCase();

    // Check for help requests
    if (lowerText.match(/^(help|what can you do|commands|start)/)) {
      return 'help';
    }

    // Check for examples request
    if (lowerText.match(/^(examples|show examples|demo)/)) {
      return 'examples';
    }

    // Check for error messages (common error patterns)
    if (
      lowerText.includes('error:') ||
      lowerText.includes('exception:') ||
      lowerText.includes('traceback') ||
      lowerText.match(/\w+Error:/) ||
      lowerText.includes('undefined is not') ||
      lowerText.includes('cannot read propert')
    ) {
      return 'error_help';
    }

    // Check for code (contains typical code patterns)
    if (
      text.match(/function\s+\w+/) ||
      text.match(/const\s+\w+\s*=/) ||
      text.match(/class\s+\w+/) ||
      text.match(/def\s+\w+/) ||
      text.includes('{') && text.includes('}') ||
      text.includes('import ') ||
      text.includes('require(')
    ) {
      return 'code_analysis';
    }

    return 'question';
  }

  /**
   * Handle code analysis request
   */
  private async handleCodeAnalysis(context: TurnContext, text: string): Promise<void> {
    const code = this.extractCode(text);
    const language = this.detectLanguage(code);
    const question = this.extractQuestion(text);

    const response = await this.claudeService.analyzeCode({
      code,
      language,
      question: question || undefined
    });

    await context.sendActivity(
      MessageFactory.attachment(
        AdaptiveCards.createCodeAnalysisCard(code, response.analysis, language)
      )
    );
  }

  /**
   * Handle error help request
   */
  private async handleErrorHelp(context: TurnContext, text: string): Promise<void> {
    const error = this.extractError(text);
    const code = this.extractCode(text);

    const explanation = await this.claudeService.explainError(error, code || undefined);

    await context.sendActivity(
      MessageFactory.attachment(
        AdaptiveCards.createErrorExplanationCard(error, explanation)
      )
    );
  }

  /**
   * Handle general question
   */
  private async handleQuestion(context: TurnContext, question: string): Promise<void> {
    const answer = await this.claudeService.askQuestion(question);

    await context.sendActivity(
      MessageFactory.attachment(
        AdaptiveCards.createQuestionResponseCard(question, answer)
      )
    );
  }

  /**
   * Handle adaptive card actions
   */
  private async handleCardAction(context: TurnContext): Promise<void> {
    const action = context.activity.value?.action;

    switch (action) {
      case 'showExamples':
        await context.sendActivity(MessageFactory.attachment(AdaptiveCards.createExamplesCard()));
        break;
      case 'followUp':
        await context.sendActivity('Please ask your follow-up question about the code.');
        break;
      case 'getSuggestions':
        const code = context.activity.value?.code;
        if (code) {
          await this.handleCodeAnalysis(context, `Suggest improvements for:\n${code}`);
        }
        break;
      case 'feedback':
        const value = context.activity.value?.value;
        console.log(`User feedback: ${value}`);
        await context.sendActivity('Thanks for your feedback! 🙏');
        break;
      default:
        await context.sendActivity('Action not recognized.');
    }
  }

  /**
   * Send welcome message
   */
  private async sendWelcomeMessage(context: TurnContext): Promise<void> {
    await context.sendActivity(MessageFactory.attachment(AdaptiveCards.createWelcomeCard()));
  }

  /**
   * Remove bot mention from text
   */
  private removeBotMention(context: TurnContext): string {
    let text = context.activity.text || '';

    // Remove @mentions
    const mentions = context.activity.entities?.filter(entity => entity.type === 'mention') || [];
    for (const mention of mentions) {
      text = text.replace(mention.text, '').trim();
    }

    return text.trim();
  }

  /**
   * Extract code from text (handles code blocks and inline code)
   */
  private extractCode(text: string): string {
    // Try to extract from markdown code blocks first
    const codeBlockMatch = text.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try inline code
    const inlineCodeMatch = text.match(/`([^`]+)`/);
    if (inlineCodeMatch) {
      return inlineCodeMatch[1].trim();
    }

    // Otherwise, look for code-like patterns
    const lines = text.split('\n');
    const codeLines = lines.filter(line =>
      line.includes('{') ||
      line.includes('}') ||
      line.includes('function') ||
      line.includes('const') ||
      line.includes('let') ||
      line.includes('var') ||
      line.includes('class') ||
      line.includes('def ') ||
      line.includes('import ')
    );

    if (codeLines.length > 0) {
      return codeLines.join('\n');
    }

    return text;
  }

  /**
   * Extract error message from text
   */
  private extractError(text: string): string {
    // Look for error patterns
    const errorMatch = text.match(/(Error:[\s\S]*?)(?:\n\n|\n$|$)/i) ||
                       text.match(/(Exception:[\s\S]*?)(?:\n\n|\n$|$)/i);

    if (errorMatch) {
      return errorMatch[1].trim();
    }

    // Return first few lines if no specific error found
    return text.split('\n').slice(0, 5).join('\n');
  }

  /**
   * Extract question from text that also contains code
   */
  private extractQuestion(text: string): string | null {
    // Remove code blocks
    const withoutCode = text.replace(/```[\s\S]*?```/g, '').trim();

    if (withoutCode.length > 10) {
      return withoutCode;
    }

    return null;
  }

  /**
   * Detect programming language from code
   */
  private detectLanguage(code: string): string {
    if (code.includes('function') || code.includes('const') || code.includes('let')) {
      return 'javascript';
    }
    if (code.includes('def ') || code.includes('import ')) {
      return 'python';
    }
    if (code.includes('public class') || code.includes('private ')) {
      return 'java';
    }
    if (code.includes('namespace') || code.includes('using System')) {
      return 'csharp';
    }
    return 'unknown';
  }

  /**
   * Clean up on turn end
   */
  async run(context: TurnContext): Promise<void> {
    await super.run(context);

    // Save any state changes
    await this.conversationState.saveChanges(context, false);
    await this.userState.saveChanges(context, false);
  }
}
