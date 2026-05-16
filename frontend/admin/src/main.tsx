import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type PlanType = 'free_trial' | 'starter' | 'pro' | 'studio';
type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
type OperationalStatus = 'active' | 'paused';
type GiftAdapterType = 'dev_mock' | 'manual' | 'tiktok_experimental' | 'future_official';
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
  defaultTiktokId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Subscription = {
  id: string;
  plan: PlanType;
  status: SubscriptionStatus;
  maxWorlds: number;
  maxNpcsPerWorld: number;
  aiNarrationQuota: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
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
  overlayUrl: string | null;
  viewerCreateUrl: string | null;
  viewerMyNpcUrl: string | null;
};

type LiveSession = {
  id: string;
  tenantId: string;
  streamerId: string;
  worldId: string;
  platform: string;
  platformLiveId: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  viewerCountPeak: number;
  giftCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type GiftEvent = {
  id: string;
  tenantId: string;
  streamerId: string;
  worldId: string;
  liveSessionId: string | null;
  platform: string;
  platformEventId: string;
  tiktokId: string;
  displayName: string | null;
  giftId: string | null;
  giftName: string | null;
  giftValue: number;
  repeatCount: number;
  status: string;
  rawPayload: Record<string, unknown>;
  receivedAt: string;
  processedAt: string | null;
};

type SessionInfo = {
  id: string;
  adminId: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

type AdminInfo = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminAuthResponse = {
  ok: boolean;
  admin: AdminInfo;
  session: SessionInfo;
};

type AdminSummary = {
  tenantCount: number;
  streamerCount: number;
  activeStreamerCount: number;
  liveWorldCount: number;
  worldCount: number;
  npcCount: number;
  aliveNpcCount: number;
  todayLiveSessionCount: number;
  todayGiftEventCount: number;
};

type AdminStreamerListItem = {
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
  worldCount: number;
  npcCount: number;
  liveSessionCount: number;
  lastLiveAt: string | null;
  latestLiveSessionStatus: string | null;
};

type AdminTenantListItem = {
  tenant: Tenant;
  streamerCount: number;
  activeStreamerCount: number;
  worldCount: number;
  npcCount: number;
  liveSessionCount: number;
};

type AdminWorldListItem = {
  tenant: Tenant;
  streamer: Streamer;
  subscription: Subscription | null;
  world: WorldSummary;
  lastGiftEventAt: string | null;
};

type AdminLiveSessionListItem = {
  tenant: Tenant;
  streamer: Streamer;
  world: WorldSummary;
  liveSession: LiveSession;
};

type AdminGiftEventListItem = {
  tenant: Tenant;
  streamer: Streamer;
  world: WorldSummary;
  liveSession: LiveSession | null;
  giftEvent: GiftEvent;
};

type AdminSystemHealth = {
  backendStatus: 'ok' | 'degraded';
  databaseStatus: 'connected' | 'disconnected';
  websocketClients: number;
  activeWorldCount: number;
  lastTickAt: string | null;
  lastGiftEventAt: string | null;
};

type AdminConsoleContext = {
  ok: boolean;
  handle: string;
  displayName: string;
  tenantHandle: string;
  plan: PlanType;
  planLabel: string;
  status: SubscriptionStatus;
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
  worlds: WorldSummary[];
  primaryWorld: WorldSummary | null;
  liveSession: LiveSession | null;
};

type AdminDetailResponse = AdminConsoleContext & {
  recentLiveSessions: LiveSession[];
  recentGiftEvents: GiftEvent[];
};

type AdminRoute =
  | { page: 'login' }
  | { page: 'dashboard' }
  | { page: 'streamers' }
  | { page: 'streamer-detail'; streamerId: string }
  | { page: 'tenants' }
  | { page: 'worlds' }
  | { page: 'live-sessions' }
  | { page: 'gifts' }
  | { page: 'system' };

const PLAN_LABELS: Record<PlanType, string> = {
  free_trial: '無料トライアル',
  starter: 'スターター',
  pro: 'プロ',
  studio: 'スタジオ',
};

const STATUS_LABELS: Record<string, string> = {
  active: '有効',
  paused: '停止中',
  trialing: '試用中',
  past_due: '支払遅延',
  canceled: '解約済み',
  expired: '期限切れ',
  live: '配信中',
  ended: '終了',
  created: '作成済み',
  connecting: '接続中',
  failed: '失敗',
  archived: 'アーカイブ',
};

const DATE_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
});

function resolveApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  return '';
}

const DEFAULT_API_BASE_URL = resolveApiBaseUrl();

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
      return payload.error;
    }

    if (payload.error && typeof payload.error === 'object') {
      const nested = payload.error as { message?: unknown };
      if (typeof nested.message === 'string' && nested.message.trim()) {
        return nested.message;
      }
    }
  } catch {
    return rawText;
  }

  return rawText;
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  const body = options.body;
  if (body && typeof body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
    credentials: 'include',
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

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return DATE_FORMAT.format(parsed);
}

function formatPlanLabel(plan: PlanType | string | null | undefined): string {
  if (!plan) {
    return '—';
  }

  return PLAN_LABELS[plan as PlanType] ?? plan;
}

function formatStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }

  return STATUS_LABELS[status] ?? status;
}

function parseAdminRoute(pathname: string): AdminRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/' || normalized === '/admin') {
    return { page: 'dashboard' };
  }

  if (normalized === '/admin/login') {
    return { page: 'login' };
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments[0] !== 'admin') {
    return { page: 'dashboard' };
  }

  if (segments[1] === 'streamers' && segments[2]) {
    return { page: 'streamer-detail', streamerId: decodeURIComponent(segments[2]) };
  }

  if (segments[1] === 'streamers') {
    return { page: 'streamers' };
  }

  if (segments[1] === 'tenants') {
    return { page: 'tenants' };
  }

  if (segments[1] === 'worlds') {
    return { page: 'worlds' };
  }

  if (segments[1] === 'live-sessions') {
    return { page: 'live-sessions' };
  }

  if (segments[1] === 'gifts') {
    return { page: 'gifts' };
  }

  if (segments[1] === 'system') {
    return { page: 'system' };
  }

  return { page: 'dashboard' };
}

function useAdminResource<T>(loader: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await loader();
      setData(value);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

function AdminBadge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{formatStatusLabel(value)}</span>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function navigate(path: string): void {
  window.location.assign(path);
}

function App() {
  const route = useMemo(() => parseAdminRoute(window.location.pathname), []);
  const [authLoading, setAuthLoading] = useState(true);
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAuth = async () => {
      try {
        const response = await requestJson<AdminAuthResponse>('/api/admin/me');
        if (!cancelled) {
          setAdmin(response.admin);
          setAuthError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setAdmin(null);
          setAuthError(error instanceof Error ? error.message : '管理者認証の確認に失敗しました。');
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    };

    void loadAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (admin && route.page === 'login') {
      navigate('/admin');
    }
  }, [admin, route.page]);

  if (authLoading) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-header">
            <strong>管理ダッシュボード</strong>
            <p className="muted">認証情報を確認しています。</p>
          </div>
        </div>
      </div>
    );
  }

  if (!admin) {
    return (
      <LoginPage
        route={route}
        initialError={authError}
      />
    );
  }

  return (
    <AdminShell
      admin={admin}
      route={route}
      onLogout={async () => {
        await requestJson('/api/admin/logout', { method: 'POST' });
        navigate('/admin/login');
      }}
    />
  );
}

function LoginPage({
  route,
  initialError,
}: {
  route: AdminRoute;
  initialError: string | null;
}) {
  const [form, setForm] = useState({
    email: 'admin@example.com',
    password: 'admin-demo-123',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await requestJson<AdminAuthResponse>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
        }),
      });
      navigate('/admin');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'ログインに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-header">
          <strong>管理ダッシュボード</strong>
          <p className="muted">プラットフォーム管理者としてログインしてください。</p>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="admin-email">メールアドレス</label>
            <input
              id="admin-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="admin-password">パスワード</label>
            <input
              id="admin-password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </div>
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>

        <div className="notice">
          開発用アカウント: <strong>admin@example.com</strong> / <strong>admin-demo-123</strong>
        </div>

        {route.page !== 'login' ? (
          <p className="muted">要求されたページを表示する前に認証が必要です。</p>
        ) : null}
      </div>
    </div>
  );
}

function AdminShell({
  admin,
  route,
  onLogout,
}: {
  admin: AdminInfo;
  route: AdminRoute;
  onLogout: () => Promise<void>;
}) {
  const navItems = [
    { href: '/admin', label: '管理ダッシュボード', match: ['dashboard'] },
    { href: '/admin/streamers', label: '配信者一覧', match: ['streamers', 'streamer-detail'] },
    { href: '/admin/tenants', label: 'テナント一覧', match: ['tenants'] },
    { href: '/admin/worlds', label: 'ワールド一覧', match: ['worlds'] },
    { href: '/admin/live-sessions', label: 'ライブセッション', match: ['live-sessions'] },
    { href: '/admin/gifts', label: 'ギフトイベント', match: ['gifts'] },
    { href: '/admin/system', label: 'システム状態', match: ['system'] },
  ];

  const titleMap: Record<AdminRoute['page'], { title: string; subtitle: string }> = {
    login: { title: '管理ダッシュボード', subtitle: '認証が必要です。' },
    dashboard: { title: '管理ダッシュボード', subtitle: '全体の稼働と契約状況を確認します。' },
    streamers: { title: '配信者一覧', subtitle: '各配信者の契約と稼働状態を確認します。' },
    'streamer-detail': { title: '配信者詳細', subtitle: '契約、世界、直近のライブとギフトを確認します。' },
    tenants: { title: 'テナント一覧', subtitle: 'テナント単位の状況を確認します。' },
    worlds: { title: 'ワールド一覧', subtitle: '各ワールドの tick と NPC 状態を確認します。' },
    'live-sessions': { title: 'ライブセッション', subtitle: '配信中と終了済みの session を確認します。' },
    gifts: { title: 'ギフトイベント', subtitle: '直近のギフト処理状況を確認します。' },
    system: { title: 'システム状態', subtitle: 'バックエンドと realtime の状態を確認します。' },
  };

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>AI WASTELAND SURVIVAL v2</strong>
          <span>Admin Console</span>
        </div>

        <nav className="nav">
          {navItems.map((item) => {
            const active = item.match.includes(route.page);
            return (
              <a key={item.href} className={`nav-link ${active ? 'active' : ''}`} href={item.href}>
                <span>{item.label}</span>
                <span>›</span>
              </a>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{admin.displayName}</strong>
            <span>{admin.email}</span>
          </div>
          <button className="ghost-button" type="button" onClick={() => void onLogout()}>
            ログアウト
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{titleMap[route.page].title}</h1>
            <p>{titleMap[route.page].subtitle}</p>
          </div>
          <div className="table-actions">
            <a className="text-button" href="/admin/streamers">
              配信者を見る
            </a>
            <a className="text-button" href="/admin/system">
              システムを見る
            </a>
          </div>
        </header>

        {route.page === 'dashboard' ? <DashboardPage /> : null}
        {route.page === 'streamers' ? <StreamersPage /> : null}
        {route.page === 'streamer-detail' ? <StreamerDetailPage streamerId={route.streamerId} /> : null}
        {route.page === 'tenants' ? <TenantsPage /> : null}
        {route.page === 'worlds' ? <WorldsPage /> : null}
        {route.page === 'live-sessions' ? <LiveSessionsPage /> : null}
        {route.page === 'gifts' ? <GiftsPage /> : null}
        {route.page === 'system' ? <SystemPage /> : null}
      </main>
    </div>
  );
}

function DashboardPage() {
  const loader = useCallback(async () => {
    const [summaryResponse, streamersResponse] = await Promise.all([
      requestJson<{ ok: boolean; summary: AdminSummary }>('/api/admin/summary'),
      requestJson<{ ok: boolean; streamers: AdminStreamerListItem[] }>('/api/admin/streamers'),
    ]);

    return {
      summary: summaryResponse.summary,
      streamers: streamersResponse.streamers,
    };
  }, []);

  const { data, loading, error, reload } = useAdminResource(loader, [loader]);

  if (loading) {
    return <div className="panel">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const topStreamers = data.streamers.slice(0, 5);

  return (
    <div className="detail-grid">
      <div className="summary-grid">
        <Metric label="配信者数" value={String(data.summary.streamerCount)} />
        <Metric label="有効契約" value={String(data.summary.activeStreamerCount)} />
        <Metric label="ライブ中ワールド" value={String(data.summary.liveWorldCount)} />
        <Metric label="AI住民数" value={String(data.summary.npcCount)} />
        <Metric label="本日の配信回数" value={String(data.summary.todayLiveSessionCount)} />
        <Metric label="本日のギフトイベント" value={String(data.summary.todayGiftEventCount)} />
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="section-title">配信者サマリー</h2>
            <p className="section-subtitle">直近の配信者と契約状態を確認します。</p>
          </div>
          <a className="link" href="/admin/streamers">
            一覧へ
          </a>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>配信者</th>
                <th>プラン</th>
                <th>契約状態</th>
                <th>ワールド</th>
                <th>AI住民</th>
                <th>今月の配信</th>
                <th>最終配信</th>
              </tr>
            </thead>
            <tbody>
              {topStreamers.map((item) => (
                <tr key={item.streamer.id}>
                  <td>
                    <div className="stack">
                      <strong>{item.streamer.displayName}</strong>
                      <span className="muted">{item.streamer.handle}</span>
                    </div>
                  </td>
                  <td>{item.subscription ? formatPlanLabel(item.subscription.plan) : '—'}</td>
                  <td>
                    <AdminBadge value={item.subscription?.status ?? 'inactive'} />
                  </td>
                  <td>
                    {item.worldCount} / {item.subscription?.maxWorlds ?? 0}
                  </td>
                  <td>
                    {item.npcCount} / {item.subscription?.maxNpcsPerWorld ?? 0}
                  </td>
                  <td>{item.liveSessionCount}</td>
                  <td>{formatDateTime(item.lastLiveAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StreamersPage() {
  const loader = useCallback(async () => {
    const response = await requestJson<{ ok: boolean; streamers: AdminStreamerListItem[] }>('/api/admin/streamers');
    return response.streamers;
  }, []);

  const { data, loading, error, reload } = useAdminResource(loader, [loader]);

  if (loading) {
    return <div className="panel">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="section-title">配信者一覧</h2>
          <p className="section-subtitle">契約、ワールド、NPC、ライブ回数をまとめて確認します。</p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>配信者</th>
              <th>メール</th>
              <th>プラン</th>
              <th>契約状態</th>
              <th>状態</th>
              <th>ワールド</th>
              <th>AI住民</th>
              <th>ライブ回数</th>
              <th>最終配信</th>
              <th>詳細</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.streamer.id}>
                <td>
                  <div className="stack">
                    <strong>{item.streamer.displayName}</strong>
                    <span className="muted">{item.streamer.handle}</span>
                  </div>
                </td>
                <td>{item.streamer.email}</td>
                <td>{item.subscription ? formatPlanLabel(item.subscription.plan) : '—'}</td>
                <td>
                  <AdminBadge value={item.subscription?.status ?? 'inactive'} />
                </td>
                <td>
                  <AdminBadge value={item.streamer.isActive ? 'active' : 'paused'} />
                </td>
                <td>
                  {item.worldCount} / {item.subscription?.maxWorlds ?? 0}
                </td>
                <td>
                  {item.npcCount} / {item.subscription?.maxNpcsPerWorld ?? 0}
                </td>
                <td>{item.liveSessionCount}</td>
                <td>{formatDateTime(item.lastLiveAt)}</td>
                <td>
                  <a className="link" href={`/admin/streamers/${item.streamer.id}`}>
                    詳細
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StreamerDetailPage({ streamerId }: { streamerId: string }) {
  const loader = useCallback(async () => {
    return requestJson<AdminDetailResponse>(`/api/admin/streamers/${encodeURIComponent(streamerId)}`);
  }, [streamerId]);

  const { data, loading, error, reload, setData } = useAdminResource(loader, [loader]);
  const [planDraft, setPlanDraft] = useState<PlanType>('free_trial');
  const [subscriptionStatusDraft, setSubscriptionStatusDraft] = useState<SubscriptionStatus>('trialing');
  const [operationalStatusDraft, setOperationalStatusDraft] = useState<OperationalStatus>('active');
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) {
      return;
    }

    setPlanDraft(data.subscription?.plan ?? 'free_trial');
    setSubscriptionStatusDraft(data.subscription?.status ?? 'trialing');
    setOperationalStatusDraft(data.tenant.status === 'active' && data.streamer.isActive ? 'active' : 'paused');
  }, [data]);

  const handleSavePlan = async () => {
    if (!data) {
      return;
    }

    setSavingPlan(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const response = await requestJson<AdminDetailResponse>(`/api/admin/streamers/${encodeURIComponent(streamerId)}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          plan: planDraft,
          status: subscriptionStatusDraft,
        }),
      });
      setData(response);
      setActionMessage('プランを更新しました。');
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : 'プラン更新に失敗しました。');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!data) {
      return;
    }

    setSavingStatus(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const response = await requestJson<AdminDetailResponse>(`/api/admin/streamers/${encodeURIComponent(streamerId)}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: operationalStatusDraft,
        }),
      });
      setData(response);
      setActionMessage(operationalStatusDraft === 'active' ? '配信者を復旧しました。' : '配信者を停止しました。');
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '状態更新に失敗しました。');
    } finally {
      setSavingStatus(false);
    }
  };

  if (loading) {
    return <div className="panel">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const currentWorld = data.primaryWorld ?? data.worlds[0] ?? null;

  return (
    <div className="panel-grid">
      <div className="detail-grid">
        <div className="summary-grid">
          <Metric label="現在のプラン" value={formatPlanLabel(data.plan)} />
          <Metric label="契約状態" value={formatStatusLabel(data.subscription?.status ?? data.status)} />
          <Metric label="ワールド数" value={`${data.stats.worldCount} / ${data.planLimits.maxWorlds}`} />
          <Metric label="AI住民数" value={`${data.stats.npcCount} / ${data.planLimits.maxNpcsPerWorld}`} />
          <Metric label="今月の配信" value={`${data.stats.liveSessionsThisMonth} / ${data.planLimits.maxLiveSessionsPerMonth}`} />
          <Metric label="AIナレーション残数" value={String(data.stats.aiNarrationRemaining)} />
        </div>

        {actionError ? <div className="error">{actionError}</div> : null}
        {actionMessage ? <div className="notice">{actionMessage}</div> : null}

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="section-title">{data.displayName}</h2>
              <p className="section-subtitle">
                {data.handle} / {data.tenantHandle}
              </p>
            </div>
            <a className="link" href={`/admin/streamers/${encodeURIComponent(streamerId)}`}>
              詳細リンク
            </a>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ワールド</th>
                  <th>状態</th>
                  <th>tick</th>
                  <th>NPC</th>
                  <th>ライブ状態</th>
                  <th>OBS URL</th>
                </tr>
              </thead>
              <tbody>
                {data.worlds.map((world) => (
                  <tr key={world.id}>
                    <td>
                      <div className="stack">
                        <strong>{world.name}</strong>
                        <span className="muted">{world.id}</span>
                      </div>
                    </td>
                    <td>
                      <AdminBadge value={world.status} />
                    </td>
                    <td>{world.currentTick}</td>
                    <td>
                      {world.aliveNpcCount} / {world.npcCount}
                    </td>
                    <td>{formatStatusLabel(world.latestLiveSessionStatus)}</td>
                    <td>
                      {world.overlayUrl ? (
                        <a className="link" href={world.overlayUrl}>
                          Overlay
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="section-title">最近のライブ</h2>
              <p className="section-subtitle">配信開始と終了の履歴を確認します。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>状態</th>
                  <th>開始</th>
                  <th>終了</th>
                  <th>gift</th>
                  <th>peak</th>
                  <th>ワールド</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLiveSessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <AdminBadge value={session.status} />
                    </td>
                    <td>{formatDateTime(session.startedAt)}</td>
                    <td>{formatDateTime(session.endedAt)}</td>
                    <td>{session.giftCount}</td>
                    <td>{session.viewerCountPeak}</td>
                    <td>{session.worldId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="section-title">最近のギフト</h2>
              <p className="section-subtitle">直近の gift_event と処理結果を確認します。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ギフト</th>
                  <th>tiktok</th>
                  <th>値</th>
                  <th>回数</th>
                  <th>状態</th>
                  <th>受信</th>
                </tr>
              </thead>
              <tbody>
                {data.recentGiftEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <div className="stack">
                        <strong>{event.giftName ?? '—'}</strong>
                        <span className="muted">{event.platform}</span>
                      </div>
                    </td>
                    <td>{event.tiktokId}</td>
                    <td>{event.giftValue}</td>
                    <td>{event.repeatCount}</td>
                    <td>
                      <AdminBadge value={event.status} />
                    </td>
                    <td>{formatDateTime(event.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="detail-card">
        <h2>管理操作</h2>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="plan-select">プラン</label>
            <select id="plan-select" value={planDraft} onChange={(event) => setPlanDraft(event.target.value as PlanType)}>
              <option value="free_trial">無料トライアル</option>
              <option value="starter">スターター</option>
              <option value="pro">プロ</option>
              <option value="studio">スタジオ</option>
            </select>
          </div>

          <div className="form-row">
            <label htmlFor="subscription-status-select">契約状態</label>
            <select
              id="subscription-status-select"
              value={subscriptionStatusDraft}
              onChange={(event) => setSubscriptionStatusDraft(event.target.value as SubscriptionStatus)}
            >
              <option value="trialing">試用中</option>
              <option value="active">有効</option>
              <option value="past_due">支払遅延</option>
              <option value="canceled">解約済み</option>
              <option value="expired">期限切れ</option>
            </select>
          </div>

          <button className="primary-button" type="button" onClick={() => void handleSavePlan()} disabled={savingPlan}>
            {savingPlan ? '更新中…' : 'プラン変更'}
          </button>

          <div className="form-row">
            <label htmlFor="operational-status-select">配信者状態</label>
            <select
              id="operational-status-select"
              value={operationalStatusDraft}
              onChange={(event) => setOperationalStatusDraft(event.target.value as OperationalStatus)}
            >
              <option value="active">稼働中</option>
              <option value="paused">停止中</option>
            </select>
          </div>

          <button className="secondary-button" type="button" onClick={() => void handleSaveStatus()} disabled={savingStatus}>
            {savingStatus ? '更新中…' : '停止 / 復旧'}
          </button>

          <div className="notice">
            <div className="stack">
              <strong>現在のワールド</strong>
              <span>{currentWorld ? currentWorld.name : '—'}</span>
              <span className="muted">
                {currentWorld ? `NPC ${currentWorld.aliveNpcCount} / ${currentWorld.npcCount}` : ''}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function TenantsPage() {
  const loader = useCallback(async () => {
    const response = await requestJson<{ ok: boolean; tenants: AdminTenantListItem[] }>('/api/admin/tenants');
    return response.tenants;
  }, []);

  const { data, loading, error, reload } = useAdminResource(loader, [loader]);

  if (loading) {
    return <div className="panel">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="section-title">テナント一覧</h2>
          <p className="section-subtitle">テナント単位の稼働状況を確認します。</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>テナント</th>
              <th>状態</th>
              <th>配信者</th>
              <th>有効</th>
              <th>ワールド</th>
              <th>AI住民</th>
              <th>ライブ回数</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.tenant.id}>
                <td>
                  <div className="stack">
                    <strong>{item.tenant.name}</strong>
                    <span className="muted">{item.tenant.handle}</span>
                  </div>
                </td>
                <td>
                  <AdminBadge value={item.tenant.status} />
                </td>
                <td>{item.streamerCount}</td>
                <td>{item.activeStreamerCount}</td>
                <td>{item.worldCount}</td>
                <td>{item.npcCount}</td>
                <td>{item.liveSessionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WorldsPage() {
  const loader = useCallback(async () => {
    const response = await requestJson<{ ok: boolean; worlds: AdminWorldListItem[] }>('/api/admin/worlds');
    return response.worlds;
  }, []);

  const { data, loading, error, reload } = useAdminResource(loader, [loader]);

  if (loading) {
    return <div className="panel">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="section-title">ワールド一覧</h2>
          <p className="section-subtitle">各ワールドの tick と NPC の状態を確認します。</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ワールド</th>
              <th>配信者</th>
              <th>状態</th>
              <th>tick</th>
              <th>NPC</th>
              <th>ライブ</th>
              <th>最終ギフト</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.world.id}>
                <td>
                  <div className="stack">
                    <strong>{item.world.name}</strong>
                    <span className="muted">{item.world.id}</span>
                  </div>
                </td>
                <td>
                  <div className="stack">
                    <strong>{item.streamer.displayName}</strong>
                    <span className="muted">{item.tenant.handle}</span>
                  </div>
                </td>
                <td>
                  <AdminBadge value={item.world.status} />
                </td>
                <td>{item.world.currentTick}</td>
                <td>
                  {item.world.aliveNpcCount} / {item.world.npcCount}
                </td>
                <td>{formatStatusLabel(item.world.latestLiveSessionStatus)}</td>
                <td>{formatDateTime(item.lastGiftEventAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LiveSessionsPage() {
  const loader = useCallback(async () => {
    const response = await requestJson<{ ok: boolean; liveSessions: AdminLiveSessionListItem[] }>('/api/admin/live-sessions');
    return response.liveSessions;
  }, []);

  const { data, loading, error, reload } = useAdminResource(loader, [loader]);

  if (loading) {
    return <div className="panel">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="section-title">ライブセッション</h2>
          <p className="section-subtitle">配信中と終了済みの履歴を確認します。</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>配信者</th>
              <th>ワールド</th>
              <th>状態</th>
              <th>開始</th>
              <th>終了</th>
              <th>gift</th>
              <th>peak</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.liveSession.id}>
                <td>
                  <div className="stack">
                    <strong>{item.streamer.displayName}</strong>
                    <span className="muted">{item.streamer.handle}</span>
                  </div>
                </td>
                <td>
                  <div className="stack">
                    <strong>{item.world.name}</strong>
                    <span className="muted">{item.world.status}</span>
                  </div>
                </td>
                <td>
                  <AdminBadge value={item.liveSession.status} />
                </td>
                <td>{formatDateTime(item.liveSession.startedAt)}</td>
                <td>{formatDateTime(item.liveSession.endedAt)}</td>
                <td>{item.liveSession.giftCount}</td>
                <td>{item.liveSession.viewerCountPeak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GiftsPage() {
  const loader = useCallback(async () => {
    const response = await requestJson<{ ok: boolean; giftEvents: AdminGiftEventListItem[] }>('/api/admin/gift-events');
    return response.giftEvents;
  }, []);

  const { data, loading, error, reload } = useAdminResource(loader, [loader]);

  if (loading) {
    return <div className="panel">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="section-title">ギフトイベント</h2>
          <p className="section-subtitle">直近のギフト受信と処理状態を確認します。</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>配信者</th>
              <th>ワールド</th>
              <th>セッション</th>
              <th>tiktok</th>
              <th>ギフト</th>
              <th>値</th>
              <th>回数</th>
              <th>状態</th>
              <th>受信</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.giftEvent.id}>
                <td>
                  <div className="stack">
                    <strong>{item.streamer.displayName}</strong>
                    <span className="muted">{item.streamer.handle}</span>
                  </div>
                </td>
                <td>{item.world.name}</td>
                <td>{item.liveSession ? item.liveSession.status : '—'}</td>
                <td>{item.giftEvent.tiktokId}</td>
                <td>{item.giftEvent.giftName ?? '—'}</td>
                <td>{item.giftEvent.giftValue}</td>
                <td>{item.giftEvent.repeatCount}</td>
                <td>
                  <AdminBadge value={item.giftEvent.status} />
                </td>
                <td>{formatDateTime(item.giftEvent.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SystemPage() {
  const loader = useCallback(async () => {
    const response = await requestJson<{ ok: boolean; health: AdminSystemHealth }>('/api/admin/system/health');
    return response.health;
  }, []);

  const { data, loading, error, reload } = useAdminResource(loader, [loader]);

  if (loading) {
    return <div className="panel">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="summary-grid">
      <Metric label="Backend" value={formatStatusLabel(data.backendStatus)} />
      <Metric label="Database" value={formatStatusLabel(data.databaseStatus)} />
      <Metric label="WebSocket" value={String(data.websocketClients)} />
      <Metric label="稼働中ワールド" value={String(data.activeWorldCount)} />
      <Metric label="最終 tick" value={formatDateTime(data.lastTickAt)} />
      <Metric label="最終ギフト" value={formatDateTime(data.lastGiftEventAt)} />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
