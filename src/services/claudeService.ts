import Anthropic from '@anthropic-ai/sdk';

export interface CodeAnalysisRequest {
  code: string;
  language?: string;
  question?: string;
  context?: string;
}

export interface CodeAnalysisResponse {
  analysis: string;
  suggestions?: string[];
  codeExamples?: string[];
}

export class ClaudeService {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({
      apiKey: apiKey
    });
    this.model = model;
  }

  /**
   * Ask a general coding question
   */
  async askQuestion(question: string, context?: string): Promise<string> {
    const systemPrompt = `You are Claude, an AI assistant specializing in software development and coding.
You provide clear, concise, and accurate answers to programming questions.
When showing code examples, use proper syntax highlighting and explain your reasoning.`;

    const userMessage = context
      ? `Context: ${context}\n\nQuestion: ${question}`
      : question;

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }]
      });

      const textContent = message.content.find(block => block.type === 'text');
      return textContent ? textContent.text : 'I was unable to generate a response.';
    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error('Failed to get response from Claude API');
    }
  }

  /**
   * Analyze code snippet
   */
  async analyzeCode(request: CodeAnalysisRequest): Promise<CodeAnalysisResponse> {
    const { code, language = 'unknown', question, context } = request;

    const systemPrompt = `You are an expert code reviewer and software architect.
Analyze code for:
- Correctness and potential bugs
- Performance issues
- Security vulnerabilities
- Code quality and best practices
- Readability and maintainability

Provide actionable feedback with specific suggestions.`;

    let userMessage = `Please analyze this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``;

    if (question) {
      userMessage += `\n\nSpecific question: ${question}`;
    }

    if (context) {
      userMessage += `\n\nAdditional context: ${context}`;
    }

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }]
      });

      const textContent = message.content.find(block => block.type === 'text');
      const analysis = textContent ? textContent.text : 'Unable to analyze code.';

      return {
        analysis,
        suggestions: this.extractSuggestions(analysis),
        codeExamples: this.extractCodeExamples(analysis)
      };
    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error('Failed to analyze code');
    }
  }

  /**
   * Explain error message
   */
  async explainError(errorMessage: string, code?: string): Promise<string> {
    const systemPrompt = `You are a debugging expert. Help developers understand and fix errors by:
1. Explaining what the error means in simple terms
2. Identifying the likely root cause
3. Providing step-by-step solutions
4. Suggesting preventive measures`;

    let userMessage = `I'm getting this error:\n\n\`\`\`\n${errorMessage}\n\`\`\``;

    if (code) {
      userMessage += `\n\nHere's the relevant code:\n\n\`\`\`\n${code}\n\`\`\``;
    }

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }]
      });

      const textContent = message.content.find(block => block.type === 'text');
      return textContent ? textContent.text : 'Unable to explain error.';
    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error('Failed to explain error');
    }
  }

  /**
   * Review pull request (simplified version)
   */
  async reviewPullRequest(diff: string, title: string, description?: string): Promise<string> {
    const systemPrompt = `You are a senior software engineer performing code review. Focus on:
- Code correctness and logic errors
- Security vulnerabilities
- Performance concerns
- Best practices and patterns
- Test coverage considerations

Provide constructive, actionable feedback.`;

    let userMessage = `Pull Request: ${title}`;
    if (description) {
      userMessage += `\n\nDescription: ${description}`;
    }
    userMessage += `\n\nChanges:\n\`\`\`diff\n${diff}\n\`\`\``;

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userMessage
        }]
      });

      const textContent = message.content.find(block => block.type === 'text');
      return textContent ? textContent.text : 'Unable to review PR.';
    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error('Failed to review pull request');
    }
  }

  /**
   * Extract suggestions from analysis text
   */
  private extractSuggestions(text: string): string[] {
    const suggestions: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.match(/^[-*]\s+/)) {
        suggestions.push(line.replace(/^[-*]\s+/, '').trim());
      }
    }

    return suggestions.slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Extract code examples from analysis text
   */
  private extractCodeExamples(text: string): string[] {
    const codeBlocks: string[] = [];
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push(match[1].trim());
    }

    return codeBlocks;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'ping'
        }]
      });
      return true;
    } catch (error) {
      console.error('Claude API health check failed:', error);
      return false;
    }
  }
}
