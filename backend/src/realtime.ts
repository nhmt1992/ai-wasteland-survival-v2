import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { isAppError } from './errors.js';
import type { RealtimeMessage } from './types.js';

type SubscriptionBucket = Set<WebSocket>;

function nowIso(): string {
  return new Date().toISOString();
}

class RealtimeHub {
  private wss: WebSocketServer | null = null;

  private readonly worldSubscriptions = new Map<string, SubscriptionBucket>();

  private readonly socketWorld = new Map<WebSocket, string>();

  attach(server: HttpServer, authorizeConnection?: (requestUrl: URL) => Promise<void>): void {
    if (this.wss) {
      return;
    }

    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (requestUrl.pathname !== '/api/realtime') {
        socket.destroy();
        return;
      }

      if (!this.wss) {
        socket.destroy();
        return;
      }

      void this.handleUpgrade(request, socket, head, requestUrl, authorizeConnection);
    });
  }

  publishWorldMessage(worldId: string, message: Omit<RealtimeMessage, 'worldId' | 'timestamp'>): void {
    const bucket = this.worldSubscriptions.get(worldId);
    if (!bucket || bucket.size === 0) {
      return;
    }

    const envelope = {
      ...(message as Record<string, unknown>),
      worldId,
      timestamp: nowIso(),
    } as RealtimeMessage;

    const payload = JSON.stringify(envelope);

    for (const socket of bucket) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      socket.send(payload);
    }
  }

  getClientCount(): number {
    return this.socketWorld.size;
  }

  private async handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    requestUrl: URL,
    authorizeConnection?: (requestUrl: URL) => Promise<void>,
  ): Promise<void> {
    try {
      if (authorizeConnection) {
        await authorizeConnection(requestUrl);
      }
    } catch (error) {
      const statusCode = isAppError(error) ? error.statusCode : 500;
      this.rejectUpgrade(socket, statusCode);
      return;
    }

    if (!this.wss) {
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (websocket) => {
      this.handleConnection(websocket, requestUrl);
    });
  }

  private rejectUpgrade(socket: Duplex, statusCode: number): void {
    const statusText =
      statusCode === 400
        ? 'Bad Request'
        : statusCode === 401
          ? 'Unauthorized'
          : statusCode === 403
            ? 'Forbidden'
            : statusCode === 404
              ? 'Not Found'
              : 'Internal Server Error';

    socket.write(
      `HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
    socket.destroy();
  }

  private handleConnection(websocket: WebSocket, requestUrl: URL): void {
    const worldId = requestUrl.searchParams.get('worldId')?.trim();
    const streamerHandle = requestUrl.searchParams.get('streamerHandle')?.trim();

    if (!worldId || !streamerHandle) {
      websocket.close(1008, 'streamerHandle and worldId required');
      return;
    }

    const bucket = this.worldSubscriptions.get(worldId) ?? new Set<WebSocket>();
    bucket.add(websocket);
    this.worldSubscriptions.set(worldId, bucket);
    this.socketWorld.set(websocket, worldId);

    const hello: RealtimeMessage = {
      type: 'hello',
      worldId,
      timestamp: nowIso(),
      connectionId: randomUUID(),
      ready: true,
    };

    websocket.send(JSON.stringify(hello));

    websocket.on('close', () => {
      this.removeSocket(websocket);
    });

    websocket.on('error', () => {
      this.removeSocket(websocket);
    });
  }

  private removeSocket(websocket: WebSocket): void {
    const worldId = this.socketWorld.get(websocket);
    if (!worldId) {
      return;
    }

    this.socketWorld.delete(websocket);
    const bucket = this.worldSubscriptions.get(worldId);
    if (!bucket) {
      return;
    }

    bucket.delete(websocket);
    if (bucket.size === 0) {
      this.worldSubscriptions.delete(worldId);
    }
  }
}

export const realtimeHub = new RealtimeHub();
