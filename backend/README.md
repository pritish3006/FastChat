# Fast Chat Backend

This is the backend component of the Fast Chat application, providing API endpoints for chat functionality, model selection, and conversation history management.

## Tech Stack

- **Node.js**: JavaScript runtime
- **Express**: Web framework
- **TypeScript**: Type-safe JavaScript
- **Socket.io**: Real-time bidirectional event-based communication
- **Supabase**: Database and authentication
- **Ollama**: Local LLM integration

## Directory Structure

```
backend/
├── src/
│   ├── controllers/   # Request handlers
│   ├── models/        # Data models and schemas
│   ├── routes/        # API route definitions
│   ├── services/      # Business logic
│   ├── config/        # Configuration files
│   ├── middleware/    # Express middleware
│   ├── utils/         # Utility functions
│   └── index.ts       # Application entry point
├── dist/              # Compiled JavaScript code
├── node_modules/      # Dependencies
├── package.json       # Project metadata and dependencies
├── tsconfig.json      # TypeScript configuration
└── README.md          # This file
```

## Getting Started

### Prerequisites

- Node.js (v18 or newer)
- npm or yarn
- Ollama installed and running locally
- Supabase CLI installed (`npm install -g supabase`)

### Database Migrations

The project uses Supabase CLI for database migrations. Here's how to work with migrations:

1. **Link to Your Supabase Project**

```bash
supabase link --project-ref your_project_ref
```

2. **View Migration Status**

```bash
supabase migration list
```

3. **Create a New Migration**

```bash
supabase migration new your_migration_name
```

This creates a new timestamped SQL file in `supabase/migrations/`.

4. **Apply Migrations**

```bash
supabase db push
```

5. **Reset Database (Development Only)**

```bash
supabase db reset
```

This resets the database and reapplies all migrations.

6. **Pull Remote Changes**

```bash
supabase db pull
```

This syncs your local schema with the remote database.

**Note**: Always test migrations locally before applying them to production.

### Local Development

1. **Install dependencies**

```bash
npm install
```

2. **Create a .env file**

```
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
OLLAMA_API_URL=http://localhost:11434
```

3. **Start the development server**

```bash
npm run dev
```

The server will start on http://localhost:3001 with hot reloading enabled.

### Building for Production

```bash
npm run build
```

This will compile TypeScript files to JavaScript in the `dist` directory.

### Running in Production

```bash
npm start
```

## API Endpoints

### Health Check
- **GET** `/api/health` - Check if the server is running

Additional endpoints will be documented as they are implemented.

## Testing

```bash
npm test
```

## Linting

```bash
npm run lint
```

## Docker

A Dockerfile is provided to containerize the application. Build and run with:

```bash
docker build -t fast-chat-backend .
docker run -p 3001:3001 fast-chat-backend
``` 