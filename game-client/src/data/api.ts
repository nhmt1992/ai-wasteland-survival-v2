import type { BackendSnapshotResponse, RealtimeMessage } from '../types.js';

type RealtimeHandler = (message: RealtimeMessage) => void;

function resolveApiPrefix(): string {
  return import.meta.env.VITE_API_BASE_URL?.trim() || '/api';
}

export async function loadWorldSnapshot(streamerHandle: string, worldId: string, signal?: AbortSignal): Promise<BackendSnapshotResponse> {
  const baseUrl = resolveApiPrefix();
  const response = await fetch(`${baseUrl}/streamers/${encodeURIComponent(streamerHandle)}/worlds/${encodeURIComponent(worldId)}/snapshot`, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`snapshot load failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as BackendSnapshotResponse;
  if (!payload.ok) {
    throw new Error('snapshot payload missing ok flag');
  }

  return payload;
}

export function openWorldRealtime(
  streamerHandle: string,
  worldId: string,
  onMessage: RealtimeHandler,
  onStatus?: (status: string) => void,
): () => void {
  const apiBase = resolveApiPrefix();
  const baseUrl = new URL(apiBase, window.location.origin);
  const wsProtocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = new URL(baseUrl.toString());
  socketUrl.protocol = wsProtocol;
  socketUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/realtime`;
  socketUrl.searchParams.set('streamerHandle', streamerHandle);
  socketUrl.searchParams.set('worldId', worldId);

  let closed = false;
  let reconnectTimer: number | null = null;
  let websocket: WebSocket | null = null;

  const connect = () => {
    if (closed) {
      return;
    }

    onStatus?.('connecting');
    websocket = new WebSocket(socketUrl.toString());

    websocket.addEventListener('open', () => {
      onStatus?.('connected');
    });

    websocket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as RealtimeMessage;
        onMessage(message);
      } catch {
        onStatus?.('message_parse_failed');
      }
    });

    websocket.addEventListener('close', () => {
      onStatus?.('reconnecting');
      if (!closed) {
        reconnectTimer = window.setTimeout(connect, 1200);
      }
    });

    websocket.addEventListener('error', () => {
      onStatus?.('error');
    });
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
    }
    websocket?.close();
  };
}
