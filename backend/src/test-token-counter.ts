import { tokenizeText } from './services/llm/tokens/counter';
import logger from './utils/logger';

// Set log level to info
logger.level = 'info';

async function testTokenCounter() {
  const sampleText = "Hello, this is a test of the tokenizer functionality!";
  logger.info(`Testing tokenization for text: "${sampleText}"`);

  try {
    const tokens = await tokenizeText(sampleText);
    logger.info('Tokens:', tokens);
  } catch (error) {
    logger.error('Tokenization test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testTokenCounter().catch(error => {
    logger.error('Test failed:', error);
    process.exit(1);
  });
}