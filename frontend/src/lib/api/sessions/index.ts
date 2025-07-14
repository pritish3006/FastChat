/**
 * Sessions API exports with throttling
 * 
 * Provides throttled versions of the sessions API to prevent spam
 */

import { sessionsAPI } from './sessions.api';
import { createThrottledAPIClient } from '../throttled';

// Export the raw API for cases where throttling is not needed
export const rawSessionsAPI = sessionsAPI;

// Export the throttled version for general use
export const throttledSessionsAPI = createThrottledAPIClient(sessionsAPI);

// Default export is the throttled version
export default throttledSessionsAPI; 