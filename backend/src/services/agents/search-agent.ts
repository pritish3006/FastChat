import { BaseAgent } from './base/base-agent';
import { AgentContext, AgentResult } from './base/types';
import { TavilySearchService } from '../search/tavily';
import logger from '../../utils/logger';

export class SearchAgent extends BaseAgent {
  private searchService: TavilySearchService;

  constructor(options: any) {
    super(options);
    this.searchService = new TavilySearchService();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      if (!context.flags?.needsSearch) {
        return { output: null, context };
      }

      const searchResults = await this.executeTool('search', {
        query: context.message,
        searchDepth: 'advanced',
        maxResults: 5
      }, context);

      // Add search results to context
      if (!context.toolResults) context.toolResults = {};
      context.toolResults.search = searchResults.results;

      this.addStep(context, context.message, searchResults);

      return {
        output: searchResults.results,
        context
      };
    } catch (error) {
      logger.error('Search operation failed', {
        error: error instanceof Error ? error.message : String(error),
        query: context.message
      });

      throw error;
    }
  }

  protected async executeTool(
    toolName: string,
    args: any,
    context: AgentContext
  ): Promise<any> {
    if (toolName !== 'search') {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    if (this.streaming?.onToolStart) {
      this.streaming.onToolStart('search');
    }

    try {
      const results = await this.searchService.search(args.query, {
        searchDepth: args.searchDepth,
        maxResults: args.maxResults
      });

      if (this.streaming?.onToolEnd) {
        this.streaming.onToolEnd('search', results);
      }

      return results;
    } catch (error) {
      logger.error('Search tool execution failed', {
        error: error instanceof Error ? error.message : String(error),
        args
      });

      throw error;
    }
  }
} 