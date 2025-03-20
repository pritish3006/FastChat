import { config } from '../../config';
import logger from '../../utils/logger';

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilySearchResponse {
  results: TavilySearchResult[];
  query: string;
  search_depth?: string;
}

export interface SearchOptions {
  searchDepth?: 'basic' | 'advanced';
  includeImages?: boolean;
  includeLinks?: boolean;
  maxResults?: number;
}

export class TavilySearchService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.tavily.com/search';

  constructor() {
    const apiKey = config.search?.tavilyApiKey;
    if (!apiKey) {
      throw new Error('Tavily API key is not configured');
    }
    this.apiKey = apiKey;
  }

  async search(query: string, options: SearchOptions = {}): Promise<TavilySearchResponse> {
    try {
      const searchParams = {
        api_key: this.apiKey,
        query,
        search_depth: options.searchDepth || 'basic',
        include_images: options.includeImages || false,
        include_links: options.includeLinks || true,
        max_results: options.maxResults || 5
      };

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchParams)
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('Tavily search completed', { query, resultCount: data.results?.length });
      
      return data;
    } catch (error) {
      logger.error('Tavily search failed', { 
        error: error instanceof Error ? error.message : String(error),
        query 
      });
      throw error;
    }
  }
} 