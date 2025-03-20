import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import modelsRouter from './routes/models';
import chatRouter from './routes/chat';
import searchRouter from './routes/search';
import voiceRouter from './routes/voice';
import agentRouter from './routes/agent';

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/v1/models', modelsRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/search', searchRouter);
app.use('/api/v1/voice', voiceRouter);
app.use('/api/v1/agent', agentRouter);

// Error handling
app.use(errorHandler);

export default app; 