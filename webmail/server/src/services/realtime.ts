import { Response } from 'express';

interface SSEClient {
  id: string;
  res: Response;
}

class RealtimeService {
  private clients: Map<string, SSEClient> = new Map();

  addClient(id: string, res: Response) {
    this.clients.set(id, { id, res });

    // Send initial handshake
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId: id })}\n\n`);

    res.on('close', () => {
      this.clients.delete(id);
    });
  }

  broadcast(event: string, payload: any) {
    const data = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    for (const [_, client] of this.clients) {
      try {
        client.res.write(`event: ${event}\ndata: ${data}\n\n`);
      } catch (err) {
        console.error(`Error sending SSE to client ${client.id}:`, err);
      }
    }
  }

  getActiveClientsCount(): number {
    return this.clients.size;
  }
}

export const realtime = new RealtimeService();
