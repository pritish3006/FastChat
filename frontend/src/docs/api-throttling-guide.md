# API Throttling Guide for Fast Chat

This document describes how to prevent API spamming in the Fast Chat application.

## Overview

To protect our backend from excessive API calls and improve user experience, we've implemented a comprehensive throttling system. This system consists of:

1. **Server-side rate limiting**: Limits requests based on IP address and endpoint type
2. **Client-side throttling**: Prevents rapid successive API calls from the frontend

## Server-side Rate Limiting

The backend implements rate limiting middleware with different configurations:

- **Default limit**: 60 requests per minute (all endpoints)
- **Chat endpoints**: 20 requests per minute (stricter)
- **Auth endpoints**: 30 requests per 15 minutes (longer window)

These are defined in `backend/src/middleware/rateLimiter.ts`.

## Client-side Throttling

To complement server-side limits, we've implemented client-side throttling mechanisms:

### 1. Utility Functions (`frontend/src/lib/utils/debounce.ts`)

- **`debounce(func, wait)`**: Delays execution until wait time has passed since last call
- **`throttle(func, wait)`**: Ensures function runs at most once per wait period
- **`useDebounceCallback(callback, delay)`**: React hook for debouncing functions with status tracking
- **`useThrottleCallback(callback, limit)`**: React hook for throttling functions

### 2. API Client Wrappers (`frontend/src/lib/api/throttled.ts`)

We've created proxy wrappers that automatically throttle API calls:

- **`createThrottledAPIClient(apiClient, config)`**: Creates a basic throttled version of any API client
- **`createAdvancedThrottledAPIClient(apiClient, config)`**: Enhanced version that supports async generators

### Default Throttling Configuration

Different API methods have different throttling intervals:

```typescript
const DEFAULT_THROTTLE_CONFIG = {
  // Session management (less frequent operations)
  createSession: 2000,   // 2 seconds
  getSessions: 2000,     // 2 seconds
  
  // Message operations (more frequent operations)
  sendMessage: 1000,     // 1 second
  streamMessage: 1000,   // 1 second
  
  // Default for any other method
  default: 1000          // 1 second
};
```

## How to Use Throttled APIs

### Option 1: Use Pre-throttled Clients

Import the pre-throttled API clients:

```typescript
import { throttledChatAPI } from '@/lib/api/chat';
import { throttledSessionsAPI } from '@/lib/api/sessions';

// Then use them directly
const sessions = await throttledSessionsAPI.getSessions();
const result = await throttledChatAPI.sendMessage({ /* ... */ });
```

### Option 2: Create Throttled Versions on Demand

You can create throttled versions of any API client:

```typescript
import { createThrottledAPIClient } from '@/lib/api/throttled';
import { myCustomAPI } from './my-custom-api';

const throttledCustomAPI = createThrottledAPIClient(myCustomAPI, {
  customMethod: 3000, // 3 second interval 
  default: 1000       // 1 second for other methods
});

// Then use it
throttledCustomAPI.customMethod();
```

### Option 3: Use Debouncing in Component Methods

For UI event handlers:

```typescript
import { useDebounceCallback } from '@/lib/utils/debounce';

function MyComponent() {
  const [debouncedSendMessage, isDebouncing] = useDebounceCallback((message) => {
    // This won't be called more often than once per second
    api.sendMessage(message);
  }, 1000);

  return (
    <button 
      onClick={() => debouncedSendMessage("Hello")}
      disabled={isDebouncing()}
    >
      Send
    </button>
  );
}
```

## Best Practices

1. **Always use throttled clients** for API calls in production code
2. **Add feedback for users** when throttling prevents an action
3. **Use longer intervals** for expensive operations (like creating sessions)
4. **Keep raw API clients available** for testing or when bypassing throttling is needed
5. **Disable buttons** during debounce periods to prevent clicks

## Error Handling

When API calls are throttled, they will:

1. Show a toast notification to the user
2. Return a rejected Promise with an error message
3. Log the throttling event

Handle these rejections appropriately:

```typescript
try {
  const result = await throttledAPI.someMethod();
  // Success path
} catch (error) {
  if (error.message.includes('throttled')) {
    // This was a throttling error - already handled by toast
    // Optional: provide additional UI feedback
  } else {
    // Handle other types of errors
    toast.error("An error occurred: " + error.message);
  }
}
```

## Debugging

You can temporarily bypass throttling for debugging by:

1. Using the raw API clients directly
2. Increasing the throttle intervals in development

```typescript
// In development only:
const devConfig = { default: 100 }; // 100ms for rapid testing
const devThrottledAPI = createThrottledAPIClient(api, devConfig);
``` 