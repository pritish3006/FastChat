# Fast Chat Frontend

## Project info: prototyped frontend for Low-latency AI chatbot with custom LLM services (Locally deployed using vLLM, Ollama, or llama.cpp) or via private API keys for major LLM providers.

**Lovable URL**: [lovable project](https://lovable.dev/projects/d23d141d-9401-45ed-b985-671d1ac01599)



Changes made via Lovable will automatically get committed to the repo.

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```
## Tech Stack

- **React**: UI library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Build tool
- **Redux**: State management
- **React Router**: Routing
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn UI**: Component library
- **Socket.io**: Real-time communication
- **Supabase**: Database and authentication

## Directory Structure

```
frontend/
├── public/             # Static assets
├── src/
│   ├── components/     # UI components
│   │   ├── chat/       # Chat-specific components
│   │   ├── layout/     # Layout components
│   │   └── ui/         # UI components (shadcn)
│   ├── hooks/          # Custom React hooks
│   ├── integrations/   # External API integrations
│   ├── lib/            # Utility libraries
│   ├── pages/          # Page components
│   ├── redux/          # Redux state management
│   │   └── features/   # Redux slices
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── App.tsx         # Root component
│   └── main.tsx        # Entry point
├── .dockerignore       # Docker ignore file
├── Dockerfile          # Docker configuration
├── index.html          # HTML entry point
├── nginx.conf          # Nginx configuration for production
├── package.json        # Dependencies and scripts
├── postcss.config.js   # PostCSS configuration
├── tailwind.config.ts  # Tailwind CSS configuration
├── tsconfig.json       # TypeScript configuration
└── vite.config.ts      # Vite configuration
```

## Getting Started

### Prerequisites

- Node.js (v18 or newer)
- npm or yarn

### Local Development

1. **Install dependencies**

```bash
npm install
```

2. **Start the development server**

```bash
npm run dev
```

The app will be available at http://localhost:8080 with hot reloading enabled.

### Building for Production

```bash
npm run build
```

This will create a `dist` directory with optimized production assets.

### Previewing the Production Build

```bash
npm run preview
```

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development
- `npm run lint` - Run ESLint
- `npm run preview` - Preview the production build
- `npm start` - Start the preview server on port 3000
- `npm test` - Run tests (when implemented)

## Docker

A Dockerfile is provided to containerize the application. Build and run with:

```bash
# Build the Docker image
docker build -t fast-chat-frontend .

# Run the container
docker run -p 3000:80 fast-chat-frontend
```

## Key Features

- **Chat Interface**: Clean, responsive interface for interacting with AI models
- **Message History**: View and continue past conversations
- **Model Selection**: Choose from available Ollama models
- **Streaming Responses**: Real-time streaming of AI responses
- **Responsive Design**: Works on desktop and mobile devices
