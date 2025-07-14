import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { BaseAgent } from './base/base-agent';
import { AgentContext, AgentResult } from './base/types';
import logger from '../../utils/logger';

export class QueryAgent extends BaseAgent {
  private readonly systemPrompt = `You are an intelligent query analyzer. Your role is to:
1. Understand the user's query and determine what tools might be needed
2. Identify if the query requires:
   - Internet search (for current information)
   - Text-to-speech conversion
3. Extract key information and context from the query
4. Determine the best way to structure the response

Respond in JSON format with:
{
  "needsSearch": boolean,
  "needsVoice": boolean,
  "searchQuery": string | null,
  "voiceText": string | null,
  "analysis": string
}`;

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: context.message }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' }
      });

      const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      // Add the analysis to the context
      if (!context.toolResults) {
        context.toolResults = {};
      }
      context.toolResults.queryAnalysis = analysis;

      this.addStep(context, context.message, analysis);

      return {
        output: analysis,
        context
      };
    } catch (error) {
      logger.error('Query analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        query: context.message
      });

      throw error;
    }
  }

  protected async executeTool(): Promise<any> {
    throw new Error('QueryAgent does not execute tools');
  }
} 