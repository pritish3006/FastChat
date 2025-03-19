import { LLMService } from '../services/llm';
import { RedisManager } from '../services/llm/memory/redis';

declare global {
  var llmService: LLMService;
  var redisManager: RedisManager;
}

export {}; 