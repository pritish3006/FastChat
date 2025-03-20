/**
 * websocket type definitions
 * 
 * contains interfaces for all websocket messages types
 * used for type safety in client-server communication
 */

import { StringValidation } from "zod";

/**
 * base interface for all websocket messages
 */
interface WebSocketMessage {
    type: string;
}

/**
 * client message types
 */
export interface ChatRequestMessage extends WebSocketMessage {
    type: 'chat_request';
    content: string;
    conversationId: string | null;
    parentMessageId: string | null;
    model: string;
    options? : {
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    };
}

export interface CancelRequestMessage extends WebSocketMessage {
    type: 'cancel_request';
    requestId: string;
}

export interface HistoryRequestMessage extends WebSocketMessage {
    type: 'history_request';
    conversationId: string;
    limit?: number;
    before?: string; // pagination reference message id
}

export interface PingMessage extends WebSocketMessage {
    type: 'ping';
    timestamp?: number;
}

/**
 * server message types
 */
export interface ChatResponseChunkMessage extends WebSocketMessage {
    type: 'chat_response_chunk';
    requestId: string;
    conversationId: string;
    content: string;
}

export interface ChatResposeEndMessage extends WebSocketMessage {
    type: 'chat_response_end';
    requestId: string;
    conversationId: string;
    messageId: string; // final message id for this conversation in the database
}

export interface HistoryUpdateMessage extends WebSocketMessage {
    type: 'history_update';
    conversationId: string | null; // null for new conversations
    messages: ChatMessage[]; // list of messages in the conversation (where is this coming from?) 
}

export interface ErrorMessage extends WebSocketMessage {
    type: 'error';
    message: string;
    code: string;
    timestamp?: number;
}

export interface PongMessage extends WebSocketMessage {
    type: 'pong';
    timestamp?: number;
}

export interface ConnectionInfoMessage extends WebSocketMessage {
    type: 'connection_info';
    clientId: string;
    reconnectBackoff: {
        initialDelay: number;
        maxDelay: number;
        factor: number;
    };
}

/**
 * chat message interface
 */
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    model?: string;
    parentId: string | null;
}

/**
 * union types for client and sever messages
 */
export type ClientMessage = 
    | ChatRequestMessage
    | CancelRequestMessage
    | HistoryRequestMessage
    | PingMessage;

export type ServerMessage = 
    | ChatResponseChunkMessage
    | ChatResposeEndMessage
    | HistoryUpdateMessage
    | ErrorMessage
    | PongMessage
    | ConnectionInfoMessage;

/**
 * socket data interface for authentication information
 */
export interface SocketData {
    userId: string | null;
    isAuthenticated: boolean;
}



