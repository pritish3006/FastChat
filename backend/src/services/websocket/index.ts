/**
 * websocket service
 * 
 * manages socket.io connections and events.
 * handles real-time message streaming between client and server.
 */

import { Socket } from 'socket.io';
import { io } from '../../index';
import logger from '../../utils/logger';
import { llmService, ChatMessage } from '../llm';

// map of user ids to their active socket connections
const userSockets = new Map<string, Socket[]>();

// map of socket ids to active stream controllers
const activeStreams = new Map<string, Map<string, any>>();

/**
 * registers a socket connection with a user id
 */
export function registerUserSocket(userId: string, socket: Socket): void {
  // get existing sockets for this user or create new array
  const sockets = userSockets.get(userId) || [];
  
  // add this socket to the user's sockets
  sockets.push(socket);
  
  // update the map
  userSockets.set(userId, sockets);
  
  // create a place to store active streams for this socket
  activeStreams.set(socket.id, new Map());
  
  logger.info(`user ${userId} connected with socket ${socket.id}`);
}

/**
 * removes a socket from a user's registered sockets
 */
export function removeUserSocket(userId: string, socket: Socket): void {
  // get existing sockets
  const sockets = userSockets.get(userId);
  
  if (sockets) {
    // filter out this socket
    const updatedSockets = sockets.filter(s => s.id !== socket.id);
    
    // update or remove entry
    if (updatedSockets.length > 0) {
      userSockets.set(userId, updatedSockets);
    } else {
      userSockets.delete(userId);
    }
  }
  
  // clear active streams for this socket
  const socketStreams = activeStreams.get(socket.id);
  if (socketStreams) {
    // abort any active streams
    socketStreams.forEach(stream => {
      if (stream && stream.abort) {
        stream.abort();
      }
    });
    
    // remove the map
    activeStreams.delete(socket.id);
  }
  
  logger.info(`user ${userId} disconnected socket ${socket.id}`);
}

/**
 * sends a message to all of a user's connected sockets
 */
export function broadcastToUser(userId: string, event: string, data: any): void {
  const sockets = userSockets.get(userId);
  
  if (sockets && sockets.length > 0) {
    sockets.forEach(socket => {
      socket.emit(event, data);
    });
    
    logger.debug(`broadcast ${event} to user ${userId} on ${sockets.length} sockets`);
  }
}

/**
 * handles a chat request from the client
 */
export async function handleChatRequest(
  socket: Socket, 
  userId: string,
  requestId: string, 
  messages: ChatMessage[],
  modelId: string,
  options: any
): Promise<void> {
  // get or create the map for this socket's streams
  let socketStreams = activeStreams.get(socket.id);
  if (!socketStreams) {
    socketStreams = new Map();
    activeStreams.set(socket.id, socketStreams);
  }
  
  // abort any existing stream with this request id
  if (socketStreams.has(requestId)) {
    const existingStream = socketStreams.get(requestId);
    if (existingStream && existingStream.abort) {
      existingStream.abort();
    }
    socketStreams.delete(requestId);
  }
  
  try {
    // extract the system prompt if present
    const systemMessages = messages.filter(m => m.role === 'system');
    const systemPrompt = systemMessages.length > 0 ? systemMessages[0].content : undefined;
    
    // convert messages to a prompt string
    const prompt = llmService.messagesToPrompt(messages.filter(m => m.role !== 'system'));
    
    // generate a streaming completion
    const stream = await llmService.generateCompletion({
      prompt,
      model: modelId,
      systemPrompt,
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens,
      topP: options?.topP,
      stop: options?.stop,
      context: options?.context,
    });
    
    // store the stream controller
    socketStreams.set(requestId, stream);
    
    // send initial response that streaming is starting
    socket.emit('chat:start', { requestId });
    
    // buffer for accumulating the full response
    let fullResponse = '';
    
    // handle data events (tokens from the model)
    stream.on('data', (data: any) => {
      socket.emit('chat:token', { 
        requestId, 
        token: data.response,
        done: data.done,
      });
      
      fullResponse += data.response;
    });
    
    // handle the end of the stream
    stream.on('end', (data: any) => {
      socket.emit('chat:complete', { 
        requestId,
        response: fullResponse,
        context: data.context,
      });
      
      // remove from active streams
      socketStreams.delete(requestId);
    });
    
    // handle errors
    stream.on('error', (error: any) => {
      socket.emit('chat:error', { 
        requestId,
        error: error.message || 'Unknown error',
        code: error.statusCode || 500,
      });
      
      // remove from active streams
      socketStreams.delete(requestId);
    });
    
    // handle aborted streams
    stream.on('abort', () => {
      socket.emit('chat:abort', { requestId });
      
      // remove from active streams
      socketStreams.delete(requestId);
    });
    
  } catch (error: any) {
    // handle errors in setup
    socket.emit('chat:error', { 
      requestId,
      error: error.message || 'Failed to start chat',
      code: error.statusCode || 500,
    });
    
    logger.error('error in chat request', { error, userId, requestId });
  }
}

/**
 * handles a request to stop generation
 */
export function handleStopGeneration(
  socket: Socket,
  requestId: string
): void {
  const socketStreams = activeStreams.get(socket.id);
  
  if (socketStreams && socketStreams.has(requestId)) {
    const stream = socketStreams.get(requestId);
    
    if (stream && stream.abort) {
      // abort the stream
      stream.abort();
      
      // remove from active streams
      socketStreams.delete(requestId);
      
      // notify client
      socket.emit('chat:abort', { requestId });
      
      logger.info(`stopped generation for request ${requestId}`);
    }
  }
}

/**
 * configure socket events
 */
export function setupSocketEvents(): void {
  io.on('connection', (socket: Socket) => {
    let userId: string | null = null;
    
    // authenticate socket connection
    socket.on('auth', (data: { userId: string }) => {
      // in a real app, verify the user id from a token
      userId = data.userId;
      
      // register this socket
      registerUserSocket(userId, socket);
      
      // acknowledge authentication
      socket.emit('auth:success', { userId });
    });
    
    // handle chat messages
    socket.on('chat:request', async (data: {
      requestId: string;
      messages: ChatMessage[];
      modelId: string;
      options?: any;
    }) => {
      if (!userId) {
        socket.emit('auth:required');
        return;
      }
      
      await handleChatRequest(
        socket,
        userId,
        data.requestId,
        data.messages,
        data.modelId,
        data.options
      );
    });
    
    // handle stop generation requests
    socket.on('chat:stop', (data: { requestId: string }) => {
      if (!userId) {
        socket.emit('auth:required');
        return;
      }
      
      handleStopGeneration(socket, data.requestId);
    });
    
    // handle disconnection
    socket.on('disconnect', () => {
      if (userId) {
        removeUserSocket(userId, socket);
      }
    });
  });
  
  logger.info('websocket events configured');
}

// export the setup function
export default {
  setupSocketEvents,
}; 