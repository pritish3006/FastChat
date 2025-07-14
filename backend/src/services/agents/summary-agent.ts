import { BaseAgent } from './base/base-agent';
import { AgentContext, AgentResult } from './base/types';
import logger from '../../utils/logger';

export class SummaryAgent extends BaseAgent {
  private readonly basePrompt = `You are a summarization expert. Your role is to create clear, concise, and accurate summaries while maintaining the key information and context.`;

  private readonly modePrompts = {
    search: `Analyze search results and:
1. Extract key information and findings
2. Create a concise but comprehensive summary
3. Organize by relevance and importance
4. Highlight key dates, statistics, and quotes
5. Include source references

Format your summary with:
- Brief overview (1-2 sentences)
- Key points in bullet form
- Important quotes or statistics
- Sources referenced`,

    chat: `Create a TLDR (Too Long; Didn't Read) summary of the chat conversation that:
1. Captures the main topics discussed
2. Highlights key decisions or conclusions
3. Notes any action items or next steps
4. Preserves important context
5. Maintains chronological flow if relevant

Format your summary with:
- Main topic/theme
- Key points discussed
- Decisions/conclusions reached
- Action items (if any)`,

    voice: `Create a summarized transcript of the voice conversation that:
1. Captures the essential dialogue
2. Maintains speaker context
3. Highlights key points and decisions
4. Notes any action items
5. Preserves emotional context or tone where relevant

Format your summary with:
- Conversation context
- Main points of discussion
- Key decisions or outcomes
- Action items or follow-ups`
  };

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const mode = context.flags?.summaryMode || 'chat';
      let contentToSummarize: any;
      let prompt: string;

      switch (mode) {
        case 'search':
          contentToSummarize = context.toolResults.search;
          if (!contentToSummarize?.length) {
            return { output: null, context };
          }
          // Format search results
          contentToSummarize = contentToSummarize.map((result: any) => ({
            title: result.title,
            content: result.content,
            url: result.url
          }));
          break;

        case 'chat':
          contentToSummarize = context.history;
          if (!contentToSummarize?.length) {
            return { output: null, context };
          }
          break;

        case 'voice':
          contentToSummarize = context.toolResults.voice?.text;
          if (!contentToSummarize) {
            return { output: null, context };
          }
          break;
      }

      const messages = [
        { role: 'system', content: `${this.basePrompt}\n\n${this.modePrompts[mode]}` },
        { 
          role: 'user', 
          content: `Please summarize this ${mode} content:\n${JSON.stringify(contentToSummarize, null, 2)}`
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: this.config.temperature ?? 0.3,
        max_tokens: this.config.maxTokens,
        stream: true
      });

      const summary = await this.streamResponse(response, context);

      // Add summary to context
      if (!context.toolResults) context.toolResults = {};
      context.toolResults.summary = summary;

      this.addStep(context, { mode, contentLength: JSON.stringify(contentToSummarize).length }, summary);

      return {
        output: summary,
        context
      };
    } catch (error) {
      logger.error('Summary generation failed', {
        error: error instanceof Error ? error.message : String(error),
        mode: context.flags?.summaryMode,
        query: context.message
      });

      throw error;
    }
  }

  protected async executeTool(): Promise<any> {
    throw new Error('SummaryAgent does not execute tools');
  }
} 