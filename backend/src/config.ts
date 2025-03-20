import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

const configSchema = z.object({
  server: z.object({
    port: z.number().default(3000),
    host: z.string().default('localhost'),
    nodeEnv: z.enum(['development', 'test', 'production']).default('development')
  }).default({}),
  cors: z.object({
    allowedOrigins: z.array(z.string()).default(['http://localhost:3000'])
  }).default({}),
  search: z.object({
    tavilyApiKey: z.string()
  }).default({}),
  voice: z.object({
    sttApiKey: z.string(),
    ttsApiKey: z.string()
  }).default({}),
  llm: z.object({
    provider: z.enum(['openai', 'ollama']).default('openai'),
    defaultModel: z.string().default('gpt-3.5-turbo'),
    temperature: z.number().default(0.7),
    topP: z.number().default(0.9),
    maxTokens: z.number().default(1000),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional()
  }).default({})
});

export const config = configSchema.parse({
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
    host: process.env.HOST,
    nodeEnv: process.env.NODE_ENV
  },
  cors: {
    allowedOrigins: process.env.CORS_ORIGINS?.split(',')
  },
  search: {
    tavilyApiKey: process.env.TAVILY_API_KEY
  },
  voice: {
    sttApiKey: process.env.DEEPGRAM_API_KEY_STT,
    ttsApiKey: process.env.DEEPGRAM_API_KEY_TTS
  },
  llm: {
    provider: process.env.LLM_PROVIDER as 'openai' | 'ollama',
    defaultModel: process.env.DEFAULT_MODEL,
    temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : undefined,
    topP: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : undefined,
    maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : undefined,
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OLLAMA_BASE_URL
  }
}); 