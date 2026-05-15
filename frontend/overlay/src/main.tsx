import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type WorldSummary = {
  id: string;
  name: string;
  width: number;
  height: number;
  currentTick: number;
  status: string;
  overlayUrl: string;
  viewerCreateUrl: string;
  viewerMyNpcUrl: string;
  npcCount: number;
  aliveNpcCount: number;
  deadNpcCount: number;
  latestLiveSessionStatus: string | null;
  lastTickStartedAt: string | null;
  latestLiveSessionId: string | null;
};

type LiveSession = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  viewerCountPeak: number;
  giftCount: number;
};

type OverlayNpc = {
  id: string;
  name: string;
  status: string;
  state: {
    hp: number;
    food: number;
    water: number;
    stamina: number;
    morale: number;
    injury: number;
    shelter: number;
    currentAction: string;
    tileX: number;
    tileY: number;
  };
};

type OverlayEvent = {
  id: string;
  tick: number;
  eventType: string;
  titleJa: string | null;
  descriptionJa: string | null;
  actorNpcId: string | null;
  targetNpcId: string | null;
  tileX: number | null;
  tileY: number | null;
  createdAt: string;
};

type ResourceGrant = {
  id: string;
  packId: string | null;
  status: string;
  spawnTileX: number | null;
  spawnTileY: number | null;
  targetNpcId: string | null;
  expiresAt: string | null;
};

type SnapshotResponse = {
  ok: boolean;
  world: WorldSummary;
  liveSession: LiveSession | null;
  npcs: OverlayNpc[];
  events: OverlayEvent[];
  resourceGrants: ResourceGrant[];
};

type OverlayRoute = {
  streamerHandle: string;
  worldId: string;
};

type RealtimeMessage = {
  type: string;
  worldId: string;
  timestamp: string;
  [key: string]: unknown;
};

function resolveApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  return '';
}

const API_BASE_URL = resolveApiBaseUrl();

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function websocketUrl(path: string): string {
  const baseUrl = API_BASE_URL.startsWith('http') ? API_BASE_URL : window.location.origin;
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  }

  return url.toString();
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body !== undefined && init?.body !== null) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  } else {
    headers.delete('Content-Type');
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
  }

  return response.json() as Promise<T>;
}

function formatShortNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatLiveStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '未配信';
  }

  switch (status) {
    case 'live':
      return '配信中';
    case 'connecting':
      return '接続中';
    case 'created':
      return '作成済み';
    case 'ended':
      return '配信終了';
    case 'failed':
      return '失敗';
    default:
      return status;
  }
}

function resolveOverlayRoute(): OverlayRoute {
  const parts = window.location.pathname.split('/').filter(Boolean);

  if (parts[0] === 'overlay' && parts.length >= 3) {
    return {
      streamerHandle: parts[1]?.trim() ?? '',
      worldId: parts[2]?.trim() ?? '',
    };
  }

  return {
    streamerHandle: '',
    worldId: '',
  };
}

function urgentLabel(npc: OverlayNpc): string {
  if (npc.status === 'dead') {
    return '死亡';
  }

  if (npc.state.hp <= 30 || npc.state.water <= 25 || npc.state.food <= 25) {
    return '要注意';
  }

  return '安定';
}

function useRealtimeFeed(streamerHandle: string, worldId: string, onMessage: (message: RealtimeMessage) => void) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting'>('idle');
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let attempt = 0;

    if (!streamerHandle || !worldId) {
      setStatus('idle');
      return () => {
        active = false;
      };
    }

    const connect = () => {
      if (!active) {
        return;
      }

      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      socket = new WebSocket(
        websocketUrl(
          `/api/realtime?streamerHandle=${encodeURIComponent(streamerHandle)}&worldId=${encodeURIComponent(worldId)}`,
        ),
      );

      socket.onopen = () => {
        if (!active) {
          return;
        }

        attempt = 0;
        setStatus('connected');
      };

      socket.onmessage = (event) => {
        if (!active) {
          return;
        }

        try {
          const payload = JSON.parse(String(event.data)) as RealtimeMessage;
          if (payload.type !== 'hello') {
            onMessageRef.current(payload);
          }
        } catch {
          // 受信失敗はポーリング側に任せる
        }
      };

      socket.onclose = () => {
        if (!active) {
          return;
        }

        setStatus('reconnecting');
        attempt += 1;
        const delay = Math.min(1000 + attempt * 500, 5000);
        retryTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      socket?.close();
    };
  }, [streamerHandle, worldId]);

  return status;
}

function OverlayApp() {
  const route = useMemo(resolveOverlayRoute, []);
  const routeError = !route.streamerHandle || !route.worldId ? 'overlay URL に streamerHandle と worldId を指定してください' : null;
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    if (routeError) {
      setSnapshot(null);
      setError(routeError);
      setLoading(false);
      return;
    }

    try {
      const data = await requestJson<SnapshotResponse>(
        `/api/streamers/${encodeURIComponent(route.streamerHandle)}/worlds/${encodeURIComponent(route.worldId)}/snapshot`,
      );
      setSnapshot(data);
      setError(null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'snapshot の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [route.streamerHandle, route.worldId, routeError]);

  const realtimeStatus = useRealtimeFeed(route.streamerHandle, route.worldId, () => {
    void loadSnapshot();
  });

  useEffect(() => {
    let active = true;
    setLoading(true);

    if (routeError) {
      setLoading(false);
      setSnapshot(null);
      setError(routeError);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      await loadSnapshot();
      if (!active) {
        return;
      }
    };

    void run();
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadSnapshot, routeError]);

  const latestEvent = snapshot?.events[0] ?? null;
  const latestGrant = snapshot?.resourceGrants[0] ?? null;

  const markers = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const width = Math.max(1, snapshot.world.width);
    const height = Math.max(1, snapshot.world.height);

    return snapshot.npcs.map((npc, index) => ({
      npc,
      index,
      left: ((npc.state.tileX + 0.5) / width) * 100,
      top: ((npc.state.tileY + 0.5) / height) * 100,
    }));
  }, [snapshot]);

  const grantMarkers = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const width = Math.max(1, snapshot.world.width);
    const height = Math.max(1, snapshot.world.height);

    return snapshot.resourceGrants.map((grant) => ({
      grant,
      left: (((grant.spawnTileX ?? 0) + 0.5) / width) * 100,
      top: (((grant.spawnTileY ?? 0) + 0.5) / height) * 100,
    }));
  }, [snapshot]);

  if (routeError) {
    return (
      <main className="overlay-shell">
        <div className="overlay-error">{routeError}</div>
      </main>
    );
  }

  return (
    <main className="overlay-shell">
      <header className="hud">
        <div className="hud-brand">
          <strong>{snapshot?.world.name ?? '荒土世界 Alpha'}</strong>
          <span>@{route.streamerHandle} / overlay</span>
        </div>
        <div className="hud-stats">
          <div className="hud-stat">
            <span>Tick</span>
            <strong>{snapshot ? formatShortNumber(snapshot.world.currentTick) : '—'}</strong>
          </div>
          <div className="hud-stat">
            <span>生存者</span>
            <strong>{snapshot ? formatShortNumber(snapshot.world.aliveNpcCount) : '—'}</strong>
          </div>
          <div className="hud-stat">
            <span>死亡者</span>
            <strong>{snapshot ? formatShortNumber(snapshot.world.deadNpcCount) : '—'}</strong>
          </div>
          <div className="hud-stat">
            <span>支援</span>
            <strong>{snapshot ? formatShortNumber(snapshot.resourceGrants.length) : '—'}</strong>
          </div>
          <div className="hud-stat">
            <span>ライブ</span>
            <strong>{formatLiveStatusLabel(snapshot?.liveSession?.status ?? snapshot?.world.latestLiveSessionStatus)}</strong>
          </div>
          <div className="hud-stat">
            <span>WS</span>
            <strong>{realtimeStatus === 'connected' ? '接続中' : realtimeStatus === 'reconnecting' ? '再接続' : realtimeStatus === 'connecting' ? '接続中' : '待機'}</strong>
          </div>
        </div>
      </header>

      {error ? <div className="overlay-error">{error}</div> : null}

      <section className="overlay-grid">
        <section className="stage-panel">
          <div className="stage-head">
            <div>
              <p className="eyebrow">WORLD SNAPSHOT</p>
              <h1>リアルタイム監視</h1>
            </div>
            <div className="stage-meta">
              <span>Width {snapshot ? formatShortNumber(snapshot.world.width) : '—'}</span>
              <span>Height {snapshot ? formatShortNumber(snapshot.world.height) : '—'}</span>
              <span>Last Tick {snapshot?.world.lastTickStartedAt ? formatDateTime(snapshot.world.lastTickStartedAt) : '—'}</span>
            </div>
          </div>

          <div className="map-frame">
            <div className="map-grid" aria-hidden="true" />
            {grantMarkers.map(({ grant, left, top }) => (
              <div
                key={grant.id}
                className="grant-marker"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                }}
              >
                <span>支援</span>
                <strong>{grant.packId ?? 'pack'}</strong>
              </div>
            ))}
            {markers.map(({ npc, left, top, index }) => (
              <article
                key={npc.id}
                className={`npc-marker ${npc.status}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                }}
              >
                <div className="npc-marker-head">
                  <strong>
                    {index + 1}. {npc.name}
                  </strong>
                  <span>{urgentLabel(npc)}</span>
                </div>
                <div className="npc-marker-body">
                  <div className="mini-bars">
                    <Bar label="HP" value={npc.state.hp} />
                    <Bar label="水" value={npc.state.water} />
                    <Bar label="食料" value={npc.state.food} />
                  </div>
                  <span className="npc-action">{npc.state.currentAction}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="ticker">
            <span>最新イベント</span>
            <strong>{latestEvent ? latestEvent.titleJa ?? latestEvent.eventType : 'イベントはまだありません'}</strong>
            <p>{latestEvent?.descriptionJa ?? 'Tick の進行を待っています。'}</p>
          </div>
        </section>

        <aside className="side-panel">
          <section className="panel-block">
            <header className="block-head">
              <div>
                <h2>AI 住民</h2>
                <p>5 人の状態と行動を縦に確認できます。</p>
              </div>
              <span className="status-chip">{loading ? '読込中' : '最新'}</span>
            </header>

            <div className="npc-list">
              {(snapshot?.npcs ?? []).map((npc) => (
                <article key={npc.id} className="npc-row">
                  <div className="npc-row-top">
                    <strong>{npc.name}</strong>
                    <span>{npc.state.currentAction}</span>
                  </div>
                  <div className="npc-row-meta">
                    <span>HP {formatShortNumber(Math.round(npc.state.hp))}</span>
                    <span>水 {formatShortNumber(Math.round(npc.state.water))}</span>
                    <span>食料 {formatShortNumber(Math.round(npc.state.food))}</span>
                    <span>座標 {npc.state.tileX}, {npc.state.tileY}</span>
                  </div>
                  <div className="row-meter">
                    <span style={{ width: `${npc.state.hp}%` }} />
                  </div>
                </article>
              ))}
              {snapshot?.npcs.length === 0 ? <div className="empty-state">NPC がいません。</div> : null}
            </div>
          </section>

          <section className="panel-block">
            <header className="block-head">
              <div>
                <h2>最近の出来事</h2>
                <p>world_events の最新 5 件です。</p>
              </div>
            </header>
            <div className="event-list">
              {(snapshot?.events ?? []).slice(0, 5).map((event) => (
                <article key={event.id} className="event-row">
                  <span className="event-badge">Tick {formatShortNumber(event.tick)}</span>
                  <strong>{event.titleJa ?? event.eventType}</strong>
                  <p>{event.descriptionJa ?? '—'}</p>
                </article>
              ))}
              {snapshot?.events.length === 0 ? <div className="empty-state">イベントはまだありません。</div> : null}
            </div>
          </section>

          <section className="panel-block">
            <header className="block-head">
              <div>
                <h2>支援物資</h2>
                <p>gift_events で生成された resource_grants を表示します。</p>
              </div>
            </header>

            {latestGrant ? (
              <article className="grant-row">
                <div className="grant-row-top">
                  <strong>{latestGrant.packId ?? 'pack'}</strong>
                  <span>{latestGrant.status}</span>
                </div>
                <p>
                  {latestGrant.spawnTileX ?? '—'}, {latestGrant.spawnTileY ?? '—'}
                </p>
                <small>期限 {formatDateTime(latestGrant.expiresAt)}</small>
              </article>
            ) : (
              <div className="empty-state">支援物資はまだありません。</div>
            )}
          </section>
        </aside>
      </section>

      <footer className="bottom-bar">
        <span>{snapshot ? `Tick ${formatShortNumber(snapshot.world.currentTick)}` : 'Tick —'}</span>
        <strong>{latestEvent ? latestEvent.titleJa ?? latestEvent.eventType : 'イベント待機中'}</strong>
        <span>{lastUpdatedAt ? `更新 ${formatDateTime(lastUpdatedAt)}` : '更新待機中'}</span>
      </footer>
    </main>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<OverlayApp />);
