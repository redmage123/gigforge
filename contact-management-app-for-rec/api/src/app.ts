import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRouter from './routes/auth';
import contactsRouter from './routes/contacts';
import tagsRouter from './routes/tags';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/api/v1/health', (_req, res) => {
    res.json({ data: { status: 'ok', uptime: process.uptime() } });
  });

  // Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/contacts', contactsRouter);
  app.use('/api/v1/tags', tagsRouter);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ data: null, error: 'Not found' });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}
