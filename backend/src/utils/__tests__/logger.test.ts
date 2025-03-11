import { logger, logError, logInfo } from '../logger';

// mock pino to prevent actual logging during tests
jest.mock('pino', () => {
  const mockPino = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockPino);
});

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should log errors with context', () => {
    const error = new Error('test error');
    const context = { requestId: 'test-123', userId: 'user-456' };
    
    logError(error, context);
    
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ 
        err: error,
        requestId: 'test-123',
        userId: 'user-456' 
      }),
      'test error'
    );
  });

  it('should log info messages', () => {
    logInfo('test message', { key: 'value' });
    
    expect(logger.info).toHaveBeenCalledWith(
      { key: 'value' },
      'test message'
    );
  });

  // Testing behavior, not implementation since we mocked pino
  it('should use consistent log format', () => {
    const error = new Error('consistent format test');
    logError(error);
    logInfo('info test');
    
    // Both methods should call their respective logger methods
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
}); 