import { ModelProviderFactory } from '../providers';
import { OllamaProvider } from '../providers/ollama';
import { BaseModelProvider, ModelConfig, StreamController } from '../types';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import logger from '../../../utils/logger';

// Set log level to info
logger.level = 'info';

// Helper function to log with formatting
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

// Use real Ollama instance
const OLLAMA_BASE_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';

// Add type for Ollama API response
interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaResponse {
  models: OllamaModel[];
}

// Function to get available models
async function getAvailableModel(): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    const data = await response.json() as OllamaResponse;
    const models = data.models || [];
    if (models.length === 0) {
      throw new Error('No models available in Ollama');
    }
    // Return the first available model
    return models[0].name;
  } catch (error) {
    logger.error('Error fetching models:', error);
    throw error;
  }
}

async function testModelProviderFactory(modelId: string) {
  logSection('Testing ModelProviderFactory');
  
  try {
    // Test 1: Create provider
    logger.info('Test: Create Ollama provider');
    const config: ModelConfig = {
      provider: 'ollama',
      modelId,
      baseUrl: OLLAMA_BASE_URL
    };

    const provider = ModelProviderFactory.getProvider(config);
    if (!(provider instanceof OllamaProvider)) {
      throw new Error('Expected OllamaProvider instance');
    }
    logger.info('✓ Provider created successfully');

    // Test 2: Reuse provider
    logger.info('\nTest: Reuse existing provider');
    const provider2 = ModelProviderFactory.getProvider(config);
    if (provider !== provider2) {
      throw new Error('Expected same provider instance');
    }
    logger.info('✓ Provider reused successfully');

    // Test 3: Invalid provider
    logger.info('\nTest: Handle invalid provider');
    try {
      ModelProviderFactory.getProvider({
        ...config,
        provider: 'invalid' as any
      });
      throw new Error('Expected error for invalid provider');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Unsupported provider')) {
        throw error;
      }
      logger.info('✓ Invalid provider handled correctly');
    }

    return true;
  } catch (error) {
    logger.error('ModelProviderFactory tests failed:', error);
    return false;
  }
}

async function testOllamaProvider(modelId: string) {
  logSection('Testing OllamaProvider');

  try {
    const provider = new OllamaProvider();
    const config: ModelConfig = {
      provider: 'ollama',
      modelId,
      baseUrl: OLLAMA_BASE_URL,
      temperature: 0.7
    };

    // Test 1: Configuration validation
    logger.info('Test: Configuration validation');
    provider.validateConfig(config);
    logger.info('✓ Valid config accepted');

    try {
      provider.validateConfig({ ...config, modelId: undefined as any });
      throw new Error('Should fail for missing modelId');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Model ID is required')) {
        throw error;
      }
      logger.info('✓ Invalid modelId handled correctly');
    }

    try {
      provider.validateConfig({ ...config, temperature: 1.5 });
      throw new Error('Should fail for invalid temperature');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Temperature must be between 0 and 1')) {
        throw error;
      }
      logger.info('✓ Invalid temperature handled correctly');
    }

    // Test 2: Model initialization
    logger.info('\nTest: Model initialization');
    const model = await provider.initialize(config);
    if (!(model instanceof ChatOllama)) {
      throw new Error('Expected ChatOllama instance');
    }
    logger.info('✓ Model initialized successfully');

    // Test 3: Chat completion
    logger.info('\nTest: Chat completion');
    const response = await provider.generateChatCompletion({
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      stream: false
    });

    if (!('text' in response)) {
      throw new Error('Expected text response');
    }
    if (typeof response.text !== 'string' || response.text.length === 0) {
      throw new Error('Invalid response text');
    }
    logger.info('✓ Chat completion successful');
    logger.info(`Response: ${response.text.substring(0, 100)}${response.text.length > 100 ? '...' : ''}`);

    // Test 4: Streaming
    logger.info('\nTest: Streaming response');
    const stream = await provider.generateChatCompletion({
      messages: [{ role: 'user', content: 'In 5 sentences tell me about Chandragupta Maurya"' }],
      stream: true,
      temperature: 0.1
    });

    if (!('on' in stream)) {
      throw new Error('Expected streaming response');
    }

    let receivedChunks = 0;
    let fullResponse = '';

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Stream timeout after 30 seconds'));
        }, 30000);

        // Handle data chunks
        stream.on('chunk', (chunk: any) => {
          try {
            receivedChunks++;
            if (chunk.text) {
              fullResponse += chunk.text;
              process.stdout.write(chunk.text);
            }
          } catch (error) {
            clearTimeout(timeout);
            reject(new Error(`Error processing chunk: ${error}`));
          }
        });

        // Handle end of stream
        stream.on('done', () => {
          if (receivedChunks === 0) {
            clearTimeout(timeout);
            reject(new Error('Stream ended without sending any chunks'));
          } else {
            clearTimeout(timeout);
            resolve(true);
          }
        });

        // Handle errors
        stream.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Stream error: ${error}`));
        });
      });

      logger.info(`\n✓ Streaming successful (${receivedChunks} chunks)`);
      logger.info(`Full response: "${fullResponse.trim()}"`);

      // Basic validation
      if (fullResponse.length === 0) {
        throw new Error('Empty response received');
      }

      return true;
    } catch (error) {
      logger.error('Streaming test failed:', error);
      throw error;
    } finally {
      // Cleanup
      if (stream && typeof (stream as any).destroy === 'function') {
        (stream as any).destroy();
      }
    }
  } catch (error) {
    logger.error('OllamaProvider tests failed:', error);
    return false;
  }
}

async function testModelConfigurations(modelId: string) {
  logSection('Testing Different Model Configurations');

  const configs = [
    {
      name: 'Default Configuration',
      config: {
        provider: 'ollama' as const,
        modelId,
        baseUrl: OLLAMA_BASE_URL,
        temperature: 0.7
      }
    },
    {
      name: 'High Temperature (More Creative)',
      config: {
        provider: 'ollama' as const,
        modelId,
        baseUrl: OLLAMA_BASE_URL,
        temperature: 0.9,
        topP: 0.9
      }
    },
    {
      name: 'Low Temperature (More Deterministic)',
      config: {
        provider: 'ollama' as const,
        modelId,
        baseUrl: OLLAMA_BASE_URL,
        temperature: 0.1,
        topP: 0.1
      }
    },
    {
      name: 'Balanced Configuration',
      config: {
        provider: 'ollama' as const,
        modelId,
        baseUrl: OLLAMA_BASE_URL,
        temperature: 0.5,
        topP: 0.5,
        topK: 40
      }
    }
  ];

  for (const { name, config } of configs) {
    logger.info(`\nTesting: ${name}`);
    logger.info(`Config: ${JSON.stringify(config, null, 2)}`);

    try {
      const provider = new OllamaProvider();
      await provider.initialize(config);

      const stream = await provider.generateChatCompletion({
        messages: [{ role: 'user', content: 'In 3 sentences tell me about the Taj Mahal' }],
        stream: true,
        temperature: config.temperature
      });

      if (!('on' in stream)) {
        throw new Error('Expected streaming response');
      }

      let receivedChunks = 0;
      let fullResponse = '';

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Stream timeout after 30 seconds'));
        }, 30000);

        stream.on('chunk', (chunk: any) => {
          try {
            receivedChunks++;
            if (chunk.text) {
              fullResponse += chunk.text;
              process.stdout.write(chunk.text);
            }
          } catch (error) {
            clearTimeout(timeout);
            reject(new Error(`Error processing chunk: ${error}`));
          }
        });

        stream.on('done', () => {
          if (receivedChunks === 0) {
            clearTimeout(timeout);
            reject(new Error('Stream ended without sending any chunks'));
          } else {
            clearTimeout(timeout);
            resolve(true);
          }
        });

        stream.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Stream error: ${error}`));
        });
      });

      logger.info(`\n✓ Streaming successful (${receivedChunks} chunks)`);
      logger.info(`Full response: "${fullResponse.trim()}"`);

      if (stream && typeof (stream as any).destroy === 'function') {
        (stream as any).destroy();
      }
    } catch (error) {
      logger.error(`Test failed for ${name}:`, error);
    }
  }
}

// Update the main test function to include configuration tests
async function runTests() {
  try {
    logSection('Model Provider Integration Tests');
    
    // Get available model
    const modelId = await getAvailableModel();
    logger.info(`Using model: ${modelId}\n`);

    // Run tests
    const factorySuccess = await testModelProviderFactory(modelId);
    const providerSuccess = await testOllamaProvider(modelId);
    await testModelConfigurations(modelId);

    // Report results
    logSection('Test Results');
    logger.info(`ModelProviderFactory: ${factorySuccess ? '✓ PASS' : '✗ FAIL'}`);
    logger.info(`OllamaProvider: ${providerSuccess ? '✓ PASS' : '✗ FAIL'}`);

    if (!factorySuccess || !providerSuccess) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Tests failed:', error);
    process.exit(1);
  }
}

// Run the tests
runTests(); 