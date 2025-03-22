/**
 * Base Agent
 * 
 * This module provides a base class for all agents.
 * It includes methods for streaming responses, handling tool calls, and adding steps to the agent's history.
 */

import { OpenAI } from 'openai';
import { config } from '../../../config';
import logger from '../../../utils/logger';
import {
  AgentConfig,
  AgentContext,
  AgentExecutor,
  AgentResult,
  BaseAgentOptions,
  StreamingConfig
} from './types';

export abstract class BaseAgent implements AgentExecutor {
  protected config: AgentConfig;
  protected openai: OpenAI;
  protected streaming?: StreamingConfig;

  constructor(options: BaseAgentOptions) {
    this.config = options.config;
    this.streaming = options.streaming;

    if (!config.llm.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({
      apiKey: config.llm.apiKey
    });
  }

  abstract execute(context: AgentContext): Promise<AgentResult>;

  protected async streamResponse(
    response: AsyncIterable<any>,
    context: AgentContext
  ): Promise<string> {
    let fullResponse = '';

    try {
      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          if (this.streaming?.onToken) {
            this.streaming.onToken(content);
          }
        }
      }

      if (this.streaming?.onComplete) {
        this.streaming.onComplete();
      }

      return fullResponse;
    } catch (error) {
      logger.error('Error in stream response', {
        error: error instanceof Error ? error.message : String(error),
        agent: this.config.name
      });

      if (this.streaming?.onError) {
        this.streaming.onError(error as Error);
      }

      throw error;
    }
  }

  protected async handleToolCall(
    toolName: string,
    args: any,
    context: AgentContext
  ): Promise<any> {
    try {
      if (this.streaming?.onToolStart) {
        this.streaming.onToolStart(toolName);
      }

      // Tool execution will be handled by specific agents
      const result = await this.executeTool(toolName, args, context);

      if (this.streaming?.onToolEnd) {
        this.streaming.onToolEnd(toolName, result);
      }

      return result;
    } catch (error) {
      logger.error('Tool execution failed', {
        tool: toolName,
        error: error instanceof Error ? error.message : String(error),
        agent: this.config.name
      });

      throw error;
    }
  }

  protected abstract executeTool(
    toolName: string,
    args: any,
    context: AgentContext
  ): Promise<any>;

  protected addStep(
    context: AgentContext,
    input: any,
    output: any
  ): void {
    context.intermediateSteps.push({
      agent: this.config.name,
      input,
      output,
      timestamp: Date.now()
    });
  }
} 