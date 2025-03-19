/**
 * chain implementation using langchain
 * 
 * provides various types of chains for different use cases
 */

import { RunnableSequence } from "@langchain/core/runnables";
import { 
  ChatPromptTemplate, 
  HumanMessagePromptTemplate, 
  SystemMessagePromptTemplate,
  MessagesPlaceholder
} from "@langchain/core/prompts";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MemoryManager } from "../memory";
import { BaseModelProvider } from "../types";
import logger from "../../../utils/logger";

export interface ChainConfig {
  model: BaseModelProvider;
  memory?: MemoryManager;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * creates a conversation chain 
 */
export function createConversationChain(config: ChainConfig) {
  const { model, memory, systemPrompt, temperature = 0.7, maxTokens = 1000 } = config;
  
  // Create LangChain model wrapper
  const langChainModel = model.asLangChainModel({
    temperature,
    maxTokens
  });
  
  // Create prompt template
  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      systemPrompt || "You are a helpful AI assistant."
    ),
    // Include chat history using MessagesPlaceholder
    new MessagesPlaceholder("history"),
    // User's current message
    HumanMessagePromptTemplate.fromTemplate("{question}")
  ]);
  
  // Create the chain
  return RunnableSequence.from([
    {
      question: (input: any) => input.question || input.input || "",
      history: async (input: any) => {
        // Get conversation history from memory if available
        if (memory) {
          try {
            const messages = await memory.getMessages(
              input.sessionId,
              input.branchId
            );
            
            // Convert to LangChain format
            return messages.map(msg => {
              if (msg.role === "user") {
                return new HumanMessage(msg.content || "");
              } else if (msg.role === "assistant") {
                return new AIMessage(msg.content || "");
              } else {
                return new SystemMessage(msg.content || "");
              }
            });
          } catch (error) {
            logger.error("Error loading memory in chain", { error });
            return [];
          }
        }
        return [];
      }
    },
    prompt,
    langChainModel
  ]);
}

/**
 * creates a branching chain for branch management
 */
export function createBranchingChain(config: ChainConfig) {
  const { model, systemPrompt, temperature = 0.2, maxTokens = 1000 } = config;
  
  // Create LangChain model wrapper
  const langChainModel = model.asLangChainModel({
    temperature,
    maxTokens
  });
  
  // Branch analysis system prompt
  const branchSystemPrompt = systemPrompt || 
    "You are an AI assistant that analyzes conversation branches. " +
    "Analyze the differences between branches and help with branch management.";
  
  // Create prompt template
  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(branchSystemPrompt),
    HumanMessagePromptTemplate.fromTemplate(
      "Source branch: {sourceBranch}\n" +
      "Target branch: {targetBranch}\n" +
      "Task: {task}\n\n" +
      "Analyze the branches according to the task."
    )
  ]);
  
  // Create the chain
  return RunnableSequence.from([
    {
      sourceBranch: (input: any) => input.sourceBranch || "No source branch content provided",
      targetBranch: (input: any) => input.targetBranch || "No target branch content provided",
      task: (input: any) => input.task || "compare"
    },
    prompt,
    langChainModel
  ]);
}

/**
 * creates a context-aware chain
 */
export function createContextAwareChain(config: ChainConfig & {
  contextProvider?: (input: any) => Promise<string>;
}) {
  const { model, memory, systemPrompt, contextProvider, temperature = 0.7, maxTokens = 1000 } = config;
  
  // Create LangChain model wrapper
  const langChainModel = model.asLangChainModel({
    temperature,
    maxTokens
  });
  
  // Context-aware system prompt
  const contextSystemPrompt = systemPrompt || 
    "You are a helpful AI assistant that uses the provided context to answer questions accurately. " +
    "Always reference the context when it's relevant to the question.";
  
  // Create prompt template
  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(contextSystemPrompt),
    SystemMessagePromptTemplate.fromTemplate("Context: {context}"),
    // Include chat history using MessagesPlaceholder
    new MessagesPlaceholder("history"),
    // User's current message
    HumanMessagePromptTemplate.fromTemplate("{question}")
  ]);
  
  // Create the chain
  return RunnableSequence.from([
    {
      question: (input: any) => input.question || input.input || "",
      history: async (input: any) => {
        // Get conversation history from memory if available
        if (memory) {
          try {
            const messages = await memory.getMessages(
              input.sessionId,
              input.branchId
            );
            
            // Convert to LangChain format
            return messages.map(msg => {
              if (msg.role === "user") {
                return new HumanMessage(msg.content || "");
              } else if (msg.role === "assistant") {
                return new AIMessage(msg.content || "");
              } else {
                return new SystemMessage(msg.content || "");
              }
            });
          } catch (error) {
            logger.error("Error loading memory in chain", { error });
            return [];
          }
        }
        return [];
      },
      context: async (input: any) => {
        if (contextProvider) {
          try {
            return await contextProvider(input);
          } catch (error) {
            logger.error("Error fetching context", { error });
            return "No additional context available.";
          }
        }
        return input.context || "No context provided.";
      }
    },
    prompt,
    langChainModel
  ]);
}

/**
 * creates a router chain
 */
export function createRouterChain(config: {
  conversationChain: RunnableSequence;
  branchingChain: RunnableSequence;
  contextAwareChain: RunnableSequence;
}) {
  const { conversationChain, branchingChain, contextAwareChain } = config;
  
  // Create router chain
  // This is a simplified version - in a real implementation, you'd use
  // LangChain's RunnableBranch with more sophisticated routing logic
  return {
    route: async (input: any) => {
      // Route based on input type
      if (input.task === "branch" || input.sourceBranch || input.targetBranch) {
        logger.info("Routing to branching chain");
        return branchingChain.invoke(input);
      } else if (input.context || input.useContext) {
        logger.info("Routing to context-aware chain");
        return contextAwareChain.invoke(input);
      } else {
        logger.info("Routing to conversation chain");
        return conversationChain.invoke(input);
      }
    }
  };
} 