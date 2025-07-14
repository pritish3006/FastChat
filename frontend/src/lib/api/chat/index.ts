/**
 * Chat API exports with throttling
 * 
 * Provides throttled versions of the chat API to prevent spam
 */

import { chatAPI } from './chat.api';
import { createAdvancedThrottledAPIClient } from '../throttled';

// Export the raw API for cases where throttling is not needed
export const rawChatAPI = chatAPI;

// Export the throttled version for general use
export const throttledChatAPI = createAdvancedThrottledAPIClient(chatAPI);

// Default export is the throttled version
export default throttledChatAPI; 