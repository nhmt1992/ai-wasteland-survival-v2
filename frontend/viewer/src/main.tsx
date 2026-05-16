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
  plan: string;
  status: string;
  maxWorlds: number;
  maxNpcsPerWorld: number;
  aiNarrationQuota: number;
};

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
};

type StreamerContext = {
  ok: boolean;
  handle: string;
  displayName: string;
  tenantHandle: string;
  plan: string;
  status: string;
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
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
};

type ViewerUser = {
  id: string;
  tiktokId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type ViewerNpc = {
  id: string;
  name: string;
  age: number;
  gender: string | null;
  appearanceKey: string;
  personalityPrompt: string;
  backstory: string;
  traits: {
    social: number;
    aggression: number;
    greed: number;
    cooperation: number;
    risk: number;
    leadership: number;
  };
  status: string;
  deathCause: string | null;
  createdAt: string;
  updatedAt: string;
  viewerUser: ViewerUser | null;
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
    actionTargetX: number | null;
    actionTargetY: number | null;
    actionStartedAt: string | null;
    actionEndsAt: string | null;
    lastTick: number;
    updatedAt: string;
  };
  inventory: Array<{
    id: string;
    itemId: string;
    quantity: number;
    durability: number | null;
  }>;
};

type ViewerSnapshotResponse = {
  ok: boolean;
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
  world: WorldSummary;
  viewerUser: ViewerUser;
  npc: ViewerNpc;
  events: Array<{
    id: string;
    tick: number;
    eventType: string;
    titleJa: string | null;
    descriptionJa: string | null;
    createdAt: string;
  }>;
};

type CreateNpcResponse = {
  ok: boolean;
  created: boolean;
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
  world: WorldSummary;
  viewerUser: ViewerUser;
  npc: ViewerNpc;
};

type ViewerRoute = {
  page: 'create' | 'my-npc' | 'watch';
  streamerHandle: string;
  npcId?: string;
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

const DEFAULT_API_BASE_URL = resolveApiBaseUrl();
const LAST_TIKTOK_KEY = 'ai-wasteland:last-tiktok-id';

function apiUrl(path: string): string {
  return `${DEFAULT_API_BASE_URL}${path}`;
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
    // Fall back to raw body.
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

function websocketUrl(path: string): string {
  const baseUrl = DEFAULT_API_BASE_URL.startsWith('http') ? DEFAULT_API_BASE_URL : window.location.origin;
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  }

  return url.toString();
}

function formatNumber(value: number): string {
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

function formatPlanLabel(plan: string | null | undefined): string {
  switch (plan) {
    case 'free_trial':
      return '無料トライアル';
    case 'starter':
      return 'スターター';
    case 'pro':
      return 'プロ';
    case 'studio':
      return 'スタジオ';
    default:
      return '—';
  }
}

function buildWatchUrl(streamerHandle: string, npcId: string): string {
  return `${window.location.origin}/s/${encodeURIComponent(streamerHandle)}/watch/${encodeURIComponent(npcId)}`;
}

function resolveRoute(): ViewerRoute {
  const parts = window.location.pathname.split('/').filter(Boolean);

  if (parts[0] === 's' && parts[1]) {
    const streamerHandle = parts[1].trim();
    if (parts[2] === 'my-npc') {
      return { page: 'my-npc', streamerHandle };
    }

    if (parts[2] === 'watch' && parts[3]) {
      return { page: 'watch', streamerHandle, npcId: parts[3].trim() };
    }

    return { page: 'create', streamerHandle };
  }

  return { page: 'create', streamerHandle: '' };
}

function useStreamerContext(streamerHandle: string) {
  const [context, setContext] = useState<StreamerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      if (!streamerHandle.trim()) {
        setContext(null);
        setError('配信者 URL が必要です。/s/{streamerHandle}/create を開いてください。');
        return;
      }

      const data = await requestJson<StreamerContext>(`/api/streamers/${encodeURIComponent(streamerHandle)}`);
      setContext(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '配信者情報の取得に失敗しました');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [streamerHandle]);

  useEffect(() => {
    void load();
  }, [load]);

  return { context, loading, error, reload: () => load({ silent: true }) };
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
          // 受信失敗時は次の更新で追従する
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

function App() {
  const route = useMemo(resolveRoute, []);
  const streamer = useStreamerContext(route.streamerHandle);
  const [searchTiktokId, setSearchTiktokId] = useState('');

  useEffect(() => {
    const queryTiktokId = new URLSearchParams(window.location.search).get('tiktokId');
    const savedTiktokId = window.localStorage.getItem(LAST_TIKTOK_KEY);
    setSearchTiktokId(queryTiktokId ?? savedTiktokId ?? '');
  }, []);

  if (route.page === 'my-npc') {
    return (
      <MyNpcPage
        route={route}
        initialTiktokId={searchTiktokId}
        context={streamer.context}
        loading={streamer.loading}
        error={streamer.error}
        reloadContext={streamer.reload}
      />
    );
  }

  if (route.page === 'watch') {
    return (
      <WatchNpcPage
        route={route}
        initialNpcId={route.npcId ?? ''}
        context={streamer.context}
        loading={streamer.loading}
        error={streamer.error}
        reloadContext={streamer.reload}
      />
    );
  }

  return <CreatePage route={route} context={streamer.context} loading={streamer.loading} error={streamer.error} reloadContext={streamer.reload} />;
}

function CreatePage({
  route,
  context,
  loading,
  error,
  reloadContext,
}: {
  route: ViewerRoute;
  context: StreamerContext | null;
  loading: boolean;
  error: string | null;
  reloadContext: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    tiktokId: '',
    displayName: '',
    npcName: '',
    personalityPrompt: '',
    gender: '',
    age: '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const realtimeWorldId = context?.primaryWorld?.id ?? '';
  const routeError = route.streamerHandle ? null : '配信者 URL が必要です。';
  const currentWorldNpcCount = context?.primaryWorld?.npcCount ?? 0;
  const currentWorldNpcLimit = context?.subscription?.maxNpcsPerWorld ?? 0;
  const npcLimitReached = Boolean(context?.primaryWorld && context?.subscription && currentWorldNpcCount >= currentWorldNpcLimit);

  useEffect(() => {
    const savedTiktokId = window.localStorage.getItem(LAST_TIKTOK_KEY);
    if (savedTiktokId) {
      setForm((current) => (current.tiktokId ? current : { ...current, tiktokId: savedTiktokId }));
    }
  }, []);

  const realtimeStatus = useRealtimeFeed(route.streamerHandle, realtimeWorldId, () => {
    void reloadContext();
  });

  const handleChange = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (routeError) {
      setSubmitError(routeError);
      return;
    }

    if (!form.tiktokId.trim()) {
      setSubmitError('TikTok ID を入力してください。');
      return;
    }

    if (npcLimitReached) {
      setSubmitError('この配信者のAI住民枠は上限に達しています。配信者がプランを変更すると、新しいAI住民を作成できます。');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await requestJson<CreateNpcResponse>('/api/viewer/npcs', {
        method: 'POST',
        body: JSON.stringify({
          streamerHandle: route.streamerHandle,
          tiktokId: form.tiktokId.trim(),
          displayName: form.displayName.trim() || undefined,
          npcName: form.npcName.trim() || undefined,
          personalityPrompt: form.personalityPrompt.trim() || undefined,
          gender: form.gender.trim() || undefined,
          age: form.age ? Number(form.age) : undefined,
        }),
      });

      window.localStorage.setItem(LAST_TIKTOK_KEY, form.tiktokId.trim());
      window.location.assign(`/s/${route.streamerHandle}/my-npc?tiktokId=${encodeURIComponent(form.tiktokId.trim())}`);
    } catch (createError) {
      setSubmitError(createError instanceof Error ? createError.message : 'NPC 作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="viewer-shell">
      <header className="topbar">
        <div className="brand">
          <strong>AI WASTELAND SURVIVAL v2</strong>
          <span>Viewer / Creator</span>
        </div>
        <div className="actions">
          <a className="action" href={`/s/${route.streamerHandle}/my-npc`}>
            自分の NPC
          </a>
          <a
            className="action primary"
            href={route.streamerHandle && context?.primaryWorld?.id ? `/overlay/${route.streamerHandle}/${context.primaryWorld.id}` : '#'}
            aria-disabled={!route.streamerHandle || !context?.primaryWorld?.id}
          >
            Overlay を確認
          </a>
        </div>
      </header>

      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">AI 住民を作成</p>
          <h1>視聴者の NPC を荒土世界に参加させる</h1>
          <p>
            TikTok ID と性格・背景を入力すると、選択した配信者の世界に NPC を生成します。作成後は自分の
            NPC ページで状態を確認できます。
          </p>
        </div>
        <div className="hero-side">
          <div className="metric">
            <span className="metric-label">配信者</span>
            <strong>{(context?.streamer.displayName ?? route.streamerHandle) || '—'}</strong>
            <span className="metric-sub">@{route.streamerHandle}</span>
          </div>
          <div className="metric">
            <span className="metric-label">現在のワールド</span>
            <strong>{context?.primaryWorld?.name ?? '荒土世界 Alpha'}</strong>
            <span className="metric-sub">
              NPC {context?.primaryWorld && context?.subscription ? `${formatNumber(currentWorldNpcCount)} / ${formatNumber(currentWorldNpcLimit)}` : '—'}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">リアルタイム</span>
            <strong>{realtimeStatus === 'connected' ? '接続中' : realtimeStatus === 'reconnecting' ? '再接続中' : realtimeStatus === 'connecting' ? '接続中' : '待機中'}</strong>
            <span className="metric-sub">WebSocket / world 更新</span>
          </div>
        </div>
      </section>

      {error ? <section className="alert">{error}</section> : null}

      <section className="layout">
        <form className="panel form-panel" onSubmit={(event) => void handleSubmit(event)}>
          <header className="section-head">
            <div>
              <h2>NPC 作成フォーム</h2>
              <p>入力後は自動的に my-npc へ移動します。</p>
            </div>
            <span className="status-chip">{loading ? '読込中' : '準備完了'}</span>
          </header>

          <div className="form-grid">
            <Field label="TikTok ID" hint="必須">
              <input
                value={form.tiktokId}
                onChange={(event) => handleChange('tiktokId', event.target.value)}
                placeholder="例: test_user_001"
                autoComplete="off"
              />
            </Field>
            <Field label="表示名" hint="任意">
              <input
                value={form.displayName}
                onChange={(event) => handleChange('displayName', event.target.value)}
                placeholder="例: テスト視聴者"
                autoComplete="off"
              />
            </Field>
            <Field label="住民名" hint="任意">
              <input
                value={form.npcName}
                onChange={(event) => handleChange('npcName', event.target.value)}
                placeholder="例: サバイバー"
                autoComplete="off"
              />
            </Field>
            <Field label="性別" hint="任意">
              <input
                value={form.gender}
                onChange={(event) => handleChange('gender', event.target.value)}
                placeholder="例: female"
                autoComplete="off"
              />
            </Field>
            <Field label="年齢" hint="任意">
              <input
                value={form.age}
                onChange={(event) => handleChange('age', event.target.value)}
                placeholder="例: 24"
                inputMode="numeric"
                autoComplete="off"
              />
            </Field>
            <Field label="性格・背景" hint="任意">
              <textarea
                value={form.personalityPrompt}
                onChange={(event) => handleChange('personalityPrompt', event.target.value)}
                placeholder="例: 落ち着いていて、物資を大事にする。"
                rows={7}
              />
            </Field>
          </div>

          {submitError ? <div className="form-error">{submitError}</div> : null}
          {npcLimitReached ? (
            <div className="form-error">
              この配信者のAI住民枠は上限に達しています。配信者がプランを変更すると、新しいAI住民を作成できます。
            </div>
          ) : null}

          <div className="form-actions">
            <button className="action primary" type="submit" disabled={submitting || npcLimitReached}>
              {submitting ? '作成中…' : 'NPC を作成'}
            </button>
          </div>
        </form>

        <aside className="panel info-panel">
          <header className="section-head">
            <div>
              <h2>配信者と共有リンク</h2>
              <p>この MVP は選択した配信者のワールドに接続します。</p>
            </div>
          </header>

          <div className="stack">
            <div className="metric">
              <span className="metric-label">契約状態</span>
              <strong>{context?.subscription?.status ?? '—'}</strong>
              <span className="metric-sub">{formatPlanLabel(context?.subscription?.plan)}</span>
            </div>
            <div className="metric">
              <span className="metric-label">AI住民枠</span>
              <strong>
                {context?.primaryWorld && context?.subscription
                  ? `${formatNumber(currentWorldNpcCount)} / ${formatNumber(currentWorldNpcLimit)}`
                  : '—'}
              </strong>
              <span className="metric-sub">{npcLimitReached ? '上限に達しています' : '作成可能です'}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Overlay URL</span>
              <strong>{context?.primaryWorld?.overlayUrl ?? '—'}</strong>
              <span className="metric-sub">OBS Browser Source に貼り付けます。</span>
            </div>
            <div className="metric">
              <span className="metric-label">視聴者作成リンク</span>
              <strong>{context?.primaryWorld?.viewerCreateUrl ?? `http://localhost:5175/s/${route.streamerHandle}/create`}</strong>
              <span className="metric-sub">作成ページの共有用です。</span>
            </div>
            <div className="metric">
              <span className="metric-label">自分の NPC ページ</span>
              <strong>{context?.primaryWorld?.viewerMyNpcUrl ?? `http://localhost:5175/s/${route.streamerHandle}/my-npc`}</strong>
              <span className="metric-sub">作成後に自動遷移します。</span>
            </div>
          </div>

          <section className="inner-panel">
            <header className="section-head compact">
              <div>
                <h3>配信者の現在値</h3>
                <p>リアル API から取得した値を表示しています。</p>
              </div>
            </header>

            {context ? (
              <div className="summary-grid">
                <div className="metric tiny">
                  <span className="metric-label">ワールド</span>
                  <strong>{formatNumber(context.stats.worldCount)}</strong>
                </div>
                <div className="metric tiny">
                  <span className="metric-label">今月の配信</span>
                  <strong>{formatNumber(context.stats.liveSessionsThisMonth)}</strong>
                </div>
                <div className="metric tiny">
                  <span className="metric-label">観覧者</span>
                  <strong>{formatNumber(context.stats.viewerUserCount)}</strong>
                </div>
                <div className="metric tiny">
                  <span className="metric-label">NPC</span>
                  <strong>{formatNumber(context.stats.npcCount)}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-state">配信者情報を読み込み中です。</div>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

function MyNpcPage({
  route,
  initialTiktokId,
  context,
  loading,
  error,
  reloadContext,
}: {
  route: ViewerRoute;
  initialTiktokId: string;
  context: StreamerContext | null;
  loading: boolean;
  error: string | null;
  reloadContext: () => Promise<void>;
}) {
  const [tiktokId, setTiktokId] = useState(initialTiktokId);
  const [snapshot, setSnapshot] = useState<ViewerSnapshotResponse | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(Boolean(initialTiktokId));
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const realtimeWorldId = snapshot?.world.id ?? context?.primaryWorld?.id ?? '';
  const routeError = route.streamerHandle ? null : '配信者 URL が必要です。';
  const activeWorldId = snapshot?.world.id ?? context?.primaryWorld?.id ?? '';

  useEffect(() => {
    setTiktokId(initialTiktokId);
  }, [initialTiktokId]);

  const loadSnapshot = useCallback(async (id: string) => {
    if (routeError) {
      setSnapshot(null);
      setSnapshotError(routeError);
      setSnapshotLoading(false);
      return;
    }

    if (!id.trim()) {
      setSnapshot(null);
      setSnapshotError(null);
      setSnapshotLoading(false);
      return;
    }

    setSnapshotLoading(true);
    try {
      const data = await requestJson<ViewerSnapshotResponse>(
        `/api/viewer/my-npc?streamerHandle=${encodeURIComponent(route.streamerHandle)}&tiktokId=${encodeURIComponent(id.trim())}`,
      );
      setSnapshot(data);
      setSnapshotError(null);
      window.localStorage.setItem(LAST_TIKTOK_KEY, id.trim());
    } catch (loadError) {
      setSnapshot(null);
      setSnapshotError(loadError instanceof Error ? loadError.message : 'my-npc の取得に失敗しました');
    } finally {
      setSnapshotLoading(false);
    }
  }, [route.streamerHandle, routeError]);

  useEffect(() => {
    void loadSnapshot(initialTiktokId);
  }, [initialTiktokId, loadSnapshot]);

  useEffect(() => {
    if (!snapshot?.npc.id) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadSnapshot(tiktokId);
    }, 8000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadSnapshot, snapshot?.npc.id, tiktokId]);

  const realtimeStatus = useRealtimeFeed(route.streamerHandle, realtimeWorldId, () => {
    void reloadContext();
    void loadSnapshot(tiktokId);
  });

  const traits = snapshot?.npc.traits;
  const inventory = snapshot?.npc.inventory ?? [];
  const events = snapshot?.events ?? [];

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void loadSnapshot(tiktokId);
  };

  return (
    <main className="viewer-shell">
      <header className="topbar">
        <div className="brand">
          <strong>AI WASTELAND SURVIVAL v2</strong>
          <span>My NPC</span>
        </div>
        <div className="actions">
          <a className="action" href={`/s/${route.streamerHandle}/create`}>
            新しく作成
          </a>
          <a
            className="action primary"
            href={route.streamerHandle && activeWorldId ? `/overlay/${route.streamerHandle}/${activeWorldId}` : '#'}
            aria-disabled={!route.streamerHandle || !activeWorldId}
          >
            Overlay を確認
          </a>
        </div>
      </header>

      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">あなたの AI 住民</p>
          <h1>{snapshot?.npc.name ?? 'NPC を読み込み中'}</h1>
          <p>
            TikTok ID {tiktokId || '未入力'} の NPC 状態、所持品、最近の出来事を表示します。
          </p>
        </div>
        <div className="hero-side">
          <div className="metric">
            <span className="metric-label">配信者</span>
            <strong>{(snapshot?.streamer.displayName ?? context?.streamer.displayName ?? route.streamerHandle) || '—'}</strong>
            <span className="metric-sub">@{route.streamerHandle}</span>
          </div>
          <div className="metric">
            <span className="metric-label">ワールド</span>
            <strong>{snapshot?.world.name ?? context?.primaryWorld?.name ?? '荒土世界 Alpha'}</strong>
            <span className="metric-sub">Tick {snapshot?.world.currentTick ?? context?.primaryWorld?.currentTick ?? '—'}</span>
          </div>
          <div className="metric">
            <span className="metric-label">リアルタイム</span>
            <strong>{realtimeStatus === 'connected' ? '接続中' : realtimeStatus === 'reconnecting' ? '再接続中' : realtimeStatus === 'connecting' ? '接続中' : '待機中'}</strong>
            <span className="metric-sub">WebSocket / world 更新</span>
          </div>
          {snapshot ? (
            <div className="metric">
              <span className="metric-label">公開視聴 URL</span>
              <strong>{buildWatchUrl(route.streamerHandle, snapshot.npc.id)}</strong>
              <span className="metric-sub">この URL を共有すると NPC を直接見られます。</span>
            </div>
          ) : null}
        </div>
      </section>

      {(error || snapshotError) ? <section className="alert">{error ?? snapshotError}</section> : null}

      <section className="layout">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <header className="section-head">
            <div>
              <h2>NPC を検索</h2>
              <p>作成時の TikTok ID を入力すると、自分の NPC に戻れます。</p>
            </div>
            <span className="status-chip">{snapshotLoading ? '読込中' : '表示'}</span>
          </header>

          <div className="form-grid narrow">
            <Field label="TikTok ID" hint="必須">
              <input value={tiktokId} onChange={(event) => setTiktokId(event.target.value)} placeholder="例: test_user_001" autoComplete="off" />
            </Field>
          </div>

          <div className="form-actions">
            <button className="action primary" type="submit">
              NPC を表示
            </button>
            <button className="action" type="button" onClick={() => void loadSnapshot(tiktokId)}>
              更新
            </button>
          </div>

          <div className="helper">
            {snapshot ? `最終更新 ${formatDateTime(snapshot.npc.updatedAt)}` : 'TikTok ID を入れると現在状態を取得します。'}
          </div>
        </form>

        <section className="panel info-panel">
          <header className="section-head">
            <div>
              <h2>NPC 概要</h2>
              <p>現在の体調、行動、位置をまとめています。</p>
            </div>
          </header>

          {snapshot ? (
            <div className="profile-grid">
              <div className="metric profile-card">
                <span className="metric-label">名前</span>
                <strong>{snapshot.npc.name}</strong>
                <span className="metric-sub">{snapshot.npc.gender ?? '—'} / {snapshot.npc.age} 歳</span>
              </div>
              <div className="metric profile-card">
                <span className="metric-label">状態</span>
                <strong>{snapshot.npc.status}</strong>
                <span className="metric-sub">{snapshot.npc.deathCause ?? snapshot.npc.state.currentAction}</span>
              </div>
              <div className="metric profile-card">
                <span className="metric-label">座標</span>
                <strong>{snapshot.npc.state.tileX}, {snapshot.npc.state.tileY}</strong>
                <span className="metric-sub">最後の Tick {formatNumber(snapshot.npc.state.lastTick)}</span>
              </div>
              <div className="metric profile-card">
                <span className="metric-label">入力済み TikTok ID</span>
                <strong>{snapshot.viewerUser.tiktokId}</strong>
                <span className="metric-sub">{snapshot.viewerUser.displayName ?? '—'}</span>
              </div>
            </div>
          ) : (
            <div className="empty-state">まだ NPC は表示されていません。</div>
          )}

          {snapshot ? (
            <div className="state-grid">
              <StatCard label="HP" value={snapshot.npc.state.hp} />
              <StatCard label="水" value={snapshot.npc.state.water} />
              <StatCard label="食料" value={snapshot.npc.state.food} />
              <StatCard label="スタミナ" value={snapshot.npc.state.stamina} />
              <StatCard label="士気" value={snapshot.npc.state.morale} />
              <StatCard label="傷" value={snapshot.npc.state.injury} />
              <StatCard label="防護" value={snapshot.npc.state.shelter} />
            </div>
          ) : null}
        </section>
      </section>

      {snapshot ? (
        <section className="layout lower">
          <section className="panel">
            <header className="section-head">
              <div>
                <h2>所持品</h2>
                <p>生存に必要な物資をそのまま表示しています。</p>
              </div>
            </header>
            <div className="inventory-list">
              {inventory.length > 0 ? (
                inventory.map((item) => (
                  <article key={item.id} className="inventory-row">
                    <strong>{item.itemId}</strong>
                    <span>数量 {formatNumber(item.quantity)}</span>
                    <small>{item.durability !== null ? `耐久 ${item.durability}` : '消耗品'}</small>
                  </article>
                ))
              ) : (
                <div className="empty-state">所持品はまだありません。</div>
              )}
            </div>
          </section>

          <section className="panel">
            <header className="section-head">
              <div>
                <h2>最近の出来事</h2>
                <p>world_events の最新状態です。</p>
              </div>
            </header>
            <div className="event-list">
              {events.length > 0 ? (
                events.map((event) => (
                  <article key={event.id} className="event-row">
                    <span className="event-badge">Tick {formatNumber(event.tick)}</span>
                    <strong>{event.titleJa ?? event.eventType}</strong>
                    <p>{event.descriptionJa ?? '—'}</p>
                    <small>{formatDateTime(event.createdAt)}</small>
                  </article>
                ))
              ) : (
                <div className="empty-state">出来事はまだありません。</div>
              )}
            </div>
          </section>

          <section className="panel">
            <header className="section-head">
              <div>
                <h2>性格と背景</h2>
                <p>作成時に入力された Prompt をそのまま表示しています。</p>
              </div>
            </header>
            <div className="detail-stack">
              <div className="detail-item">
                <span>性格・背景</span>
                <p>{snapshot.npc.personalityPrompt || '—'}</p>
              </div>
              <div className="detail-item">
                <span>バックストーリー</span>
                <p>{snapshot.npc.backstory || '—'}</p>
              </div>
              <div className="detail-item">
                <span>特性</span>
                <p>
                  社交 {snapshot.npc.traits.social} / 協調 {snapshot.npc.traits.cooperation} / 危険 {snapshot.npc.traits.risk}
                </p>
              </div>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

function WatchNpcPage({
  route,
  initialNpcId,
  context,
  loading,
  error,
  reloadContext,
}: {
  route: ViewerRoute;
  initialNpcId: string;
  context: StreamerContext | null;
  loading: boolean;
  error: string | null;
  reloadContext: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<ViewerSnapshotResponse | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(Boolean(initialNpcId));
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const routeError = route.streamerHandle ? null : '配信者 URL が必要です。';
  const activeWorldId = snapshot?.world.id ?? context?.primaryWorld?.id ?? '';
  const watchUrl = route.npcId ? buildWatchUrl(route.streamerHandle, route.npcId) : null;

  const loadSnapshot = useCallback(async (npcId: string) => {
    if (routeError) {
      setSnapshot(null);
      setSnapshotError(routeError);
      setSnapshotLoading(false);
      return;
    }

    if (!npcId.trim()) {
      setSnapshot(null);
      setSnapshotError('NPC ID が必要です。/s/{streamerHandle}/watch/{npcId} を開いてください。');
      setSnapshotLoading(false);
      return;
    }

    setSnapshotLoading(true);
    try {
      const data = await requestJson<ViewerSnapshotResponse>(
        `/api/viewer/watch/${encodeURIComponent(npcId.trim())}?streamerHandle=${encodeURIComponent(route.streamerHandle)}`,
      );
      setSnapshot(data);
      setSnapshotError(null);
    } catch (loadError) {
      setSnapshot(null);
      setSnapshotError(loadError instanceof Error ? loadError.message : 'watch ページの取得に失敗しました');
    } finally {
      setSnapshotLoading(false);
    }
  }, [route.streamerHandle, routeError]);

  useEffect(() => {
    void loadSnapshot(initialNpcId);
  }, [initialNpcId, loadSnapshot]);

  useEffect(() => {
    if (!snapshot?.npc.id || !route.npcId) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadSnapshot(route.npcId ?? '');
    }, 8000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadSnapshot, route.npcId, snapshot?.npc.id]);

  const realtimeStatus = useRealtimeFeed(route.streamerHandle, activeWorldId, () => {
    void reloadContext();
    void loadSnapshot(route.npcId ?? '');
  });

  const traits = snapshot?.npc.traits;
  const inventory = snapshot?.npc.inventory ?? [];
  const events = snapshot?.events ?? [];

  const handleReload = () => {
    void loadSnapshot(route.npcId ?? '');
  };

  return (
    <main className="viewer-shell">
      <header className="topbar">
        <div className="brand">
          <strong>AI WASTELAND SURVIVAL v2</strong>
          <span>Watch NPC</span>
        </div>
        <div className="actions">
          <a className="action" href={`/s/${route.streamerHandle}/create`}>
            新しく作成
          </a>
          <a className="action" href={snapshot?.viewerUser?.tiktokId ? `/s/${route.streamerHandle}/my-npc?tiktokId=${encodeURIComponent(snapshot.viewerUser.tiktokId)}` : `/s/${route.streamerHandle}/my-npc`}>
            自分の NPC
          </a>
          <a
            className="action primary"
            href={route.streamerHandle && activeWorldId ? `/overlay/${route.streamerHandle}/${activeWorldId}` : '#'}
            aria-disabled={!route.streamerHandle || !activeWorldId}
          >
            Overlay を確認
          </a>
        </div>
      </header>

      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">公開視聴ページ</p>
          <h1>{snapshot?.npc.name ?? 'NPC を読み込み中'}</h1>
          <p>
            NPC ID {route.npcId || '未入力'} の公開視聴ページです。状態、所持品、最近の出来事をそのまま確認できます。
          </p>
        </div>
        <div className="hero-side">
          <div className="metric">
            <span className="metric-label">配信者</span>
            <strong>{(snapshot?.streamer.displayName ?? context?.streamer.displayName ?? route.streamerHandle) || '—'}</strong>
            <span className="metric-sub">@{route.streamerHandle}</span>
          </div>
          <div className="metric">
            <span className="metric-label">ワールド</span>
            <strong>{snapshot?.world.name ?? context?.primaryWorld?.name ?? '荒土世界 Alpha'}</strong>
            <span className="metric-sub">Tick {snapshot?.world.currentTick ?? context?.primaryWorld?.currentTick ?? '—'}</span>
          </div>
          <div className="metric">
            <span className="metric-label">リアルタイム</span>
            <strong>{realtimeStatus === 'connected' ? '接続中' : realtimeStatus === 'reconnecting' ? '再接続中' : realtimeStatus === 'connecting' ? '接続中' : '待機中'}</strong>
            <span className="metric-sub">WebSocket / world 更新</span>
          </div>
        </div>
      </section>

      {(error || snapshotError) ? <section className="alert">{error ?? snapshotError}</section> : null}

      <section className="layout">
        <section className="panel form-panel">
          <header className="section-head">
            <div>
              <h2>公開リンク</h2>
              <p>このページは NPC ID を使って直接開きます。</p>
            </div>
            <span className="status-chip">{snapshotLoading ? '読込中' : '表示'}</span>
          </header>

          <div className="detail-stack">
            <div className="detail-item">
              <span>公開視聴 URL</span>
              <p>{watchUrl ?? '—'}</p>
            </div>
            <div className="detail-item">
              <span>本人用ページ</span>
              <p>{snapshot?.viewerUser?.tiktokId ? `/s/${route.streamerHandle}/my-npc?tiktokId=${snapshot.viewerUser.tiktokId}` : `/s/${route.streamerHandle}/my-npc`}</p>
            </div>
            <div className="detail-item">
              <span>現在の状態</span>
              <p>{snapshot ? `${snapshot.npc.status} / ${snapshot.npc.state.currentAction}` : '—'}</p>
            </div>
          </div>

          <div className="form-actions">
            <button className="action primary" type="button" onClick={handleReload} disabled={!route.npcId}>
              更新
            </button>
          </div>

          <div className="helper">
            {snapshot ? `最終更新 ${formatDateTime(snapshot.npc.updatedAt)}` : 'NPC ID を開くと現在状態を取得します。'}
          </div>
        </section>

        <section className="panel info-panel">
          <header className="section-head">
            <div>
              <h2>NPC 概要</h2>
              <p>現在の体調、行動、位置をまとめています。</p>
            </div>
          </header>

          {snapshot ? (
            <div className="profile-grid">
              <div className="metric profile-card">
                <span className="metric-label">名前</span>
                <strong>{snapshot.npc.name}</strong>
                <span className="metric-sub">{snapshot.npc.gender ?? '—'} / {snapshot.npc.age} 歳</span>
              </div>
              <div className="metric profile-card">
                <span className="metric-label">状態</span>
                <strong>{snapshot.npc.status}</strong>
                <span className="metric-sub">{snapshot.npc.deathCause ?? snapshot.npc.state.currentAction}</span>
              </div>
              <div className="metric profile-card">
                <span className="metric-label">座標</span>
                <strong>{snapshot.npc.state.tileX}, {snapshot.npc.state.tileY}</strong>
                <span className="metric-sub">最後の Tick {formatNumber(snapshot.npc.state.lastTick)}</span>
              </div>
              <div className="metric profile-card">
                <span className="metric-label">入力済み TikTok ID</span>
                <strong>{snapshot.viewerUser.tiktokId}</strong>
                <span className="metric-sub">{snapshot.viewerUser.displayName ?? '—'}</span>
              </div>
            </div>
          ) : (
            <div className="empty-state">まだ NPC は表示されていません。</div>
          )}

          {snapshot ? (
            <div className="state-grid">
              <StatCard label="HP" value={snapshot.npc.state.hp} />
              <StatCard label="水" value={snapshot.npc.state.water} />
              <StatCard label="食料" value={snapshot.npc.state.food} />
              <StatCard label="スタミナ" value={snapshot.npc.state.stamina} />
              <StatCard label="士気" value={snapshot.npc.state.morale} />
              <StatCard label="傷" value={snapshot.npc.state.injury} />
              <StatCard label="防護" value={snapshot.npc.state.shelter} />
            </div>
          ) : null}
        </section>
      </section>

      {snapshot ? (
        <section className="layout lower">
          <section className="panel">
            <header className="section-head">
              <div>
                <h2>所持品</h2>
                <p>生存に必要な物資をそのまま表示しています。</p>
              </div>
            </header>
            <div className="inventory-list">
              {inventory.length > 0 ? (
                inventory.map((item) => (
                  <article key={item.id} className="inventory-row">
                    <strong>{item.itemId}</strong>
                    <span>数量 {formatNumber(item.quantity)}</span>
                    <small>{item.durability !== null ? `耐久 ${item.durability}` : '消耗品'}</small>
                  </article>
                ))
              ) : (
                <div className="empty-state">所持品はまだありません。</div>
              )}
            </div>
          </section>

          <section className="panel">
            <header className="section-head">
              <div>
                <h2>最近の出来事</h2>
                <p>world_events の最新状態です。</p>
              </div>
            </header>
            <div className="event-list">
              {events.length > 0 ? (
                events.map((event) => (
                  <article key={event.id} className="event-row">
                    <span className="event-badge">Tick {formatNumber(event.tick)}</span>
                    <strong>{event.titleJa ?? event.eventType}</strong>
                    <p>{event.descriptionJa ?? '—'}</p>
                    <small>{formatDateTime(event.createdAt)}</small>
                  </article>
                ))
              ) : (
                <div className="empty-state">出来事はまだありません。</div>
              )}
            </div>
          </section>

          <section className="panel">
            <header className="section-head">
              <div>
                <h2>性格と背景</h2>
                <p>作成時に入力された Prompt をそのまま表示しています。</p>
              </div>
            </header>
            <div className="detail-stack">
              <div className="detail-item">
                <span>性格・背景</span>
                <p>{snapshot.npc.personalityPrompt || '—'}</p>
              </div>
              <div className="detail-item">
                <span>バックストーリー</span>
                <p>{snapshot.npc.backstory || '—'}</p>
              </div>
              <div className="detail-item">
                <span>特性</span>
                <p>
                  社交 {snapshot.npc.traits.social} / 協調 {snapshot.npc.traits.cooperation} / 危険 {snapshot.npc.traits.risk}
                </p>
              </div>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-head">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      {children}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{formatNumber(Math.round(value))}</strong>
      <div className="stat-track" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
