import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicTool } from '@langchain/core/tools';
import logger from '../../../utils/logger';
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { StateGraph, END } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';

// Set environment to development for logging
process.env.NODE_ENV = 'development';

// Set log level to info
logger.level = 'debug';

// Define our state type
interface AgentState {
  input: string;
  chat_history: any[];
  intermediate_steps: any[];
  output?: any;
}

// Define our schema for tool usage using Zod
const toolCallSchema = z.object({
  tool: z.enum(['CALCULATOR_TOOL', 'TIME_TOOL']).describe("The name of the tool to use (calculator or get_current_time)"),
  input: z.string().describe("The input to pass to the tool"),
  reasoning: z.string().describe("Why you chose this tool and input"),
  next_action: z.string().optional().describe("If another tool needs to be used after this one, specify which tool and why")
});

type ToolCall = z.infer<typeof toolCallSchema>;

// Ollama API types
interface OllamaRequest {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

function logSection(title: string) {
  logger.info('\n' + '='.repeat(50));
  logger.info(title);
  logger.info('='.repeat(50) + '\n');
}

function logError(error: unknown, context: string) {
  if (error instanceof Error) {
    logger.error(`${context} Error:`, {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
  } else {
    logger.error(`${context} Error:`, {
      error: String(error),
      type: typeof error
    });
  }
}

async function testModelCapabilities() {
  logSection('Starting Model Capabilities Test');

  // Define a simple calculator tool
  const calculatorTool = new DynamicTool({
    name: 'CALCULATOR_TOOL',
    description: 'Performs mathematical calculations. Input should be a mathematical expression (e.g., "123 * 456" or "156.78 * 0.15").',
    func: async (input: string) => {
      try {
        logger.info('Executing calculator tool with input:', input);
        const result = eval(input).toString();
        logger.info('Calculator result:', result);
        return result;
      } catch (error) {
        logError(error, 'Calculator Tool');
        return 'Error evaluating expression';
      }
    },
  });

  // Define a current time tool
  const getCurrentTimeTool = new DynamicTool({
    name: 'TIME_TOOL',
    description: 'Get the current time in ISO format. No input needed, just pass an empty string.',
    func: async () => {
      const time = new Date().toISOString();
      logger.info('Current time:', time);
      return time;
    },
  });

  // Define tools array
  const tools = [calculatorTool, getCurrentTimeTool];

  // Create the parser and get format instructions
  const parser = new StructuredOutputParser(toolCallSchema);
  const formatInstructions = parser.getFormatInstructions();

  // Create a prompt template that guides the model to output in our format
  const prompt = PromptTemplate.fromTemplate(`
You are a helpful assistant that can use tools to answer questions.
Available tools:
{tools}

Important Instructions:
1. For the calculator tool, always format mathematical expressions properly (e.g., "123 * 456" or "156.78 * 0.15" for percentages)
2. For the time tool, you don't need any input, just pass an empty string
3. If a question requires multiple tools:
   - Choose the most logical tool to use first
   - Specify the next tool needed in the next_action field
   - Be explicit about why each tool is needed

Question: {input}

{format_instructions}

Think carefully about which tool(s) to use and why, then output in the required format.
If you need multiple tools, specify the next tool needed in the next_action field.
`);

  const models = [
    {
      name: 'llama3.2:latest',
      baseUrl: 'http://localhost:11434',
    },
  ];

  // Test cases with increasing complexity
  const testCases = [
    {
      name: "Basic Calculator",
      question: "What is 123 multiplied by 456? Use the calculator tool to be precise."
    },
  ];

  for (const model of models) {
    try {
      logSection(`Testing model: ${model.name}`);

      // Test 1: Basic inference
      logger.info('Testing basic inference...');
      try {
        const response = await fetch(`${model.baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.name,
            prompt: 'What is 2+2?',
            system: 'You are a helpful AI assistant. Please be concise.',
            stream: false
          } as OllamaRequest)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const result = await response.json() as OllamaResponse;
        logger.info('Basic inference response:', {
          content: result.response
        });
      } catch (error) {
        logError(error, 'Basic Inference Test');
      }

      // Test 2: Structured Output Parsing with Tool Usage
      logger.info('\nTesting structured output parsing with tool usage...');
      try {
        // Create the graph
        const graph = new StateGraph<AgentState>({
          channels: {
            input: { value: (x: string) => x },
            chat_history: { value: (x: any[]) => x },
            intermediate_steps: { value: (x: any[]) => x },
            output: { value: (x: any) => x }
          }
        });

        logger.info('Created StateGraph with channels');

        // Define the oracle function that will make decisions
        async function run_oracle(state: AgentState) {
          logger.info('Running oracle with state:', state);
          
          const toolList = tools.map(t => `${t.name}: ${t.description}`).join('\n');
          const formattedPrompt = await prompt.format({
            tools: toolList,
            input: state.input,
            format_instructions: formatInstructions
          });

          logger.info('Formatted prompt:', formattedPrompt);

          const response = await fetch(`${model.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model.name,
              prompt: formattedPrompt,
              stream: false
            } as OllamaRequest)
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json() as OllamaResponse;
          
          logger.info('Raw LLM Response:', {
            model: result.model,
            response: result.response,
            totalDuration: result.total_duration
          });

          try {
            const parsed = await parser.parse(result.response);
            logger.info('Parsed response:', parsed);
            return { intermediate_steps: [...(state.intermediate_steps || []), parsed] };
          } catch (error) {
            logger.error('Failed to parse LLM response:', error);
            return { output: "Failed to parse response" };
          }
        }

        // Define the router function
        function router(state: AgentState) {
          logger.info('Router called with state:', state);
          
          if (!state.intermediate_steps?.length) {
            logger.info('No intermediate steps, routing to oracle');
            return "oracle";
          }

          const lastStep = state.intermediate_steps[state.intermediate_steps.length - 1];
          logger.info('Last step:', lastStep);
          
          if (lastStep.next_action) {
            logger.info('Next action found:', lastStep.next_action);
            return lastStep.next_action;
          }
          
          logger.info('No next action, routing to final');
          return "final";
        }

        // Define the tool runner
        async function run_tool(state: AgentState) {
          logger.info('Tool runner called with state:', state);
          
          const lastStep = state.intermediate_steps[state.intermediate_steps.length - 1];
          const tool = tools.find(t => t.name === lastStep.tool);

          if (!tool) {
            logger.error('Tool not found:', lastStep.tool);
            return { output: `Tool ${lastStep.tool} not found` };
          }

          try {
            logger.info('Executing tool:', {
              tool: lastStep.tool,
              input: lastStep.input
            });
            
            const result = await tool.invoke(lastStep.input);
            logger.info('Tool execution result:', result);
            
            return {
              intermediate_steps: [...state.intermediate_steps, {
                tool: lastStep.tool,
                input: lastStep.input,
                output: result
              }]
            };
          } catch (error) {
            logError(error, 'Tool Execution');
            return { output: `Error executing tool ${lastStep.tool}: ${error}` };
          }
        }

        // Add nodes to the graph
        logger.info('Adding nodes to graph');
        graph.addNode("oracle", run_oracle);
        graph.addNode("calculator", run_tool);
        graph.addNode("time", run_tool);
        graph.addNode("final", run_tool);

        // Set the entry point
        logger.info('Setting entry point');
        graph.setEntryPoint("oracle");

        // Add edges
        logger.info('Adding edges');
        graph.addEdge("oracle", "calculator");
        graph.addEdge("calculator", "oracle");
        graph.addEdge("oracle", "time");
        graph.addEdge("time", "oracle");
        graph.addEdge("oracle", "final");
        graph.addEdge("final", END);

        // Compile the graph
        logger.info('Compiling graph');
        const chain = graph.compile();

        logger.info('Graph created and compiled successfully');

        // Run test cases
        for (const testCase of testCases) {
          logSection(`Running test case: ${testCase.name}`);
          logger.info('Question:', testCase.question);

          try {
            const result = await chain.invoke({
              input: testCase.question,
              chat_history: [],
              intermediate_steps: []
            });
            
            logger.info('Test result:', JSON.stringify(result, null, 2));
          } catch (error) {
            logError(error, `Test Case: ${testCase.name}`);
          }
        }

      } catch (error) {
        logError(error, 'Graph Execution');
      }

    } catch (error) {
      logError(error, `Model ${model.name} Test Suite`);
    }
  }
}

// Run the tests
testModelCapabilities().catch(error => {
  logError(error, 'Test Suite Execution');
  process.exit(1);
}); 