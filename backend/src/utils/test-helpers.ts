/**
 * Test Utility Helpers
 * Provides shared utilities for test scripts
 */

import { EventEmitter } from 'events';

/**
 * MockWebSocket - A simple WebSocket mock for testing
 * Implements the minimum interface required by StreamingManager
 */
export class MockWebSocket extends EventEmitter {
  sent: any[] = [];
  readyState = 1; // WebSocket.OPEN

  constructor() {
    super();
    this.setMaxListeners(100); // Increase max listeners to avoid warnings
  }

  // Mock send method that records sent messages
  send(data: string): void {
    this.sent.push(JSON.parse(data));
    console.log(`WebSocket sent: ${data}`);
  }

  // Mock close method
  close(): void {
    this.readyState = 3; // WebSocket.CLOSED
    this.emit('close');
  }

  // Helper method to simulate receiving a message
  simulateMessage(data: any): void {
    this.emit('message', JSON.stringify(data));
  }

  // Helper method to retrieve sent messages
  getSentMessages(): any[] {
    return this.sent;
  }

  // Helper method to clear sent messages
  clearSentMessages(): void {
    this.sent = [];
  }
} 