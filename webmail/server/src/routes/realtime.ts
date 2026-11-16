import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { realtime } from '../services/realtime';

const router = Router();

// GET /api/realtime - Server-Sent Events stream
router.get('/', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx proxy buffering for instant delivery

  const clientId = crypto.randomBytes(8).toString('hex');
  realtime.addClient(clientId, res);

  // Send periodic keep-alive ping every 25 seconds
  const pingInterval = setInterval(() => {
    try {
      res.write(': keep-alive ping\n\n');
    } catch {
      clearInterval(pingInterval);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(pingInterval);
  });
});

export default router;
