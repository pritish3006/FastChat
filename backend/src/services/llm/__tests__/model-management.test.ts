/**
 * @jest-environment node
 */

import { LLMService, createLLMService } from '../index';
import { Session } from '../types';
import assert from 'assert';

async function runTests() {
  console.log('Starting Model Management Tests...\n');
  
  let llmService: LLMService;
  let testSession: Session;

  // Setup
  console.log('Setting up test environment...');
  llmService = createLLMService({
    model: {
      provider: 'ollama',
      modelId: 'llama3.2',
      baseUrl: 'http://localhost:11434'
    }
  });

  await llmService.initialize();
  testSession = await llmService.startSession();
  console.log('Setup complete!\n');

  try {
    // Model Selection Tests
    console.log('Running Model Selection Tests...');
    
    // Test 1: List Models
    console.log('- Testing listModels...');
    const models = await llmService.listModels();
    assert(Array.isArray(models), 'models should be an array');
    assert(models.length > 0, 'models array should not be empty');
    console.log('✅ listModels test passed\n');

    // Test 2: Set Model
    console.log('- Testing setModel...');
    const testModel = models[0].name;
    const updatedSession = await llmService.setModel(testSession.id, testModel);
    assert(updatedSession.modelId === testModel, 'model should be updated in session');
    console.log('✅ setModel test passed\n');

    // Test 3: Invalid Model
    console.log('- Testing invalid model error...');
    try {
      await llmService.setModel(testSession.id, 'non-existent-model');
      assert(false, 'should have thrown an error');
    } catch (error: any) {
      assert(error.message.includes('not found'), 'should throw not found error');
    }
    console.log('✅ invalid model test passed\n');

    // Model Configuration Tests
    console.log('Running Model Configuration Tests...');
    
    // Test 4: Update Config
    console.log('- Testing updateModelConfig...');
    const testConfig = {
      temperature: 0.7,
      topP: 0.9,
      topK: 40
    };
    const configUpdatedSession = await llmService.updateModelConfig(testSession.id, testConfig);
    assert(configUpdatedSession.modelConfig?.temperature === testConfig.temperature, 'temperature should match');
    assert(configUpdatedSession.modelConfig?.topP === testConfig.topP, 'topP should match');
    assert(configUpdatedSession.modelConfig?.topK === testConfig.topK, 'topK should match');
    console.log('✅ updateModelConfig test passed\n');

    console.log('All tests passed! 🎉');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await llmService.shutdown();
  }
}

// Run the tests
runTests().catch(console.error); 