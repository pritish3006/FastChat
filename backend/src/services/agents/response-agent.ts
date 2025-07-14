import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { BaseAgent } from './base/base-agent';
import { AgentContext, AgentResult } from './base/types';
import logger from '../../utils/logger';

export class ResponseAgent extends BaseAgent {
  private readonly systemPrompt = `You are a helpful AI assistant. Your role is to:
1. Provide clear, accurate, and helpful responses
2. Use any search results provided to enhance your response
3. Keep responses concise but informative
4. Maintain a friendly and professional tone`;

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: this.systemPrompt }
      ];

      // Add search context if available
      if (context.toolResults?.search?.length) {
        messages.push({
          role: 'system',
          content: `Here are some relevant search results:\n${
            JSON.stringify(context.toolResults.search, null, 2)
          }`
        });
      }

      // Add message history and current query
      if (context.history?.length) {
        messages.push(...context.history);
      }

      messages.push({ role: 'user', content: context.message });

      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens,
        stream: true
      });

      const response = await this.streamResponse(completion, context);

      // Store the response
      if (!context.toolResults) context.toolResults = {};
      context.toolResults.response = response;

      this.addStep(context, context.message, response);

      return {
        output: response,
        context
      };
    } catch (error) {
      logger.error('Response generation failed', {
        error: error instanceof Error ? error.message : String(error),
        query: context.message
      });

      throw error;
    }
  }

  protected async executeTool(): Promise<any> {
    throw new Error('ResponseAgent does not execute tools');
  }
} 