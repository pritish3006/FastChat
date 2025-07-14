import { EventEmitter } from 'events';

/**
 * Converts an EventEmitter that emits 'chunk' events to an AsyncIterable
 * This allows us to use event-based APIs in a streaming context
 */
export async function* eventEmitterToAsyncIterable(emitter: EventEmitter): AsyncGenerator<string> {
  let isDone = false;
  let error: Error | null = null;
  const queue: string[] = [];
  let resolve: ((value: IteratorResult<string>) => void) | null = null;

  // Set up event handlers
  emitter.on('chunk', (chunk: { text?: string; content?: string }) => {
    const token = chunk.text || chunk.content || '';
    if (resolve) {
      resolve({ value: token, done: false });
      resolve = null;
    } else {
      queue.push(token);
    }
  });

  emitter.on('done', () => {
    isDone = true;
    if (resolve) {
      resolve({ value: '', done: true });
    }
  });

  emitter.on('error', (err: Error) => {
    error = err;
    if (resolve) {
      resolve({ value: '', done: true });
    }
  });

  try {
    while (!isDone) {
      // If we have queued tokens, yield them
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }

      // Wait for the next event
      const result = await new Promise<IteratorResult<string>>(r => {
        resolve = r;
        // Add timeout to prevent hanging
        setTimeout(() => {
          if (resolve) {
            resolve({ value: '', done: true });
            resolve = null;
          }
        }, 30000); // 30 second timeout
      });

      if (result.done) break;
      yield result.value;
    }

    if (error) {
      throw error;
    }
  } finally {
    // Clean up
    emitter.removeAllListeners();
  }
} 