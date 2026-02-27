import { CardFactory, Attachment } from 'botbuilder';

export class AdaptiveCards {
  /**
   * Create welcome card
   */
  static createWelcomeCard(): Attachment {
    return CardFactory.adaptiveCard({
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: '👋 Welcome to Claude Code Assistant!',
          weight: 'Bolder',
          size: 'Large',
          wrap: true
        },
        {
          type: 'TextBlock',
          text: 'I can help you with coding questions, code reviews, debugging, and more!',
          wrap: true,
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: '**What I can do:**',
          weight: 'Bolder',
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: '• 💬 Answer coding questions\n• 🔍 Analyze code snippets\n• 🐛 Explain errors\n• 📝 Review pull requests\n• 💡 Suggest improvements',
          wrap: true
        },
        {
          type: 'TextBlock',
          text: '**How to use:**',
          weight: 'Bolder',
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: 'Just @mention me and ask a question, or paste code for analysis!',
          wrap: true,
          isSubtle: true
        }
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: '📖 Show Examples',
          data: { action: 'showExamples' }
        }
      ]
    });
  }

  /**
   * Create code analysis card
   */
  static createCodeAnalysisCard(code: string, analysis: string, language: string = 'javascript'): Attachment {
    return CardFactory.adaptiveCard({
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: '🔍 Code Analysis',
          weight: 'Bolder',
          size: 'Large'
        },
        {
          type: 'TextBlock',
          text: `**Language:** ${language}`,
          isSubtle: true,
          spacing: 'Small'
        },
        {
          type: 'Container',
          style: 'emphasis',
          spacing: 'Medium',
          items: [
            {
              type: 'TextBlock',
              text: '**Your Code:**',
              weight: 'Bolder'
            },
            {
              type: 'TextBlock',
              text: `\`\`\`${language}\n${code.substring(0, 500)}${code.length > 500 ? '...' : ''}\n\`\`\``,
              wrap: true,
              fontType: 'Monospace',
              size: 'Small'
            }
          ]
        },
        {
          type: 'TextBlock',
          text: '**Analysis:**',
          weight: 'Bolder',
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: analysis,
          wrap: true
        }
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: '❓ Ask Follow-up',
          data: { action: 'followUp', code: code }
        },
        {
          type: 'Action.Submit',
          title: '✨ Get Suggestions',
          data: { action: 'getSuggestions', code: code }
        }
      ]
    });
  }

  /**
   * Create error explanation card
   */
  static createErrorExplanationCard(error: string, explanation: string): Attachment {
    return CardFactory.adaptiveCard({
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'Container',
          style: 'attention',
          items: [
            {
              type: 'TextBlock',
              text: '🐛 Error Analysis',
              weight: 'Bolder',
              size: 'Large',
              color: 'Attention'
            }
          ]
        },
        {
          type: 'TextBlock',
          text: '**Error Message:**',
          weight: 'Bolder',
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: error,
          wrap: true,
          fontType: 'Monospace',
          color: 'Attention'
        },
        {
          type: 'TextBlock',
          text: '**Explanation & Solution:**',
          weight: 'Bolder',
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: explanation,
          wrap: true
        }
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: '💬 Ask More',
          data: { action: 'askMore', error: error }
        }
      ]
    });
  }

  /**
   * Create quick question response card
   */
  static createQuestionResponseCard(question: string, answer: string): Attachment {
    return CardFactory.adaptiveCard({
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: '💡 Answer',
          weight: 'Bolder',
          size: 'Large'
        },
        {
          type: 'Container',
          style: 'emphasis',
          spacing: 'Medium',
          items: [
            {
              type: 'TextBlock',
              text: '**Your Question:**',
              weight: 'Bolder',
              size: 'Small'
            },
            {
              type: 'TextBlock',
              text: question,
              wrap: true,
              isSubtle: true
            }
          ]
        },
        {
          type: 'TextBlock',
          text: answer,
          wrap: true,
          spacing: 'Medium'
        }
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: '👍 Helpful',
          data: { action: 'feedback', value: 'positive' }
        },
        {
          type: 'Action.Submit',
          title: '👎 Not Helpful',
          data: { action: 'feedback', value: 'negative' }
        }
      ]
    });
  }

  /**
   * Create examples card
   */
  static createExamplesCard(): Attachment {
    return CardFactory.adaptiveCard({
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: '📖 Example Questions',
          weight: 'Bolder',
          size: 'Large'
        },
        {
          type: 'TextBlock',
          text: '**Code Questions:**',
          weight: 'Bolder',
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: '• "How do I handle async/await in JavaScript?"\n• "What\'s the difference between let and const?"\n• "Explain JavaScript closures"',
          wrap: true
        },
        {
          type: 'TextBlock',
          text: '**Code Analysis:**',
          weight: 'Bolder',
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: 'Just paste your code and I\'ll analyze it for bugs, performance issues, and best practices.',
          wrap: true
        },
        {
          type: 'TextBlock',
          text: '**Error Help:**',
          weight: 'Bolder',
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: 'Paste an error message with your code and I\'ll explain what went wrong and how to fix it.',
          wrap: true
        }
      ]
    });
  }

  /**
   * Create typing indicator card
   */
  static createTypingCard(): Attachment {
    return CardFactory.adaptiveCard({
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: '🤔 Thinking...',
          weight: 'Bolder',
          size: 'Medium'
        }
      ]
    });
  }

  /**
   * Create error card
   */
  static createErrorCard(errorMessage: string): Attachment {
    return CardFactory.adaptiveCard({
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'Container',
          style: 'attention',
          items: [
            {
              type: 'TextBlock',
              text: '❌ Error',
              weight: 'Bolder',
              size: 'Large',
              color: 'Attention'
            },
            {
              type: 'TextBlock',
              text: errorMessage,
              wrap: true,
              spacing: 'Small'
            }
          ]
        },
        {
          type: 'TextBlock',
          text: 'Please try again or rephrase your question.',
          isSubtle: true,
          spacing: 'Medium'
        }
      ]
    });
  }
}
