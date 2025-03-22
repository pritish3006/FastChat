# Fast Chat

An AI chat application with low latency and streaming outputs, featuring modular design for tool/agentic integrations.

## Project Structure

- `/frontend` - Next.js and React frontend application
- `/backend` - Node.js with Express backend API
- `/UI-ideas` - Design mockups and UI concepts

## Features

- Low latency and streaming outputs using Ollama's efficient local inference
- Modular architecture allowing for tool/agentic integrations
- Context retention per chat session using Supabase
- Prompt editing and redo capabilities
- Response generation stopping on demand
- Model selection from available Ollama models

## Tech Stack

### Frontend
- Next.js and React
- Responsive UI with components for message display, prompt editing, and control buttons
- State management using React Context or Redux

### Backend
- Node.js with Express
- REST API endpoints for chat message relay, conversation history management, and control actions
- Ollama integration for local LLM interaction
- Modular middleware for tool/agent integrations

### Storage
- Supabase (PostgreSQL) for conversation histories and user sessions

## Getting Started

### Prerequisites
- Node.js (v18 or newer)
- Docker and Docker Compose
- Ollama service running locally

### Installation

```bash
# Clone the repository
git clone https://github.com/pritish3006/FastChat.git
cd FastChat

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

### Database Setup

1. **Install Supabase CLI**
```bash
npm install -g supabase
```

2. **Initialize Supabase**
```bash
supabase init
```

3. **Link to Your Supabase Project**
```bash
supabase link --project-ref your_project_ref
```

4. **Apply Database Migrations**
```bash
supabase db push
```

For detailed instructions on working with database migrations, see the [backend README](backend/README.md#database-migrations).

## Development

```bash
# Start frontend development server
cd frontend
npm run dev

# Start backend development server
cd ../backend
npm run dev
```

## API Documentation

The Fast Chat backend provides a comprehensive set of API endpoints for chat, voice processing, and agent-based interactions.

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication
Most endpoints support optional authentication via Bearer token:
```bash
Authorization: Bearer your_token_here
```

### Available Endpoints

#### Chat Endpoints

1. **Create Chat Session**
```bash
curl -X POST http://localhost:3000/api/v1/chat/sessions \
  -H "Content-Type: application/json"
```

2. **Send Message**
```bash
curl -X POST http://localhost:3000/api/v1/chat/messages \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your_session_id",
    "message": "Your message here"
  }'
```

3. **Get Session History**
```bash
curl -X GET http://localhost:3000/api/v1/chat/sessions/{sessionId}/messages
```

#### Voice Agent Endpoints

1. **Process Voice Input**
```bash
curl -X POST http://localhost:3000/api/v1/agent/voice \
  -F "audio=@/path/to/your/audio.wav" \
  -F "voiceOptions={\"voice\":\"nova\",\"model\":\"nova-2\"}"
```

2. **Transcribe Audio**
```bash
curl -X POST http://localhost:3000/api/v1/agent/voice/transcribe \
  -F "audio=@/path/to/your/audio.wav" \
  -F "language=en-US" \
  -F "model=nova-2"
```

3. **Synthesize Speech**
```bash
curl -X POST http://localhost:3000/api/v1/agent/voice/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Text to convert to speech",
    "options": {
      "voice": "nova",
      "model": "nova-2",
      "speed": 1.0,
      "pitch": 1.0
    }
  }'
```

#### Agent Workflow Endpoints

1. **Process Query Through Agent Workflow**
```bash
curl -X POST http://localhost:3000/api/v1/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Your query here",
    "flags": {
      "needsSearch": true,
      "needsSummary": true,
      "summaryMode": "search"
    }
  }'
```

2. **Generate Summary**
```bash
curl -X POST http://localhost:3000/api/v1/agent/summary \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Content to summarize",
    "mode": "search"
  }'
```

### Testing the API

We provide a convenient test script for the voice agent:

```bash
# Test with text input
./scripts/test-voice-agent.sh --text "What is the weather like today?"

# Test with audio file
./scripts/test-voice-agent.sh --audio path/to/audio.wav

# Test with predefined presets
./scripts/test-voice-agent.sh --preset factual
./scripts/test-voice-agent.sh --preset complex
./scripts/test-voice-agent.sh --preset conversation
```

For more detailed API documentation, including request/response schemas and examples, visit the Swagger UI at:
```
http://localhost:3000/api-docs
```

## License

[MIT](LICENSE) 