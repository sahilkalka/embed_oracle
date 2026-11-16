import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config';

import authRoutes from './routes/auth';
import folderRoutes from './routes/folders';
import threadRoutes from './routes/threads';
import messageRoutes from './routes/messages';
import webhookRoutes from './routes/webhooks';
import realtimeRoutes from './routes/realtime';

const app = express();

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allows sandboxed iframe rendering
}));
app.use(compression());
app.use(cookieParser());
app.use(cors({
  origin: config.isProduction ? true : ['http://localhost:5173', 'http://127.0.0.1:5173', config.appUrl],
  credentials: true,
}));

// Body parser
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.text({ type: ['text/plain', 'message/rfc822'], limit: '25mb' }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'modern-webmail',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/realtime', realtimeRoutes);

// Serve compiled client in production or when available
const publicDir = path.resolve(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { maxAge: '1d' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`[Modern Webmail] Server listening on port ${config.port} (${config.nodeEnv})`);
  console.log(`[Modern Webmail] API ready at http://localhost:${config.port}/api`);
});
