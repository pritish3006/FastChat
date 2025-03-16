import { TokenCounter } from '../tokens/counter';
import { Message, ModelInfo } from '../types';
import logger from '../../../utils/logger';

interface ContextReservation {
  systemMessage: number;
  userQuery: number;
  response: number;
  conversationHistory: number;
}

interface ContextConfig {
  // Percentages for different components (must sum to 1)
  reservationPercentages: {
    systemMessage: number;    // For system instructions
    userQuery: number;        // For current query
    response: number;         // For model's response
    conversationHistory: number; // For conversation history
  };
  // Minimum token counts for critical components
  minimumTokens: {
    systemMessage: number;
    userQuery: number;
    response: number;
  };
}

export class ContextManager {
  private tokenCounter: TokenCounter;
  private config: ContextConfig;

  constructor(
    tokenCounter: TokenCounter,
    config: Partial<ContextConfig> = {}
  ) {
    this.tokenCounter = tokenCounter;
    
    // Default configuration
    this.config = {
      reservationPercentages: {
        systemMessage: 0.10,     // 10%
        userQuery: 0.12,         // 12%
        response: 0.28,          // 28%
        conversationHistory: 0.50 // 50%
      },
      minimumTokens: {
        systemMessage: 100,  // Minimum tokens for system message
        userQuery: 200,      // Minimum tokens for user query
        response: 500,       // Minimum tokens for response
      },
      ...config
    };

    // Validate percentages sum to 1
    const sum = Object.values(this.config.reservationPercentages).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) {
      throw new Error('Context reservation percentages must sum to 1');
    }
  }

  /**
   * Calculate token reservations based on model's context window
   */
  async calculateReservations(modelContextWindow: number): Promise<ContextReservation> {
    const { reservationPercentages, minimumTokens } = this.config;

    // Calculate raw token counts based on percentages
    const rawReservations = {
      systemMessage: Math.floor(modelContextWindow * reservationPercentages.systemMessage),
      userQuery: Math.floor(modelContextWindow * reservationPercentages.userQuery),
      response: Math.floor(modelContextWindow * reservationPercentages.response),
      conversationHistory: Math.floor(modelContextWindow * reservationPercentages.conversationHistory)
    };

    // Ensure minimum tokens are met
    const adjustedReservations = {
      systemMessage: Math.max(rawReservations.systemMessage, minimumTokens.systemMessage),
      userQuery: Math.max(rawReservations.userQuery, minimumTokens.userQuery),
      response: Math.max(rawReservations.response, minimumTokens.response),
      conversationHistory: rawReservations.conversationHistory
    };

    // Adjust conversation history if minimums exceed its space
    const totalMinimums = adjustedReservations.systemMessage + 
                         adjustedReservations.userQuery + 
                         adjustedReservations.response;

    if (totalMinimums > modelContextWindow) {
      logger.warn('Minimum token requirements exceed model context window', {
        modelContextWindow,
        totalMinimums
      });
      
      // Scale down proportionally
      const scale = modelContextWindow / totalMinimums;
      return {
        systemMessage: Math.floor(adjustedReservations.systemMessage * scale),
        userQuery: Math.floor(adjustedReservations.userQuery * scale),
        response: Math.floor(adjustedReservations.response * scale),
        conversationHistory: 0 // No space for history
      };
    }

    // Adjust conversation history with remaining space
    adjustedReservations.conversationHistory = modelContextWindow - totalMinimums;

    return adjustedReservations;
  }

  /**
   * Prepare context for a chat request
   */
  async prepareContext(
    messages: Message[],
    systemMessage: string | null,
    userQuery: string,
    modelInfo: ModelInfo
  ): Promise<{
    messages: Message[];
    systemMessage: string | null;
    tokenCounts: {
      total: number;
      system: number;
      history: number;
      query: number;
    };
  }> {
    // Get context window size and calculate reservations
    const contextWindow = await this.tokenCounter.getContextWindowSize(modelInfo.modelId);
    const reservations = await this.calculateReservations(contextWindow);

    // Count tokens for system message if present
    let systemTokens = 0;
    if (systemMessage) {
      systemTokens = await this.tokenCounter.countTokens(systemMessage);
      if (systemTokens > reservations.systemMessage) {
        logger.warn('System message exceeds reservation', {
          systemTokens,
          reservation: reservations.systemMessage
        });
        // Optionally handle system message truncation
      }
    }

    // Count tokens for user query
    const queryTokens = await this.tokenCounter.countTokens(userQuery);
    if (queryTokens > reservations.userQuery) {
      logger.warn('User query exceeds reservation', {
        queryTokens,
        reservation: reservations.userQuery
      });
      // Optionally handle query truncation
    }

    // Select messages to fit in conversation history reservation
    const selectedMessages = await this.selectMessages(
      messages,
      reservations.conversationHistory
    );

    // Count total tokens in selected messages
    const historyTokens = await this.countMessageTokens(selectedMessages);

    return {
      messages: selectedMessages,
      systemMessage,
      tokenCounts: {
        total: systemTokens + historyTokens + queryTokens,
        system: systemTokens,
        history: historyTokens,
        query: queryTokens
      }
    };
  }

  /**
   * Select messages to fit within token limit
   * Currently using simple recency-based selection
   * TODO: Implement more sophisticated selection based on relevance
   */
  private async selectMessages(
    messages: Message[],
    tokenLimit: number
  ): Promise<Message[]> {
    const selectedMessages: Message[] = [];
    let totalTokens = 0;

    // Process messages from most recent to oldest
    for (const message of messages.reverse()) {
      const messageTokens = await this.tokenCounter.countTokens(message.content);
      
      if (totalTokens + messageTokens <= tokenLimit) {
        selectedMessages.unshift(message); // Add to front to maintain order
        totalTokens += messageTokens;
      } else {
        break;
      }
    }

    return selectedMessages;
  }

  /**
   * Count total tokens in messages
   */
  private async countMessageTokens(messages: Message[]): Promise<number> {
    let total = 0;
    for (const message of messages) {
      total += await this.tokenCounter.countTokens(message.content);
    }
    return total;
  }
} 