import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicTool } from '@langchain/core/tools';
import logger from '../../../utils/logger';
import { RunnableSequence, RunnableMap } from '@langchain/core/runnables';
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { RunnableConfig } from '@langchain/core/runnables';

// Set log level to info
logger.level = 'info';

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
  // Define a simple calculator tool
  const calculatorTool = new DynamicTool({
    name: 'CALCULATOR_TOOL',
    description: 'Performs mathematical calculations. Input should be a mathematical expression (e.g., "123 * 456" or "156.78 * 0.15").',
    func: async (input: string) => {
      try {
        return eval(input).toString();
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
    func: async () => new Date().toISOString(),
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
    {
      name: 'deepseek-r1:latest',
      baseUrl: 'http://localhost:11434',
    },
  ];

  // Test cases with increasing complexity
  const testCases = [
    {
      name: "Basic Calculator",
      question: "What is 123 multiplied by 456? Use the calculator tool to be precise."
    },
    {
      name: "Current Time",
      question: "What is the current time? Use the get_current_time tool."
    },
    {
      name: "Multi-tool Sequential",
      question: "First tell me the current time, then calculate 15% of 156.78"
    },
    {
      name: "Complex Calculation",
      question: "If I have $156.78 and want to leave a 20% tip, then split the total bill among 3 people, how much does each person pay?"
    },
    {
      name: "Time-based Calculation",
      question: "What time will it be 2.5 hours from now? First get the current time, then help me calculate."
    },
    {
      name: "Ambiguous Tool Choice",
      question: "I need to calculate something and check the time, but I'm not sure which to do first. Maybe calculate 42 divided by 7 and then tell me the time?"
    }
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
        // Create the chain
        const chain = RunnableSequence.from([
          {
            tools: (input: { input: string }) => {
              const toolList = tools.map(t => `${t.name}: ${t.description}`).join('\n');
              logger.info('Available tools:', { toolList });
              return toolList;
            },
            input: (input: { input: string }) => {
              logger.info('Processing input:', { input: input.input });
              return input.input;
            },
            format_instructions: (input: { input: string }) => {
              logger.info('Format instructions:', { formatInstructions });
              return formatInstructions;
            }
          },
          prompt,
          {
            invoke: async (formattedPrompt: string) => {
              // Ensure we have a string prompt
              const promptString = typeof formattedPrompt === 'string' 
                ? formattedPrompt 
                : JSON.stringify(formattedPrompt);
              
              logger.info('Formatted prompt:', {
                prompt: promptString,
                promptType: typeof promptString,
                promptLength: promptString.length,
                hasSystemPrompt: promptString.includes('AVAILABLE TOOLS:'),
                hasFormatInstructions: promptString.includes('RESPONSE FORMAT:')
              });
              
              const response = await fetch(`${model.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: model.name,
                  prompt: promptString,
                  stream: false
                } as OllamaRequest)
              });

              if (!response.ok) {
                const errorText = await response.text();
                logger.error('HTTP request failed:', {
                  status: response.status,
                  statusText: response.statusText,
                  errorBody: errorText
                });
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
              }

              const result = await response.json() as OllamaResponse;
              
              // Log the raw LLM response before any processing
              logger.info('Raw LLM Response:', {
                model: result.model,
                response: result.response,
                totalDuration: result.total_duration,
                evalCount: result.eval_count,
                evalDuration: result.eval_duration,
                responseLength: result.response.length,
                responseType: typeof result.response,
                isEmpty: !result.response || result.response.trim() === '',
                firstChar: result.response ? result.response[0] : 'undefined',
                lastChar: result.response ? result.response[result.response.length - 1] : 'undefined',
                containsNewlines: result.response ? result.response.includes('\n') : false,
                containsTabs: result.response ? result.response.includes('\t') : false
              });

              return { text: result.response };
            }
          },
          parser
        ]);

        logger.info('Chain created successfully');
        logger.info('Format instructions:', formatInstructions);

        // Run test cases
        for (const testCase of testCases) {
          logger.info('\n==================================================');
          logger.info(`Running test case: ${testCase.name}`);
          logger.info('==================================================\n');

          try {
            logger.info('Question:', testCase.question);
            const result = await chain.invoke({
              input: testCase.question
            });
            logger.info('Test result:', JSON.stringify(result, null, 2));
          } catch (error) {
            logger.error('Error during test execution:', {
              testCase: testCase.name,
              question: testCase.question,
              model: model.name,
              error: error instanceof Error ? {
                message: error.message,
                name: error.name,
                stack: error.stack
              } : error,
              context: 'Failed during model invocation or tool execution'
            });
          }
        }

        logger.info('✓ Structured output parsing tests completed successfully');

      } catch (error) {
        logError(error, 'Structured Output Parsing Test');
        logger.info('Model may not support structured output parsing');
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