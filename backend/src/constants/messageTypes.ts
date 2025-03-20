export const MessageTypes = {
  // Client -> Server
  CHAT_REQUEST: 'chat_request',
  CANCEL_REQUEST: 'cancel_request',
  HISTORY_REQUEST: 'history_request',
  PING: 'ping',
  SELECT_MODEL: 'select_model',
  MODEL_SELECTED: 'model_selected',
  
  // Server -> Client
  CHAT_RESPONSE_CHUNK: 'chat_response_chunk',
  CHAT_RESPONSE_END: 'chat_response_end',
  HISTORY_UPDATE: 'history_update',
  ERROR: 'error',
  PONG: 'pong',
  CONNECTION_INFO: 'connection_info'
} as const; 