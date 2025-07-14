import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { applyAllMiddleware } from './server/middleware';
import { errorHandler } from './middleware/errorHandler';
import { swaggerSpec } from './config/swagger';

// Import routes
import modelsRouter from './routes/models';
import chatRouter from './routes/chat';
import searchRouter from './routes/search';
import voiceRouter from './routes/voice';
import agentRouter from './routes/agent';
import branchesRouter from './routes/branches';
import tokensRouter from './routes/tokens';
import authRouter from './routes/auth';

const app = express();

// Apply all middleware
applyAllMiddleware(app);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API Routes
app.use('/api/v1/models', modelsRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/agent', agentRouter);
app.use('/api/v1/agent/search', searchRouter);
app.use('/api/v1/agent/voice', voiceRouter);
app.use('/api/v1/branches', branchesRouter);
app.use('/api/v1/tokens', tokensRouter);
app.use('/api/v1/auth', authRouter);

// Error handling
app.use(errorHandler);

export default app; 