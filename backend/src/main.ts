import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { env } from './env.js';
import { closeDatabase, pingDatabase, pool } from './db.js';
import { isAppError, notFound, unauthorized } from './errors.js';
import { mockStripeBillingProvider } from './billing.js';
import { AVAILABLE_GIFT_ADAPTERS } from './gift-adapters.js';
import { realtimeHub } from './realtime.js';
import {
  createPlatformAdminSession,
  createLiveSession,
  createRegisteredStreamerAccount,
  createStreamerSession,
  createViewerNpc,
  dispatchGiftEventForCurrentLiveSession,
  endLiveSession,
  loadPlatformAdminByEmail,
  loadPlatformAdminSessionByTokenHash,
  type AdminSessionAuthResult,
  loadStreamerAuthByEmail,
  loadStreamerById,
  loadStreamerContext,
  loadStreamerSessionByTokenHash,
  loadViewerNpcSnapshot,
  loadLiveSessionById,
  loadWorldSnapshot,
  loadWorldSnapshotByHandle,
  markStreamerLogin,
  markPlatformAdminLogin,
  revokeStreamerSessionByTokenHash,
  revokePlatformAdminSessionByTokenHash,
  updateGiftSourceConnection,
  updateStreamerSubscriptionPlan,
  updateStreamerOperationalStatus,
  verifyPasswordHash,
  verifySeedData,
} from './repository.js';
import {
  listAdminGiftEvents,
  listAdminLiveSessions,
  loadAdminStreamerDetail,
  listAdminStreamers,
  loadAdminSummary,
  loadAdminSystemHealth,
  listAdminTenants,
  listAdminWorlds,
  type AdminGiftEventListItem,
  type AdminLiveSessionListItem,
  type AdminStreamerDetailResult,
  type AdminStreamerListItem,
  type AdminSummaryResult,
  type AdminSystemHealthResult,
  type AdminTenantListItem,
  type AdminWorldListItem,
} from './admin-repository.js';
import { getPlanLabel } from './plans.js';
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  buildClearedSessionCookie,
  buildClearedAdminSessionCookie,
  buildAdminSessionCookie,
  buildSessionCookie,
  createSessionToken,
  hashSessionToken,
  readCookieValue,
  STREAMER_SESSION_COOKIE_NAME,
  STREAMER_SESSION_TTL_SECONDS,
} from './auth.js';
import { runManualTick, runTickScheduler } from './tick.js';
import {
  buildOverlayUrl,
  buildViewerCreateUrl,
  buildViewerMyNpcUrl,
  formatDate,
} from './utils.js';
import type {
  BillingEventRow,
  GiftEventRow,
  GiftSourceConnectionRow,
  LiveSessionRow,
  NpcInventoryRow,
  NpcRow,
  NpcStateRow,
  AdminSessionRow,
  ResourceGrantRow,
  StreamerRow,
  StreamerSessionRow,
  SubscriptionRow,
  TenantRow,
  WorldEventRow,
  WorldRow,
  WorldSummaryRow,
} from './types.js';

const app = Fastify({ logger: true });
let bootSummary: Awaited<ReturnType<typeof verifySeedData>> | null = null;
let schedulerStarted = false;

type AuthenticatedSession = NonNullable<Awaited<ReturnType<typeof loadStreamerSessionByTokenHash>>>;

const localCorsOrigins = new Set(env.corsOrigins);

function isProductionEnvironment(): boolean {
  return env.NODE_ENV === 'production';
}

function isAllowedCorsOrigin(origin: string | null): boolean {
  if (!origin) {
    return true;
  }

  try {
    const url = new URL(origin);
    if (localCorsOrigins.has(origin)) {
      return true;
    }

    if (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1' ||
      url.hostname.endsWith('.trycloudflare.com')
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function loadSessionFromRequest(request: { headers: { cookie?: string | string[] } }): Promise<AuthenticatedSession> {
  const token = readCookieValue(request.headers.cookie, STREAMER_SESSION_COOKIE_NAME);
  if (!token) {
    throw unauthorized('ログインが必要です');
  }

  const session = await loadStreamerSessionByTokenHash(pool, hashSessionToken(token));
  if (!session) {
    throw unauthorized('ログインセッションが無効です');
  }

  return session;
}

function serializeSession(session: StreamerSessionRow) {
  return {
    id: session.id,
    tenantId: session.tenant_id,
    streamerId: session.streamer_id,
    expiresAt: formatDate(session.expires_at),
    revokedAt: formatDate(session.revoked_at),
    lastSeenAt: formatDate(session.last_seen_at),
    createdAt: formatDate(session.created_at),
    updatedAt: formatDate(session.updated_at),
  };
}

function serializeAuthContext(context: AuthenticatedSession) {
  return {
    ok: true,
    session: serializeSession(context.session),
    tenant: serializeTenant(context.tenant),
    streamer: serializeStreamer(context.streamer),
    subscription: serializeSubscription(context.subscription),
  };
}

function serializeAdminSession(session: AdminSessionRow) {
  return {
    id: session.id,
    adminId: session.admin_id,
    expiresAt: formatDate(session.expires_at),
    revokedAt: formatDate(session.revoked_at),
    lastSeenAt: formatDate(session.last_seen_at),
    createdAt: formatDate(session.created_at),
    updatedAt: formatDate(session.updated_at),
  };
}

function serializeAdminAuthContext(context: AdminSessionAuthResult) {
  return {
    ok: true,
    admin: {
      id: context.admin.id,
      email: context.admin.email,
      displayName: context.admin.display_name,
      isActive: context.admin.is_active,
      lastLoginAt: formatDate(context.admin.last_login_at),
      createdAt: formatDate(context.admin.created_at),
      updatedAt: formatDate(context.admin.updated_at),
    },
    session: serializeAdminSession(context.session),
  };
}

function serializeGiftConnection(connection: GiftSourceConnectionRow | null) {
  if (!connection) {
    return null;
  }

  return {
    id: connection.id,
    tenantId: connection.tenant_id,
    streamerId: connection.streamer_id,
    platform: connection.platform,
    connectionType: connection.connection_type,
    status: connection.status,
    hasCredentials: connection.encrypted_credentials !== null && connection.encrypted_credentials !== undefined,
    lastConnectedAt: formatDate(connection.last_connected_at),
    lastError: connection.last_error,
    createdAt: formatDate(connection.created_at),
    updatedAt: formatDate(connection.updated_at),
  };
}

function serializeBillingEvent(event: BillingEventRow) {
  return {
    id: event.id,
    tenantId: event.tenant_id,
    streamerId: event.streamer_id,
    subscriptionId: event.subscription_id,
    provider: event.provider,
    providerEventId: event.provider_event_id,
    providerSessionId: event.provider_session_id,
    eventType: event.event_type,
    status: event.status,
    payload: event.payload,
    createdAt: formatDate(event.created_at),
  };
}

function serializeConsoleContext(context: Awaited<ReturnType<typeof loadStreamerContext>>) {
  return {
    ok: true,
    handle: context.streamer.handle,
    displayName: context.streamer.display_name,
    tenantHandle: context.tenant.handle,
    plan: context.subscription?.plan ?? 'free_trial',
    planLabel: getPlanLabel(context.subscription?.plan ?? 'free_trial'),
    status: context.subscription?.status ?? 'trialing',
    tenant: serializeTenant(context.tenant),
    streamer: serializeStreamer(context.streamer),
    subscription: serializeSubscription(context.subscription),
    giftConnection: serializeGiftConnection(context.giftConnection),
    planLimits: serializePlanLimits(context.planLimits),
    stats: context.stats,
    worlds: context.worlds.map((world) => serializeWorld(world, context.streamer.handle)),
    primaryWorld: context.primaryWorld ? serializeWorld(context.primaryWorld, context.streamer.handle) : null,
    liveSession: serializeLiveSession(context.latestLiveSession),
  };
}

function serializeBillingState(state: Awaited<ReturnType<typeof mockStripeBillingProvider.loadConsoleState>>) {
  return {
    ok: true,
    tenant: serializeTenant(state.tenant),
    streamer: serializeStreamer(state.streamer),
    subscription: serializeSubscription(state.subscription),
    giftConnection: serializeGiftConnection(state.giftConnection),
    plan: state.subscription?.plan ?? 'free_trial',
    planLabel: getPlanLabel(state.subscription?.plan ?? 'free_trial'),
    status: state.subscription?.status ?? 'trialing',
    planLimits: serializePlanLimits(state.planLimits),
    stats: state.stats,
    usageWindow: {
      start: formatDate(state.usageWindow.start),
      end: formatDate(state.usageWindow.end),
    },
    billingEvents: state.billingEvents.map(serializeBillingEvent),
  };
}

function serializeBillingActionState(state: Awaited<ReturnType<typeof mockStripeBillingProvider.checkout>>) {
  return {
    ...serializeBillingState(state),
    billingEvent: serializeBillingEvent(state.billingEvent),
  };
}

function serializeAdminSummary(summary: AdminSummaryResult) {
  return {
    tenantCount: summary.tenantCount,
    streamerCount: summary.streamerCount,
    activeStreamerCount: summary.activeStreamerCount,
    liveWorldCount: summary.liveWorldCount,
    worldCount: summary.worldCount,
    npcCount: summary.npcCount,
    aliveNpcCount: summary.aliveNpcCount,
    todayLiveSessionCount: summary.todayLiveSessionCount,
    todayGiftEventCount: summary.todayGiftEventCount,
  };
}

function serializeAdminStreamerListItem(item: AdminStreamerListItem) {
  return {
    tenant: serializeTenant(item.tenant),
    streamer: serializeStreamer(item.streamer),
    subscription: serializeSubscription(item.subscription),
    worldCount: item.worldCount,
    npcCount: item.npcCount,
    liveSessionCount: item.liveSessionCount,
    lastLiveAt: formatDate(item.lastLiveAt),
    latestLiveSessionStatus: item.latestLiveSessionStatus,
  };
}

function serializeAdminTenantListItem(item: AdminTenantListItem) {
  return {
    tenant: serializeTenant(item.tenant),
    streamerCount: item.streamerCount,
    activeStreamerCount: item.activeStreamerCount,
    worldCount: item.worldCount,
    npcCount: item.npcCount,
    liveSessionCount: item.liveSessionCount,
  };
}

function serializeAdminWorldListItem(item: AdminWorldListItem) {
  return {
    tenant: serializeTenant(item.tenant),
    streamer: serializeStreamer(item.streamer),
    subscription: serializeSubscription(item.subscription),
    world: serializeWorld(item.world, item.streamer.handle),
    lastGiftEventAt: formatDate(item.lastGiftEventAt),
  };
}

function serializeAdminLiveSessionListItem(item: AdminLiveSessionListItem) {
  return {
    tenant: serializeTenant(item.tenant),
    streamer: serializeStreamer(item.streamer),
    world: serializeWorld(item.world, item.streamer.handle),
    liveSession: serializeLiveSession(item.liveSession),
  };
}

function serializeAdminGiftEventListItem(item: AdminGiftEventListItem) {
  return {
    tenant: serializeTenant(item.tenant),
    streamer: serializeStreamer(item.streamer),
    world: serializeWorld(item.world, item.streamer.handle),
    liveSession: item.liveSession ? serializeLiveSession(item.liveSession) : null,
    giftEvent: serializeGiftEvent(item.giftEvent),
  };
}

function serializeAdminSystemHealth(health: AdminSystemHealthResult) {
  return {
    backendStatus: health.backendStatus,
    databaseStatus: health.databaseStatus,
    websocketClients: health.websocketClients,
    activeWorldCount: health.activeWorldCount,
    lastTickAt: formatDate(health.lastTickAt),
    lastGiftEventAt: formatDate(health.lastGiftEventAt),
  };
}

function serializeAdminStreamerDetail(detail: AdminStreamerDetailResult) {
  return {
    ...serializeConsoleContext(detail),
    recentLiveSessions: detail.recentLiveSessions.map(serializeLiveSession),
    recentGiftEvents: detail.recentGiftEvents.map(serializeGiftEvent),
  };
}

async function issueBrowserSession(
  reply: { header(name: string, value: string): unknown },
  tenantId: string,
  streamerId: string,
): Promise<StreamerSessionRow> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + STREAMER_SESSION_TTL_SECONDS * 1000);
  const session = await createStreamerSession(pool, {
    tenantId,
    streamerId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt,
  });

  await markStreamerLogin(pool, streamerId);
  reply.header('set-cookie', buildSessionCookie(token, expiresAt));
  return session;
}

async function issueAdminSession(
  reply: { header(name: string, value: string): unknown },
  adminId: string,
): Promise<AdminSessionRow> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);
  const session = await createPlatformAdminSession(pool, {
    adminId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt,
  });

  await markPlatformAdminLogin(pool, adminId);
  reply.header('set-cookie', buildAdminSessionCookie(token, expiresAt));
  return session;
}

async function authorizeRealtimeConnection(requestUrl: URL): Promise<void> {
  const streamerHandle = requestUrl.searchParams.get('streamerHandle')?.trim();
  const worldId = requestUrl.searchParams.get('worldId')?.trim();

  if (!streamerHandle || !worldId) {
    throw notFound('Realtime connection には streamerHandle と worldId が必要です');
  }

  await loadWorldSnapshotByHandle(pool, streamerHandle, worldId);
}

async function loadAdminSessionFromRequest(request: { headers: { cookie?: string | string[] } }): Promise<AdminSessionAuthResult> {
  const token = readCookieValue(request.headers.cookie, ADMIN_SESSION_COOKIE_NAME);
  if (!token) {
    throw unauthorized('管理者ログインが必要です');
  }

  const session = await loadPlatformAdminSessionByTokenHash(pool, hashSessionToken(token));
  if (!session) {
    throw unauthorized('管理者セッションが無効です');
  }

  return session;
}

await app.register(cors, {
  origin: (origin, callback) => {
    if (isAllowedCorsOrigin(origin ?? null)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
});

realtimeHub.attach(app.server, authorizeRealtimeConnection);

function serializeTenant(tenant: TenantRow) {
  return {
    id: tenant.id,
    name: tenant.name,
    handle: tenant.handle,
    status: tenant.status,
    createdAt: formatDate(tenant.created_at),
    updatedAt: formatDate(tenant.updated_at),
  };
}

function serializeStreamer(streamer: StreamerRow) {
  return {
    id: streamer.id,
    tenantId: streamer.tenant_id,
    email: streamer.email,
    displayName: streamer.display_name,
    handle: streamer.handle,
    avatarUrl: streamer.avatar_url,
    defaultTiktokId: streamer.default_tiktok_id,
    isActive: streamer.is_active,
    createdAt: formatDate(streamer.created_at),
    updatedAt: formatDate(streamer.updated_at),
  };
}

function serializeSubscription(subscription: SubscriptionRow | null) {
  if (!subscription) {
    return null;
  }

  return {
    id: subscription.id,
    tenantId: subscription.tenant_id,
    streamerId: subscription.streamer_id,
    provider: subscription.provider,
    providerCustomerId: subscription.provider_customer_id,
    providerSubscriptionId: subscription.provider_subscription_id,
    plan: subscription.plan,
    status: subscription.status,
    maxWorlds: subscription.max_worlds,
    maxNpcsPerWorld: subscription.max_npcs_per_world,
    aiNarrationQuota: subscription.ai_narration_quota,
    currentPeriodStart: formatDate(subscription.current_period_start),
    currentPeriodEnd: formatDate(subscription.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    createdAt: formatDate(subscription.created_at),
    updatedAt: formatDate(subscription.updated_at),
  };
}

function serializePlanLimits(limits: {
  maxWorlds: number;
  maxNpcsPerWorld: number;
  maxLiveSessionsPerMonth: number;
  aiNarrationQuota: number;
  overlayBranding: 'watermark' | 'custom';
  customGiftMapping: boolean;
}) {
  return {
    maxWorlds: limits.maxWorlds,
    maxNpcsPerWorld: limits.maxNpcsPerWorld,
    maxLiveSessionsPerMonth: limits.maxLiveSessionsPerMonth,
    aiNarrationQuota: limits.aiNarrationQuota,
    overlayBranding: limits.overlayBranding,
    customGiftMapping: limits.customGiftMapping,
  };
}

function serializeLiveSession(liveSession: LiveSessionRow | null) {
  if (!liveSession) {
    return null;
  }

  return {
    id: liveSession.id,
    tenantId: liveSession.tenant_id,
    streamerId: liveSession.streamer_id,
    worldId: liveSession.world_id,
    platform: liveSession.platform,
    platformLiveId: liveSession.platform_live_id,
    status: liveSession.status,
    startedAt: formatDate(liveSession.started_at),
    endedAt: formatDate(liveSession.ended_at),
    viewerCountPeak: liveSession.viewer_count_peak,
    giftCount: liveSession.gift_count,
    metadata: liveSession.metadata,
    createdAt: formatDate(liveSession.created_at),
  };
}

function serializeLiveSessionActionResult(result: {
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  world: WorldRow;
  liveSession: LiveSessionRow;
}) {
  return {
    tenant: serializeTenant(result.tenant),
    streamer: serializeStreamer(result.streamer),
    subscription: serializeSubscription(result.subscription),
    world: serializeWorld(
      {
        ...result.world,
        npc_count: 0,
        alive_npc_count: 0,
        dead_npc_count: 0,
        latest_live_session_id: result.liveSession.id,
        latest_live_session_status: result.liveSession.status,
        latest_live_session_started_at: result.liveSession.started_at,
        latest_live_session_ended_at: result.liveSession.ended_at,
        last_tick_started_at: null,
      },
      result.streamer.handle,
    ),
    liveSession: serializeLiveSession(result.liveSession),
    overlayUrl: buildOverlayUrl(result.streamer.handle, result.world.id),
    viewerCreateUrl: buildViewerCreateUrl(result.streamer.handle),
    viewerMyNpcUrl: buildViewerMyNpcUrl(result.streamer.handle),
    createUrl: buildViewerCreateUrl(result.streamer.handle),
    myNpcUrl: buildViewerMyNpcUrl(result.streamer.handle),
  };
}

function serializeWorld(world: WorldSummaryRow, streamerHandle?: string) {
  return {
    id: world.id,
    tenantId: world.tenant_id,
    streamerId: world.streamer_id,
    name: world.name,
    width: world.width,
    height: world.height,
    tickIntervalSeconds: world.tick_interval_seconds,
    currentTick: world.current_tick,
    worldSeed: world.world_seed,
    status: world.status,
    createdAt: formatDate(world.created_at),
    updatedAt: formatDate(world.updated_at),
    npcCount: world.npc_count,
    aliveNpcCount: world.alive_npc_count,
    deadNpcCount: world.dead_npc_count,
    latestLiveSessionId: world.latest_live_session_id,
    latestLiveSessionStatus: world.latest_live_session_status,
    latestLiveSessionStartedAt: formatDate(world.latest_live_session_started_at),
    latestLiveSessionEndedAt: formatDate(world.latest_live_session_ended_at),
    lastTickStartedAt: formatDate(world.last_tick_started_at),
    overlayUrl: streamerHandle ? buildOverlayUrl(streamerHandle, world.id) : null,
    viewerCreateUrl: streamerHandle ? buildViewerCreateUrl(streamerHandle) : null,
    viewerMyNpcUrl: streamerHandle ? buildViewerMyNpcUrl(streamerHandle) : null,
  };
}

function serializeState(state: NpcStateRow) {
  return {
    tileX: state.tile_x,
    tileY: state.tile_y,
    hp: state.hp,
    food: state.food,
    water: state.water,
    stamina: state.stamina,
    morale: state.morale,
    injury: state.injury,
    shelter: state.shelter,
    currentAction: state.current_action,
    actionTargetX: state.action_target_x,
    actionTargetY: state.action_target_y,
    actionStartedAt: formatDate(state.action_started_at),
    actionEndsAt: formatDate(state.action_ends_at),
    lastTick: state.last_tick,
    updatedAt: formatDate(state.updated_at),
  };
}

function serializeInventoryItem(item: NpcInventoryRow) {
  return {
    id: item.id,
    npcId: item.npc_id,
    itemId: item.item_id,
    quantity: item.quantity,
    durability: item.durability,
    updatedAt: formatDate(item.updated_at),
  };
}

function serializeNpcSnapshot(snapshot: {
  npc: NpcRow;
  state: NpcStateRow;
  inventory: NpcInventoryRow[];
  viewerUser: { id: string; tiktok_id: string; display_name: string | null; avatar_url: string | null } | null;
}) {
  return {
    id: snapshot.npc.id,
    tenantId: snapshot.npc.tenant_id,
    streamerId: snapshot.npc.streamer_id,
    worldId: snapshot.npc.world_id,
    viewerUserId: snapshot.npc.viewer_user_id,
    name: snapshot.npc.name,
    age: snapshot.npc.age,
    gender: snapshot.npc.gender,
    appearanceKey: snapshot.npc.appearance_key,
    personalityPrompt: snapshot.npc.personality_prompt,
    backstory: snapshot.npc.backstory,
    traits: {
      social: snapshot.npc.trait_social,
      aggression: snapshot.npc.trait_aggression,
      greed: snapshot.npc.trait_greed,
      cooperation: snapshot.npc.trait_cooperation,
      risk: snapshot.npc.trait_risk,
      leadership: snapshot.npc.trait_leadership,
    },
    aiSeed: snapshot.npc.ai_seed,
    status: snapshot.npc.status,
    deathCause: snapshot.npc.death_cause,
    createdAt: formatDate(snapshot.npc.created_at),
    updatedAt: formatDate(snapshot.npc.updated_at),
    viewerUser: snapshot.viewerUser
      ? {
          id: snapshot.viewerUser.id,
          tiktokId: snapshot.viewerUser.tiktok_id,
          displayName: snapshot.viewerUser.display_name,
          avatarUrl: snapshot.viewerUser.avatar_url,
        }
      : null,
    state: serializeState(snapshot.state),
    inventory: snapshot.inventory.map(serializeInventoryItem),
  };
}

function serializeEvent(event: WorldEventRow) {
  return {
    id: event.id,
    tenantId: event.tenant_id,
    streamerId: event.streamer_id,
    worldId: event.world_id,
    liveSessionId: event.live_session_id,
    tick: event.tick,
    eventType: event.event_type,
    titleJa: event.title_ja,
    descriptionJa: event.description_ja,
    actorNpcId: event.actor_npc_id,
    targetNpcId: event.target_npc_id,
    tileX: event.tile_x,
    tileY: event.tile_y,
    metadata: event.metadata,
    createdAt: formatDate(event.created_at),
  };
}

function serializeGrant(grant: ResourceGrantRow) {
  return {
    id: grant.id,
    tenantId: grant.tenant_id,
    streamerId: grant.streamer_id,
    worldId: grant.world_id,
    liveSessionId: grant.live_session_id,
    giftEventId: grant.gift_event_id,
    viewerUserId: grant.viewer_user_id,
    targetNpcId: grant.target_npc_id,
    packId: grant.pack_id,
    status: grant.status,
    spawnTileX: grant.spawn_tile_x,
    spawnTileY: grant.spawn_tile_y,
    expiresAt: formatDate(grant.expires_at),
    claimedAt: formatDate(grant.claimed_at),
    metadata: grant.metadata,
    createdAt: formatDate(grant.created_at),
  };
}

function serializeGiftEvent(giftEvent: GiftEventRow) {
  return {
    id: giftEvent.id,
    tenantId: giftEvent.tenant_id,
    streamerId: giftEvent.streamer_id,
    worldId: giftEvent.world_id,
    liveSessionId: giftEvent.live_session_id,
    platform: giftEvent.platform,
    platformEventId: giftEvent.platform_event_id,
    tiktokId: giftEvent.tiktok_id,
    displayName: giftEvent.display_name,
    giftId: giftEvent.gift_id,
    giftName: giftEvent.gift_name,
    giftValue: giftEvent.gift_value,
    repeatCount: giftEvent.repeat_count,
    status: giftEvent.status,
    rawPayload: giftEvent.raw_payload,
    receivedAt: formatDate(giftEvent.received_at),
    processedAt: formatDate(giftEvent.processed_at),
  };
}

async function startTickScheduler(): Promise<void> {
  if (schedulerStarted || !env.enableTickScheduler) {
    return;
  }

  schedulerStarted = true;

  const interval = setInterval(() => {
    void runTickScheduler(pool).catch((error: unknown) => {
      app.log.error({ error }, 'Tick scheduler failed');
    });
  }, env.TICK_CHECK_INTERVAL_SECONDS * 1000);

  interval.unref();
}

app.setErrorHandler((error, _request, reply) => {
  if (isAppError(error)) {
    const payload: Record<string, unknown> = {
      ok: false,
      error: error.code,
      message: error.message,
      details: error.details ?? null,
    };

    if (error.details && typeof error.details === 'object') {
      const maybeDetails = error.details as Record<string, unknown>;
      if (typeof maybeDetails.code === 'string') {
        payload.code = maybeDetails.code;
      }
    }

    reply.status(error.statusCode).send(payload);
    return;
  }

  app.log.error({ error }, 'Unhandled backend error');
  reply.status(500).send({
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: '内部エラーが発生しました',
    },
  });
});

app.get('/health', async () => {
  await pingDatabase();

  return {
    ok: true,
    service: 'ai-wasteland-survival-v2-backend',
    version: '0.2.0',
    database: 'connected',
    bootSummary,
  };
});

app.get('/api/auth/me', async (request) => {
  const session = await loadSessionFromRequest(request);
  return serializeAuthContext(session);
});

app.post('/api/auth/register', async (request, reply) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
      displayName: z.string().min(1).max(80).optional(),
    })
    .parse(request.body ?? {});

  const account = await createRegisteredStreamerAccount(pool, {
    email: body.email,
    password: body.password,
    displayName: body.displayName ?? null,
  });
  const session = await issueBrowserSession(reply, account.tenant.id, account.streamer.id);

  return {
    ...serializeAuthContext({
      session,
      tenant: account.tenant,
      streamer: account.streamer,
      subscription: account.subscription,
    }),
    world: serializeWorld(
      {
        ...account.world,
        npc_count: 0,
        alive_npc_count: 0,
        dead_npc_count: 0,
        latest_live_session_id: null,
        latest_live_session_status: null,
        latest_live_session_started_at: null,
        latest_live_session_ended_at: null,
        last_tick_started_at: null,
      },
      account.streamer.handle,
    ),
  };
});

app.post('/api/auth/login', async (request, reply) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(1),
    })
    .parse(request.body ?? {});

  const account = await loadStreamerAuthByEmail(pool, body.email);
  if (!account || !account.streamer.is_active) {
    throw unauthorized('メールアドレスまたはパスワードが正しくありません');
  }

  const passwordOk = await verifyPasswordHash(pool, body.password, account.streamer.password_hash);
  if (!passwordOk) {
    throw unauthorized('メールアドレスまたはパスワードが正しくありません');
  }

  const session = await issueBrowserSession(reply, account.tenant.id, account.streamer.id);

  return {
    ...serializeAuthContext({
      session,
      tenant: account.tenant,
      streamer: account.streamer,
      subscription: account.subscription,
    }),
  };
});

app.post('/api/auth/logout', async (request, reply) => {
  const token = readCookieValue(request.headers.cookie, STREAMER_SESSION_COOKIE_NAME);
  if (token) {
    await revokeStreamerSessionByTokenHash(pool, hashSessionToken(token));
  }

  reply.header('set-cookie', buildClearedSessionCookie());
  return {
    ok: true,
  };
});

app.post('/api/admin/login', async (request, reply) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(1),
    })
    .parse(request.body ?? {});

  const admin = await loadPlatformAdminByEmail(pool, body.email);
  if (!admin || !admin.is_active) {
    throw unauthorized('管理者アカウントが見つかりません');
  }

  const passwordOk = await verifyPasswordHash(pool, body.password, admin.password_hash);
  if (!passwordOk) {
    throw unauthorized('パスワードが正しくありません');
  }

  const session = await issueAdminSession(reply, admin.id);
  const authSession = await loadPlatformAdminSessionByTokenHash(pool, session.session_token_hash);
  if (!authSession) {
    throw unauthorized('管理者セッションの作成に失敗しました');
  }

  return serializeAdminAuthContext(authSession);
});

app.post('/api/admin/logout', async (request, reply) => {
  const token = readCookieValue(request.headers.cookie, ADMIN_SESSION_COOKIE_NAME);
  if (token) {
    await revokePlatformAdminSessionByTokenHash(pool, hashSessionToken(token));
  }

  reply.header('set-cookie', buildClearedAdminSessionCookie());
  return {
    ok: true,
  };
});

app.get('/api/admin/me', async (request) => {
  const session = await loadAdminSessionFromRequest(request);
  return serializeAdminAuthContext(session);
});

app.get('/api/admin/summary', async (request) => {
  await loadAdminSessionFromRequest(request);
  const summary = await loadAdminSummary(pool);
  return {
    ok: true,
    summary: serializeAdminSummary(summary),
  };
});

app.get('/api/admin/streamers', async (request) => {
  await loadAdminSessionFromRequest(request);
  const streamers = await listAdminStreamers(pool);
  return {
    ok: true,
    streamers: streamers.map(serializeAdminStreamerListItem),
  };
});

app.get('/api/admin/streamers/:streamerId', async (request) => {
  await loadAdminSessionFromRequest(request);
  const params = z.object({ streamerId: z.string().min(1) }).parse(request.params);
  const detail = await loadAdminStreamerDetail(pool, params.streamerId);
  if (!detail) {
    throw notFound(`Streamer ${params.streamerId} が見つかりません`);
  }

  return serializeAdminStreamerDetail(detail);
});

app.post('/api/admin/streamers/:streamerId/plan', async (request) => {
  await loadAdminSessionFromRequest(request);
  const params = z.object({ streamerId: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      plan: z.enum(['free_trial', 'starter', 'pro', 'studio']),
      status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'expired']),
    })
    .parse(request.body ?? {});

  const streamer = await loadStreamerById(pool, params.streamerId);
  if (!streamer) {
    throw notFound(`Streamer ${params.streamerId} が見つかりません`);
  }

  await updateStreamerSubscriptionPlan(pool, {
    streamerHandle: streamer.handle,
    plan: body.plan,
    status: body.status,
  });

  const detail = await loadAdminStreamerDetail(pool, streamer.id);
  if (!detail) {
    throw notFound(`Streamer ${params.streamerId} が見つかりません`);
  }

  return serializeAdminStreamerDetail(detail);
});

app.post('/api/admin/streamers/:streamerId/status', async (request) => {
  await loadAdminSessionFromRequest(request);
  const params = z.object({ streamerId: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      status: z.enum(['active', 'paused']),
    })
    .parse(request.body ?? {});

  const streamer = await loadStreamerById(pool, params.streamerId);
  if (!streamer) {
    throw notFound(`Streamer ${params.streamerId} が見つかりません`);
  }

  await updateStreamerOperationalStatus(pool, {
    streamerId: streamer.id,
    isActive: body.status === 'active',
  });

  const detail = await loadAdminStreamerDetail(pool, streamer.id);
  if (!detail) {
    throw notFound(`Streamer ${params.streamerId} が見つかりません`);
  }

  return serializeAdminStreamerDetail(detail);
});

app.get('/api/admin/tenants', async (request) => {
  await loadAdminSessionFromRequest(request);
  const tenants = await listAdminTenants(pool);
  return {
    ok: true,
    tenants: tenants.map(serializeAdminTenantListItem),
  };
});

app.get('/api/admin/worlds', async (request) => {
  await loadAdminSessionFromRequest(request);
  const worlds = await listAdminWorlds(pool);
  return {
    ok: true,
    worlds: worlds.map(serializeAdminWorldListItem),
  };
});

app.get('/api/admin/live-sessions', async (request) => {
  await loadAdminSessionFromRequest(request);
  const liveSessions = await listAdminLiveSessions(pool);
  return {
    ok: true,
    liveSessions: liveSessions.map(serializeAdminLiveSessionListItem),
  };
});

app.get('/api/admin/gift-events', async (request) => {
  await loadAdminSessionFromRequest(request);
  const giftEvents = await listAdminGiftEvents(pool);
  return {
    ok: true,
    giftEvents: giftEvents.map(serializeAdminGiftEventListItem),
  };
});

app.get('/api/admin/system/health', async (request) => {
  await loadAdminSessionFromRequest(request);
  const health = await loadAdminSystemHealth(pool);
  return {
    ok: true,
    health: {
      ...serializeAdminSystemHealth(health),
      websocketClients: realtimeHub.getClientCount(),
    },
  };
});

app.get('/api/console/context', async (request) => {
  const session = await loadSessionFromRequest(request);
  const context = await loadStreamerContext(pool, session.streamer.handle);

  return {
    session: serializeSession(session.session),
    ...serializeConsoleContext(context),
  };
});

app.post('/api/console/worlds/:worldId/live-sessions/start', async (request) => {
  const session = await loadSessionFromRequest(request);
  const body = z
    .object({
      platform: z.string().min(1).optional(),
      platformLiveId: z.string().min(1).optional(),
    })
    .parse(request.body ?? {});
  const params = z.object({ worldId: z.string().min(1) }).parse(request.params);

  const result = await createLiveSession(pool, {
    streamerHandle: session.streamer.handle,
    worldId: params.worldId,
    platform: body.platform ?? null,
    platformLiveId: body.platformLiveId ?? null,
  });

  return {
    ok: true,
    session: serializeSession(session.session),
    ...serializeLiveSessionActionResult(result),
  };
});

app.post('/api/console/live-sessions', async (request) => {
  const session = await loadSessionFromRequest(request);
  const body = z
    .object({
      worldId: z.string().min(1).optional(),
      platform: z.string().min(1).optional(),
      platformLiveId: z.string().min(1).optional(),
    })
    .parse(request.body ?? {});

  const result = await createLiveSession(pool, {
    streamerHandle: session.streamer.handle,
    worldId: body.worldId ?? null,
    platform: body.platform ?? null,
    platformLiveId: body.platformLiveId ?? null,
  });

  return {
    ok: true,
    session: serializeSession(session.session),
    ...serializeLiveSessionActionResult(result),
  };
});

app.post('/api/console/live-sessions/:liveSessionId/end', async (request) => {
  const session = await loadSessionFromRequest(request);
  const params = z.object({ liveSessionId: z.string().min(1) }).parse(request.params);

  const result = await endLiveSession(pool, {
    streamerHandle: session.streamer.handle,
    liveSessionId: params.liveSessionId,
  });

  return {
    ok: true,
    session: serializeSession(session.session),
    ...serializeLiveSessionActionResult(result),
  };
});

app.get('/api/console/live-sessions/current', async (request) => {
  const session = await loadSessionFromRequest(request);
  const context = await loadStreamerContext(pool, session.streamer.handle);
  const currentLiveSession = context.latestLiveSession;

  if (!currentLiveSession) {
    return {
      ok: true,
      session: serializeSession(session.session),
      tenant: serializeTenant(context.tenant),
      streamer: serializeStreamer(context.streamer),
      subscription: serializeSubscription(context.subscription),
      liveSession: null,
      world: null,
      overlayUrl: null,
      viewerCreateUrl: buildViewerCreateUrl(context.streamer.handle),
      viewerMyNpcUrl: buildViewerMyNpcUrl(context.streamer.handle),
      createUrl: buildViewerCreateUrl(context.streamer.handle),
      myNpcUrl: buildViewerMyNpcUrl(context.streamer.handle),
    };
  }

  const snapshot = await loadWorldSnapshotByHandle(pool, context.streamer.handle, currentLiveSession.world_id);

  return {
    ok: true,
    session: serializeSession(session.session),
    tenant: serializeTenant(snapshot.tenant),
    streamer: serializeStreamer(snapshot.streamer),
    subscription: serializeSubscription(snapshot.subscription),
    liveSession: serializeLiveSession(currentLiveSession),
    world: serializeWorld(snapshot.world, snapshot.streamer.handle),
    overlayUrl: buildOverlayUrl(snapshot.streamer.handle, snapshot.world.id),
    viewerCreateUrl: buildViewerCreateUrl(snapshot.streamer.handle),
    viewerMyNpcUrl: buildViewerMyNpcUrl(snapshot.streamer.handle),
    createUrl: buildViewerCreateUrl(snapshot.streamer.handle),
    myNpcUrl: buildViewerMyNpcUrl(snapshot.streamer.handle),
  };
});

app.get('/api/console/live-sessions/:liveSessionId', async (request) => {
  const session = await loadSessionFromRequest(request);
  const params = z.object({ liveSessionId: z.string().min(1) }).parse(request.params);
  const liveSession = await loadLiveSessionById(pool, params.liveSessionId);

  if (!liveSession || liveSession.tenant_id !== session.tenant.id || liveSession.streamer_id !== session.streamer.id) {
    throw notFound(`ライブセッション ${params.liveSessionId} が見つかりません`, {
      liveSessionId: params.liveSessionId,
    });
  }

  const snapshot = await loadWorldSnapshotByHandle(pool, session.streamer.handle, liveSession.world_id);

  return {
    ok: true,
    session: serializeSession(session.session),
    tenant: serializeTenant(snapshot.tenant),
    streamer: serializeStreamer(snapshot.streamer),
    subscription: serializeSubscription(snapshot.subscription),
    liveSession: serializeLiveSession(liveSession),
    world: serializeWorld(snapshot.world, snapshot.streamer.handle),
    overlayUrl: buildOverlayUrl(snapshot.streamer.handle, snapshot.world.id),
    viewerCreateUrl: buildViewerCreateUrl(snapshot.streamer.handle),
    viewerMyNpcUrl: buildViewerMyNpcUrl(snapshot.streamer.handle),
    createUrl: buildViewerCreateUrl(snapshot.streamer.handle),
    myNpcUrl: buildViewerMyNpcUrl(snapshot.streamer.handle),
  };
});

app.post('/api/console/gift-events', async (request) => {
  const session = await loadSessionFromRequest(request);
  const body = z
    .object({
      worldId: z.string().min(1).optional(),
      tiktokId: z.string().min(1),
      giftName: z.string().min(1),
      giftValue: z.number().int().nonnegative().default(1),
      repeatCount: z.number().int().positive().default(1),
      displayName: z.string().min(1).optional(),
      giftId: z.string().min(1).optional(),
      platformEventId: z.string().min(1).optional(),
      rawPayload: z.record(z.string(), z.unknown()).optional(),
    })
    .parse(request.body ?? {});

  const result = await dispatchGiftEventForCurrentLiveSession(pool, {
    streamerHandle: session.streamer.handle,
    worldId: body.worldId ?? null,
    tiktokId: body.tiktokId,
    giftName: body.giftName,
    giftValue: body.giftValue,
    repeatCount: body.repeatCount,
    displayName: body.displayName ?? null,
    giftId: body.giftId ?? null,
    platformEventId: body.platformEventId ?? null,
    rawPayload: body.rawPayload ?? null,
  });

  return {
    ok: true,
    session: serializeSession(session.session),
    accepted: true,
    tenant: serializeTenant(result.tenant),
    streamer: serializeStreamer(result.streamer),
    world: serializeWorld(
      {
        ...result.world,
        npc_count: 0,
        alive_npc_count: 0,
        dead_npc_count: 0,
        latest_live_session_id: result.liveSession.id,
        latest_live_session_status: result.liveSession.status,
        latest_live_session_started_at: result.liveSession.started_at,
        latest_live_session_ended_at: result.liveSession.ended_at,
        last_tick_started_at: null,
      },
      result.streamer.handle,
    ),
    liveSession: serializeLiveSession(result.liveSession),
    viewerUser: {
      id: result.viewerUser.id,
      tiktokId: result.viewerUser.tiktok_id,
      displayName: result.viewerUser.display_name,
      avatarUrl: result.viewerUser.avatar_url,
    },
    targetNpc: result.targetNpc
      ? {
          id: result.targetNpc.id,
          name: result.targetNpc.name,
          status: result.targetNpc.status,
          worldId: result.targetNpc.world_id,
        }
      : null,
    giftEvent: serializeGiftEvent(result.giftEvent),
    resourceGrant: serializeGrant(result.resourceGrant),
  };
});

app.get('/api/console/gift-connection', async (request) => {
  const session = await loadSessionFromRequest(request);
  const context = await loadStreamerContext(pool, session.streamer.handle);

  return {
    ok: true,
    session: serializeSession(session.session),
    tenant: serializeTenant(context.tenant),
    streamer: serializeStreamer(context.streamer),
    giftConnection: serializeGiftConnection(context.giftConnection),
    availableAdapters: AVAILABLE_GIFT_ADAPTERS.map((adapter) => ({
      type: adapter.type,
      label: adapter.label,
      description: adapter.description,
      enabled: adapter.enabled,
      experimental: adapter.experimental,
    })),
  };
});

app.post('/api/console/gift-connection', async (request) => {
  const session = await loadSessionFromRequest(request);
  const body = z
    .object({
      platform: z.string().min(1).optional(),
      connectionType: z.enum(['dev_mock', 'manual', 'tiktok_experimental', 'future_official']).optional(),
      status: z.enum(['not_connected', 'connecting', 'connected', 'reconnecting', 'failed', 'test_mode']).optional(),
      encryptedCredentials: z.record(z.string(), z.unknown()).nullable().optional(),
      lastConnectedAt: z.string().datetime().nullable().optional(),
      lastError: z.string().nullable().optional(),
    })
    .parse(request.body ?? {});

  const lastConnectedAt =
    body.lastConnectedAt === undefined ? undefined : body.lastConnectedAt === null ? null : new Date(body.lastConnectedAt);

  const connection = await updateGiftSourceConnection(pool, {
    streamerHandle: session.streamer.handle,
    platform: body.platform,
    connectionType: body.connectionType,
    status: body.status,
    encryptedCredentials: body.encryptedCredentials === undefined ? undefined : body.encryptedCredentials,
    lastConnectedAt,
    lastError: body.lastError,
  });

  return {
    ok: true,
    session: serializeSession(session.session),
    giftConnection: serializeGiftConnection(connection),
  };
});

app.get('/api/console/billing', async (request) => {
  const session = await loadSessionFromRequest(request);
  const state = await mockStripeBillingProvider.loadConsoleState(pool, session.streamer.handle);

  return {
    session: serializeSession(session.session),
    ...serializeBillingState(state),
  };
});

app.post('/api/console/billing/checkout', async (request) => {
  const session = await loadSessionFromRequest(request);
  const body = z
    .object({
      plan: z.enum(['free_trial', 'starter', 'pro', 'studio']),
      providerEventId: z.string().min(1).optional(),
      providerSessionId: z.string().min(1).optional(),
      paymentMethod: z.string().min(1).optional(),
    })
    .parse(request.body ?? {});

  const result = await mockStripeBillingProvider.checkout(pool, {
    streamerHandle: session.streamer.handle,
    plan: body.plan,
    providerEventId: body.providerEventId ?? null,
    providerSessionId: body.providerSessionId ?? null,
    paymentMethod: body.paymentMethod ?? null,
  });

  return {
    session: serializeSession(session.session),
    ...serializeBillingActionState(result),
  };
});

app.post('/api/console/billing/portal', async (request) => {
  const session = await loadSessionFromRequest(request);
  const body = z
    .object({
      action: z.enum(['renew', 'cancel', 'restore', 'mark_past_due', 'mark_expired']),
      providerEventId: z.string().min(1).optional(),
      providerSessionId: z.string().min(1).optional(),
    })
    .parse(request.body ?? {});

  const result = await mockStripeBillingProvider.portalAction(pool, {
    streamerHandle: session.streamer.handle,
    action: body.action,
    providerEventId: body.providerEventId ?? null,
    providerSessionId: body.providerSessionId ?? null,
  });

  return {
    session: serializeSession(session.session),
    ...serializeBillingActionState(result),
  };
});

app.post('/api/console/billing/webhook', async (request) => {
  const session = await loadSessionFromRequest(request);
  const body = z
    .object({
      eventType: z.string().min(1),
      providerEventId: z.string().min(1),
      providerSessionId: z.string().min(1).optional(),
      payload: z.record(z.string(), z.unknown()).default({}),
    })
    .parse(request.body ?? {});

  const result = await mockStripeBillingProvider.handleWebhook(pool, {
    streamerHandle: session.streamer.handle,
    eventType: body.eventType,
    providerEventId: body.providerEventId,
    providerSessionId: body.providerSessionId ?? null,
    payload: body.payload,
  });

  return {
    session: serializeSession(session.session),
    ...serializeBillingActionState(result),
  };
});

app.get('/api/streamers/:handle', async (request) => {
  const params = z.object({ handle: z.string().min(1) }).parse(request.params);
  const context = await loadStreamerContext(pool, params.handle);

  return {
    ok: true,
    handle: context.streamer.handle,
    displayName: context.streamer.display_name,
    tenantHandle: context.tenant.handle,
    plan: context.subscription?.plan ?? 'free_trial',
    status: context.subscription?.status ?? 'trialing',
    tenant: serializeTenant(context.tenant),
    streamer: serializeStreamer(context.streamer),
    subscription: serializeSubscription(context.subscription),
    stats: context.stats,
    primaryWorld: context.primaryWorld ? serializeWorld(context.primaryWorld, context.streamer.handle) : null,
    liveSession: serializeLiveSession(context.latestLiveSession),
  };
});

app.get('/api/streamers/:handle/worlds', async (request) => {
  const params = z.object({ handle: z.string().min(1) }).parse(request.params);
  const context = await loadStreamerContext(pool, params.handle);

  return {
    ok: true,
    streamerHandle: context.streamer.handle,
    tenantHandle: context.tenant.handle,
    subscription: serializeSubscription(context.subscription),
    worlds: context.worlds.map((world) => serializeWorld(world, context.streamer.handle)),
  };
});

app.post('/api/streamers/:handle/live-sessions', async (request) => {
  const params = z.object({ handle: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      worldId: z.string().min(1).optional(),
      platform: z.string().min(1).optional(),
      platformLiveId: z.string().min(1).optional(),
    })
    .parse(request.body ?? {});

  const result = await createLiveSession(pool, {
    streamerHandle: params.handle,
    worldId: body.worldId ?? null,
    platform: body.platform ?? null,
    platformLiveId: body.platformLiveId ?? null,
  });

  return {
    ok: true,
    id: result.liveSession.id,
    streamerHandle: result.streamer.handle,
    worldId: result.world.id,
    status: result.liveSession.status,
    ...serializeLiveSessionActionResult(result),
  };
});

app.get('/api/streamers/:handle/worlds/:worldId/snapshot', async (request) => {
  const params = z
    .object({
      handle: z.string().min(1),
      worldId: z.string().min(1),
    })
    .parse(request.params);
  const snapshot = await loadWorldSnapshotByHandle(pool, params.handle, params.worldId);

  return {
    ok: true,
    tenant: serializeTenant(snapshot.tenant),
    streamer: serializeStreamer(snapshot.streamer),
    subscription: serializeSubscription(snapshot.subscription),
    world: serializeWorld(snapshot.world, snapshot.streamer.handle),
    liveSession: serializeLiveSession(snapshot.liveSession),
    npcs: snapshot.npcs.map(serializeNpcSnapshot),
    events: snapshot.events.map(serializeEvent),
    resourceGrants: snapshot.resourceGrants.map(serializeGrant),
  };
});

app.get('/api/worlds/:worldId/snapshot', async (request) => {
  const params = z.object({ worldId: z.string().min(1) }).parse(request.params);
  const snapshot = await loadWorldSnapshot(pool, params.worldId);

  return {
    ok: true,
    tenant: serializeTenant(snapshot.tenant),
    streamer: serializeStreamer(snapshot.streamer),
    subscription: serializeSubscription(snapshot.subscription),
    world: serializeWorld(snapshot.world, snapshot.streamer.handle),
    liveSession: serializeLiveSession(snapshot.liveSession),
    npcs: snapshot.npcs.map(serializeNpcSnapshot),
    events: snapshot.events.map(serializeEvent),
    resourceGrants: snapshot.resourceGrants.map(serializeGrant),
  };
});

app.post('/api/viewer/npcs', async (request) => {
  const body = z
    .object({
      streamerHandle: z.string().min(1),
      tiktokId: z.string().min(1),
      displayName: z.string().min(1).optional(),
      npcName: z.string().min(1).optional(),
      personalityPrompt: z.string().min(1).optional(),
      gender: z.string().min(1).optional(),
      age: z.number().int().positive().max(120).optional(),
    })
    .parse(request.body);

  const result = await createViewerNpc(pool, {
    streamerHandle: body.streamerHandle,
    tiktokId: body.tiktokId,
    displayName: body.displayName ?? null,
    npcName: body.npcName ?? null,
    personalityPrompt: body.personalityPrompt ?? null,
    gender: body.gender ?? null,
    age: body.age ?? null,
  });

  return {
    ok: true,
    created: result.created,
    tenant: serializeTenant(result.tenant),
    streamer: serializeStreamer(result.streamer),
    subscription: serializeSubscription(result.subscription),
    world: serializeWorld(result.world, result.streamer.handle),
    viewerUser: {
      id: result.viewerUser.id,
      tiktokId: result.viewerUser.tiktok_id,
      displayName: result.viewerUser.display_name,
      avatarUrl: result.viewerUser.avatar_url,
    },
    npc: serializeNpcSnapshot(result.npc),
  };
});

app.get('/api/viewer/my-npc', async (request) => {
  const query = z
    .object({
      streamerHandle: z.string().min(1),
      tiktokId: z.string().min(1),
    })
    .parse(request.query);

  const result = await loadViewerNpcSnapshot(pool, query.streamerHandle, query.tiktokId);

  if (!result) {
    throw notFound('指定された TikTok ID の NPC が見つかりません', query);
  }

  return {
    ok: true,
    tenant: serializeTenant(result.tenant),
    streamer: serializeStreamer(result.streamer),
    subscription: serializeSubscription(result.subscription),
    world: serializeWorld(result.world, result.streamer.handle),
    viewerUser: {
      id: result.viewerUser.id,
      tiktokId: result.viewerUser.tiktok_id,
      displayName: result.viewerUser.display_name,
      avatarUrl: result.viewerUser.avatar_url,
    },
    npc: serializeNpcSnapshot(result.npc),
    events: result.events.map(serializeEvent),
  };
});

app.post('/api/dev/streamers/:handle/plan', async (request) => {
  if (isProductionEnvironment()) {
    throw notFound('Not found');
  }

  const params = z.object({ handle: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      plan: z.enum(['free_trial', 'starter', 'pro', 'studio']),
      status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'expired']),
    })
    .parse(request.body ?? {});

  await updateStreamerSubscriptionPlan(pool, {
    streamerHandle: params.handle,
    plan: body.plan,
    status: body.status,
  });

  const context = await loadStreamerContext(pool, params.handle);

  return serializeConsoleContext(context);
});

app.post('/api/dev/gift-events', async (request) => {
  if (isProductionEnvironment()) {
    throw notFound('Not found');
  }

  const body = z
    .object({
      worldId: z.string().min(1).optional(),
      streamerHandle: z.string().min(1),
      tiktokId: z.string().min(1),
      giftName: z.string().min(1),
      giftValue: z.number().int().nonnegative().default(1),
      repeatCount: z.number().int().positive().default(1),
      displayName: z.string().min(1).optional(),
      giftId: z.string().min(1).optional(),
      platformEventId: z.string().min(1).optional(),
    })
    .parse(request.body ?? {});

  const result = await dispatchGiftEventForCurrentLiveSession(pool, {
    streamerHandle: body.streamerHandle,
    worldId: body.worldId ?? null,
    tiktokId: body.tiktokId,
    giftName: body.giftName,
    giftValue: body.giftValue,
    repeatCount: body.repeatCount,
    displayName: body.displayName ?? null,
    giftId: body.giftId ?? null,
    platformEventId: body.platformEventId ?? null,
  });

  return {
    ok: true,
    accepted: true,
    tenant: serializeTenant(result.tenant),
    streamer: serializeStreamer(result.streamer),
    world: serializeWorld(
      {
        ...result.world,
        npc_count: 0,
        alive_npc_count: 0,
        dead_npc_count: 0,
        latest_live_session_id: result.liveSession.id,
        latest_live_session_status: result.liveSession.status,
        latest_live_session_started_at: result.liveSession.started_at,
        latest_live_session_ended_at: result.liveSession.ended_at,
        last_tick_started_at: null,
      },
      result.streamer.handle,
    ),
    liveSession: serializeLiveSession(result.liveSession),
    viewerUser: {
      id: result.viewerUser.id,
      tiktokId: result.viewerUser.tiktok_id,
      displayName: result.viewerUser.display_name,
      avatarUrl: result.viewerUser.avatar_url,
    },
    targetNpc: result.targetNpc
      ? {
          id: result.targetNpc.id,
          name: result.targetNpc.name,
          status: result.targetNpc.status,
          worldId: result.targetNpc.world_id,
        }
      : null,
    giftEvent: serializeGiftEvent(result.giftEvent),
    resourceGrant: serializeGrant(result.resourceGrant),
  };
});

app.post('/api/dev/tick', async (request) => {
  if (isProductionEnvironment()) {
    throw notFound('Not found');
  }

  const body = z
    .object({
      worldId: z.string().min(1).optional(),
    })
    .parse(request.body ?? {});

  const results = await runManualTick(pool, body.worldId ?? null);

  return {
    ok: true,
    accepted: true,
    tickedWorlds: results.length,
    results,
  };
});

async function bootstrap(): Promise<void> {
  bootSummary = await verifySeedData(pool);
  app.log.info({ bootSummary }, 'Database seed data verified');

  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  if (env.enableTickScheduler) {
    await startTickScheduler();
  }
}

try {
  await bootstrap();
} catch (error) {
  if (isAppError(error)) {
    app.log.error({ error }, 'Backend bootstrap failed');
  } else {
    app.log.error({ error }, 'Backend bootstrap failed');
  }
  await closeDatabase();
  process.exit(1);
}

process.on('SIGINT', async () => {
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDatabase();
  process.exit(0);
});
