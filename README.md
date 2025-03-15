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

## License

[MIT](LICENSE) 