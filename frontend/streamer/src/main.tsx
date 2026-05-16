import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Tenant = {
  id: string;
  name: string;
  handle: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type Streamer = {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  defaultTiktokId: string;
  createdAt: string;
  updatedAt: string;
};

type Subscription = {
  id: string;
  tenantId: string;
  streamerId: string;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  plan: string;
  status: string;
  maxWorlds: number;
  maxNpcsPerWorld: number;
  aiNarrationQuota: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
};

type GiftAdapterType = 'dev_mock' | 'manual' | 'tiktok_experimental' | 'future_official';
type BillingPlan = 'free_trial' | 'starter' | 'pro' | 'studio';
type BillingPortalAction = 'renew' | 'cancel' | 'restore' | 'mark_past_due' | 'mark_expired';

type GiftConnection = {
  id: string;
  tenantId: string;
  streamerId: string;
  platform: string;
  connectionType: GiftAdapterType;
  status: 'not_connected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'test_mode';
  hasCredentials: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type PlanLimits = {
  maxWorlds: number;
  maxNpcsPerWorld: number;
  maxLiveSessionsPerMonth: number;
  aiNarrationQuota: number;
  overlayBranding: 'watermark' | 'custom';
  customGiftMapping: boolean;
};

type WorldSummary = {
  id: string;
  tenantId: string;
  streamerId: string;
  name: string;
  width: number;
  height: number;
  tickIntervalSeconds: number;
  currentTick: number;
  worldSeed: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  npcCount: number;
  aliveNpcCount: number;
  deadNpcCount: number;
  latestLiveSessionId: string | null;
  latestLiveSessionStatus: string | null;
  latestLiveSessionStartedAt: string | null;
  latestLiveSessionEndedAt: string | null;
  lastTickStartedAt: string | null;
  overlayUrl: string;
  viewerCreateUrl: string;
  viewerMyNpcUrl: string;
};

type LiveSession = {
  id: string;
  worldId: string;
  platform: string;
  platformLiveId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  viewerCountPeak: number;
  giftCount: number;
};

type BillingEvent = {
  id: string;
  tenantId: string;
  streamerId: string;
  subscriptionId: string | null;
  provider: string;
  providerEventId: string;
  providerSessionId: string | null;
  eventType: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type SessionInfo = {
  id: string;
  tenantId: string;
  streamerId: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

type SnapshotState = {
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
  actionTargetX: number | null;
  actionTargetY: number | null;
  actionStartedAt: string | null;
  actionEndsAt: string | null;
  lastTick: number;
  updatedAt: string;
};

type SnapshotNpc = {
  id: string;
  name: string;
  age: number;
  gender: string | null;
  appearanceKey: string;
  personalityPrompt: string;
  backstory: string;
  status: string;
  deathCause: string | null;
  createdAt: string;
  updatedAt: string;
  traits: {
    social: number;
    aggression: number;
    greed: number;
    cooperation: number;
    risk: number;
    leadership: number;
  };
  state: SnapshotState;
};

type SnapshotEvent = {
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

type SnapshotGrant = {
  id: string;
  packId: string | null;
  status: string;
  spawnTileX: number | null;
  spawnTileY: number | null;
  expiresAt: string | null;
};

type StreamerContext = {
  ok: boolean;
  handle: string;
  displayName: string;
  tenantHandle: string;
  plan: string;
  planLabel: string;
  status: string;
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
  giftConnection: GiftConnection | null;
  planLimits: PlanLimits;
  stats: {
    worldCount: number;
    liveSessionCount: number;
    liveSessionsThisMonth: number;
    viewerUserCount: number;
    npcCount: number;
    aiNarrationUsed: number;
    aiNarrationRemaining: number;
  };
  primaryWorld: WorldSummary | null;
  liveSession: LiveSession | null;
  session: SessionInfo;
  worlds: WorldSummary[];
};

type BillingContext = {
  ok: boolean;
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
  giftConnection: GiftConnection | null;
  plan: string;
  planLabel: string;
  status: string;
  planLimits: PlanLimits;
  stats: StreamerContext['stats'];
  usageWindow: {
    start: string;
    end: string;
  };
  billingEvents: BillingEvent[];
};

type BillingActionResponse = BillingContext & {
  billingEvent: BillingEvent;
};

type SnapshotResponse = {
  ok: boolean;
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
  world: WorldSummary;
  liveSession: LiveSession | null;
  npcs: SnapshotNpc[];
  events: SnapshotEvent[];
  resourceGrants: SnapshotGrant[];
};

type CreateLiveSessionResponse = {
  ok: boolean;
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
  world: WorldSummary;
  liveSession: LiveSession;
};

type DevGiftResponse = {
  ok: boolean;
  accepted: boolean;
  targetNpc: {
    id: string;
    name: string;
    status: string;
    worldId: string;
  } | null;
  giftEvent: {
    id: string;
    giftName: string;
    giftValue: number;
    repeatCount: number;
    status: string;
    platformEventId: string;
  };
  resourceGrant: {
    id: string;
    packId: string | null;
    status: string;
    spawnTileX: number | null;
    spawnTileY: number | null;
  };
  liveSession: LiveSession;
};

type AuthResponse = {
  ok: boolean;
  session: SessionInfo;
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
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

async function readApiErrorMessage(response: Response): Promise<string> {
  const rawText = await response.text();
  if (!rawText.trim()) {
    return `${response.status} ${response.statusText}`;
  }

  try {
    const payload = JSON.parse(rawText) as {
      message?: unknown;
      error?: unknown;
      details?: unknown;
    };

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.message && typeof payload.message === 'string' ? payload.message : payload.error;
    }

    if (payload.error && typeof payload.error === 'object') {
      const nestedError = payload.error as { message?: unknown };
      if (typeof nestedError.message === 'string' && nestedError.message.trim()) {
        return nestedError.message;
      }
    }
  } catch {
    // Fall through to raw text.
  }

  return `${response.status} ${response.statusText} - ${rawText}`;
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
    throw new Error(await readApiErrorMessage(response));
  }

  return response.json() as Promise<T>;
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

function formatShortNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function metricColor(value: number, type: 'hp' | 'water' | 'food' | 'stamina'): 'ok' | 'warning' | 'danger' {
  if (type === 'hp' && value <= 30) {
    return 'danger';
  }

  if ((type === 'water' || type === 'food' || type === 'stamina') && value <= 25) {
    return 'danger';
  }

  if (value <= 55) {
    return 'warning';
  }

  return 'ok';
}

const GIFT_ADAPTER_LABELS: Record<GiftAdapterType, string> = {
  dev_mock: 'DevMockGiftAdapter',
  manual: 'ManualGiftAdapter',
  tiktok_experimental: 'TikTokExperimentalAdapter',
  future_official: 'FutureOfficialTikTokAdapter',
};

const GIFT_CONNECTION_STATUS_LABELS: Record<GiftConnection['status'], string> = {
  not_connected: '未接続',
  connecting: '接続中',
  connected: '接続済み',
  reconnecting: '再接続中',
  failed: '接続失敗',
  test_mode: 'テストモード',
};

const BILLING_PLAN_OPTIONS: Array<{ value: BillingPlan; label: string }> = [
  { value: 'free_trial', label: '無料トライアル' },
  { value: 'starter', label: 'スターター' },
  { value: 'pro', label: 'プロ' },
  { value: 'studio', label: 'スタジオ' },
];

const BILLING_PORTAL_ACTIONS: Array<{
  action: BillingPortalAction;
  label: string;
  description: string;
  tone?: 'primary' | 'danger';
}> = [
  { action: 'renew', label: '契約を更新', description: '現在の期間を 30 日延長します。', tone: 'primary' },
  { action: 'restore', label: '復元する', description: '停止中の契約を active に戻します。' },
  { action: 'cancel', label: '解約する', description: '契約を cancel に切り替えます。', tone: 'danger' },
  { action: 'mark_past_due', label: '支払失敗にする', description: '請求失敗状態を再現します。' },
  { action: 'mark_expired', label: '期限切れにする', description: '期限切れ状態を再現します。' },
];

function formatGiftAdapterLabel(connectionType: GiftAdapterType | null | undefined): string {
  if (!connectionType) {
    return '未設定';
  }

  return GIFT_ADAPTER_LABELS[connectionType] ?? connectionType;
}

function formatGiftConnectionStatusLabel(status: GiftConnection['status'] | null | undefined): string {
  if (!status) {
    return '未接続';
  }

  return GIFT_CONNECTION_STATUS_LABELS[status] ?? status;
}

function copyText(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
}

function urgencyScore(npc: SnapshotNpc): number {
  return (
    (100 - npc.state.hp) * 2 +
    (100 - npc.state.water) * 1.2 +
    (100 - npc.state.food) * 1.2 +
    (100 - npc.state.stamina) * 0.7 +
    npc.state.injury * 0.8
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="7" y="3" width="9" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7H4a1 1 0 0 0-1 1v7a2 2 0 0 0 2 2h7a1 1 0 0 0 1-1v-1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16 6.5V3l-2.2 2.2A6.5 6.5 0 1 0 17 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 5.5v9l8-4.5-8-4.5Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8.5 11.5 11.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 13.2 5.2 15A3 3 0 0 1 1 10.8l2.1-2.1A3 3 0 0 1 6.3 8.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6.8 14.8 5A3 3 0 0 1 19 9.2l-2.1 2.1A3 3 0 0 1 13.7 11.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WorldIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 10h14M10 3a12 12 0 0 1 0 14M10 3a12 12 0 0 0 0 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LiveIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="5.5" fill="currentColor" />
    </svg>
  );
}

function formatDurationLabel(status: string | null): string {
  if (!status) {
    return '未設定';
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

function useRealtimeFeed(streamerHandle: string, worldId: string, onMessage: (message: RealtimeMessage) => void) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting'>('idle');
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!streamerHandle || !worldId) {
      setStatus('idle');
      return;
    }

    let active = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let attempt = 0;

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
          // 瞬断時は次のポーリングで回復する
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

function DashboardApp({ session, onLogout }: { session: AuthResponse; onLogout: () => Promise<void> }) {
  const [context, setContext] = useState<StreamerContext | null>(null);
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string>('');
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [giftForm, setGiftForm] = useState({
    tiktokId: 'test_user_001',
    displayName: '',
    giftName: 'Rose',
    giftValue: '1',
    repeatCount: '10',
    giftId: 'rose',
  });
  const [giftSubmitting, setGiftSubmitting] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [giftResult, setGiftResult] = useState<DevGiftResponse | null>(null);
  const activeStreamerHandle = context?.streamer.handle ?? session.streamer.handle;

  const selectedWorld = useMemo(
    () => worlds.find((world) => world.id === selectedWorldId) ?? context?.primaryWorld ?? worlds[0] ?? null,
    [context?.primaryWorld, selectedWorldId, worlds],
  );
  const currentLiveSession = context?.liveSession ?? snapshot?.liveSession ?? null;
  const currentLiveWorld = useMemo(
    () => worlds.find((world) => world.id === currentLiveSession?.worldId) ?? null,
    [currentLiveSession?.worldId, worlds],
  );
  const giftConnection = context?.giftConnection ?? null;
  const activeWorld = currentLiveWorld ?? selectedWorld ?? context?.primaryWorld ?? null;
  const activeWorldId = activeWorld?.id ?? '';
  const liveSessionLabel = currentLiveSession
    ? formatDurationLabel(currentLiveSession.status)
    : selectedWorld?.latestLiveSessionStatus
      ? formatDurationLabel(selectedWorld.latestLiveSessionStatus)
      : '未配信';
  const giftConnectionLabel = giftConnection
    ? formatGiftAdapterLabel(giftConnection.connectionType)
    : currentLiveSession?.status === 'live'
      ? 'ギフトテスト可能'
      : selectedWorld?.latestLiveSessionId
        ? '配信終了'
        : '未配信';
  const giftConnectionStatusLabel = giftConnection
    ? formatGiftConnectionStatusLabel(giftConnection.status)
    : currentLiveSession?.status === 'live'
      ? '配信接続'
      : '未接続';
  const linkWorld = currentLiveWorld ?? selectedWorld ?? context?.primaryWorld ?? null;
  const selectedWorldNpcCount = selectedWorld?.npcCount ?? 0;
  const selectedWorldNpcLimit = context?.planLimits.maxNpcsPerWorld ?? context?.subscription?.maxNpcsPerWorld ?? 0;
  const selectedWorldLimitReached = Boolean(selectedWorld && selectedWorldNpcLimit > 0 && selectedWorldNpcCount >= selectedWorldNpcLimit);

  const loadContext = useCallback(async () => {
    const contextData = await requestJson<StreamerContext>('/api/console/context');

    setContext(contextData);
    setWorlds(contextData.worlds);
    setSelectedWorldId((current) => current || contextData.liveSession?.worldId || contextData.worlds[0]?.id || contextData.primaryWorld?.id || '');
  }, []);

  const loadSnapshot = useCallback(async (worldId: string) => {
    setSnapshotLoading(true);
    try {
      const snapshotData = await requestJson<SnapshotResponse>(
        `/api/streamers/${encodeURIComponent(activeStreamerHandle)}/worlds/${encodeURIComponent(worldId)}/snapshot`,
      );
      setSnapshot(snapshotData);
    } finally {
      setSnapshotLoading(false);
    }
  }, [activeStreamerHandle]);

  const refreshAll = useCallback(async () => {
    setError(null);
    try {
      await loadContext();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'データの取得に失敗しました');
    }
  }, [loadContext]);

  const handleRealtimeMessage = useCallback(
    (message: RealtimeMessage) => {
      if (!message.worldId) {
        return;
      }

      void refreshAll();
      void loadSnapshot(message.worldId);
    },
    [loadSnapshot, refreshAll],
  );

  const realtimeStatus = useRealtimeFeed(activeStreamerHandle, activeWorldId, handleRealtimeMessage);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        await loadContext();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'データの取得に失敗しました');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loadContext]);

  useEffect(() => {
    if (!activeWorldId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await loadSnapshot(activeWorldId);
      } catch {
        if (!cancelled) {
          setSnapshot(null);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeWorldId, loadSnapshot]);

  const crisisNpcList = useMemo(() => {
    return [...(snapshot?.npcs ?? [])].sort((left, right) => urgencyScore(right) - urgencyScore(left)).slice(0, 5);
  }, [snapshot?.npcs]);

  const recentEvents = useMemo(() => {
    return [...(snapshot?.events ?? [])].slice(-6).reverse();
  }, [snapshot?.events]);

  const resourceGrant = snapshot?.resourceGrants[0] ?? null;

  const handleCopy = async (text: string, key: string) => {
    try {
      const copied = await navigator.clipboard.writeText(text).then(() => true).catch(() => copyText(text));
      if (copied) {
        setCopyState(key);
        window.setTimeout(() => setCopyState((current) => (current === key ? null : current)), 1400);
        return;
      }

      setError('リンクのコピーに失敗しました');
    } catch {
      const copied = copyText(text);
      if (copied) {
        setCopyState(key);
        window.setTimeout(() => setCopyState((current) => (current === key ? null : current)), 1400);
        return;
      }

      setError('リンクのコピーに失敗しました');
    }
  };

  const handleStartLiveSession = async () => {
    if (!selectedWorld) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await requestJson<CreateLiveSessionResponse>(`/api/console/worlds/${encodeURIComponent(selectedWorld.id)}/live-sessions/start`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshAll();
      await loadSnapshot(selectedWorld.id);
    } catch (liveError) {
      setError(liveError instanceof Error ? liveError.message : 'ライブセッションの作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndLiveSession = async () => {
    if (!currentLiveSession) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await requestJson<CreateLiveSessionResponse>(`/api/console/live-sessions/${encodeURIComponent(currentLiveSession.id)}/end`, {
        method: 'POST',
      });
      await refreshAll();
      if (currentLiveSession.worldId) {
        await loadSnapshot(currentLiveSession.worldId);
      }
    } catch (liveError) {
      setError(liveError instanceof Error ? liveError.message : 'ライブセッションの終了に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGiftFieldChange = <K extends keyof typeof giftForm>(key: K, value: (typeof giftForm)[K]) => {
    setGiftForm((current) => ({ ...current, [key]: value }));
  };

  const handleGiftSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!giftForm.tiktokId.trim() || !giftForm.giftName.trim()) {
      setGiftError('TikTok ID とギフト名を入力してください。');
      return;
    }

    if (!currentLiveSession || currentLiveSession.status !== 'live') {
      setGiftError('配信中のみテストギフトを送信できます。');
      return;
    }

    const targetWorldId = currentLiveSession.worldId;
    const giftValue = Number(giftForm.giftValue);
    const repeatCount = Number(giftForm.repeatCount);

    if (!Number.isFinite(giftValue) || giftValue < 0 || !Number.isFinite(repeatCount) || repeatCount <= 0) {
      setGiftError('ギフト値と repeatCount は数値で入力してください。');
      return;
    }

    setGiftSubmitting(true);
    setGiftError(null);
    try {
      const result = await requestJson<DevGiftResponse>('/api/console/gift-events', {
        method: 'POST',
        body: JSON.stringify({
          worldId: targetWorldId,
          tiktokId: giftForm.tiktokId.trim(),
          displayName: giftForm.displayName.trim() || undefined,
          giftName: giftForm.giftName.trim(),
          giftValue,
          repeatCount,
          giftId: giftForm.giftId.trim() || undefined,
        }),
      });

      setGiftResult(result);
      await refreshAll();
      if (targetWorldId) {
        await loadSnapshot(targetWorldId);
      }
    } catch (giftSubmitError) {
      setGiftError(giftSubmitError instanceof Error ? giftSubmitError.message : 'ギフト送信に失敗しました');
    } finally {
      setGiftSubmitting(false);
    }
  };

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <strong>AI WASTELAND SURVIVAL v2</strong>
          <span>Streamer Console / ログイン中の実データを表示</span>
        </div>
        <div className="actions">
          <button className="action" type="button" onClick={() => void refreshAll()} disabled={loading}>
            <RefreshIcon />
            更新
          </button>
          <a className="action" href="/streamer/billing">
            プラン管理
          </a>
          <button className="action" type="button" onClick={() => void onLogout()}>
            ログアウト
          </button>
          {currentLiveSession ? (
            <button className="action danger" type="button" onClick={() => void handleEndLiveSession()} disabled={submitting}>
              <StopIcon />
              {submitting ? '配信終了処理中' : '配信を終了'}
            </button>
          ) : (
            <button className="action primary" type="button" onClick={() => void handleStartLiveSession()} disabled={submitting || !selectedWorld}>
              <PlayIcon />
              {submitting ? '配信開始処理中' : '配信を開始'}
            </button>
          )}
        </div>
      </header>

      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">配信者コンソール</p>
          <h1>配信者の世界を実データで監視する</h1>
          <p>
            配信者、契約状態、ワールド一覧、現在の snapshot、OBS Overlay のリンク、視聴者作成リンクを
            まとめて確認できます。
          </p>
        </div>
        <div className="hero-summary">
          <div className="metric hero-metric">
            <span className="metric-label">配信者名</span>
            <strong>{context?.streamer.displayName ?? '読み込み中'}</strong>
            <span className="metric-sub">{context?.streamer.handle ?? activeStreamerHandle}</span>
          </div>
          <div className="metric hero-metric">
            <span className="metric-label">契約状態</span>
            <strong>{context?.subscription?.status ?? context?.status ?? '—'}</strong>
            <span className="metric-sub">{context?.planLabel ?? context?.subscription?.plan ?? context?.plan ?? '—'}</span>
          </div>
          <div className="metric hero-metric">
            <span className="metric-label">現在の世界</span>
            <strong>{activeWorld?.name ?? '—'}</strong>
            <span className="metric-sub">Tick {activeWorld ? formatShortNumber(activeWorld.currentTick) : '—'}</span>
          </div>
          <div className="metric hero-metric">
            <span className="metric-label">リアルタイム</span>
            <strong>{realtimeStatus === 'connected' ? '接続中' : realtimeStatus === 'reconnecting' ? '再接続中' : realtimeStatus === 'connecting' ? '接続中' : '待機中'}</strong>
            <span className="metric-sub">WebSocket / world 更新を受信</span>
          </div>
        </div>
      </section>

      {error ? (
        <section className="alert">
          <strong>取得エラー</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="shell">
        <aside className="panel sidebar">
          <header className="section-head">
            <div>
              <h2>配信者情報</h2>
              <p>ログイン中のテナントと購読状態を表示しています。</p>
            </div>
          </header>
          <div className="stack">
            <div className="metric">
              <span className="metric-label">配信者</span>
              <strong>{context?.streamer.displayName ?? '—'}</strong>
              <span className="metric-sub">@{context?.streamer.handle ?? '—'}</span>
            </div>
            <div className="metric">
              <span className="metric-label">契約状態</span>
              <strong>{context?.subscription?.status ?? '—'}</strong>
              <span className="metric-sub">{context?.planLabel ?? context?.subscription?.plan ?? '—'}</span>
            </div>
            <div className="metric">
              <span className="metric-label">現在のプラン</span>
              <strong>{context?.planLabel ?? context?.subscription?.plan ?? '—'}</strong>
              <span className="metric-sub">NPC 上限 {context?.subscription ? formatShortNumber(context.subscription.maxNpcsPerWorld) : '—'}</span>
            </div>
            <div className="metric">
              <span className="metric-label">集計</span>
              <strong>{context ? formatShortNumber(context.stats.npcCount) : '—'}</strong>
              <span className="metric-sub">
                ワールド {context ? formatShortNumber(context.stats.worldCount) : '—'} / 今月の配信 {context ? formatShortNumber(context.stats.liveSessionsThisMonth) : '—'}
              </span>
            </div>
          </div>

          <section className="inner-panel">
            <header className="section-head compact">
              <div>
                <h3>プラン</h3>
                <p>契約状態と現在の利用枠を表示しています。</p>
              </div>
              <button className="action" type="button" disabled>
                プランを変更
              </button>
            </header>

            <div className="plan-grid summary-grid">
              <div className="metric tiny">
                <span className="metric-label">現在のプラン</span>
                <strong>{context?.planLabel ?? context?.subscription?.plan ?? '—'}</strong>
              </div>
              <div className="metric tiny">
                <span className="metric-label">契約状態</span>
                <strong>{context?.subscription?.status ?? '—'}</strong>
              </div>
              <div className="metric tiny">
                <span className="metric-label">AI住民</span>
                <strong>
                  {context?.primaryWorld ? `${formatShortNumber(selectedWorldNpcCount)} / ${formatShortNumber(selectedWorldNpcLimit)}` : '—'}
                </strong>
                <span className="metric-sub">{selectedWorldLimitReached ? '上限に達しています' : '選択中のワールド基準'}</span>
              </div>
              <div className="metric tiny">
                <span className="metric-label">ワールド</span>
                <strong>{context ? `${formatShortNumber(context.stats.worldCount)} / ${formatShortNumber(context.planLimits.maxWorlds)}` : '—'}</strong>
                <span className="metric-sub">テナント全体の数</span>
              </div>
              <div className="metric tiny">
                <span className="metric-label">今月の配信</span>
                <strong>{context ? `${formatShortNumber(context.stats.liveSessionsThisMonth)} / ${formatShortNumber(context.planLimits.maxLiveSessionsPerMonth)}` : '—'}</strong>
                <span className="metric-sub">月内の live_session 数</span>
              </div>
              <div className="metric tiny">
                <span className="metric-label">AIナレーション残数</span>
                <strong>{context ? `${formatShortNumber(context.stats.aiNarrationRemaining)} / ${formatShortNumber(context.planLimits.aiNarrationQuota)}` : '—'}</strong>
                <span className="metric-sub">現在は未消費分を表示</span>
              </div>
            </div>
          </section>
        </aside>

        <section className="panel main-column">
          <header className="section-head">
            <div>
              <h2>ワールド一覧</h2>
              <p>現在のワールド状態と snapshot を切り替えられます。</p>
            </div>
            <span className={`status-chip ${currentLiveSession?.status === 'live' ? 'ok' : selectedWorld?.latestLiveSessionStatus ? 'warning' : 'idle'}`}>{liveSessionLabel}</span>
          </header>

          <div className="table-shell">
            <table className="world-table">
              <thead>
                <tr>
                  <th>ワールド</th>
                  <th>状態</th>
                  <th>Tick</th>
                  <th>NPC</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {worlds.map((world) => (
                  <tr key={world.id} className={world.id === selectedWorldId ? 'selected' : ''}>
                    <td>
                      <button className="row-button" type="button" onClick={() => setSelectedWorldId(world.id)}>
                        <WorldIcon />
                        <span>
                          <strong>{world.name}</strong>
                          <small>{world.id}</small>
                        </span>
                      </button>
                    </td>
                    <td>{world.status}</td>
                    <td>{formatShortNumber(world.currentTick)}</td>
                    <td>
                      {formatShortNumber(world.aliveNpcCount)} / {formatShortNumber(world.deadNpcCount)}
                    </td>
                    <td>
                      <button className="inline-action" type="button" onClick={() => setSelectedWorldId(world.id)}>
                        選択
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="summary-grid">
            <div className="metric card">
              <span className="metric-label">現在のワールド状態</span>
              <strong>{selectedWorld?.name ?? '—'}</strong>
              <span className="metric-sub">
                {selectedWorld ? `status ${selectedWorld.status} / Tick ${selectedWorld.currentTick}` : 'ワールドを選択してください'}
              </span>
            </div>
            <div className="metric card">
              <span className="metric-label">NPC 数量</span>
              <strong>{selectedWorld ? formatShortNumber(selectedWorld.npcCount) : '—'}</strong>
              <span className="metric-sub">生存者 {selectedWorld ? formatShortNumber(selectedWorld.aliveNpcCount) : '—'}</span>
            </div>
            <div className="metric card">
              <span className="metric-label">生存者 / 死亡者</span>
              <strong>
                {selectedWorld ? `${formatShortNumber(selectedWorld.aliveNpcCount)} / ${formatShortNumber(selectedWorld.deadNpcCount)}` : '—'}
              </strong>
              <span className="metric-sub">最終 Tick {selectedWorld ? formatShortNumber(selectedWorld.currentTick) : '—'}</span>
            </div>
            <div className="metric card">
              <span className="metric-label">ライブ状態</span>
              <strong>{liveSessionLabel}</strong>
              <span className="metric-sub">
                {currentLiveSession ? currentLiveSession.id : selectedWorld?.latestLiveSessionId ?? '—'}
              </span>
            </div>
          </div>

          <div className="split">
            <section className="inner-panel">
              <header className="section-head compact">
                <div>
                  <h3>ワールド snapshot</h3>
                  <p>Overlay と同じデータをそのまま表示しています。</p>
                </div>
                <span className={`status-chip ${snapshotLoading ? 'warning' : 'ok'}`}>{snapshotLoading ? '読み込み中' : '最新'}</span>
              </header>

              {snapshot ? (
                <div className="snapshot-block">
                  <div className="snapshot-grid">
                    <div className="metric tiny">
                      <span className="metric-label">Current Tick</span>
                      <strong>{formatShortNumber(snapshot.world.currentTick)}</strong>
                    </div>
                    <div className="metric tiny">
                      <span className="metric-label">生存者</span>
                      <strong>{formatShortNumber(snapshot.world.aliveNpcCount)}</strong>
                    </div>
                    <div className="metric tiny">
                      <span className="metric-label">死亡者</span>
                      <strong>{formatShortNumber(snapshot.world.deadNpcCount)}</strong>
                    </div>
                    <div className="metric tiny">
                      <span className="metric-label">支援物資</span>
                      <strong>{formatShortNumber(snapshot.resourceGrants.length)}</strong>
                    </div>
                  </div>

                  <div className="npc-table-wrap">
                    <table className="npc-table">
                      <thead>
                        <tr>
                          <th>NPC</th>
                          <th>HP</th>
                          <th>水</th>
                          <th>食料</th>
                          <th>行動</th>
                          <th>座標</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crisisNpcList.map((npc) => (
                          <tr key={npc.id}>
                            <td>
                              <strong>{npc.name}</strong>
                              <small>{npc.status}</small>
                            </td>
                            <td>
                              <Meter value={npc.state.hp} tone={metricColor(npc.state.hp, 'hp')} />
                            </td>
                            <td>
                              <Meter value={npc.state.water} tone={metricColor(npc.state.water, 'water')} />
                            </td>
                            <td>
                              <Meter value={npc.state.food} tone={metricColor(npc.state.food, 'food')} />
                            </td>
                            <td>{npc.state.currentAction}</td>
                            <td>
                              {npc.state.tileX}, {npc.state.tileY}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="empty-state">snapshot を読み込んでいます。</div>
              )}
            </section>

            <section className="inner-panel">
              <header className="section-head compact">
                <div>
                  <h3>危機ボード</h3>
                  <p>HP / 水 / 食料 / 行動から簡易的に危機度を並べています。</p>
                </div>
              </header>
              <div className="stack">
                {crisisNpcList.map((npc, index) => (
                  <article key={npc.id} className="crisis-row">
                    <div className="crisis-meta">
                      <strong>
                        {index + 1}. {npc.name}
                      </strong>
                      <span>{npc.state.currentAction}</span>
                    </div>
                    <div className="crisis-bars">
                      <Meter label="HP" value={npc.state.hp} tone={metricColor(npc.state.hp, 'hp')} />
                      <Meter label="水" value={npc.state.water} tone={metricColor(npc.state.water, 'water')} />
                      <Meter label="食料" value={npc.state.food} tone={metricColor(npc.state.food, 'food')} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>

        <aside className="panel sidebar right">
          <header className="section-head">
            <div>
              <h2>配信用リンク</h2>
              <p>OBS Overlay と Viewer の入口をそのまま共有できます。</p>
            </div>
          </header>

          <div className="link-stack">
            <CopyField
              label="OBS Overlay URL"
              value={linkWorld?.overlayUrl ?? (activeWorldId ? `http://localhost:5174/overlay/${activeStreamerHandle}/${activeWorldId}` : '—')}
              copied={copyState === 'overlay'}
              actionLabel="OBSリンクをコピー"
              onCopy={() => void handleCopy(linkWorld?.overlayUrl ?? (activeWorldId ? `http://localhost:5174/overlay/${activeStreamerHandle}/${activeWorldId}` : '—'), 'overlay')}
            />
            <CopyField
              label="視聴者作成リンク"
              value={linkWorld?.viewerCreateUrl ?? `http://localhost:5175/s/${activeStreamerHandle}/create`}
              copied={copyState === 'create'}
              actionLabel="視聴者作成リンクをコピー"
              onCopy={() => void handleCopy(linkWorld?.viewerCreateUrl ?? `http://localhost:5175/s/${activeStreamerHandle}/create`, 'create')}
            />
            <CopyField
              label="自分の NPC 確認リンク"
              value={linkWorld?.viewerMyNpcUrl ?? `http://localhost:5175/s/${activeStreamerHandle}/my-npc`}
              copied={copyState === 'myNpc'}
              actionLabel="自分のNPCリンクをコピー"
              onCopy={() => void handleCopy(linkWorld?.viewerMyNpcUrl ?? `http://localhost:5175/s/${activeStreamerHandle}/my-npc`, 'myNpc')}
            />
          </div>

          <section className="inner-panel gift-panel">
            <header className="section-head compact">
              <div>
                <h3>ギフトテスト</h3>
                <p>配信中のライブセッションにだけ支援物資を投げ込めます。</p>
              </div>
            </header>

            <form className="gift-form" onSubmit={(event) => void handleGiftSubmit(event)}>
              <div className="gift-grid">
                <label className="gift-field">
                  <span>TikTok ID</span>
                  <input value={giftForm.tiktokId} onChange={(event) => handleGiftFieldChange('tiktokId', event.target.value)} />
                </label>
                <label className="gift-field">
                  <span>表示名</span>
                  <input value={giftForm.displayName} onChange={(event) => handleGiftFieldChange('displayName', event.target.value)} />
                </label>
                <label className="gift-field">
                  <span>ギフト名</span>
                  <input value={giftForm.giftName} onChange={(event) => handleGiftFieldChange('giftName', event.target.value)} />
                </label>
                <label className="gift-field">
                  <span>giftId</span>
                  <input value={giftForm.giftId} onChange={(event) => handleGiftFieldChange('giftId', event.target.value)} />
                </label>
                <label className="gift-field">
                  <span>ギフト値</span>
                  <input value={giftForm.giftValue} inputMode="numeric" onChange={(event) => handleGiftFieldChange('giftValue', event.target.value)} />
                </label>
                <label className="gift-field">
                  <span>repeatCount</span>
                  <input value={giftForm.repeatCount} inputMode="numeric" onChange={(event) => handleGiftFieldChange('repeatCount', event.target.value)} />
                </label>
              </div>

              {giftError ? <div className="gift-error">{giftError}</div> : null}

              <div className="gift-actions">
                <button className="action primary" type="submit" disabled={giftSubmitting || currentLiveSession?.status !== 'live'}>
                  {giftSubmitting ? '送信中…' : 'テストギフト送信'}
                </button>
              </div>
            </form>

            {giftResult ? (
              <div className="gift-result">
                <div className="gift-result-row">
                  <strong>{giftResult.giftEvent.giftName}</strong>
                  <span>{giftResult.giftEvent.status}</span>
                </div>
                <p>
                  {giftResult.giftEvent.repeatCount} 回 / pack {giftResult.resourceGrant.packId ?? '—'}
                </p>
                <small>
                  {giftResult.targetNpc ? `対象 ${giftResult.targetNpc.name}` : '対象 NPC なし'} / Gift Count {formatShortNumber(giftResult.liveSession.giftCount)}
                </small>
              </div>
            ) : null}
          </section>

          <div className="stack">
            <div className="metric">
              <span className="metric-label">現在の配信状態</span>
              <strong>{liveSessionLabel}</strong>
              <span className="metric-sub">
                {currentLiveSession?.id ?? selectedWorld?.latestLiveSessionId ?? '—'}
                {currentLiveSession?.status === 'live' ? ` / gift ${formatShortNumber(currentLiveSession.giftCount)}` : ''}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">ギフト接続状態</span>
              <strong>{giftConnectionLabel}</strong>
              <span className="metric-sub">
                {giftConnection
                  ? `${giftConnectionStatusLabel} / ${giftConnection.platform} / ${giftConnection.hasCredentials ? '認証情報あり' : '認証情報なし'}`
                  : currentLiveSession
                    ? '配信開始後に有効になります'
                    : '配信開始後に有効になります'}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">最後の Tick 開始</span>
              <strong>{activeWorld?.lastTickStartedAt ? formatDateTime(activeWorld.lastTickStartedAt) : '—'}</strong>
              <span className="metric-sub">{activeWorld ? `間隔 ${formatShortNumber(activeWorld.tickIntervalSeconds)} 秒` : '—'}</span>
            </div>
          </div>

          <section className="inner-panel">
            <header className="section-head compact">
              <div>
                <h3>最近のイベント</h3>
                <p>最新の world_events をそのまま並べています。</p>
              </div>
            </header>
            <div className="event-list">
              {recentEvents.map((event) => (
                <article key={event.id} className="event-item">
                  <span className="event-tick">Tick {formatShortNumber(event.tick)}</span>
                  <strong>{event.titleJa ?? event.eventType}</strong>
                  <p>{event.descriptionJa ?? '—'}</p>
                </article>
              ))}
              {recentEvents.length === 0 ? <div className="empty-state">イベントはまだありません。</div> : null}
            </div>
          </section>

          <section className="inner-panel">
            <header className="section-head compact">
              <div>
                <h3>支援物資</h3>
                <p>gift_events から生成された resource_grants を確認できます。</p>
              </div>
            </header>
            {resourceGrant ? (
              <div className="metric">
                <span className="metric-label">Pack</span>
                <strong>{resourceGrant.packId ?? '—'}</strong>
                <span className="metric-sub">
                  {resourceGrant.status} / {resourceGrant.spawnTileX ?? '—'}, {resourceGrant.spawnTileY ?? '—'}
                </span>
              </div>
            ) : (
              <div className="empty-state">支援物資はまだありません。</div>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

type ConsoleRoute = 'dashboard' | 'login' | 'register' | 'billing';

function resolveConsoleRoute(): ConsoleRoute {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'streamer' && parts[1] === 'login') {
    return 'login';
  }

  if (parts[0] === 'streamer' && parts[1] === 'register') {
    return 'register';
  }

  if (parts[0] === 'streamer' && parts[1] === 'billing') {
    return 'billing';
  }

  return 'dashboard';
}

function useAuthBootstrap() {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const auth = await requestJson<AuthResponse>('/api/auth/me');
        if (!cancelled) {
          setSession(auth);
          setError(null);
        }
      } catch (authError) {
        if (!cancelled) {
          const message = authError instanceof Error ? authError.message : '認証情報の取得に失敗しました';
          if (message.startsWith('401')) {
            setSession(null);
            setError(null);
          } else {
            setError(message);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return { session, setSession, loading, error };
}

function RootApp() {
  const route = useMemo(resolveConsoleRoute, []);
  const auth = useAuthBootstrap();

  const handleLogout = useCallback(async () => {
    try {
      await requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      auth.setSession(null);
      window.location.assign('/streamer/login');
    }
  }, [auth]);

  const handleAuthSuccess = useCallback(
    (response: AuthResponse) => {
      auth.setSession(response);
      window.location.assign('/streamer/dashboard');
    },
    [auth],
  );

  if (auth.loading) {
    return (
      <main className="page">
        <section className="panel hero">
          <div className="hero-copy">
            <p className="eyebrow">認証確認中</p>
            <h1>ログイン状態を確認しています</h1>
            <p>セッションを読み込んでいます。</p>
          </div>
        </section>
      </main>
    );
  }

  if (!auth.session) {
    if (route === 'register') {
      return <RegisterPage initialError={auth.error} onSuccess={handleAuthSuccess} />;
    }

    return <LoginPage initialError={auth.error} onSuccess={handleAuthSuccess} />;
  }

  if (route === 'billing') {
    return <BillingPage session={auth.session} onLogout={handleLogout} />;
  }

  return <DashboardApp session={auth.session} onLogout={handleLogout} />;
}

function LoginPage({ initialError, onSuccess }: { initialError: string | null; onSuccess: (response: AuthResponse) => void }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.email.trim() || !form.password.trim()) {
      setError('メールアドレスとパスワードを入力してください。');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await requestJson<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
        }),
      });
      onSuccess(response);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <strong>AI WASTELAND SURVIVAL v2</strong>
          <span>Streamer Console / ログイン</span>
        </div>
        <div className="actions">
          <a className="action" href="/streamer/register">
            新規登録
          </a>
        </div>
      </header>

      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">配信者ログイン</p>
          <h1>メールアドレスとパスワードでログインします</h1>
          <p>ログイン後は session に紐づく tenant / world / snapshot を表示します。</p>
        </div>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <label className="gift-field">
            <span>メールアドレス</span>
            <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" />
          </label>
          <label className="gift-field">
            <span>パスワード</span>
            <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} autoComplete="current-password" />
          </label>
          {error ? <div className="alert"><strong>取得エラー</strong><span>{error}</span></div> : null}
          <div className="form-actions">
            <button className="action primary" type="submit" disabled={loading}>
              {loading ? 'ログイン中…' : 'ログイン'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function RegisterPage({ initialError, onSuccess }: { initialError: string | null; onSuccess: (response: AuthResponse) => void }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.email.trim() || !form.password.trim()) {
      setError('メールアドレスとパスワードを入力してください。');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await requestJson<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          displayName: form.displayName.trim() || undefined,
        }),
      });
      onSuccess(response);
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : '登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <strong>AI WASTELAND SURVIVAL v2</strong>
          <span>Streamer Console / 新規登録</span>
        </div>
        <div className="actions">
          <a className="action" href="/streamer/login">
            ログイン
          </a>
        </div>
      </header>

      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">配信者登録</p>
          <h1>新しい tenant と world を作成します</h1>
          <p>登録すると自分専用の world と overlay / viewer リンクが作成されます。</p>
        </div>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <label className="gift-field">
            <span>メールアドレス</span>
            <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" />
          </label>
          <label className="gift-field">
            <span>パスワード</span>
            <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" />
          </label>
          <label className="gift-field">
            <span>表示名</span>
            <input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} autoComplete="nickname" />
          </label>
          {error ? <div className="alert"><strong>取得エラー</strong><span>{error}</span></div> : null}
          <div className="form-actions">
            <button className="action primary" type="submit" disabled={loading}>
              {loading ? '登録中…' : '登録する'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function BillingPage({
  session,
  onLogout,
}: {
  session: AuthResponse;
  onLogout: () => Promise<void>;
}) {
  const [context, setContext] = useState<BillingContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>(session.subscription?.plan === 'starter' || session.subscription?.plan === 'pro' || session.subscription?.plan === 'studio' ? session.subscription.plan : 'free_trial');

  const loadBilling = useCallback(async () => {
    const response = await requestJson<BillingContext>('/api/console/billing');
    setContext(response);
    setSelectedPlan(
      response.subscription?.plan === 'starter' || response.subscription?.plan === 'pro' || response.subscription?.plan === 'studio'
        ? response.subscription.plan
        : 'free_trial',
    );
  }, []);

  const refreshBilling = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setRefreshing(true);
      }

      setError(null);
      try {
        await loadBilling();
      } catch (billingError) {
        setError(billingError instanceof Error ? billingError.message : '請求情報の取得に失敗しました');
      } finally {
        if (!options?.silent) {
          setRefreshing(false);
        }
      }
    },
    [loadBilling],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        await loadBilling();
      } catch (billingError) {
        if (!cancelled) {
          setError(billingError instanceof Error ? billingError.message : '請求情報の取得に失敗しました');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loadBilling]);

  const applyResponse = useCallback((response: BillingActionResponse) => {
    setContext(response);
    setSelectedPlan(
      response.subscription?.plan === 'starter' || response.subscription?.plan === 'pro' || response.subscription?.plan === 'studio'
        ? response.subscription.plan
        : 'free_trial',
    );
    setNotice(`${response.billingEvent.eventType} / ${response.billingEvent.status}`);
  }, []);

  const handleCheckout = useCallback(async () => {
    setBusyAction('checkout');
    setError(null);
    setNotice(null);
    try {
      const response = await requestJson<BillingActionResponse>('/api/console/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: selectedPlan }),
      });
      applyResponse(response);
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : 'プラン変更に失敗しました');
    } finally {
      setBusyAction(null);
    }
  }, [applyResponse, selectedPlan]);

  const handlePortal = useCallback(
    async (action: BillingPortalAction) => {
      setBusyAction(action);
      setError(null);
      setNotice(null);
      try {
        const response = await requestJson<BillingActionResponse>('/api/console/billing/portal', {
          method: 'POST',
          body: JSON.stringify({ action }),
        });
        applyResponse(response);
      } catch (billingError) {
        setError(billingError instanceof Error ? billingError.message : '契約操作に失敗しました');
      } finally {
        setBusyAction(null);
      }
    },
    [applyResponse],
  );

  const currentPlan = context?.planLabel ?? session.subscription?.plan ?? '—';
  const currentStatus = context?.status ?? session.subscription?.status ?? '—';
  const subscription = context?.subscription ?? session.subscription ?? null;
  const giftConnection = context?.giftConnection ?? null;

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <strong>AI WASTELAND SURVIVAL v2</strong>
          <span>Streamer Billing / モック課金</span>
        </div>
        <div className="actions">
          <button className="action" type="button" onClick={() => void refreshBilling()} disabled={loading || refreshing}>
            <RefreshIcon />
            更新
          </button>
          <a className="action" href="/streamer/dashboard">
            コンソールへ戻る
          </a>
          <button className="action" type="button" onClick={() => void onLogout()}>
            ログアウト
          </button>
        </div>
      </header>

      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">請求・契約</p>
          <h1>Stripe 形状のモック契約を管理する</h1>
          <p>
            現在のプラン、契約状態、利用枠、billing event をまとめて確認できます。ここで変えた状態は
            Streamer Console と Viewer の制限に即時反映されます。
          </p>
        </div>
        <div className="hero-summary">
          <div className="metric hero-metric">
            <span className="metric-label">配信者名</span>
            <strong>{session.streamer.displayName}</strong>
            <span className="metric-sub">@{session.streamer.handle}</span>
          </div>
          <div className="metric hero-metric">
            <span className="metric-label">現在のプラン</span>
            <strong>{currentPlan}</strong>
            <span className="metric-sub">{currentStatus}</span>
          </div>
          <div className="metric hero-metric">
            <span className="metric-label">AI住民</span>
            <strong>{context ? `${formatShortNumber(context.stats.npcCount)} / ${formatShortNumber(context.planLimits.maxNpcsPerWorld)}` : '—'}</strong>
            <span className="metric-sub">選択ワールドの上限</span>
          </div>
          <div className="metric hero-metric">
            <span className="metric-label">契約状態</span>
            <strong>{subscription?.status ?? '—'}</strong>
            <span className="metric-sub">{subscription?.cancelAtPeriodEnd ? '更新停止予定' : '更新継続中'}</span>
          </div>
        </div>
      </section>

      {error ? (
        <section className="alert">
          <strong>取得エラー</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {notice ? (
        <section className="alert">
          <strong>更新完了</strong>
          <span>{notice}</span>
        </section>
      ) : null}

      {loading ? (
        <section className="panel">
          <div className="empty-state">請求情報を読み込んでいます。</div>
        </section>
      ) : (
        <section className="shell">
          <aside className="panel sidebar">
            <header className="section-head">
              <div>
                <h2>利用状況</h2>
                <p>契約の上限と現在の使用量です。</p>
              </div>
            </header>

            <div className="stack">
              <div className="metric">
                <span className="metric-label">現在のプラン</span>
                <strong>{currentPlan}</strong>
                <span className="metric-sub">{context?.planLimits.overlayBranding === 'custom' ? 'カスタムブランド可' : 'ウォーターマーク表示'}</span>
              </div>
              <div className="metric">
                <span className="metric-label">契約状態</span>
                <strong>{currentStatus}</strong>
                <span className="metric-sub">{subscription?.cancelAtPeriodEnd ? '解約予定あり' : '契約継続中'}</span>
              </div>
              <div className="metric">
                <span className="metric-label">ワールド数</span>
                <strong>{context ? `${formatShortNumber(context.stats.worldCount)} / ${formatShortNumber(context.planLimits.maxWorlds)}` : '—'}</strong>
                <span className="metric-sub">テナント全体</span>
              </div>
              <div className="metric">
                <span className="metric-label">今月の配信</span>
                <strong>{context ? `${formatShortNumber(context.stats.liveSessionsThisMonth)} / ${formatShortNumber(context.planLimits.maxLiveSessionsPerMonth)}` : '—'}</strong>
                <span className="metric-sub">月内の live_session 数</span>
              </div>
              <div className="metric">
                <span className="metric-label">AIナレーション残数</span>
                <strong>{context ? `${formatShortNumber(context.stats.aiNarrationRemaining)} / ${formatShortNumber(context.planLimits.aiNarrationQuota)}` : '—'}</strong>
                <span className="metric-sub">使用可能分のみ表示</span>
              </div>
              <div className="metric">
                <span className="metric-label">ギフト接続</span>
                <strong>{giftConnection ? formatGiftAdapterLabel(giftConnection.connectionType) : '未設定'}</strong>
                <span className="metric-sub">
                  {giftConnection
                    ? `${formatGiftConnectionStatusLabel(giftConnection.status)} / ${giftConnection.platform} / ${giftConnection.hasCredentials ? '認証情報あり' : '認証情報なし'}`
                    : '接続先を選んでください'}
                </span>
              </div>
            </div>
          </aside>

          <section className="panel main-column">
            <header className="section-head">
              <div>
                <h2>契約操作</h2>
                <p>モック課金でプランや契約状態を切り替えます。</p>
              </div>
              <span className="status-chip ok">{context?.planLabel ?? '—'}</span>
            </header>

            <div className="split">
              <section className="inner-panel">
                <header className="section-head compact">
                  <div>
                    <h3>プラン変更</h3>
                    <p>mock checkout を呼び出して plan を更新します。</p>
                  </div>
                </header>

                <div className="stack">
                  <label className="gift-field">
                    <span>現在のプラン</span>
                    <select value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value as BillingPlan)}>
                      {BILLING_PLAN_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="form-actions">
                    <button className="action primary" type="button" onClick={() => void handleCheckout()} disabled={busyAction !== null}>
                      {busyAction === 'checkout' ? '更新中…' : 'プランを変更'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="inner-panel">
                <header className="section-head compact">
                  <div>
                    <h3>契約状態操作</h3>
                    <p>Stripe webhook 風の状態遷移を再現します。</p>
                  </div>
                </header>

                <div className="stack">
                  {BILLING_PORTAL_ACTIONS.map((item) => (
                    <button
                      key={item.action}
                      className={`action ${item.tone === 'danger' ? 'danger' : item.tone === 'primary' ? 'primary' : ''}`.trim()}
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void handlePortal(item.action)}
                    >
                      {busyAction === item.action ? '処理中…' : item.label}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <section className="inner-panel">
              <header className="section-head compact">
                <div>
                  <h3>billing events</h3>
                  <p>checkout / portal / webhook の履歴です。</p>
                </div>
                <span className="status-chip">{context?.billingEvents.length ?? 0} 件</span>
              </header>

              <div className="table-shell">
                <table className="world-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Provider</th>
                      <th>Session</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(context?.billingEvents ?? []).map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.eventType}</strong>
                          <small>{event.providerEventId}</small>
                        </td>
                        <td>{event.status}</td>
                        <td>{event.provider}</td>
                        <td>{event.providerSessionId ?? '—'}</td>
                        <td>{formatDateTime(event.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(context?.billingEvents ?? []).length === 0 ? <div className="empty-state">billing event はまだありません。</div> : null}
            </section>

            <section className="inner-panel">
              <header className="section-head compact">
                <div>
                  <h3>使用期間</h3>
                  <p>請求イベントの集計期間です。</p>
                </div>
              </header>
              <div className="summary-grid">
                <div className="metric tiny">
                  <span className="metric-label">開始</span>
                  <strong>{context ? formatDateTime(context.usageWindow.start) : '—'}</strong>
                </div>
                <div className="metric tiny">
                  <span className="metric-label">終了</span>
                  <strong>{context ? formatDateTime(context.usageWindow.end) : '—'}</strong>
                </div>
                <div className="metric tiny">
                  <span className="metric-label">提供元</span>
                  <strong>{context?.subscription?.provider ?? 'mock_stripe'}</strong>
                </div>
                <div className="metric tiny">
                  <span className="metric-label">顧客</span>
                  <strong>{context?.subscription?.providerCustomerId ?? '—'}</strong>
                </div>
              </div>
            </section>
          </section>
        </section>
      )}
    </main>
  );
}

function Meter({ value, tone, label }: { value: number; tone: 'ok' | 'warning' | 'danger'; label?: string }) {
  return (
    <div className={`meter ${tone}`}>
      {label ? <span>{label}</span> : null}
      <strong>{formatShortNumber(Math.round(value))}</strong>
      <div className="meter-track" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function CopyField({
  label,
  value,
  copied,
  onCopy,
  actionLabel = 'コピー',
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="copy-field">
      <div className="copy-field-head">
        <span>{label}</span>
        <button className={`inline-action copy ${copied ? 'copied' : ''}`} type="button" onClick={onCopy}>
          <CopyIcon />
          {copied ? 'コピー済み' : actionLabel}
        </button>
      </div>
      <code>{value}</code>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<RootApp />);
