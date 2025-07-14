import { AgentContext } from '../base/types';
import { WorkflowEvents } from './workflow-manager';
import { WorkflowGraphBuilder } from './workflow-graph-builder';
import { config } from '../../../config';
import logger from '../../../utils/logger';

export class WorkflowFactory {
  /**
   * Creates a standard chat workflow using the builder pattern
   * @param initialContext - The initial context for the workflow
   * @param events - Optional events for the workflow
   * @returns A WorkflowManager instance for the chat workflow
   */
  static createChatWorkflow(initialContext: AgentContext, events?: WorkflowEvents) {
    logger.info('Creating chat workflow with builder pattern');
    
    const builder = new WorkflowGraphBuilder({
      defaultModel: config.llm.defaultModel
    });
    
    // Always add query and response agents
    builder.withQueryAgent();
    builder.withResponseAgent();
    
    // Add agents conditionally based on analysis or flags
    // We add these regardless of conditions - they'll only execute if needed
    builder.withSearchAgent(ctx => Boolean(ctx.toolResults.queryAnalysis?.needsSearch));
    builder.withVoiceAgent(ctx => Boolean(ctx.toolResults.queryAnalysis?.needsVoice));
    
    // Add summary agent with mode-specific condition
    builder.withSummaryAgent(ctx => Boolean(ctx.flags?.needsSummary));
    
    // Connect query to all other agents - they'll only execute if conditions are met
    builder.connect('query', 'search');
    builder.connect('query', 'voice');
    builder.connect('query', 'summary');
    builder.connect('query', 'response');
    
    // Connect search to summary for search-based summaries
    builder.connect('search', 'summary', ctx => 
      Boolean(ctx.flags?.needsSummary && ctx.flags?.summaryMode === 'search'));
    
    // Connect all agents to response
    builder.connect('search', 'response');
    builder.connect('voice', 'response');
    builder.connect('summary', 'response');
    
    // Build and return workflow
    return builder.build(initialContext, events);
  }
  
  /**
   * Creates a voice-focused workflow
   * @param initialContext - The initial context for the workflow
   * @param events - Optional events for the workflow
   * @returns A WorkflowManager instance for the voice workflow
   */
  static createVoiceWorkflow(initialContext: AgentContext, events?: WorkflowEvents) {
    logger.info('Creating voice workflow with STT and TTS capabilities');
    
    const builder = new WorkflowGraphBuilder({
      defaultModel: config.llm.defaultModel
    });
    
    // Add voice agent for STT (if we have audio input or simulated voice)
    const hasAudioInput = !!initialContext.audioInput;
    const hasVoiceText = initialContext.flags?.voiceText !== undefined;
    
    if (hasAudioInput || hasVoiceText) {
      logger.debug('Adding voice agent for STT processing');
      builder.withVoiceAgent();
    }
    
    // Add query agent for understanding the request
    builder.withQueryAgent();
    
    // Add search agent conditionally
    builder.withSearchAgent(ctx => Boolean(
      ctx.toolResults.queryAnalysis?.needsSearch || 
      ctx.flags.needsSearch
    ));
    
    // Add speech agent for TTS output
    builder.withSpeechAgent();
    
    // Add response agent
    builder.withResponseAgent();
    
    // Connect the workflow
    if (hasAudioInput || hasVoiceText) {
      // If we have audio input or voiceText, start with voice agent
      builder.connect('voice', 'query');
    }
    
    // Connect query to search if needed
    builder.connect('query', 'search', ctx => Boolean(
      ctx.toolResults.queryAnalysis?.needsSearch || 
      ctx.flags.needsSearch
    ));
    
    // Connect search to response
    builder.connect('search', 'response');
    
    // Connect query directly to response as well
    builder.connect('query', 'response');
    
    // Response generates text that speech agent converts to audio
    builder.connect('response', 'speech');
    
    logger.debug('Voice workflow graph built with STT and TTS capabilities');
    
    // Build and return workflow
    return builder.build(initialContext, events);
  }
  
  /**
   * Creates a search-focused workflow
   * @param initialContext - The initial context for the workflow
   * @param events - Optional events for the workflow
   * @returns A WorkflowManager instance for the search workflow
   */
  static createSearchWorkflow(initialContext: AgentContext, events?: WorkflowEvents) {
    logger.info('Creating search workflow with builder pattern');
    
    const builder = new WorkflowGraphBuilder({
      defaultModel: config.llm.defaultModel
    });
    
    return builder
      .withQueryAgent()
      .withSearchAgent()
      .withSummaryAgent(ctx => Boolean(ctx.flags?.needsSummary))
      .withResponseAgent()
      .connect('query', 'search')
      .connect('search', 'summary', ctx => Boolean(ctx.flags?.needsSummary))
      .connect('search', 'response')
      .connect('summary', 'response')
      .connect('query', 'response')
      .build(initialContext, events);
  }
} 