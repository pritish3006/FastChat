# Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm install && npm install @xenova/transformers

# Copy source
COPY . .

# Build the application
RUN npm run build

# Development stage
FROM node:18-slim AS development

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies for development
RUN npm install && npm install @xenova/transformers @anush008/tokenizers

# Copy source
COPY . .

# Set development environment
ENV NODE_ENV=development

# Start development server
CMD ["npm", "run", "dev"]

# Production stage
FROM node:18-slim AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --only=production && npm install @xenova/transformers @anush008/tokenizers

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set production environment
ENV NODE_ENV=production

# Start production server
CMD ["node", "dist/index.js"]