import { randomUUID } from 'node:crypto';
import type { QueryResult, QueryResultRow } from 'pg';
import { withTransaction } from './db.js';
import { env } from './env.js';
import { conflict, notFound, planLimitExceeded, streamerInactive, subscriptionInactive } from './errors.js';
import { normalizeGiftAdapterEvent } from './gift-adapters.js';
import { getPlanLimits, isSubscriptionActiveForUsage, resolveUsageWindow } from './plans.js';
import { realtimeHub } from './realtime.js';
import type {
  AdminSessionRow,
  GiftEventRow,
  GiftSourceConnectionRow,
  ItemDefinitionRow,
  LiveSessionRow,
  NpcInventoryRow,
  NpcRow,
  NpcStateRow,
  BillingEventRow,
  PlatformAdminRow,
  ResourceGrantRow,
  ResourcePackItemRow,
  ResourcePackRow,
  StreamerRow,
  StreamerSessionRow,
  SubscriptionRow,
  TenantRow,
  TileResourceRow,
  ViewerUserRow,
  WorldEventInsertRow,
  WorldEventRow,
  WorldRow,
  WorldSummaryRow,
  WorldTickContext,
  WorldTickOutcome,
  WorldTileRow,
} from './types.js';
import { clampNumber, formatDate, hashString, makeTileKey, normalizeHandle } from './utils.js';

export interface SqlExecutor {
  query<T extends QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

export interface StreamerContextResult {
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  giftConnection: GiftSourceConnectionRow | null;
  planLimits: {
    maxWorlds: number;
    maxNpcsPerWorld: number;
    maxLiveSessionsPerMonth: number;
    aiNarrationQuota: number;
    overlayBranding: 'watermark' | 'custom';
    customGiftMapping: boolean;
  };
  stats: {
    worldCount: number;
    liveSessionCount: number;
    liveSessionsThisMonth: number;
    viewerUserCount: number;
    npcCount: number;
    aiNarrationUsed: number;
    aiNarrationRemaining: number;
  };
  worlds: WorldSummaryRow[];
  primaryWorld: WorldSummaryRow | null;
  latestLiveSession: LiveSessionRow | null;
}

export interface SnapshotNpcRow {
  npc: NpcRow;
  state: NpcStateRow;
  inventory: NpcInventoryRow[];
  viewerUser: ViewerUserRow | null;
}

export interface WorldSnapshotResult {
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  world: WorldSummaryRow;
  liveSession: LiveSessionRow | null;
  npcs: SnapshotNpcRow[];
  events: WorldEventRow[];
  resourceGrants: ResourceGrantRow[];
}

export interface ViewerNpcSnapshotResult {
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  world: WorldSummaryRow;
  viewerUser: ViewerUserRow;
  npc: SnapshotNpcRow;
  events: WorldEventRow[];
}

export interface GiftDispatchInput {
  tenant: TenantRow;
  streamer: StreamerRow;
  world: WorldRow;
  liveSession: LiveSessionRow;
  viewerUser: ViewerUserRow;
  targetNpc: NpcRow | null;
  giftEvent: GiftEventRow;
  resourceGrant: ResourceGrantRow;
}

export interface BootSummary {
  tenantCount: number;
  streamerCount: number;
  worldCount: number;
  liveSessionCount: number;
  npcCount: number;
  aliveNpcCount: number;
  worldTileCount: number;
  tileResourceCount: number;
}

export interface StreamerAuthResult {
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
}

export interface StreamerSessionAuthResult extends StreamerAuthResult {
  session: StreamerSessionRow;
}

export interface RegisteredStreamerResult extends StreamerAuthResult {
  world: WorldRow;
}

export interface AdminSessionAuthResult {
  admin: PlatformAdminRow;
  session: AdminSessionRow;
}

export interface AdminSummaryResult {
  tenantCount: number;
  streamerCount: number;
  activeStreamerCount: number;
  liveWorldCount: number;
  worldCount: number;
  npcCount: number;
  aliveNpcCount: number;
  todayLiveSessionCount: number;
  todayGiftEventCount: number;
}

export interface AdminStreamerListItem {
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  worldCount: number;
  npcCount: number;
  liveSessionCount: number;
  lastLiveAt: Date | null;
  latestLiveSessionStatus: LiveSessionRow['status'] | null;
}

export interface AdminTenantListItem {
  tenant: TenantRow;
  streamerCount: number;
  activeStreamerCount: number;
  worldCount: number;
  npcCount: number;
  liveSessionCount: number;
}

export interface AdminWorldListItem {
  world: WorldSummaryRow;
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  lastGiftEventAt: Date | null;
}

export interface AdminLiveSessionListItem {
  liveSession: LiveSessionRow;
  tenant: TenantRow;
  streamer: StreamerRow;
  world: WorldSummaryRow;
}

export interface AdminGiftEventListItem {
  giftEvent: GiftEventRow;
  tenant: TenantRow;
  streamer: StreamerRow;
  world: WorldSummaryRow;
  liveSession: LiveSessionRow | null;
}

export interface AdminSystemHealthResult {
  backendStatus: 'ok' | 'degraded';
  databaseStatus: 'connected' | 'disconnected';
  websocketClients: number;
  activeWorldCount: number;
  lastTickAt: Date | null;
  lastGiftEventAt: Date | null;
}

export interface AdminStreamerDetailResult extends StreamerContextResult {
  recentLiveSessions: LiveSessionRow[];
  recentGiftEvents: GiftEventRow[];
}

type PlacementCandidate = {
  tileX: number;
  tileY: number;
  score: number;
};

function getTextValue(value: string | null | undefined, fallback: string): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    return fallback;
  }

  return value;
}

function ensureNonNull<T>(value: T | null, message: string): T {
  if (value === null) {
    throw notFound(message);
  }

  return value;
}

async function queryOne<T extends QueryResultRow>(db: SqlExecutor, text: string, values?: readonly unknown[]): Promise<T | null> {
  const result = await db.query<T>(text, values);
  return result.rows[0] ?? null;
}

async function queryMany<T extends QueryResultRow>(db: SqlExecutor, text: string, values?: readonly unknown[]): Promise<T[]> {
  const result = await db.query<T>(text, values);
  return result.rows;
}

function groupRowsById<T extends { npc_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const bucket = grouped.get(row.npc_id) ?? [];
    bucket.push(row);
    grouped.set(row.npc_id, bucket);
  }

  return grouped;
}

function groupResourcePackItems(rows: ResourcePackItemRow[]): Map<string, ResourcePackItemRow[]> {
  const grouped = new Map<string, ResourcePackItemRow[]>();

  for (const row of rows) {
    const bucket = grouped.get(row.pack_id) ?? [];
    bucket.push(row);
    grouped.set(row.pack_id, bucket);
  }

  return grouped;
}

function serializeStreamerContextWorld(world: WorldSummaryRow): WorldSummaryRow {
  return world;
}

function resolvePrimaryWorld(worlds: WorldSummaryRow[]): WorldSummaryRow | null {
  return worlds[0] ?? null;
}

function ensureSubscriptionIsActive(subscription: SubscriptionRow | null): SubscriptionRow {
  if (!subscription || !isSubscriptionActiveForUsage(subscription.status)) {
    throw subscriptionInactive('契約状態を確認してください。');
  }

  return subscription;
}

function ensureStreamerIsOperational(tenant: TenantRow, streamer: StreamerRow): void {
  if (tenant.status !== 'active' || !streamer.is_active) {
    throw streamerInactive('配信者が停止中です。', {
      tenantId: tenant.id,
      tenantStatus: tenant.status,
      streamerId: streamer.id,
      streamerStatus: streamer.is_active ? 'active' : 'inactive',
    });
  }
}

function ensureNpcCreationWithinPlan(
  world: WorldSummaryRow,
  subscription: SubscriptionRow | null,
): void {
  const activeSubscription = ensureSubscriptionIsActive(subscription);
  const limits = getPlanLimits(activeSubscription.plan);

  if (world.npc_count >= limits.maxNpcsPerWorld) {
    throw planLimitExceeded('このプランのAI住民数上限に達しました。', {
      code: 'max_npcs_per_world',
      worldId: world.id,
      current: world.npc_count,
      limit: limits.maxNpcsPerWorld,
      plan: activeSubscription.plan,
    });
  }
}

function ensureWorldCreationWithinPlan(
  worldCount: number,
  subscription: SubscriptionRow | null,
): void {
  const activeSubscription = ensureSubscriptionIsActive(subscription);
  const limits = getPlanLimits(activeSubscription.plan);

  if (worldCount >= limits.maxWorlds) {
    throw planLimitExceeded('このプランのワールド数上限に達しました。', {
      code: 'max_worlds',
      current: worldCount,
      limit: limits.maxWorlds,
      plan: activeSubscription.plan,
    });
  }
}

function ensureLiveSessionCreationWithinPlan(
  liveSessionsThisMonth: number,
  subscription: SubscriptionRow | null,
): void {
  const activeSubscription = ensureSubscriptionIsActive(subscription);
  const limits = getPlanLimits(activeSubscription.plan);

  if (liveSessionsThisMonth >= limits.maxLiveSessionsPerMonth) {
    throw planLimitExceeded('このプランの今月の配信回数上限に達しました。', {
      code: 'max_live_sessions_per_month',
      current: liveSessionsThisMonth,
      limit: limits.maxLiveSessionsPerMonth,
      plan: activeSubscription.plan,
    });
  }
}

function calculateNeedScore(state: NpcStateRow): number {
  const waterDeficit = 100 - state.water;
  const foodDeficit = 100 - state.food;
  const hpDeficit = 100 - state.hp;
  const nearbyDanger = state.injury > 0 ? state.injury : 0;
  return waterDeficit * 1.5 + foodDeficit + hpDeficit * 2 + nearbyDanger * 1.2 - state.shelter * 0.5;
}

function chooseBestPlacementTile(
  world: WorldRow,
  tiles: WorldTileRow[],
  occupied: Set<string>,
  seed: string,
  preferredX: number,
  preferredY: number,
): PlacementCandidate {
  const tileByKey = new Map<string, WorldTileRow>();
  for (const tile of tiles) {
    tileByKey.set(makeTileKey(tile.tile_x, tile.tile_y), tile);
  }

  let best: PlacementCandidate | null = null;
  const searchRadius = Math.max(4, Math.floor(Math.min(world.width, world.height) / 8));
  const hashedBias = hashString(seed) % Math.max(1, searchRadius + 1);

  for (let radius = 0; radius <= searchRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }

        const tileX = clampNumber(preferredX + dx + hashedBias % 3 - 1, 0, world.width - 1);
        const tileY = clampNumber(preferredY + dy + (hashedBias % 5) - 2, 0, world.height - 1);
        const tile = tileByKey.get(makeTileKey(tileX, tileY));

        if (!tile || tile.has_blocker) {
          continue;
        }

        if (occupied.has(makeTileKey(tileX, tileY))) {
          continue;
        }

        const score = tile.water_level * 1.6 + tile.fertility * 1.1 - tile.danger_level * 2;
        if (!best || score > best.score) {
          best = { tileX, tileY, score };
        }
      }
    }

    if (best) {
      break;
    }
  }

  return best ?? { tileX: preferredX, tileY: preferredY, score: 0 };
}

function buildWorldSummaryRow(row: WorldRow & {
  npc_count: number;
  alive_npc_count: number;
  dead_npc_count: number;
  latest_live_session_id: string | null;
  latest_live_session_status: LiveSessionRow['status'] | null;
  latest_live_session_started_at: Date | null;
  latest_live_session_ended_at: Date | null;
  last_tick_started_at: Date | null;
}): WorldSummaryRow {
  return row;
}

async function loadTenantStreamerSubscription(
  db: SqlExecutor,
  handle: string,
): Promise<{ tenant: TenantRow; streamer: StreamerRow; subscription: SubscriptionRow | null; giftConnection: GiftSourceConnectionRow | null }> {
  const row = await queryOne<{
    tenant_id: string;
    tenant_name: string;
    tenant_handle: string;
    tenant_status: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
    streamer_id: string;
    streamer_email: string | null;
    streamer_display_name: string;
    streamer_handle: string;
    streamer_avatar_url: string | null;
    streamer_default_tiktok_id: string | null;
    streamer_password_hash: string;
    streamer_password_updated_at: Date;
    streamer_last_login_at: Date | null;
    streamer_is_active: boolean;
    streamer_created_at: Date;
    streamer_updated_at: Date;
    subscription_id: string | null;
    subscription_tenant_id: string | null;
    subscription_streamer_id: string | null;
    subscription_provider: string | null;
    subscription_provider_customer_id: string | null;
    subscription_provider_subscription_id: string | null;
    subscription_plan: SubscriptionRow['plan'] | null;
    subscription_status: SubscriptionRow['status'] | null;
    subscription_max_worlds: number | null;
    subscription_max_npcs_per_world: number | null;
    subscription_ai_narration_quota: number | null;
    subscription_current_period_start: Date | null;
    subscription_current_period_end: Date | null;
    subscription_cancel_at_period_end: boolean | null;
    subscription_created_at: Date | null;
    subscription_updated_at: Date | null;
    gift_connection_id: string | null;
    gift_connection_tenant_id: string | null;
    gift_connection_streamer_id: string | null;
    gift_connection_platform: string | null;
    gift_connection_connection_type: GiftSourceConnectionRow['connection_type'] | null;
    gift_connection_status: GiftSourceConnectionRow['status'] | null;
    gift_connection_encrypted_credentials: Record<string, unknown> | null;
    gift_connection_last_connected_at: Date | null;
    gift_connection_last_error: string | null;
    gift_connection_created_at: Date | null;
    gift_connection_updated_at: Date | null;
  }>(
    db,
    `
      select
        t.id as tenant_id,
        t.name as tenant_name,
        t.handle as tenant_handle,
        t.status as tenant_status,
        t.created_at as tenant_created_at,
        t.updated_at as tenant_updated_at,
        s.id as streamer_id,
        s.email as streamer_email,
        s.display_name as streamer_display_name,
        s.handle as streamer_handle,
        s.avatar_url as streamer_avatar_url,
        s.default_tiktok_id as streamer_default_tiktok_id,
        s.password_hash as streamer_password_hash,
        s.password_updated_at as streamer_password_updated_at,
        s.last_login_at as streamer_last_login_at,
        s.is_active as streamer_is_active,
        s.created_at as streamer_created_at,
        s.updated_at as streamer_updated_at,
        sub.id as subscription_id,
        sub.tenant_id as subscription_tenant_id,
        sub.streamer_id as subscription_streamer_id,
        sub.provider as subscription_provider,
        sub.provider_customer_id as subscription_provider_customer_id,
        sub.provider_subscription_id as subscription_provider_subscription_id,
        sub.plan as subscription_plan,
        sub.status as subscription_status,
        sub.max_worlds as subscription_max_worlds,
        sub.max_npcs_per_world as subscription_max_npcs_per_world,
        sub.ai_narration_quota as subscription_ai_narration_quota,
        sub.current_period_start as subscription_current_period_start,
        sub.current_period_end as subscription_current_period_end,
        sub.cancel_at_period_end as subscription_cancel_at_period_end,
        sub.created_at as subscription_created_at,
        sub.updated_at as subscription_updated_at,
        gsc.id as gift_connection_id,
        gsc.tenant_id as gift_connection_tenant_id,
        gsc.streamer_id as gift_connection_streamer_id,
        gsc.platform as gift_connection_platform,
        gsc.connection_type as gift_connection_connection_type,
        gsc.status as gift_connection_status,
        gsc.encrypted_credentials as gift_connection_encrypted_credentials,
        gsc.last_connected_at as gift_connection_last_connected_at,
        gsc.last_error as gift_connection_last_error,
        gsc.created_at as gift_connection_created_at,
        gsc.updated_at as gift_connection_updated_at
      from public.streamers s
      join public.tenants t on t.id = s.tenant_id
      left join public.streamer_subscriptions sub
        on sub.tenant_id = s.tenant_id
       and sub.streamer_id = s.id
      left join public.gift_source_connections gsc
        on gsc.tenant_id = s.tenant_id
       and gsc.streamer_id = s.id
      where s.handle = $1
      limit 1
    `,
    [handle],
  );

  if (!row) {
    throw notFound(`Streamer ${handle} が見つかりません`, { handle });
  }

  return {
    tenant: {
      id: row.tenant_id,
      name: row.tenant_name,
      handle: row.tenant_handle,
      status: row.tenant_status,
      created_at: row.tenant_created_at,
      updated_at: row.tenant_updated_at,
    },
    streamer: {
      id: row.streamer_id,
      tenant_id: row.tenant_id,
      email: row.streamer_email ?? '',
      display_name: row.streamer_display_name,
      handle: row.streamer_handle,
      avatar_url: row.streamer_avatar_url,
      default_tiktok_id: row.streamer_default_tiktok_id,
      password_hash: row.streamer_password_hash,
      password_updated_at: row.streamer_password_updated_at,
      last_login_at: row.streamer_last_login_at,
      is_active: row.streamer_is_active,
      created_at: row.streamer_created_at,
      updated_at: row.streamer_updated_at,
    },
    subscription: row.subscription_id
      ? {
          id: row.subscription_id,
          tenant_id: row.subscription_tenant_id ?? row.tenant_id,
          streamer_id: row.subscription_streamer_id ?? row.streamer_id,
          provider: row.subscription_provider ?? 'manual',
          provider_customer_id: row.subscription_provider_customer_id,
          provider_subscription_id: row.subscription_provider_subscription_id,
          plan: row.subscription_plan ?? 'free_trial',
          status: row.subscription_status ?? 'trialing',
          max_worlds: row.subscription_max_worlds ?? 1,
          max_npcs_per_world: row.subscription_max_npcs_per_world ?? 5,
          ai_narration_quota: row.subscription_ai_narration_quota ?? 0,
          current_period_start: row.subscription_current_period_start,
          current_period_end: row.subscription_current_period_end,
          cancel_at_period_end: row.subscription_cancel_at_period_end ?? false,
          created_at: row.subscription_created_at ?? row.tenant_created_at,
          updated_at: row.subscription_updated_at ?? row.tenant_updated_at,
        }
      : null,
    giftConnection: row.gift_connection_id
      ? {
          id: row.gift_connection_id,
          tenant_id: row.gift_connection_tenant_id ?? row.tenant_id,
          streamer_id: row.gift_connection_streamer_id ?? row.streamer_id,
          platform: row.gift_connection_platform ?? 'tiktok',
          connection_type: row.gift_connection_connection_type ?? 'dev_mock',
          status: row.gift_connection_status ?? 'not_connected',
          encrypted_credentials: row.gift_connection_encrypted_credentials,
          last_connected_at: row.gift_connection_last_connected_at,
          last_error: row.gift_connection_last_error,
          created_at: row.gift_connection_created_at ?? row.tenant_created_at,
          updated_at: row.gift_connection_updated_at ?? row.tenant_updated_at,
        }
      : null,
  };
}

async function loadWorldSummaries(
  db: SqlExecutor,
  tenantId: string,
  streamerId: string,
): Promise<WorldSummaryRow[]> {
  const rows = await queryMany<{
    id: string;
    tenant_id: string;
    streamer_id: string;
    name: string;
    width: number;
    height: number;
    tick_interval_seconds: number;
    current_tick: number;
    world_seed: string;
    status: WorldSummaryRow['status'];
    created_at: Date;
    updated_at: Date;
    npc_count: number;
    alive_npc_count: number;
    dead_npc_count: number;
    latest_live_session_id: string | null;
    latest_live_session_status: LiveSessionRow['status'] | null;
    latest_live_session_started_at: Date | null;
    latest_live_session_ended_at: Date | null;
    last_tick_started_at: Date | null;
  }>(
    db,
    `
      select
        w.id,
        w.tenant_id,
        w.streamer_id,
        w.name,
        w.width,
        w.height,
        w.tick_interval_seconds,
        w.current_tick,
        w.world_seed,
        w.status,
        w.created_at,
        w.updated_at,
        coalesce(npc_counts.npc_count, 0)::int as npc_count,
        coalesce(npc_counts.alive_npc_count, 0)::int as alive_npc_count,
        coalesce(npc_counts.dead_npc_count, 0)::int as dead_npc_count,
        latest_session.id as latest_live_session_id,
        latest_session.status as latest_live_session_status,
        latest_session.started_at as latest_live_session_started_at,
        latest_session.ended_at as latest_live_session_ended_at,
        latest_tick.started_at as last_tick_started_at
      from public.worlds w
      left join lateral (
        select
          count(*)::int as npc_count,
          count(*) filter (where n.status = 'alive')::int as alive_npc_count,
          count(*) filter (where n.status = 'dead')::int as dead_npc_count
        from public.npcs n
        where n.world_id = w.id
          and n.tenant_id = w.tenant_id
          and n.streamer_id = w.streamer_id
      ) npc_counts on true
      left join lateral (
        select
          ls.id,
          ls.status,
          ls.started_at,
          ls.ended_at
        from public.live_sessions ls
        where ls.world_id = w.id
          and ls.tenant_id = w.tenant_id
          and ls.streamer_id = w.streamer_id
        order by ls.created_at desc
        limit 1
      ) latest_session on true
      left join lateral (
        select wt.started_at
        from public.world_ticks wt
        where wt.world_id = w.id
        order by wt.tick desc
        limit 1
      ) latest_tick on true
      where w.tenant_id = $1
        and w.streamer_id = $2
      order by case
        when w.id = $3 then 0
        when w.status = 'live' then 1
        when w.status = 'active' then 2
        else 3
      end, w.created_at asc
    `,
    [tenantId, streamerId, env.DEFAULT_WORLD_ID],
  );

  return rows.map(buildWorldSummaryRow);
}

export async function loadStreamerContext(db: SqlExecutor, handle: string): Promise<StreamerContextResult> {
  const base = await loadTenantStreamerSubscription(db, handle);
  const worlds = await loadWorldSummaries(db, base.tenant.id, base.streamer.id);
  const primaryWorld = resolvePrimaryWorld(worlds);
  const latestLiveSession = await loadCurrentLiveSessionForStreamer(db, base.tenant.id, base.streamer.id);
  const planLimits = getPlanLimits(base.subscription?.plan);
  const usageWindow = resolveUsageWindow(base.subscription);

  const counts = await queryOne<{
    world_count: number;
    live_session_count: number;
    live_sessions_this_month: number;
    viewer_user_count: number;
    npc_count: number;
  }>(
    db,
    `
      select
        (select count(*)::int from public.worlds w where w.tenant_id = $1 and w.streamer_id = $2) as world_count,
        (select count(*)::int from public.live_sessions ls where ls.tenant_id = $1 and ls.streamer_id = $2) as live_session_count,
        (select count(*)::int
           from public.live_sessions ls
          where ls.tenant_id = $1
            and ls.streamer_id = $2
            and ls.started_at >= $3
            and ls.started_at < $4) as live_sessions_this_month,
        (select count(*)::int from public.viewer_users vu where vu.tenant_id = $1 and vu.streamer_id = $2) as viewer_user_count,
        (select count(*)::int from public.npcs n where n.tenant_id = $1 and n.streamer_id = $2) as npc_count
    `,
    [base.tenant.id, base.streamer.id, usageWindow.start, usageWindow.end],
  );

  return {
    ...base,
    giftConnection: base.giftConnection,
    planLimits,
    stats: {
      worldCount: counts?.world_count ?? worlds.length,
      liveSessionCount: counts?.live_session_count ?? 0,
      liveSessionsThisMonth: counts?.live_sessions_this_month ?? 0,
      viewerUserCount: counts?.viewer_user_count ?? 0,
      npcCount: counts?.npc_count ?? 0,
      aiNarrationUsed: 0,
      aiNarrationRemaining: planLimits.aiNarrationQuota,
    },
    worlds,
    primaryWorld,
    latestLiveSession,
  };
}

export async function loadStreamerAuthByEmail(db: SqlExecutor, email: string): Promise<StreamerAuthResult | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const row = await queryOne<{
    tenant_id: string;
    tenant_name: string;
    tenant_handle: string;
    tenant_status: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
    streamer_id: string;
    streamer_email: string;
    streamer_display_name: string;
    streamer_handle: string;
    streamer_avatar_url: string | null;
    streamer_default_tiktok_id: string | null;
    streamer_password_hash: string;
    streamer_password_updated_at: Date;
    streamer_last_login_at: Date | null;
    streamer_is_active: boolean;
    streamer_created_at: Date;
    streamer_updated_at: Date;
    subscription_id: string | null;
    subscription_tenant_id: string | null;
    subscription_streamer_id: string | null;
    subscription_provider: string | null;
    subscription_provider_customer_id: string | null;
    subscription_provider_subscription_id: string | null;
    subscription_plan: SubscriptionRow['plan'] | null;
    subscription_status: SubscriptionRow['status'] | null;
    subscription_max_worlds: number | null;
    subscription_max_npcs_per_world: number | null;
    subscription_ai_narration_quota: number | null;
    subscription_current_period_start: Date | null;
    subscription_current_period_end: Date | null;
    subscription_cancel_at_period_end: boolean | null;
    subscription_created_at: Date | null;
    subscription_updated_at: Date | null;
  }>(
    db,
    `
      select
        t.id as tenant_id,
        t.name as tenant_name,
        t.handle as tenant_handle,
        t.status as tenant_status,
        t.created_at as tenant_created_at,
        t.updated_at as tenant_updated_at,
        s.id as streamer_id,
        s.email as streamer_email,
        s.display_name as streamer_display_name,
        s.handle as streamer_handle,
        s.avatar_url as streamer_avatar_url,
        s.default_tiktok_id as streamer_default_tiktok_id,
        s.password_hash as streamer_password_hash,
        s.password_updated_at as streamer_password_updated_at,
        s.last_login_at as streamer_last_login_at,
        s.is_active as streamer_is_active,
        s.created_at as streamer_created_at,
        s.updated_at as streamer_updated_at,
        sub.id as subscription_id,
        sub.tenant_id as subscription_tenant_id,
        sub.streamer_id as subscription_streamer_id,
        sub.provider as subscription_provider,
        sub.provider_customer_id as subscription_provider_customer_id,
        sub.provider_subscription_id as subscription_provider_subscription_id,
        sub.plan as subscription_plan,
        sub.status as subscription_status,
        sub.max_worlds as subscription_max_worlds,
        sub.max_npcs_per_world as subscription_max_npcs_per_world,
        sub.ai_narration_quota as subscription_ai_narration_quota,
        sub.current_period_start as subscription_current_period_start,
        sub.current_period_end as subscription_current_period_end,
        sub.cancel_at_period_end as subscription_cancel_at_period_end,
        sub.created_at as subscription_created_at,
        sub.updated_at as subscription_updated_at
      from public.streamers s
      join public.tenants t on t.id = s.tenant_id
      left join public.streamer_subscriptions sub
        on sub.tenant_id = s.tenant_id
       and sub.streamer_id = s.id
      where lower(s.email) = $1
      limit 1
    `,
    [normalizedEmail],
  );

  if (!row) {
    return null;
  }

  return {
    tenant: {
      id: row.tenant_id,
      name: row.tenant_name,
      handle: row.tenant_handle,
      status: row.tenant_status,
      created_at: row.tenant_created_at,
      updated_at: row.tenant_updated_at,
    },
    streamer: {
      id: row.streamer_id,
      tenant_id: row.tenant_id,
      email: row.streamer_email,
      display_name: row.streamer_display_name,
      handle: row.streamer_handle,
      avatar_url: row.streamer_avatar_url,
      default_tiktok_id: row.streamer_default_tiktok_id,
      password_hash: row.streamer_password_hash,
      password_updated_at: row.streamer_password_updated_at,
      last_login_at: row.streamer_last_login_at,
      is_active: row.streamer_is_active,
      created_at: row.streamer_created_at,
      updated_at: row.streamer_updated_at,
    },
    subscription: row.subscription_id
      ? {
          id: row.subscription_id,
          tenant_id: row.subscription_tenant_id ?? row.tenant_id,
          streamer_id: row.subscription_streamer_id ?? row.streamer_id,
          provider: row.subscription_provider ?? 'manual',
          provider_customer_id: row.subscription_provider_customer_id,
          provider_subscription_id: row.subscription_provider_subscription_id,
          plan: row.subscription_plan ?? 'free_trial',
          status: row.subscription_status ?? 'trialing',
          max_worlds: row.subscription_max_worlds ?? 1,
          max_npcs_per_world: row.subscription_max_npcs_per_world ?? 5,
          ai_narration_quota: row.subscription_ai_narration_quota ?? 0,
          current_period_start: row.subscription_current_period_start,
          current_period_end: row.subscription_current_period_end,
          cancel_at_period_end: row.subscription_cancel_at_period_end ?? false,
          created_at: row.subscription_created_at ?? row.tenant_created_at,
          updated_at: row.subscription_updated_at ?? row.tenant_updated_at,
        }
      : null,
  };
}

export async function loadStreamerSessionByTokenHash(
  db: SqlExecutor,
  sessionTokenHash: string,
): Promise<StreamerSessionAuthResult | null> {
  const row = await queryOne<{
    session_id: string;
    session_tenant_id: string;
    session_streamer_id: string;
    session_token_hash: string;
    session_expires_at: Date;
    session_revoked_at: Date | null;
    session_last_seen_at: Date;
    session_created_at: Date;
    session_updated_at: Date;
    tenant_name: string;
    tenant_handle: string;
    tenant_status: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
    streamer_email: string;
    streamer_display_name: string;
    streamer_handle: string;
    streamer_avatar_url: string | null;
    streamer_default_tiktok_id: string | null;
    streamer_password_hash: string;
    streamer_password_updated_at: Date;
    streamer_last_login_at: Date | null;
    streamer_is_active: boolean;
    streamer_created_at: Date;
    streamer_updated_at: Date;
    subscription_id: string | null;
    subscription_tenant_id: string | null;
    subscription_streamer_id: string | null;
    subscription_provider: string | null;
    subscription_provider_customer_id: string | null;
    subscription_provider_subscription_id: string | null;
    subscription_plan: SubscriptionRow['plan'] | null;
    subscription_status: SubscriptionRow['status'] | null;
    subscription_max_worlds: number | null;
    subscription_max_npcs_per_world: number | null;
    subscription_ai_narration_quota: number | null;
    subscription_current_period_start: Date | null;
    subscription_current_period_end: Date | null;
    subscription_cancel_at_period_end: boolean | null;
    subscription_created_at: Date | null;
    subscription_updated_at: Date | null;
  }>(
    db,
    `
      select
        ss.id as session_id,
        ss.tenant_id as session_tenant_id,
        ss.streamer_id as session_streamer_id,
        ss.session_token_hash,
        ss.expires_at as session_expires_at,
        ss.revoked_at as session_revoked_at,
        ss.last_seen_at as session_last_seen_at,
        ss.created_at as session_created_at,
        ss.updated_at as session_updated_at,
        t.name as tenant_name,
        t.handle as tenant_handle,
        t.status as tenant_status,
        t.created_at as tenant_created_at,
        t.updated_at as tenant_updated_at,
        s.email as streamer_email,
        s.display_name as streamer_display_name,
        s.handle as streamer_handle,
        s.avatar_url as streamer_avatar_url,
        s.default_tiktok_id as streamer_default_tiktok_id,
        s.password_hash as streamer_password_hash,
        s.password_updated_at as streamer_password_updated_at,
        s.last_login_at as streamer_last_login_at,
        s.is_active as streamer_is_active,
        s.created_at as streamer_created_at,
        s.updated_at as streamer_updated_at,
        sub.id as subscription_id,
        sub.tenant_id as subscription_tenant_id,
        sub.streamer_id as subscription_streamer_id,
        sub.provider as subscription_provider,
        sub.provider_customer_id as subscription_provider_customer_id,
        sub.provider_subscription_id as subscription_provider_subscription_id,
        sub.plan as subscription_plan,
        sub.status as subscription_status,
        sub.max_worlds as subscription_max_worlds,
        sub.max_npcs_per_world as subscription_max_npcs_per_world,
        sub.ai_narration_quota as subscription_ai_narration_quota,
        sub.current_period_start as subscription_current_period_start,
        sub.current_period_end as subscription_current_period_end,
        sub.cancel_at_period_end as subscription_cancel_at_period_end,
        sub.created_at as subscription_created_at,
        sub.updated_at as subscription_updated_at
      from public.streamer_sessions ss
      join public.streamers s on s.id = ss.streamer_id
      join public.tenants t on t.id = ss.tenant_id
      left join public.streamer_subscriptions sub
        on sub.tenant_id = ss.tenant_id
       and sub.streamer_id = ss.streamer_id
      where ss.session_token_hash = $1
        and ss.revoked_at is null
        and ss.expires_at > now()
        and s.is_active = true
      limit 1
    `,
    [sessionTokenHash],
  );

  if (!row) {
    return null;
  }

  await db.query(
    `
      update public.streamer_sessions
      set last_seen_at = now(),
          updated_at = now()
      where id = $1
    `,
    [row.session_id],
  );

  return {
    session: {
      id: row.session_id,
      tenant_id: row.session_tenant_id,
      streamer_id: row.session_streamer_id,
      session_token_hash: row.session_token_hash,
      expires_at: row.session_expires_at,
      revoked_at: row.session_revoked_at,
      last_seen_at: row.session_last_seen_at,
      created_at: row.session_created_at,
      updated_at: row.session_updated_at,
    },
    tenant: {
      id: row.session_tenant_id,
      name: row.tenant_name,
      handle: row.tenant_handle,
      status: row.tenant_status,
      created_at: row.tenant_created_at,
      updated_at: row.tenant_updated_at,
    },
    streamer: {
      id: row.session_streamer_id,
      tenant_id: row.session_tenant_id,
      email: row.streamer_email,
      display_name: row.streamer_display_name,
      handle: row.streamer_handle,
      avatar_url: row.streamer_avatar_url,
      default_tiktok_id: row.streamer_default_tiktok_id,
      password_hash: row.streamer_password_hash,
      password_updated_at: row.streamer_password_updated_at,
      last_login_at: row.streamer_last_login_at,
      is_active: row.streamer_is_active,
      created_at: row.streamer_created_at,
      updated_at: row.streamer_updated_at,
    },
    subscription: row.subscription_id
      ? {
          id: row.subscription_id,
          tenant_id: row.subscription_tenant_id ?? row.session_tenant_id,
          streamer_id: row.subscription_streamer_id ?? row.session_streamer_id,
          provider: row.subscription_provider ?? 'manual',
          provider_customer_id: row.subscription_provider_customer_id,
          provider_subscription_id: row.subscription_provider_subscription_id,
          plan: row.subscription_plan ?? 'free_trial',
          status: row.subscription_status ?? 'trialing',
          max_worlds: row.subscription_max_worlds ?? 1,
          max_npcs_per_world: row.subscription_max_npcs_per_world ?? 5,
          ai_narration_quota: row.subscription_ai_narration_quota ?? 0,
          current_period_start: row.subscription_current_period_start,
          current_period_end: row.subscription_current_period_end,
          cancel_at_period_end: row.subscription_cancel_at_period_end ?? false,
          created_at: row.subscription_created_at ?? row.tenant_created_at,
          updated_at: row.subscription_updated_at ?? row.tenant_updated_at,
        }
      : null,
  };
}

async function isHandleTaken(db: SqlExecutor, handle: string): Promise<boolean> {
  const row = await queryOne<{
    tenant_exists: boolean;
    streamer_exists: boolean;
  }>(
    db,
    `
      select
        exists(select 1 from public.tenants where handle = $1) as tenant_exists,
        exists(select 1 from public.streamers where handle = $1) as streamer_exists
    `,
    [handle],
  );

  return Boolean(row?.tenant_exists || row?.streamer_exists);
}

async function allocateStreamerHandle(db: SqlExecutor, source: string): Promise<string> {
  const base = normalizeHandle(source.split('@')[0] ?? source);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!(await isHandleTaken(db, candidate))) {
      return candidate;
    }
  }

  throw conflict('配信者ハンドルを生成できませんでした', { base });
}

export async function createRegisteredStreamerAccount(
  db: SqlExecutor,
  input: {
    email: string;
    password: string;
    displayName?: string | null;
  },
): Promise<RegisteredStreamerResult> {
  const email = input.email.trim().toLowerCase();
  const displayName = getTextValue(input.displayName, email.split('@')[0] ?? 'streamer');

  return withTransaction(async (client) => {
    const existing = await loadStreamerAuthByEmail(client, email);
    if (existing) {
      throw conflict('このメールアドレスは既に登録されています', { email });
    }

    const handle = await allocateStreamerHandle(client, email);
    const tenantId = randomUUID();
    const streamerId = randomUUID();
    const worldId = randomUUID();
    const now = new Date();
    const passwordHashRow = ensureNonNull(
      await queryOne<{ password_hash: string }>(
        client,
        `select crypt($1, gen_salt('bf')) as password_hash`,
        [input.password],
      ),
      'パスワードのハッシュ化に失敗しました',
    );

    const tenant = ensureNonNull(
      await queryOne<TenantRow>(
        client,
        `
          insert into public.tenants (id, name, handle, status, created_at, updated_at)
          values ($1, $2, $3, 'active', $4, $5)
          returning id, name, handle, status, created_at, updated_at
        `,
        [tenantId, displayName, handle, now, now],
      ),
      'tenant の作成に失敗しました',
    );

    const streamer = ensureNonNull(
      await queryOne<StreamerRow>(
        client,
        `
          insert into public.streamers (
            id,
            tenant_id,
            email,
            display_name,
            handle,
            avatar_url,
            default_tiktok_id,
            password_hash,
            password_updated_at,
            last_login_at,
            is_active,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, null, null, $6, $7, null, true, $8, $9)
          returning
            id,
            tenant_id,
            email,
            display_name,
            handle,
            avatar_url,
            default_tiktok_id,
            password_hash,
            password_updated_at,
            last_login_at,
            is_active,
            created_at,
            updated_at
        `,
        [streamerId, tenant.id, email, displayName, handle, passwordHashRow.password_hash, now, now, now],
      ),
      'streamer の作成に失敗しました',
    );

    const subscriptionPlan: SubscriptionRow['plan'] = 'free_trial';
    const subscriptionLimits = getPlanLimits(subscriptionPlan);

    await queryOne(
      client,
      `
        insert into public.streamer_members (tenant_id, streamer_id, role)
        values ($1, $2, 'owner')
        on conflict (tenant_id, streamer_id) do nothing
        returning id
      `,
      [tenant.id, streamer.id],
    );

    const subscription = ensureNonNull(
      await queryOne<SubscriptionRow>(
        client,
        `
          insert into public.streamer_subscriptions (
            tenant_id,
            streamer_id,
            provider,
            plan,
            status,
            max_worlds,
            max_npcs_per_world,
            ai_narration_quota,
            current_period_start,
            current_period_end,
            cancel_at_period_end,
            created_at,
            updated_at
          )
          values ($1, $2, 'manual', $3, 'trialing', $4, $5, $6, $7, $8, false, $9, $10)
          returning
            id,
            tenant_id,
            streamer_id,
            provider,
            provider_customer_id,
            provider_subscription_id,
            plan,
            status,
            max_worlds,
            max_npcs_per_world,
            ai_narration_quota,
            current_period_start,
            current_period_end,
            cancel_at_period_end,
            created_at,
            updated_at
        `,
        [
          tenant.id,
          streamer.id,
          subscriptionPlan,
          subscriptionLimits.maxWorlds,
          subscriptionLimits.maxNpcsPerWorld,
          subscriptionLimits.aiNarrationQuota,
          now,
          null,
          now,
          now,
        ],
      ),
      'subscription の作成に失敗しました',
    );

    await queryOne(
      client,
      `
        insert into public.gift_source_connections (
          tenant_id,
          streamer_id,
          platform,
          connection_type,
          status,
          encrypted_credentials,
          last_connected_at,
          last_error,
          created_at,
          updated_at
        )
        values ($1, $2, 'tiktok', 'dev_mock', 'not_connected', $3, null, null, $4, $5)
        on conflict (tenant_id, streamer_id)
        do update set
          platform = excluded.platform,
          connection_type = excluded.connection_type,
          status = excluded.status,
          encrypted_credentials = excluded.encrypted_credentials,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
        returning id
      `,
      [
        tenant.id,
        streamer.id,
        { seed: true, source: 'registration', adapterType: 'dev_mock' },
        now,
        now,
      ],
    );

    const worldCount = ensureNonNull(
      await queryOne<{ world_count: number }>(
        client,
        `
          select count(*)::int as world_count
          from public.worlds
          where tenant_id = $1
            and streamer_id = $2
        `,
        [tenant.id, streamer.id],
      ),
      'world_count の取得に失敗しました',
    );

    ensureWorldCreationWithinPlan(worldCount.world_count, subscription);

    const world = ensureNonNull(
      await queryOne<WorldRow>(
        client,
        `
          insert into public.worlds (
            id,
            tenant_id,
            streamer_id,
            name,
            width,
            height,
            tick_interval_seconds,
            current_tick,
            world_seed,
            status,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, 64, 64, $5, 0, $6, 'active', $7, $8)
          returning
            id,
            tenant_id,
            streamer_id,
            name,
            width,
            height,
            tick_interval_seconds,
            current_tick,
            world_seed,
            status,
            created_at,
            updated_at
        `,
        [
          worldId,
          tenant.id,
          streamer.id,
          `荒土世界 ${displayName}`,
          env.LIVE_WORLD_TICK_INTERVAL_SECONDS,
          `${handle}-seed-v2`,
          now,
          now,
        ],
      ),
      'world の作成に失敗しました',
    );

    return {
      tenant,
      streamer,
      subscription,
      world,
    };
  });
}

export async function updateStreamerSubscriptionState(
  db: SqlExecutor,
  input: {
    streamerHandle: string;
    plan?: SubscriptionRow['plan'];
    status?: SubscriptionRow['status'];
    provider?: string;
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
  },
): Promise<SubscriptionRow> {
  return withTransaction(async (client) => {
    const context = await loadTenantStreamerSubscription(client, input.streamerHandle);
    const existing = ensureNonNull(context.subscription, `subscription ${input.streamerHandle} が見つかりません`);
    const effectivePlan = input.plan ?? existing.plan;
    const effectiveStatus = input.status ?? existing.status;
    const limits = getPlanLimits(effectivePlan);

    const subscription = ensureNonNull(
      await queryOne<SubscriptionRow>(
        client,
        `
          update public.streamer_subscriptions
          set provider = $1,
              provider_customer_id = $2,
              provider_subscription_id = $3,
              plan = $4,
              status = $5,
              max_worlds = $6,
              max_npcs_per_world = $7,
              ai_narration_quota = $8,
              current_period_start = $9,
              current_period_end = $10,
              cancel_at_period_end = $11,
              updated_at = now()
          where tenant_id = $12
            and streamer_id = $13
          returning
            id,
            tenant_id,
            streamer_id,
            provider,
            provider_customer_id,
            provider_subscription_id,
            plan,
            status,
            max_worlds,
            max_npcs_per_world,
            ai_narration_quota,
            current_period_start,
            current_period_end,
            cancel_at_period_end,
            created_at,
            updated_at
        `,
        [
          input.provider === undefined ? existing.provider : input.provider,
          input.providerCustomerId === undefined ? existing.provider_customer_id : input.providerCustomerId,
          input.providerSubscriptionId === undefined ? existing.provider_subscription_id : input.providerSubscriptionId,
          effectivePlan,
          effectiveStatus,
          limits.maxWorlds,
          limits.maxNpcsPerWorld,
          limits.aiNarrationQuota,
          input.currentPeriodStart === undefined ? existing.current_period_start : input.currentPeriodStart,
          input.currentPeriodEnd === undefined ? existing.current_period_end : input.currentPeriodEnd,
          input.cancelAtPeriodEnd === undefined ? existing.cancel_at_period_end : input.cancelAtPeriodEnd,
          context.tenant.id,
          context.streamer.id,
        ],
      ),
      `subscription ${input.streamerHandle} の更新に失敗しました`,
    );

    return subscription;
  });
}

export async function updateStreamerSubscriptionPlan(
  db: SqlExecutor,
  input: {
    streamerHandle: string;
    plan: SubscriptionRow['plan'];
    status: SubscriptionRow['status'];
  },
): Promise<SubscriptionRow> {
  return updateStreamerSubscriptionState(db, {
    streamerHandle: input.streamerHandle,
    plan: input.plan,
    status: input.status,
  });
}

export async function updateGiftSourceConnection(
  db: SqlExecutor,
  input: {
    streamerHandle: string;
    platform?: string;
    connectionType?: GiftSourceConnectionRow['connection_type'];
    status?: GiftSourceConnectionRow['status'];
    encryptedCredentials?: Record<string, unknown> | null;
    lastConnectedAt?: Date | null;
    lastError?: string | null;
  },
): Promise<GiftSourceConnectionRow> {
  return withTransaction(async (client) => {
    const context = await loadStreamerContext(client, input.streamerHandle);
    const existing = context.giftConnection;
    const now = new Date();

    const row = ensureNonNull(
      await queryOne<GiftSourceConnectionRow>(
        client,
        `
          insert into public.gift_source_connections (
            id,
            tenant_id,
            streamer_id,
            platform,
            connection_type,
            status,
            encrypted_credentials,
            last_connected_at,
            last_error,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, now()), $11)
          on conflict (tenant_id, streamer_id)
          do update set
            platform = excluded.platform,
            connection_type = excluded.connection_type,
            status = excluded.status,
            encrypted_credentials = excluded.encrypted_credentials,
            last_connected_at = excluded.last_connected_at,
            last_error = excluded.last_error,
            updated_at = excluded.updated_at
          returning
            id,
            tenant_id,
            streamer_id,
            platform,
            connection_type,
            status,
            encrypted_credentials,
            last_connected_at,
            last_error,
            created_at,
            updated_at
        `,
        [
          existing?.id ?? randomUUID(),
          context.tenant.id,
          context.streamer.id,
          input.platform ?? existing?.platform ?? 'tiktok',
          input.connectionType ?? existing?.connection_type ?? 'dev_mock',
          input.status ?? existing?.status ?? 'not_connected',
          input.encryptedCredentials === undefined ? existing?.encrypted_credentials ?? null : input.encryptedCredentials,
          input.lastConnectedAt === undefined ? existing?.last_connected_at ?? null : input.lastConnectedAt,
          input.lastError === undefined ? existing?.last_error ?? null : input.lastError,
          existing?.created_at ?? now,
          now,
        ],
      ),
      `gift_source_connection ${input.streamerHandle} の更新に失敗しました`,
    );

    return row;
  });
}

export async function recordBillingEvent(
  db: SqlExecutor,
  input: {
    tenantId: string;
    streamerId: string;
    subscriptionId?: string | null;
    provider?: string;
    providerEventId: string;
    providerSessionId?: string | null;
    eventType: string;
    status?: BillingEventRow['status'];
    payload: Record<string, unknown>;
  },
): Promise<BillingEventRow> {
  const row = await queryOne<BillingEventRow>(
    db,
    `
      insert into public.billing_events (
        id,
        tenant_id,
        streamer_id,
        subscription_id,
        provider,
        provider_event_id,
        provider_session_id,
        event_type,
        status,
        payload,
        created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      on conflict (provider_event_id)
      do update set
        tenant_id = excluded.tenant_id,
        streamer_id = excluded.streamer_id,
        subscription_id = excluded.subscription_id,
        provider = excluded.provider,
        provider_session_id = excluded.provider_session_id,
        event_type = excluded.event_type,
        status = excluded.status,
        payload = excluded.payload
      returning
        id,
        tenant_id,
        streamer_id,
        subscription_id,
        provider,
        provider_event_id,
        provider_session_id,
        event_type,
        status,
        payload,
        created_at
    `,
    [
      randomUUID(),
      input.tenantId,
      input.streamerId,
      input.subscriptionId ?? null,
      input.provider ?? 'mock_stripe',
      input.providerEventId,
      input.providerSessionId ?? null,
      input.eventType,
      input.status ?? 'received',
      input.payload,
    ],
  );

  return ensureNonNull(row, 'billing_event の作成に失敗しました');
}

export async function listBillingEventsForStreamer(
  db: SqlExecutor,
  input: {
    tenantId: string;
    streamerId: string;
    limit?: number;
  },
): Promise<BillingEventRow[]> {
  return queryMany<BillingEventRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        subscription_id,
        provider,
        provider_event_id,
        provider_session_id,
        event_type,
        status,
        payload,
        created_at
      from public.billing_events
      where tenant_id = $1
        and streamer_id = $2
      order by created_at desc
      limit $3
    `,
    [input.tenantId, input.streamerId, input.limit ?? 20],
  );
}

export async function loadStreamerById(db: SqlExecutor, streamerId: string): Promise<StreamerRow | null> {
  return queryOne<StreamerRow>(
    db,
    `
      select
        id,
        tenant_id,
        email,
        display_name,
        handle,
        avatar_url,
        default_tiktok_id,
        password_hash,
        password_updated_at,
        last_login_at,
        is_active,
        created_at,
        updated_at
      from public.streamers
      where id = $1
      limit 1
    `,
    [streamerId],
  );
}

export async function updateStreamerOperationalStatus(
  db: SqlExecutor,
  input: {
    streamerId: string;
    isActive: boolean;
  },
): Promise<void> {
  await withTransaction(async (client) => {
    const streamer = ensureNonNull(
      await loadStreamerById(client, input.streamerId),
      `streamer ${input.streamerId} が見つかりません`,
    );

    await client.query(
      `
        update public.streamers
        set is_active = $1,
            updated_at = now()
        where id = $2
      `,
      [input.isActive, streamer.id],
    );

    await client.query(
      `
        update public.tenants
        set status = $1,
            updated_at = now()
        where id = $2
      `,
      [input.isActive ? 'active' : 'paused', streamer.tenant_id],
    );

    if (!input.isActive) {
      await client.query(
        `
          update public.streamer_sessions
          set revoked_at = now(),
              updated_at = now()
          where streamer_id = $1
            and revoked_at is null
        `,
        [streamer.id],
      );
    }
  });
}

export async function loadWorldById(db: SqlExecutor, worldId: string): Promise<WorldRow | null> {
  return queryOne<WorldRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        name,
        width,
        height,
        tick_interval_seconds,
        current_tick,
        world_seed,
        status,
        created_at,
        updated_at
      from public.worlds
      where id = $1
      limit 1
    `,
    [worldId],
  );
}

export async function loadCurrentLiveSessionForWorld(db: SqlExecutor, worldId: string): Promise<LiveSessionRow | null> {
  return queryOne<LiveSessionRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        platform,
        platform_live_id,
        status,
        started_at,
        ended_at,
        viewer_count_peak,
        gift_count,
        metadata,
        created_at
      from public.live_sessions
      where world_id = $1
        and status = 'live'
        and ended_at is null
      order by case
        when status = 'live' then 0
        when status = 'connecting' then 1
        when status = 'created' then 2
        else 3
      end, created_at desc
      limit 1
    `,
    [worldId],
  );
}

export async function loadLatestLiveSessionForWorld(db: SqlExecutor, worldId: string): Promise<LiveSessionRow | null> {
  return queryOne<LiveSessionRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        platform,
        platform_live_id,
        status,
        started_at,
        ended_at,
        viewer_count_peak,
        gift_count,
        metadata,
        created_at
      from public.live_sessions
      where world_id = $1
      order by created_at desc
      limit 1
    `,
    [worldId],
  );
}

export async function loadCurrentLiveSessionForStreamer(
  db: SqlExecutor,
  tenantId: string,
  streamerId: string,
): Promise<LiveSessionRow | null> {
  return queryOne<LiveSessionRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        platform,
        platform_live_id,
        status,
        started_at,
        ended_at,
        viewer_count_peak,
        gift_count,
        metadata,
        created_at
      from public.live_sessions
      where tenant_id = $1
        and streamer_id = $2
        and status = 'live'
        and ended_at is null
      order by started_at desc, created_at desc
      limit 1
    `,
    [tenantId, streamerId],
  );
}

export async function loadLiveSessionById(db: SqlExecutor, liveSessionId: string): Promise<LiveSessionRow | null> {
  return queryOne<LiveSessionRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        platform,
        platform_live_id,
        status,
        started_at,
        ended_at,
        viewer_count_peak,
        gift_count,
        metadata,
        created_at
      from public.live_sessions
      where id = $1
      limit 1
    `,
    [liveSessionId],
  );
}

async function loadWorldIdentity(db: SqlExecutor, worldId: string): Promise<{
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  giftConnection: GiftSourceConnectionRow | null;
  world: WorldRow;
  liveSession: LiveSessionRow | null;
  latestLiveSession: LiveSessionRow | null;
}> {
  const world = await loadWorldById(db, worldId);

  if (!world) {
    throw notFound(`World ${worldId} が見つかりません`, { worldId });
  }

  const tenantStreamer = await queryOne<{
    tenant_id: string;
    tenant_name: string;
    tenant_handle: string;
    tenant_status: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
    streamer_id: string;
    streamer_email: string | null;
    streamer_display_name: string;
    streamer_handle: string;
    streamer_avatar_url: string | null;
    streamer_default_tiktok_id: string | null;
    streamer_password_hash: string;
    streamer_password_updated_at: Date;
    streamer_last_login_at: Date | null;
    streamer_is_active: boolean;
    streamer_created_at: Date;
    streamer_updated_at: Date;
    subscription_id: string | null;
    subscription_provider: string | null;
    subscription_provider_customer_id: string | null;
    subscription_provider_subscription_id: string | null;
    subscription_plan: SubscriptionRow['plan'] | null;
    subscription_status: SubscriptionRow['status'] | null;
    subscription_max_worlds: number | null;
    subscription_max_npcs_per_world: number | null;
    subscription_ai_narration_quota: number | null;
    subscription_current_period_start: Date | null;
    subscription_current_period_end: Date | null;
    subscription_cancel_at_period_end: boolean | null;
    subscription_created_at: Date | null;
    subscription_updated_at: Date | null;
    gift_connection_id: string | null;
    gift_connection_tenant_id: string | null;
    gift_connection_streamer_id: string | null;
    gift_connection_platform: string | null;
    gift_connection_connection_type: GiftSourceConnectionRow['connection_type'] | null;
    gift_connection_status: GiftSourceConnectionRow['status'] | null;
    gift_connection_encrypted_credentials: Record<string, unknown> | null;
    gift_connection_last_connected_at: Date | null;
    gift_connection_last_error: string | null;
    gift_connection_created_at: Date | null;
    gift_connection_updated_at: Date | null;
  }>(
    db,
    `
      select
        t.id as tenant_id,
        t.name as tenant_name,
        t.handle as tenant_handle,
        t.status as tenant_status,
        t.created_at as tenant_created_at,
        t.updated_at as tenant_updated_at,
        s.id as streamer_id,
        s.email as streamer_email,
        s.display_name as streamer_display_name,
        s.handle as streamer_handle,
        s.avatar_url as streamer_avatar_url,
        s.default_tiktok_id as streamer_default_tiktok_id,
        s.password_hash as streamer_password_hash,
        s.password_updated_at as streamer_password_updated_at,
        s.last_login_at as streamer_last_login_at,
        s.is_active as streamer_is_active,
        s.created_at as streamer_created_at,
        s.updated_at as streamer_updated_at,
        sub.id as subscription_id,
        sub.provider as subscription_provider,
        sub.provider_customer_id as subscription_provider_customer_id,
        sub.provider_subscription_id as subscription_provider_subscription_id,
        sub.plan as subscription_plan,
        sub.status as subscription_status,
        sub.max_worlds as subscription_max_worlds,
        sub.max_npcs_per_world as subscription_max_npcs_per_world,
        sub.ai_narration_quota as subscription_ai_narration_quota,
        sub.current_period_start as subscription_current_period_start,
        sub.current_period_end as subscription_current_period_end,
        sub.cancel_at_period_end as subscription_cancel_at_period_end,
        sub.created_at as subscription_created_at,
        sub.updated_at as subscription_updated_at,
        gsc.id as gift_connection_id,
        gsc.tenant_id as gift_connection_tenant_id,
        gsc.streamer_id as gift_connection_streamer_id,
        gsc.platform as gift_connection_platform,
        gsc.connection_type as gift_connection_connection_type,
        gsc.status as gift_connection_status,
        gsc.encrypted_credentials as gift_connection_encrypted_credentials,
        gsc.last_connected_at as gift_connection_last_connected_at,
        gsc.last_error as gift_connection_last_error,
        gsc.created_at as gift_connection_created_at,
        gsc.updated_at as gift_connection_updated_at
      from public.tenants t
      join public.streamers s on s.tenant_id = t.id
      left join public.streamer_subscriptions sub
        on sub.tenant_id = t.id
       and sub.streamer_id = s.id
      left join public.gift_source_connections gsc
        on gsc.tenant_id = t.id
       and gsc.streamer_id = s.id
      where t.id = $1
        and s.id = $2
      limit 1
    `,
    [world.tenant_id, world.streamer_id],
  );

  if (!tenantStreamer) {
    throw notFound(`World ${worldId} の tenant / streamer が見つかりません`, { worldId });
  }

  const liveSession = await loadCurrentLiveSessionForWorld(db, worldId);
  const latestLiveSession = await loadLatestLiveSessionForWorld(db, worldId);

  return {
    tenant: {
      id: tenantStreamer.tenant_id,
      name: tenantStreamer.tenant_name,
      handle: tenantStreamer.tenant_handle,
      status: tenantStreamer.tenant_status,
      created_at: tenantStreamer.tenant_created_at,
      updated_at: tenantStreamer.tenant_updated_at,
    },
    streamer: {
      id: tenantStreamer.streamer_id,
      tenant_id: tenantStreamer.tenant_id,
      email: tenantStreamer.streamer_email ?? '',
      display_name: tenantStreamer.streamer_display_name,
      handle: tenantStreamer.streamer_handle,
      avatar_url: tenantStreamer.streamer_avatar_url,
      default_tiktok_id: tenantStreamer.streamer_default_tiktok_id,
      password_hash: tenantStreamer.streamer_password_hash,
      password_updated_at: tenantStreamer.streamer_password_updated_at,
      last_login_at: tenantStreamer.streamer_last_login_at,
      is_active: tenantStreamer.streamer_is_active,
      created_at: tenantStreamer.streamer_created_at,
      updated_at: tenantStreamer.streamer_updated_at,
    },
    subscription: tenantStreamer.subscription_id
      ? {
          id: tenantStreamer.subscription_id,
          tenant_id: tenantStreamer.tenant_id,
          streamer_id: tenantStreamer.streamer_id,
          provider: tenantStreamer.subscription_provider ?? 'manual',
          provider_customer_id: tenantStreamer.subscription_provider_customer_id,
          provider_subscription_id: tenantStreamer.subscription_provider_subscription_id,
          plan: tenantStreamer.subscription_plan ?? 'free_trial',
          status: tenantStreamer.subscription_status ?? 'trialing',
          max_worlds: tenantStreamer.subscription_max_worlds ?? 1,
          max_npcs_per_world: tenantStreamer.subscription_max_npcs_per_world ?? 5,
          ai_narration_quota: tenantStreamer.subscription_ai_narration_quota ?? 0,
          current_period_start: tenantStreamer.subscription_current_period_start,
          current_period_end: tenantStreamer.subscription_current_period_end,
          cancel_at_period_end: tenantStreamer.subscription_cancel_at_period_end ?? false,
          created_at: tenantStreamer.subscription_created_at ?? tenantStreamer.tenant_created_at,
          updated_at: tenantStreamer.subscription_updated_at ?? tenantStreamer.tenant_updated_at,
        }
      : null,
    giftConnection: tenantStreamer.gift_connection_id
      ? {
          id: tenantStreamer.gift_connection_id,
          tenant_id: tenantStreamer.gift_connection_tenant_id ?? tenantStreamer.tenant_id,
          streamer_id: tenantStreamer.gift_connection_streamer_id ?? tenantStreamer.streamer_id,
          platform: tenantStreamer.gift_connection_platform ?? 'tiktok',
          connection_type: tenantStreamer.gift_connection_connection_type ?? 'dev_mock',
          status: tenantStreamer.gift_connection_status ?? 'not_connected',
          encrypted_credentials: tenantStreamer.gift_connection_encrypted_credentials,
          last_connected_at: tenantStreamer.gift_connection_last_connected_at,
          last_error: tenantStreamer.gift_connection_last_error,
          created_at: tenantStreamer.gift_connection_created_at ?? tenantStreamer.tenant_created_at,
          updated_at: tenantStreamer.gift_connection_updated_at ?? tenantStreamer.tenant_updated_at,
        }
      : null,
    world,
    liveSession,
    latestLiveSession,
  };
}

async function loadWorldSnapshots(db: SqlExecutor, worldId: string): Promise<SnapshotNpcRow[]> {
  const npcs = await queryMany<NpcRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        viewer_user_id,
        name,
        age,
        gender,
        appearance_key,
        personality_prompt,
        backstory,
        trait_social,
        trait_aggression,
        trait_greed,
        trait_cooperation,
        trait_risk,
        trait_leadership,
        ai_seed,
        status,
        death_cause,
        created_at,
        updated_at
      from public.npcs
      where world_id = $1
      order by created_at asc
    `,
    [worldId],
  );

  if (npcs.length === 0) {
    return [];
  }

  const npcIds = npcs.map((npc) => npc.id);
  const viewerUserIds = npcs.map((npc) => npc.viewer_user_id).filter((viewerUserId): viewerUserId is string => Boolean(viewerUserId));

  const states = await queryMany<NpcStateRow>(
    db,
    `
      select
        npc_id,
        tile_x,
        tile_y,
        hp,
        food,
        water,
        stamina,
        morale,
        injury,
        shelter,
        current_action,
        action_target_x,
        action_target_y,
        action_started_at,
        action_ends_at,
        last_tick,
        updated_at
      from public.npc_states
      where npc_id = any($1::uuid[])
    `,
    [npcIds],
  );

  const inventories = await queryMany<NpcInventoryRow>(
    db,
    `
      select
        id,
        npc_id,
        item_id,
        quantity,
        durability,
        updated_at
      from public.npc_inventory
      where npc_id = any($1::uuid[])
        and quantity > 0
      order by updated_at asc
    `,
    [npcIds],
  );

  const viewerUsers = viewerUserIds.length === 0
    ? []
    : await queryMany<ViewerUserRow>(
        db,
        `
          select
            id,
            tenant_id,
            streamer_id,
            tiktok_id,
            display_name,
            avatar_url,
            created_at,
            updated_at
          from public.viewer_users
          where id = any($1::uuid[])
        `,
        [viewerUserIds],
      );

  const stateByNpcId = new Map(states.map((state) => [state.npc_id, state]));
  const inventoryByNpcId = groupRowsById(inventories);
  const viewerUserById = new Map(viewerUsers.map((viewerUser) => [viewerUser.id, viewerUser]));

  return npcs.map((npc) => {
    const state = ensureNonNull(stateByNpcId.get(npc.id) ?? null, `NPC ${npc.id} の state がありません`);

    return {
      npc,
      state,
      inventory: inventoryByNpcId.get(npc.id) ?? [],
      viewerUser: npc.viewer_user_id ? viewerUserById.get(npc.viewer_user_id) ?? null : null,
    };
  });
}

async function loadWorldEvents(db: SqlExecutor, worldId: string): Promise<WorldEventRow[]> {
  return queryMany<WorldEventRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        live_session_id,
        tick,
        event_type,
        title_ja,
        description_ja,
        actor_npc_id,
        target_npc_id,
        tile_x,
        tile_y,
        metadata,
        created_at
      from public.world_events
      where world_id = $1
      order by tick desc, created_at desc
      limit 25
    `,
    [worldId],
  );
}

async function loadResourceGrants(db: SqlExecutor, worldId: string): Promise<ResourceGrantRow[]> {
  return queryMany<ResourceGrantRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        live_session_id,
        gift_event_id,
        viewer_user_id,
        target_npc_id,
        pack_id,
        status,
        spawn_tile_x,
        spawn_tile_y,
        expires_at,
        claimed_at,
        metadata,
        created_at
      from public.resource_grants
      where world_id = $1
      order by created_at desc
      limit 25
    `,
    [worldId],
  );
}

export async function loadWorldSnapshot(db: SqlExecutor, worldId: string): Promise<WorldSnapshotResult> {
  const worldIdentity = await loadWorldIdentity(db, worldId);
  const worldRow = await queryOne<{
    npc_count: number;
    alive_npc_count: number;
    dead_npc_count: number;
  }>(
    db,
    `
      select
        count(*)::int as npc_count,
        count(*) filter (where n.status = 'alive')::int as alive_npc_count,
        count(*) filter (where n.status = 'dead')::int as dead_npc_count
      from public.npcs n
      where n.world_id = $1
    `,
    [worldId],
  );

  const world: WorldSummaryRow = {
    ...worldIdentity.world,
    npc_count: worldRow?.npc_count ?? 0,
    alive_npc_count: worldRow?.alive_npc_count ?? 0,
    dead_npc_count: worldRow?.dead_npc_count ?? 0,
    latest_live_session_id: worldIdentity.latestLiveSession?.id ?? null,
    latest_live_session_status: worldIdentity.latestLiveSession?.status ?? null,
    latest_live_session_started_at: worldIdentity.latestLiveSession?.started_at ?? null,
    latest_live_session_ended_at: worldIdentity.latestLiveSession?.ended_at ?? null,
    last_tick_started_at: null,
  };

  return {
    tenant: worldIdentity.tenant,
    streamer: worldIdentity.streamer,
    subscription: worldIdentity.subscription,
    world,
    liveSession: worldIdentity.liveSession,
    npcs: await loadWorldSnapshots(db, worldId),
    events: await loadWorldEvents(db, worldId),
    resourceGrants: await loadResourceGrants(db, worldId),
  };
}

export async function loadWorldIdentityByHandle(
  db: SqlExecutor,
  handle: string,
  worldId: string,
): Promise<{
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  world: WorldRow;
  liveSession: LiveSessionRow | null;
  latestLiveSession: LiveSessionRow | null;
}> {
  const context = await loadTenantStreamerSubscription(db, handle);
  const world = await queryOne<WorldRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        name,
        width,
        height,
        tick_interval_seconds,
        current_tick,
        world_seed,
        status,
        created_at,
        updated_at
      from public.worlds
      where id = $1
        and tenant_id = $2
        and streamer_id = $3
      limit 1
    `,
    [worldId, context.tenant.id, context.streamer.id],
  );

  if (!world) {
    throw notFound(`World ${worldId} は streamer ${handle} に属していません`, {
      handle,
      worldId,
    });
  }

  const liveSession = await loadCurrentLiveSessionForWorld(db, worldId);
  const latestLiveSession = await loadLatestLiveSessionForWorld(db, worldId);

  return {
    tenant: context.tenant,
    streamer: context.streamer,
    subscription: context.subscription,
    world,
    liveSession,
    latestLiveSession,
  };
}

export async function loadWorldSnapshotByHandle(
  db: SqlExecutor,
  handle: string,
  worldId: string,
): Promise<WorldSnapshotResult> {
  const worldIdentity = await loadWorldIdentityByHandle(db, handle, worldId);
  const worldRow = await queryOne<{
    npc_count: number;
    alive_npc_count: number;
    dead_npc_count: number;
  }>(
    db,
    `
      select
        count(*)::int as npc_count,
        count(*) filter (where n.status = 'alive')::int as alive_npc_count,
        count(*) filter (where n.status = 'dead')::int as dead_npc_count
      from public.npcs n
      where n.world_id = $1
    `,
    [worldId],
  );

  const world: WorldSummaryRow = {
    ...worldIdentity.world,
    npc_count: worldRow?.npc_count ?? 0,
    alive_npc_count: worldRow?.alive_npc_count ?? 0,
    dead_npc_count: worldRow?.dead_npc_count ?? 0,
    latest_live_session_id: worldIdentity.latestLiveSession?.id ?? null,
    latest_live_session_status: worldIdentity.latestLiveSession?.status ?? null,
    latest_live_session_started_at: worldIdentity.latestLiveSession?.started_at ?? null,
    latest_live_session_ended_at: worldIdentity.latestLiveSession?.ended_at ?? null,
    last_tick_started_at: null,
  };

  return {
    tenant: worldIdentity.tenant,
    streamer: worldIdentity.streamer,
    subscription: worldIdentity.subscription,
    world,
    liveSession: worldIdentity.liveSession,
    npcs: await loadWorldSnapshots(db, worldId),
    events: await loadWorldEvents(db, worldId),
    resourceGrants: await loadResourceGrants(db, worldId),
  };
}

export async function loadViewerNpcSnapshot(
  db: SqlExecutor,
  handle: string,
  tiktokId: string,
): Promise<ViewerNpcSnapshotResult | null> {
  const context = await loadTenantStreamerSubscription(db, handle);
  const worldSummaries = await loadWorldSummaries(db, context.tenant.id, context.streamer.id);
  const world = resolvePrimaryWorld(worldSummaries);

  if (!world) {
    throw notFound(`Streamer ${handle} に world がありません`, { handle });
  }

  const viewerUser = await queryOne<ViewerUserRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        tiktok_id,
        display_name,
        avatar_url,
        created_at,
        updated_at
      from public.viewer_users
      where tenant_id = $1
        and tiktok_id = $2
      limit 1
    `,
    [context.tenant.id, tiktokId],
  );

  if (!viewerUser) {
    return null;
  }

  const snapshot = await queryOne<NpcRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        viewer_user_id,
        name,
        age,
        gender,
        appearance_key,
        personality_prompt,
        backstory,
        trait_social,
        trait_aggression,
        trait_greed,
        trait_cooperation,
        trait_risk,
        trait_leadership,
        ai_seed,
        status,
        death_cause,
        created_at,
        updated_at
      from public.npcs
      where tenant_id = $1
        and viewer_user_id = $2
      limit 1
    `,
    [context.tenant.id, viewerUser.id],
  );

  if (!snapshot) {
    return null;
  }

  const state = ensureNonNull(
    await queryOne<NpcStateRow>(
      db,
      `
        select
          npc_id,
          tile_x,
          tile_y,
          hp,
          food,
          water,
          stamina,
          morale,
          injury,
          shelter,
          current_action,
          action_target_x,
          action_target_y,
          action_started_at,
          action_ends_at,
          last_tick,
          updated_at
        from public.npc_states
        where npc_id = $1
        limit 1
      `,
      [snapshot.id],
    ),
    `NPC ${snapshot.id} の state がありません`,
  );

  const inventory = await queryMany<NpcInventoryRow>(
    db,
    `
      select
        id,
        npc_id,
        item_id,
        quantity,
        durability,
        updated_at
      from public.npc_inventory
      where npc_id = $1
        and quantity > 0
      order by updated_at asc
    `,
    [snapshot.id],
  );

  const events = await queryMany<WorldEventRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        live_session_id,
        tick,
        event_type,
        title_ja,
        description_ja,
        actor_npc_id,
        target_npc_id,
        tile_x,
        tile_y,
        metadata,
        created_at
      from public.world_events
      where world_id = $1
        and (actor_npc_id = $2 or target_npc_id = $2)
      order by tick desc, created_at desc
      limit 15
    `,
    [world.id, snapshot.id],
  );

  return {
    tenant: context.tenant,
    streamer: context.streamer,
    subscription: context.subscription,
    world,
    viewerUser,
    npc: {
      npc: snapshot,
      state,
      inventory,
      viewerUser,
    },
    events,
  };
}

function deriveTraits(prompt: string, tiktokId: string): Pick<NpcRow, 'trait_social' | 'trait_aggression' | 'trait_greed' | 'trait_cooperation' | 'trait_risk' | 'trait_leadership'> {
  const hash = hashString(`${prompt}|${tiktokId}`);
  return {
    trait_social: clampNumber(30 + (hash % 50), 0, 100),
    trait_aggression: clampNumber(15 + ((hash >> 3) % 50), 0, 100),
    trait_greed: clampNumber(20 + ((hash >> 6) % 55), 0, 100),
    trait_cooperation: clampNumber(35 + ((hash >> 9) % 55), 0, 100),
    trait_risk: clampNumber(25 + ((hash >> 12) % 50), 0, 100),
    trait_leadership: clampNumber(20 + ((hash >> 15) % 60), 0, 100),
  };
}

function deriveAge(prompt: string, tiktokId: string): number {
  const hash = hashString(`${tiktokId}:${prompt}`);
  return clampNumber(18 + (hash % 25), 18, 42);
}

function pickSpawnTileFromWorld(world: WorldRow, tiles: WorldTileRow[], occupied: Set<string>, seed: string): PlacementCandidate {
  const preferredX = Math.floor(world.width / 2);
  const preferredY = Math.floor(world.height / 2);
  return chooseBestPlacementTile(world, tiles, occupied, seed, preferredX, preferredY);
}

function buildViewerNpcRow(
  tenantId: string,
  streamerId: string,
  worldId: string,
  viewerUserId: string,
  tiktokId: string,
  input: {
    npcName?: string | null;
    displayName?: string | null;
    personalityPrompt?: string | null;
    gender?: string | null;
    age?: number | null;
  },
): {
  npc: NpcRow;
  state: NpcStateRow;
} {
  const npcName = getTextValue(input.npcName, getTextValue(input.displayName, tiktokId));
  const personalityPrompt = input.personalityPrompt?.trim() ?? null;
  const age = input.age ?? deriveAge(personalityPrompt ?? '', tiktokId);
  const traits = deriveTraits(personalityPrompt ?? npcName, tiktokId);
  const now = new Date();
  const npcId = randomUUID();

  return {
    npc: {
      id: npcId,
      tenant_id: tenantId,
      streamer_id: streamerId,
      world_id: worldId,
      viewer_user_id: viewerUserId,
      name: npcName,
      age,
      gender: input.gender ?? null,
      appearance_key: `viewer_${hashString(tiktokId + npcName) % 1000}`,
      personality_prompt: personalityPrompt,
      backstory: personalityPrompt ? `観戦者が入力した人格設定: ${personalityPrompt}` : null,
      trait_social: traits.trait_social,
      trait_aggression: traits.trait_aggression,
      trait_greed: traits.trait_greed,
      trait_cooperation: traits.trait_cooperation,
      trait_risk: traits.trait_risk,
      trait_leadership: traits.trait_leadership,
      ai_seed: `viewer-${tiktokId}-${hashString(npcName).toString(16)}`,
      status: 'alive',
      death_cause: null,
      created_at: now,
      updated_at: now,
    },
    state: {
      npc_id: npcId,
      tile_x: 0,
      tile_y: 0,
      hp: 100,
      food: 70,
      water: 70,
      stamina: 100,
      morale: 60,
      injury: 0,
      shelter: 0,
      current_action: 'idle',
      action_target_x: null,
      action_target_y: null,
      action_started_at: null,
      action_ends_at: null,
      last_tick: 0,
      updated_at: now,
    },
  };
}

export async function createStreamerSession(
  db: SqlExecutor,
  input: {
    tenantId: string;
    streamerId: string;
    sessionTokenHash: string;
    expiresAt: Date;
  },
): Promise<StreamerSessionRow> {
  const now = new Date();
  const row = await queryOne<StreamerSessionRow>(
    db,
    `
      insert into public.streamer_sessions (
        id,
        tenant_id,
        streamer_id,
        session_token_hash,
        expires_at,
        revoked_at,
        last_seen_at,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, null, $6, $7, $8)
      returning
        id,
        tenant_id,
        streamer_id,
        session_token_hash,
        expires_at,
        revoked_at,
        last_seen_at,
        created_at,
        updated_at
    `,
    [randomUUID(), input.tenantId, input.streamerId, input.sessionTokenHash, input.expiresAt, now, now, now],
  );

  return ensureNonNull(row, 'streamer_session の作成に失敗しました');
}

export async function verifyPasswordHash(
  db: SqlExecutor,
  password: string,
  passwordHash: string,
): Promise<boolean> {
  const row = await queryOne<{ password_ok: boolean }>(
    db,
    `
      select crypt($1, $2) = $2 as password_ok
    `,
    [password, passwordHash],
  );

  return row?.password_ok ?? false;
}

export async function markStreamerLogin(db: SqlExecutor, streamerId: string): Promise<void> {
  await db.query(
    `
      update public.streamers
      set last_login_at = now(),
          updated_at = now()
      where id = $1
    `,
    [streamerId],
  );
}

export async function revokeStreamerSessionByTokenHash(db: SqlExecutor, sessionTokenHash: string): Promise<void> {
  await db.query(
    `
      update public.streamer_sessions
      set revoked_at = now(),
          updated_at = now()
      where session_token_hash = $1
        and revoked_at is null
    `,
    [sessionTokenHash],
  );
}

export async function loadPlatformAdminByEmail(db: SqlExecutor, email: string): Promise<PlatformAdminRow | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  return queryOne<PlatformAdminRow>(
    db,
    `
      select
        id,
        email,
        display_name,
        password_hash,
        is_active,
        last_login_at,
        created_at,
        updated_at
      from public.platform_admins
      where lower(email) = $1
      limit 1
    `,
    [normalizedEmail],
  );
}

export async function loadPlatformAdminById(db: SqlExecutor, adminId: string): Promise<PlatformAdminRow | null> {
  return queryOne<PlatformAdminRow>(
    db,
    `
      select
        id,
        email,
        display_name,
        password_hash,
        is_active,
        last_login_at,
        created_at,
        updated_at
      from public.platform_admins
      where id = $1
      limit 1
    `,
    [adminId],
  );
}

export async function createPlatformAdminSession(
  db: SqlExecutor,
  input: {
    adminId: string;
    sessionTokenHash: string;
    expiresAt: Date;
  },
): Promise<AdminSessionRow> {
  const now = new Date();
  const row = await queryOne<AdminSessionRow>(
    db,
    `
      insert into public.admin_sessions (
        id,
        admin_id,
        session_token_hash,
        expires_at,
        revoked_at,
        last_seen_at,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, null, $5, $6, $7)
      returning
        id,
        admin_id,
        session_token_hash,
        expires_at,
        revoked_at,
        last_seen_at,
        created_at,
        updated_at
    `,
    [randomUUID(), input.adminId, input.sessionTokenHash, input.expiresAt, now, now, now],
  );

  return ensureNonNull(row, 'admin_session の作成に失敗しました');
}

export async function loadPlatformAdminSessionByTokenHash(
  db: SqlExecutor,
  sessionTokenHash: string,
): Promise<AdminSessionAuthResult | null> {
  const row = await queryOne<{
    session_id: string;
    session_admin_id: string;
    session_token_hash: string;
    session_expires_at: Date;
    session_revoked_at: Date | null;
    session_last_seen_at: Date;
    session_created_at: Date;
    session_updated_at: Date;
    admin_email: string;
    admin_display_name: string;
    admin_password_hash: string;
    admin_is_active: boolean;
    admin_last_login_at: Date | null;
    admin_created_at: Date;
    admin_updated_at: Date;
  }>(
    db,
    `
      select
        asess.id as session_id,
        asess.admin_id as session_admin_id,
        asess.session_token_hash,
        asess.expires_at as session_expires_at,
        asess.revoked_at as session_revoked_at,
        asess.last_seen_at as session_last_seen_at,
        asess.created_at as session_created_at,
        asess.updated_at as session_updated_at,
        a.email as admin_email,
        a.display_name as admin_display_name,
        a.password_hash as admin_password_hash,
        a.is_active as admin_is_active,
        a.last_login_at as admin_last_login_at,
        a.created_at as admin_created_at,
        a.updated_at as admin_updated_at
      from public.admin_sessions asess
      join public.platform_admins a on a.id = asess.admin_id
      where asess.session_token_hash = $1
        and asess.revoked_at is null
        and asess.expires_at > now()
        and a.is_active = true
      limit 1
    `,
    [sessionTokenHash],
  );

  if (!row) {
    return null;
  }

  return {
    admin: {
      id: row.session_admin_id,
      email: row.admin_email,
      display_name: row.admin_display_name,
      password_hash: row.admin_password_hash,
      is_active: row.admin_is_active,
      last_login_at: row.admin_last_login_at,
      created_at: row.admin_created_at,
      updated_at: row.admin_updated_at,
    },
    session: {
      id: row.session_id,
      admin_id: row.session_admin_id,
      session_token_hash: row.session_token_hash,
      expires_at: row.session_expires_at,
      revoked_at: row.session_revoked_at,
      last_seen_at: row.session_last_seen_at,
      created_at: row.session_created_at,
      updated_at: row.session_updated_at,
    },
  };
}

export async function markPlatformAdminLogin(db: SqlExecutor, adminId: string): Promise<void> {
  await db.query(
    `
      update public.platform_admins
      set last_login_at = now(),
          updated_at = now()
      where id = $1
    `,
    [adminId],
  );
}

export async function revokePlatformAdminSessionByTokenHash(db: SqlExecutor, sessionTokenHash: string): Promise<void> {
  await db.query(
    `
      update public.admin_sessions
      set revoked_at = now(),
          updated_at = now()
      where session_token_hash = $1
        and revoked_at is null
    `,
    [sessionTokenHash],
  );
}

export async function upsertViewerUser(
  db: SqlExecutor,
  tenantId: string,
  streamerId: string,
  tiktokId: string,
  displayName: string | null,
  avatarUrl: string | null,
): Promise<ViewerUserRow> {
  const row = await queryOne<ViewerUserRow>(
    db,
    `
      insert into public.viewer_users (
        tenant_id,
        streamer_id,
        tiktok_id,
        display_name,
        avatar_url
      )
      values ($1, $2, $3, $4, $5)
      on conflict (tenant_id, tiktok_id)
      do update set
        streamer_id = excluded.streamer_id,
        display_name = coalesce(excluded.display_name, public.viewer_users.display_name),
        avatar_url = coalesce(excluded.avatar_url, public.viewer_users.avatar_url),
        updated_at = now()
      returning id, tenant_id, streamer_id, tiktok_id, display_name, avatar_url, created_at, updated_at
    `,
    [tenantId, streamerId, tiktokId, displayName, avatarUrl],
  );

  return ensureNonNull(row, 'viewer_user の upsert に失敗しました');
}

export async function createViewerNpc(
  db: SqlExecutor,
  input: {
    streamerHandle: string;
    tiktokId: string;
    displayName?: string | null;
    npcName?: string | null;
    personalityPrompt?: string | null;
    gender?: string | null;
    age?: number | null;
  },
): Promise<{
  created: boolean;
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  world: WorldSummaryRow;
  viewerUser: ViewerUserRow;
  npc: SnapshotNpcRow;
  }> {
  const context = await loadStreamerContext(db, input.streamerHandle);
  const world = ensureNonNull(context.primaryWorld, `Streamer ${input.streamerHandle} に world がありません`);
  ensureStreamerIsOperational(context.tenant, context.streamer);
  const existingViewerUser = await queryOne<ViewerUserRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        tiktok_id,
        display_name,
        avatar_url,
        created_at,
        updated_at
      from public.viewer_users
      where tenant_id = $1
        and tiktok_id = $2
      limit 1
    `,
    [context.tenant.id, input.tiktokId],
  );

  const existingSnapshot = existingViewerUser
    ? await queryOne<NpcRow>(
        db,
        `
          select
            id,
            tenant_id,
            streamer_id,
            world_id,
            viewer_user_id,
            name,
            age,
            gender,
            appearance_key,
            personality_prompt,
            backstory,
            trait_social,
            trait_aggression,
            trait_greed,
            trait_cooperation,
            trait_risk,
            trait_leadership,
            ai_seed,
            status,
            death_cause,
            created_at,
            updated_at
          from public.npcs
          where tenant_id = $1
            and viewer_user_id = $2
          limit 1
        `,
        [context.tenant.id, existingViewerUser.id],
      )
    : null;

  if (existingSnapshot) {
    const viewerUser = await upsertViewerUser(db, context.tenant.id, context.streamer.id, input.tiktokId, input.displayName ?? null, null);
    const state = ensureNonNull(
      await queryOne<NpcStateRow>(
        db,
        `
          select
            npc_id,
            tile_x,
            tile_y,
            hp,
            food,
            water,
            stamina,
            morale,
            injury,
            shelter,
            current_action,
            action_target_x,
            action_target_y,
            action_started_at,
            action_ends_at,
            last_tick,
            updated_at
          from public.npc_states
          where npc_id = $1
          limit 1
        `,
        [existingSnapshot.id],
      ),
      `NPC ${existingSnapshot.id} の state がありません`,
    );

    const inventory = await queryMany<NpcInventoryRow>(
      db,
      `
        select
          id,
          npc_id,
          item_id,
          quantity,
          durability,
          updated_at
        from public.npc_inventory
        where npc_id = $1
      `,
      [existingSnapshot.id],
    );

    return {
      created: false,
      tenant: context.tenant,
      streamer: context.streamer,
      subscription: context.subscription,
      world,
      viewerUser,
      npc: {
        npc: existingSnapshot,
        state,
        inventory,
        viewerUser,
      },
    };
  }

  ensureNpcCreationWithinPlan(world, context.subscription);

  const viewerUser = await upsertViewerUser(db, context.tenant.id, context.streamer.id, input.tiktokId, input.displayName ?? null, null);
  const tickContext = await loadWorldTickContext(db, world.id);
  const occupied = new Set(
    tickContext.npc_states
      .filter((state) => state.hp > 0)
      .map((state) => makeTileKey(state.tile_x, state.tile_y)),
  );
  const placement = pickSpawnTileFromWorld(world, tickContext.world_tiles, occupied, input.tiktokId);
  const npcSeed = buildViewerNpcRow(
    context.tenant.id,
    context.streamer.id,
    world.id,
    viewerUser.id,
    input.tiktokId,
    {
      npcName: input.npcName ?? null,
      displayName: input.displayName ?? null,
      personalityPrompt: input.personalityPrompt ?? null,
      gender: input.gender ?? null,
      age: input.age ?? null,
    },
  );

  npcSeed.state.tile_x = placement.tileX;
  npcSeed.state.tile_y = placement.tileY;
  npcSeed.state.last_tick = world.current_tick;
  npcSeed.state.updated_at = new Date();

  const npcInserted = await queryOne<NpcRow>(
    db,
    `
      insert into public.npcs (
        id,
        tenant_id,
        streamer_id,
        world_id,
        viewer_user_id,
        name,
        age,
        gender,
        appearance_key,
        personality_prompt,
        backstory,
        trait_social,
        trait_aggression,
        trait_greed,
        trait_cooperation,
        trait_risk,
        trait_leadership,
        ai_seed,
        status,
        death_cause,
        created_at,
        updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      )
      returning
        id,
        tenant_id,
        streamer_id,
        world_id,
        viewer_user_id,
        name,
        age,
        gender,
        appearance_key,
        personality_prompt,
        backstory,
        trait_social,
        trait_aggression,
        trait_greed,
        trait_cooperation,
        trait_risk,
        trait_leadership,
        ai_seed,
        status,
        death_cause,
        created_at,
        updated_at
    `,
    [
      npcSeed.npc.id,
      npcSeed.npc.tenant_id,
      npcSeed.npc.streamer_id,
      npcSeed.npc.world_id,
      npcSeed.npc.viewer_user_id,
      npcSeed.npc.name,
      npcSeed.npc.age,
      npcSeed.npc.gender,
      npcSeed.npc.appearance_key,
      npcSeed.npc.personality_prompt,
      npcSeed.npc.backstory,
      npcSeed.npc.trait_social,
      npcSeed.npc.trait_aggression,
      npcSeed.npc.trait_greed,
      npcSeed.npc.trait_cooperation,
      npcSeed.npc.trait_risk,
      npcSeed.npc.trait_leadership,
      npcSeed.npc.ai_seed,
      npcSeed.npc.status,
      npcSeed.npc.death_cause,
      npcSeed.npc.created_at,
      npcSeed.npc.updated_at,
    ],
  );

  const stateInserted = await queryOne<NpcStateRow>(
    db,
    `
      insert into public.npc_states (
        npc_id,
        tile_x,
        tile_y,
        hp,
        food,
        water,
        stamina,
        morale,
        injury,
        shelter,
        current_action,
        action_target_x,
        action_target_y,
        action_started_at,
        action_ends_at,
        last_tick,
        updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
      )
      returning
        npc_id,
        tile_x,
        tile_y,
        hp,
        food,
        water,
        stamina,
        morale,
        injury,
        shelter,
        current_action,
        action_target_x,
        action_target_y,
        action_started_at,
        action_ends_at,
        last_tick,
        updated_at
    `,
    [
      npcSeed.state.npc_id,
      npcSeed.state.tile_x,
      npcSeed.state.tile_y,
      npcSeed.state.hp,
      npcSeed.state.food,
      npcSeed.state.water,
      npcSeed.state.stamina,
      npcSeed.state.morale,
      npcSeed.state.injury,
      npcSeed.state.shelter,
      npcSeed.state.current_action,
      npcSeed.state.action_target_x,
      npcSeed.state.action_target_y,
      npcSeed.state.action_started_at,
      npcSeed.state.action_ends_at,
      npcSeed.state.last_tick,
      npcSeed.state.updated_at,
    ],
  );

  const snapshot = ensureNonNull(npcInserted, 'NPC の作成に失敗しました');
  const state = ensureNonNull(stateInserted, 'NPC state の作成に失敗しました');

  await queryOne(
    db,
    `
      insert into public.world_events (
        id,
        tenant_id,
        streamer_id,
        world_id,
        live_session_id,
        tick,
        event_type,
        title_ja,
        description_ja,
        actor_npc_id,
        target_npc_id,
        tile_x,
        tile_y,
        metadata
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      returning id
    `,
    [
      randomUUID(),
      context.tenant.id,
      context.streamer.id,
      world.id,
      context.latestLiveSession?.id ?? null,
      world.current_tick,
      'viewer_npc_created',
      '新しい AI住民が作成されました',
      `${snapshot.name} が荒土世界 Alpha に参加しました。`,
      snapshot.id,
      snapshot.id,
      placement.tileX,
      placement.tileY,
      {
        source: 'viewer-create',
        tiktokId: input.tiktokId,
      },
    ],
  );

  publishWorldUpdate(world.id, {
    type: 'viewer_npc_created',
    npcId: snapshot.id,
    viewerUserId: viewerUser.id,
    npcName: snapshot.name,
    created: true,
  });

  return {
    created: true,
    tenant: context.tenant,
    streamer: context.streamer,
    subscription: context.subscription,
    world,
    viewerUser,
    npc: {
      npc: snapshot,
      state,
      inventory: [],
      viewerUser,
    },
  };
}

export async function createLiveSession(
  db: SqlExecutor,
  input: {
    streamerHandle: string;
    worldId?: string | null;
    platform?: string | null;
    platformLiveId?: string | null;
  },
): Promise<{
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  world: WorldRow;
  liveSession: LiveSessionRow;
}> {
  const result = await withTransaction(async (client) => {
    const context = await loadStreamerContext(client, input.streamerHandle);
    ensureStreamerIsOperational(context.tenant, context.streamer);
    const targetWorld = input.worldId
      ? ensureNonNull(
          await queryOne<WorldRow>(
            client,
            `
              select
                id,
                tenant_id,
                streamer_id,
                name,
                width,
                height,
                tick_interval_seconds,
                current_tick,
                world_seed,
                status,
                created_at,
                updated_at
              from public.worlds
              where id = $1
                and tenant_id = $2
                and streamer_id = $3
              for update
            `,
            [input.worldId, context.tenant.id, context.streamer.id],
          ),
          `World ${input.worldId} は streamer ${input.streamerHandle} に属していません`,
        )
      : ensureNonNull(
          await queryOne<WorldRow>(
            client,
            `
              select
                id,
                tenant_id,
                streamer_id,
                name,
                width,
                height,
                tick_interval_seconds,
                current_tick,
                world_seed,
                status,
                created_at,
                updated_at
              from public.worlds
              where id = $1
                and tenant_id = $2
                and streamer_id = $3
              for update
            `,
            [ensureNonNull(context.primaryWorld, `Streamer ${input.streamerHandle} に world がありません`).id, context.tenant.id, context.streamer.id],
          ),
          `Streamer ${input.streamerHandle} に world がありません`,
        );

    if (targetWorld.status === 'archived') {
      throw conflict('アーカイブ済みのワールドでは配信できません', {
        reason: 'world_archived',
        worldId: targetWorld.id,
      });
    }

    ensureLiveSessionCreationWithinPlan(context.stats.liveSessionsThisMonth, context.subscription);

    const currentLiveSession = await loadCurrentLiveSessionForStreamer(client, context.tenant.id, context.streamer.id);
    if (currentLiveSession) {
      throw conflict('配信中のライブセッションがあります', {
        reason: 'live_session_already_active',
        liveSessionId: currentLiveSession.id,
        worldId: currentLiveSession.world_id,
      });
    }

    const startedAt = new Date();
    const liveSession = ensureNonNull(
      await queryOne<LiveSessionRow>(
        client,
        `
          insert into public.live_sessions (
            id,
            tenant_id,
            streamer_id,
            world_id,
            platform,
            platform_live_id,
            status,
            started_at,
            viewer_count_peak,
            gift_count,
            metadata
          ) values ($1,$2,$3,$4,$5,$6,'live',$7,0,0,$8)
          returning
            id,
            tenant_id,
            streamer_id,
            world_id,
            platform,
            platform_live_id,
            status,
            started_at,
            ended_at,
            viewer_count_peak,
            gift_count,
            metadata,
            created_at
        `,
        [
          randomUUID(),
          context.tenant.id,
          context.streamer.id,
          targetWorld.id,
          input.platform ?? 'tiktok',
          input.platformLiveId ?? `dev-${targetWorld.id.slice(0, 8)}`,
          startedAt,
          {
            source: 'streamer-console',
            auto_started: true,
            previous_world_status: targetWorld.status,
          },
        ],
      ),
      'ライブセッションの作成に失敗しました',
    );

    const updatedWorld = ensureNonNull(
      await queryOne<WorldRow>(
        client,
        `
          update public.worlds
          set status = 'live',
              updated_at = now()
          where id = $1
          returning
            id,
            tenant_id,
            streamer_id,
            name,
            width,
            height,
            tick_interval_seconds,
            current_tick,
            world_seed,
            status,
            created_at,
            updated_at
        `,
        [targetWorld.id],
      ),
      'ワールド状態の更新に失敗しました',
    );

    return {
      tenant: context.tenant,
      streamer: context.streamer,
      subscription: context.subscription,
      world: updatedWorld,
      liveSession,
    };
  });

  publishWorldUpdate(result.world.id, {
    type: 'live_session_started',
    liveSessionId: result.liveSession.id,
    platform: result.liveSession.platform,
    status: result.liveSession.status,
    worldStatus: result.world.status,
  });

  return result;
}

export async function endLiveSession(
  db: SqlExecutor,
  input: {
    streamerHandle: string;
    liveSessionId: string;
  },
): Promise<{
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  world: WorldRow;
  liveSession: LiveSessionRow;
}> {
  const result = await withTransaction(async (client) => {
    const context = await loadStreamerContext(client, input.streamerHandle);
    const liveSession = ensureNonNull(
      await queryOne<LiveSessionRow>(
        client,
        `
          select
            id,
            tenant_id,
            streamer_id,
            world_id,
            platform,
            platform_live_id,
            status,
            started_at,
            ended_at,
            viewer_count_peak,
            gift_count,
            metadata,
            created_at
          from public.live_sessions
          where id = $1
            and tenant_id = $2
            and streamer_id = $3
            and status = 'live'
            and ended_at is null
          for update
        `,
        [input.liveSessionId, context.tenant.id, context.streamer.id],
      ),
      `ライブセッション ${input.liveSessionId} が見つかりません`,
    );

    const world = ensureNonNull(
      await queryOne<WorldRow>(
        client,
        `
          select
            id,
            tenant_id,
            streamer_id,
            name,
            width,
            height,
            tick_interval_seconds,
            current_tick,
            world_seed,
            status,
            created_at,
            updated_at
          from public.worlds
          where id = $1
            and tenant_id = $2
            and streamer_id = $3
          for update
        `,
        [liveSession.world_id, context.tenant.id, context.streamer.id],
      ),
      `World ${liveSession.world_id} が見つかりません`,
    );

    const previousWorldStatus = typeof liveSession.metadata.previous_world_status === 'string'
      ? liveSession.metadata.previous_world_status
      : null;
    const restoredStatus: WorldRow['status'] = previousWorldStatus === 'paused' || previousWorldStatus === 'active'
      ? previousWorldStatus
      : 'active';
    const endedAt = new Date();

    const endedSession = ensureNonNull(
      await queryOne<LiveSessionRow>(
        client,
        `
          update public.live_sessions
          set status = 'ended',
              ended_at = coalesce(ended_at, $2)
          where id = $1
            and tenant_id = $3
            and streamer_id = $4
          returning
            id,
            tenant_id,
            streamer_id,
            world_id,
            platform,
            platform_live_id,
            status,
            started_at,
            ended_at,
            viewer_count_peak,
            gift_count,
            metadata,
            created_at
        `,
        [liveSession.id, endedAt, context.tenant.id, context.streamer.id],
      ),
      'ライブセッションの終了に失敗しました',
    );

    const updatedWorld = ensureNonNull(
      await queryOne<WorldRow>(
        client,
        `
          update public.worlds
          set status = $2,
              updated_at = now()
          where id = $1
          returning
            id,
            tenant_id,
            streamer_id,
            name,
            width,
            height,
            tick_interval_seconds,
            current_tick,
            world_seed,
            status,
            created_at,
            updated_at
        `,
        [world.id, restoredStatus],
      ),
      'ワールド状態の更新に失敗しました',
    );

    return {
      tenant: context.tenant,
      streamer: context.streamer,
      subscription: context.subscription,
      world: updatedWorld,
      liveSession: endedSession,
    };
  });

  publishWorldUpdate(result.world.id, {
    type: 'live_session_ended',
    liveSessionId: result.liveSession.id,
    status: result.liveSession.status,
    worldStatus: result.world.status,
  });

  return result;
}

export async function ensureLiveSessionForWorld(db: SqlExecutor, worldId: string): Promise<LiveSessionRow> {
  const existing = await loadCurrentLiveSessionForWorld(db, worldId);
  if (existing) {
    return existing;
  }

  throw conflict('配信中のライブセッションがありません', {
    reason: 'no_active_live_session',
    worldId,
  });
}

function chooseGrantPack(giftName: string, giftValue: number, repeatCount: number): string {
  const normalizedName = giftName.toLowerCase();
  const totalValue = giftValue * repeatCount;

  if (totalValue >= 50) {
    return 'basic_survival_pack';
  }

  if (normalizedName.includes('water') || normalizedName.includes('水')) {
    return 'small_water_pack';
  }

  if (normalizedName.includes('food') || normalizedName.includes('食')) {
    return 'small_food_pack';
  }

  return totalValue >= 20 ? 'small_water_pack' : 'small_food_pack';
}

function pickFallbackTargetNpc(npcs: Array<{ npc: NpcRow; state: NpcStateRow }>): { npc: NpcRow; state: NpcStateRow } | null {
  const alive = npcs.filter(({ npc, state }) => npc.status === 'alive' && state.hp > 0);
  if (alive.length === 0) {
    return null;
  }

  return alive.sort((left, right) => {
    const leftScore = calculateNeedScore(left.state);
    const rightScore = calculateNeedScore(right.state);
    return rightScore - leftScore;
  })[0] ?? null;
}

function pickSpawnTileNearNpc(world: WorldRow, tiles: WorldTileRow[], occupied: Set<string>, npcState: NpcStateRow | null, seed: string): PlacementCandidate {
  if (!npcState) {
    return pickSpawnTileFromWorld(world, tiles, occupied, seed);
  }

  const preferredX = npcState.tile_x;
  const preferredY = npcState.tile_y;
  return chooseBestPlacementTile(world, tiles, occupied, seed, preferredX, preferredY);
}

function buildGrantItemsMap(resourcePackItems: ResourcePackItemRow[]): Map<string, ResourcePackItemRow[]> {
  return groupResourcePackItems(resourcePackItems);
}

function resolveGrantItems(
  packId: string,
  resourcePackItems: Map<string, ResourcePackItemRow[]>,
): ResourcePackItemRow[] {
  return resourcePackItems.get(packId) ?? [];
}

function publishWorldUpdate(worldId: string, message: Record<string, unknown> & { type: string }): void {
  realtimeHub.publishWorldMessage(worldId, message);
}

export async function dispatchGiftEvent(
  db: SqlExecutor,
  input: {
    streamerHandle: string;
    tiktokId: string;
    giftName: string;
    giftValue: number;
    repeatCount: number;
    displayName?: string | null;
    giftId?: string | null;
    platformEventId?: string | null;
  },
): Promise<GiftDispatchInput> {
  const context = await loadStreamerContext(db, input.streamerHandle);
  const world = ensureNonNull(context.primaryWorld, `Streamer ${input.streamerHandle} に world がありません`);
  const tickContext = await loadWorldTickContext(db, world.id);
  const liveSession = await ensureLiveSessionForWorld(db, world.id);
  const viewerUser = await upsertViewerUser(db, context.tenant.id, context.streamer.id, input.tiktokId, input.displayName ?? null, null);

  const viewerNpcSnapshot = await queryOne<NpcRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        viewer_user_id,
        name,
        age,
        gender,
        appearance_key,
        personality_prompt,
        backstory,
        trait_social,
        trait_aggression,
        trait_greed,
        trait_cooperation,
        trait_risk,
        trait_leadership,
        ai_seed,
        status,
        death_cause,
        created_at,
        updated_at
      from public.npcs
      where tenant_id = $1
        and viewer_user_id = $2
      limit 1
    `,
    [context.tenant.id, viewerUser.id],
  );

  const npcStatesById = new Map(tickContext.npc_states.map((state) => [state.npc_id, state]));
  const npcRowsById = new Map(tickContext.npcs.map((npc) => [npc.id, npc]));
  const fallbackTarget = viewerNpcSnapshot
    ? {
        npc: ensureNonNull(npcRowsById.get(viewerNpcSnapshot.id) ?? null, `NPC ${viewerNpcSnapshot.id} が見つかりません`),
        state: ensureNonNull(npcStatesById.get(viewerNpcSnapshot.id) ?? null, `NPC state ${viewerNpcSnapshot.id} が見つかりません`),
      }
    : pickFallbackTargetNpc(
        tickContext.npcs.map((npc) => ({
          npc,
          state: ensureNonNull(npcStatesById.get(npc.id) ?? null, `NPC state ${npc.id} が見つかりません`),
        })),
      );

  const targetNpc = fallbackTarget ? fallbackTarget.npc : null;
  const targetState = fallbackTarget ? fallbackTarget.state : null;
  const packId = chooseGrantPack(input.giftName, input.giftValue, input.repeatCount);
  const resourcePackItems = buildGrantItemsMap(tickContext.resource_pack_items);
  const grantItems = resolveGrantItems(packId, resourcePackItems);
  const occupied = new Set(
    tickContext.npc_states
      .filter((state) => state.hp > 0)
      .map((state) => makeTileKey(state.tile_x, state.tile_y)),
  );
  const spawn = pickSpawnTileNearNpc(world, tickContext.world_tiles, occupied, targetState, `${input.tiktokId}:${input.giftName}:${input.giftValue}`);
  const platformEventId = input.platformEventId ?? `dev-${randomUUID()}`;
  const now = new Date();

  const giftEvent = ensureNonNull(
    await queryOne<GiftEventRow>(
      db,
      `
        insert into public.gift_events (
          id,
          tenant_id,
          streamer_id,
          world_id,
          live_session_id,
          platform,
          platform_event_id,
          tiktok_id,
          display_name,
          gift_id,
          gift_name,
          gift_value,
          repeat_count,
          status,
          raw_payload,
          received_at,
          processed_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'processed',$14,$15,$16
        )
        on conflict (platform, platform_event_id)
        do update set
          display_name = coalesce(excluded.display_name, public.gift_events.display_name),
          gift_id = coalesce(excluded.gift_id, public.gift_events.gift_id),
          gift_name = coalesce(excluded.gift_name, public.gift_events.gift_name),
          gift_value = excluded.gift_value,
          repeat_count = excluded.repeat_count,
          status = 'processed',
          processed_at = excluded.processed_at,
          raw_payload = excluded.raw_payload
        returning
          id,
          tenant_id,
          streamer_id,
          world_id,
          live_session_id,
          platform,
          platform_event_id,
          tiktok_id,
          display_name,
          gift_id,
          gift_name,
          gift_value,
          repeat_count,
          status,
          raw_payload,
          received_at,
          processed_at
      `,
      [
        randomUUID(),
        context.tenant.id,
        context.streamer.id,
        world.id,
        liveSession.id,
        'tiktok',
        platformEventId,
        input.tiktokId,
        input.displayName ?? null,
        input.giftId ?? null,
        input.giftName,
        input.giftValue,
        input.repeatCount,
        {
          source: 'DevMockGiftAdapter',
          streamerHandle: input.streamerHandle,
          tiktokId: input.tiktokId,
          giftName: input.giftName,
          giftValue: input.giftValue,
          repeatCount: input.repeatCount,
        },
        now,
        now,
      ],
    ),
    'gift_event の作成に失敗しました',
  );

  await db.query(
    `
      update public.live_sessions
      set gift_count = gift_count + $2
      where id = $1
    `,
    [liveSession.id, input.repeatCount],
  );
  liveSession.gift_count += input.repeatCount;

  const resourceGrant = ensureNonNull(
    await queryOne<ResourceGrantRow>(
      db,
      `
        insert into public.resource_grants (
          id,
          tenant_id,
          streamer_id,
          world_id,
          live_session_id,
          gift_event_id,
          viewer_user_id,
          target_npc_id,
          pack_id,
          status,
          spawn_tile_x,
          spawn_tile_y,
          expires_at,
          claimed_at,
          metadata,
          created_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,'spawned',$10,$11,$12,null,$13,$14
        )
        returning
          id,
          tenant_id,
          streamer_id,
          world_id,
          live_session_id,
          gift_event_id,
          viewer_user_id,
          target_npc_id,
          pack_id,
          status,
          spawn_tile_x,
          spawn_tile_y,
          expires_at,
          claimed_at,
          metadata,
          created_at
      `,
      [
        randomUUID(),
        context.tenant.id,
        context.streamer.id,
        world.id,
        liveSession.id,
        giftEvent.id,
        viewerUser.id,
        targetNpc?.id ?? null,
        packId,
        spawn.tileX,
        spawn.tileY,
        new Date(Date.now() + 30 * 60 * 1000),
        {
          source: 'DevMockGiftAdapter',
          giftEventId: giftEvent.id,
          packId,
          spawn: { tileX: spawn.tileX, tileY: spawn.tileY },
          items: grantItems,
        },
        now,
      ],
    ),
    'resource_grant の作成に失敗しました',
  );

  await queryOne(
    db,
    `
      insert into public.world_events (
        id,
        tenant_id,
        streamer_id,
        world_id,
        live_session_id,
        tick,
        event_type,
        title_ja,
        description_ja,
        actor_npc_id,
        target_npc_id,
        tile_x,
        tile_y,
        metadata
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      returning id
    `,
    [
      randomUUID(),
      context.tenant.id,
      context.streamer.id,
      world.id,
      liveSession.id,
      world.current_tick,
      'gift_received',
      '支援が届きました',
      `${input.tiktokId} のギフトで ${packId} が生成されました。`,
      targetNpc?.id ?? null,
      targetNpc?.id ?? null,
      spawn.tileX,
      spawn.tileY,
      {
        source: 'DevMockGiftAdapter',
        giftEventId: giftEvent.id,
        resourceGrantId: resourceGrant.id,
        packId,
      },
    ],
  );

  publishWorldUpdate(world.id, {
    type: 'gift_received',
    giftEventId: giftEvent.id,
    resourceGrantId: resourceGrant.id,
    liveSessionId: liveSession.id,
    viewerUserId: viewerUser.id,
    targetNpcId: targetNpc?.id ?? null,
    packId,
    giftName: input.giftName,
    giftValue: input.giftValue,
    repeatCount: input.repeatCount,
    giftCount: liveSession.gift_count,
  });

  return {
    tenant: context.tenant,
    streamer: context.streamer,
    world,
    liveSession,
    viewerUser,
    targetNpc,
    giftEvent,
    resourceGrant,
  };
}

export async function dispatchGiftEventForCurrentLiveSession(
  db: SqlExecutor,
  input: {
    streamerHandle: string;
    worldId?: string | null;
    adapterType?: string | null;
    rawPayload?: Record<string, unknown> | null;
    tiktokId: string;
    giftName: string;
    giftValue: number;
    repeatCount: number;
    displayName?: string | null;
    giftId?: string | null;
    platformEventId?: string | null;
  },
): Promise<GiftDispatchInput> {
  const result = await withTransaction(async (client) => {
    const context = await loadStreamerContext(client, input.streamerHandle);
    if (!context.subscription || !isSubscriptionActiveForUsage(context.subscription.status)) {
      throw subscriptionInactive('契約状態を確認してください。');
    }
    const normalizedEvent = normalizeGiftAdapterEvent({
      streamerHandle: input.streamerHandle,
      worldId: input.worldId ?? null,
      adapterType: input.adapterType ?? context.giftConnection?.connection_type ?? 'dev_mock',
      tiktokId: input.tiktokId,
      displayName: input.displayName ?? null,
      giftName: input.giftName,
      giftValue: input.giftValue,
      repeatCount: input.repeatCount,
      giftId: input.giftId ?? null,
      platformEventId: input.platformEventId ?? null,
      rawPayload: input.rawPayload ?? null,
    });
    const liveSession = await queryOne<LiveSessionRow>(
      client,
      `
        select
          id,
          tenant_id,
          streamer_id,
          world_id,
          platform,
          platform_live_id,
          status,
          started_at,
          ended_at,
          viewer_count_peak,
          gift_count,
          metadata,
          created_at
        from public.live_sessions
        where tenant_id = $1
          and streamer_id = $2
          and status = 'live'
          and ended_at is null
        for update
      `,
      [context.tenant.id, context.streamer.id],
    );

    if (!liveSession) {
      throw conflict('配信中のライブセッションがありません', {
        reason: 'no_active_live_session',
        streamerHandle: input.streamerHandle,
      });
    }

    const world = ensureNonNull(
      await queryOne<WorldRow>(
        client,
        `
          select
            id,
            tenant_id,
            streamer_id,
            name,
            width,
            height,
            tick_interval_seconds,
            current_tick,
            world_seed,
            status,
            created_at,
            updated_at
          from public.worlds
          where id = $1
            and tenant_id = $2
            and streamer_id = $3
          for update
        `,
        [liveSession.world_id, context.tenant.id, context.streamer.id],
      ),
      `World ${liveSession.world_id} が見つかりません`,
    );

    if (input.worldId && input.worldId !== world.id) {
      throw conflict('現在のライブセッションとワールドが一致しません', {
        reason: 'live_session_world_mismatch',
        requestedWorldId: input.worldId,
        activeWorldId: world.id,
        liveSessionId: liveSession.id,
      });
    }

    const tickContext = await loadWorldTickContext(client, world.id);
    const viewerUser = await upsertViewerUser(client, context.tenant.id, context.streamer.id, input.tiktokId, input.displayName ?? null, null);

    const viewerNpcSnapshot = await queryOne<NpcRow>(
      client,
      `
        select
          id,
          tenant_id,
          streamer_id,
          world_id,
          viewer_user_id,
          name,
          age,
          gender,
          appearance_key,
          personality_prompt,
          backstory,
          trait_social,
          trait_aggression,
          trait_greed,
          trait_cooperation,
          trait_risk,
          trait_leadership,
          ai_seed,
          status,
          death_cause,
          created_at,
          updated_at
        from public.npcs
        where tenant_id = $1
          and viewer_user_id = $2
        limit 1
      `,
      [context.tenant.id, viewerUser.id],
    );

    const npcStatesById = new Map(tickContext.npc_states.map((state) => [state.npc_id, state]));
    const npcRowsById = new Map(tickContext.npcs.map((npc) => [npc.id, npc]));
    const fallbackTarget = viewerNpcSnapshot
      ? {
          npc: ensureNonNull(npcRowsById.get(viewerNpcSnapshot.id) ?? null, `NPC ${viewerNpcSnapshot.id} が見つかりません`),
          state: ensureNonNull(npcStatesById.get(viewerNpcSnapshot.id) ?? null, `NPC state ${viewerNpcSnapshot.id} が見つかりません`),
        }
      : pickFallbackTargetNpc(
          tickContext.npcs.map((npc) => ({
            npc,
            state: ensureNonNull(npcStatesById.get(npc.id) ?? null, `NPC state ${npc.id} が見つかりません`),
          })),
        );

    const targetNpc = fallbackTarget ? fallbackTarget.npc : null;
    const targetState = fallbackTarget ? fallbackTarget.state : null;
    const packId = chooseGrantPack(input.giftName, input.giftValue, input.repeatCount);
    const resourcePackItems = buildGrantItemsMap(tickContext.resource_pack_items);
    const grantItems = resolveGrantItems(packId, resourcePackItems);
    const occupied = new Set(
      tickContext.npc_states
        .filter((state) => state.hp > 0)
        .map((state) => makeTileKey(state.tile_x, state.tile_y)),
    );
    const spawn = pickSpawnTileNearNpc(world, tickContext.world_tiles, occupied, targetState, `${input.tiktokId}:${input.giftName}:${input.giftValue}`);
    const platformEventId = normalizedEvent.platformEventId ?? `dev-${randomUUID()}`;
    const now = new Date();
    const sourceLabel = normalizedEvent.adapterLabel;
    const rawPayload = {
      source: sourceLabel,
      adapterType: normalizedEvent.adapterType,
      adapterLabel: sourceLabel,
      streamerHandle: input.streamerHandle,
      giftConnectionId: context.giftConnection?.id ?? null,
      giftConnectionType: context.giftConnection?.connection_type ?? null,
      giftConnectionStatus: context.giftConnection?.status ?? null,
      tiktokId: normalizedEvent.tiktokId,
      displayName: normalizedEvent.displayName,
      giftId: normalizedEvent.giftId,
      giftName: normalizedEvent.giftName,
      giftValue: normalizedEvent.giftValue,
      repeatCount: normalizedEvent.repeatCount,
      ...(normalizedEvent.rawPayload ?? {}),
    };

    const giftEvent = ensureNonNull(
      await queryOne<GiftEventRow>(
        client,
        `
          insert into public.gift_events (
            id,
            tenant_id,
            streamer_id,
            world_id,
            live_session_id,
            platform,
            platform_event_id,
            tiktok_id,
            display_name,
            gift_id,
            gift_name,
            gift_value,
            repeat_count,
            status,
            raw_payload,
            received_at,
            processed_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'processed',$14,$15,$16
          )
          on conflict (platform, platform_event_id)
          do update set
            display_name = coalesce(excluded.display_name, public.gift_events.display_name),
            gift_id = coalesce(excluded.gift_id, public.gift_events.gift_id),
            gift_name = coalesce(excluded.gift_name, public.gift_events.gift_name),
            gift_value = excluded.gift_value,
            repeat_count = excluded.repeat_count,
            status = 'processed',
            processed_at = excluded.processed_at,
            raw_payload = excluded.raw_payload
          returning
            id,
            tenant_id,
            streamer_id,
            world_id,
            live_session_id,
            platform,
            platform_event_id,
            tiktok_id,
            display_name,
            gift_id,
            gift_name,
            gift_value,
            repeat_count,
            status,
            raw_payload,
            received_at,
            processed_at
        `,
        [
          randomUUID(),
          context.tenant.id,
          context.streamer.id,
          world.id,
          liveSession.id,
          'tiktok',
          platformEventId,
          normalizedEvent.tiktokId,
          normalizedEvent.displayName ?? null,
          normalizedEvent.giftId ?? null,
          normalizedEvent.giftName,
          normalizedEvent.giftValue,
          normalizedEvent.repeatCount,
          rawPayload,
          now,
          now,
        ],
      ),
      'gift_event の作成に失敗しました',
    );

    const updatedLiveSession = await queryOne<LiveSessionRow>(
      client,
      `
        update public.live_sessions
        set gift_count = gift_count + $2
        where id = $1
          and status = 'live'
          and ended_at is null
        returning
          id,
          tenant_id,
          streamer_id,
          world_id,
          platform,
          platform_live_id,
          status,
          started_at,
          ended_at,
          viewer_count_peak,
          gift_count,
          metadata,
          created_at
      `,
      [liveSession.id, input.repeatCount],
    );

    if (!updatedLiveSession) {
      throw conflict('配信中のライブセッションがありません', {
        reason: 'no_active_live_session',
        streamerHandle: input.streamerHandle,
      });
    }

    const resourceGrant = ensureNonNull(
      await queryOne<ResourceGrantRow>(
        client,
        `
          insert into public.resource_grants (
            id,
            tenant_id,
            streamer_id,
            world_id,
            live_session_id,
            gift_event_id,
            viewer_user_id,
            target_npc_id,
            pack_id,
            status,
            spawn_tile_x,
            spawn_tile_y,
            expires_at,
            claimed_at,
            metadata,
            created_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,'spawned',$10,$11,$12,null,$13,$14
          )
          returning
            id,
            tenant_id,
            streamer_id,
            world_id,
            live_session_id,
            gift_event_id,
            viewer_user_id,
            target_npc_id,
            pack_id,
            status,
            spawn_tile_x,
            spawn_tile_y,
            expires_at,
            claimed_at,
            metadata,
            created_at
        `,
        [
          randomUUID(),
          context.tenant.id,
          context.streamer.id,
          world.id,
          liveSession.id,
          giftEvent.id,
          viewerUser.id,
          targetNpc?.id ?? null,
          packId,
          spawn.tileX,
          spawn.tileY,
          new Date(Date.now() + 30 * 60 * 1000),
          {
            source: sourceLabel,
            adapterType: normalizedEvent.adapterType,
            adapterLabel: sourceLabel,
            giftConnectionId: context.giftConnection?.id ?? null,
            giftEventId: giftEvent.id,
            packId,
            spawn: { tileX: spawn.tileX, tileY: spawn.tileY },
            items: grantItems,
          },
          now,
        ],
      ),
      'resource_grant の作成に失敗しました',
    );

    await queryOne(
      client,
      `
        insert into public.world_events (
          id,
          tenant_id,
          streamer_id,
          world_id,
          live_session_id,
          tick,
          event_type,
          title_ja,
          description_ja,
          actor_npc_id,
          target_npc_id,
          tile_x,
          tile_y,
          metadata
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
        )
        returning id
      `,
      [
        randomUUID(),
        context.tenant.id,
        context.streamer.id,
        world.id,
        liveSession.id,
        world.current_tick,
        'gift_received',
        '支援が届きました',
        `${input.tiktokId} のギフトで ${packId} が生成されました。`,
        targetNpc?.id ?? null,
        targetNpc?.id ?? null,
        spawn.tileX,
        spawn.tileY,
        {
          source: sourceLabel,
          adapterType: normalizedEvent.adapterType,
          adapterLabel: sourceLabel,
          giftConnectionId: context.giftConnection?.id ?? null,
          giftEventId: giftEvent.id,
          resourceGrantId: resourceGrant.id,
          packId,
        },
      ],
    );

    return {
      tenant: context.tenant,
      streamer: context.streamer,
      world,
      liveSession: updatedLiveSession,
      viewerUser,
      targetNpc,
      giftEvent,
      resourceGrant,
    };
  });

  publishWorldUpdate(result.world.id, {
    type: 'gift_received',
    giftEventId: result.giftEvent.id,
    resourceGrantId: result.resourceGrant.id,
    liveSessionId: result.liveSession.id,
    viewerUserId: result.viewerUser.id,
    targetNpcId: result.targetNpc?.id ?? null,
    packId: result.resourceGrant.pack_id,
    giftName: input.giftName,
    giftValue: input.giftValue,
    repeatCount: input.repeatCount,
    giftCount: result.liveSession.gift_count,
  });

  return result;
}

export async function loadWorldTickContext(db: SqlExecutor, worldId: string): Promise<WorldTickContext> {
  const worldIdentity = await loadWorldIdentity(db, worldId);
  const itemDefinitions = await queryMany<ItemDefinitionRow>(
    db,
    `
      select
        id,
        name_ja,
        name_zh,
        category,
        max_stack,
        restore_food,
        restore_water,
        restore_hp,
        tool_bonus,
        decay_per_tick,
        metadata
      from public.item_definitions
      order by id asc
    `,
  );
  const resourcePacks = await queryMany<ResourcePackRow>(
    db,
    `
      select
        id,
        name_ja,
        name_zh,
        tier,
        metadata
      from public.resource_packs
      order by tier asc, id asc
    `,
  );
  const resourcePackItems = await queryMany<ResourcePackItemRow>(
    db,
    `
      select
        pack_id,
        item_id,
        quantity,
        weight
      from public.resource_pack_items
      order by pack_id asc, item_id asc
    `,
  );
  const worldTiles = await queryMany<WorldTileRow>(
    db,
    `
      select
        id,
        world_id,
        tile_x,
        tile_y,
        tile_type,
        danger_level,
        fertility,
        water_level,
        has_blocker,
        metadata,
        created_at
      from public.world_tiles
      where world_id = $1
      order by tile_y asc, tile_x asc
    `,
    [worldId],
  );
  const tileResources = await queryMany<TileResourceRow>(
    db,
    `
      select
        id,
        world_id,
        tile_x,
        tile_y,
        item_id,
        quantity,
        regen_per_tick,
        updated_at
      from public.tile_resources
      where world_id = $1
      order by tile_y asc, tile_x asc, item_id asc
    `,
    [worldId],
  );
  const resourceGrants = await queryMany<ResourceGrantRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        live_session_id,
        gift_event_id,
        viewer_user_id,
        target_npc_id,
        pack_id,
        status,
        spawn_tile_x,
        spawn_tile_y,
        expires_at,
        claimed_at,
        metadata,
        created_at
      from public.resource_grants
      where world_id = $1
        and status in ('pending', 'spawned')
      order by created_at asc
    `,
    [worldId],
  );
  const npcs = await queryMany<NpcRow>(
    db,
    `
      select
        id,
        tenant_id,
        streamer_id,
        world_id,
        viewer_user_id,
        name,
        age,
        gender,
        appearance_key,
        personality_prompt,
        backstory,
        trait_social,
        trait_aggression,
        trait_greed,
        trait_cooperation,
        trait_risk,
        trait_leadership,
        ai_seed,
        status,
        death_cause,
        created_at,
        updated_at
      from public.npcs
      where world_id = $1
      order by created_at asc
    `,
    [worldId],
  );
  const npcStates = await queryMany<NpcStateRow>(
    db,
    `
      select
        npc_id,
        tile_x,
        tile_y,
        hp,
        food,
        water,
        stamina,
        morale,
        injury,
        shelter,
        current_action,
        action_target_x,
        action_target_y,
        action_started_at,
        action_ends_at,
        last_tick,
        updated_at
      from public.npc_states
      where npc_id = any($1::uuid[])
    `,
    [npcs.map((npc) => npc.id)],
  );
  const npcInventories = await queryMany<NpcInventoryRow>(
    db,
    `
      select
        id,
        npc_id,
        item_id,
        quantity,
        durability,
        updated_at
      from public.npc_inventory
      where npc_id = any($1::uuid[])
      order by updated_at asc
    `,
    [npcs.map((npc) => npc.id)],
  );

  return {
    tenant: worldIdentity.tenant,
    streamer: worldIdentity.streamer,
    subscription: worldIdentity.subscription,
    giftConnection: worldIdentity.giftConnection,
    world: worldIdentity.world,
    live_session: worldIdentity.liveSession,
    item_definitions: itemDefinitions,
    resource_packs: resourcePacks,
    resource_pack_items: resourcePackItems,
    world_tiles: worldTiles,
    tile_resources: tileResources,
    resource_grants: resourceGrants,
    npcs,
    npc_states: npcStates,
    npc_inventories: npcInventories,
  };
}

async function updateNpcInventory(db: SqlExecutor, inventory: NpcInventoryRow): Promise<void> {
  await db.query(
    `
      insert into public.npc_inventory (
        id,
        npc_id,
        item_id,
        quantity,
        durability,
        updated_at
      ) values ($1,$2,$3,$4,$5,$6)
      on conflict (npc_id, item_id)
      do update set
        quantity = excluded.quantity,
        durability = excluded.durability,
        updated_at = excluded.updated_at
    `,
    [
      inventory.id,
      inventory.npc_id,
      inventory.item_id,
      inventory.quantity,
      inventory.durability,
      inventory.updated_at,
    ],
  );
}

async function updateNpcState(db: SqlExecutor, state: NpcStateRow): Promise<void> {
  await db.query(
    `
      update public.npc_states
      set tile_x = $2,
          tile_y = $3,
          hp = $4,
          food = $5,
          water = $6,
          stamina = $7,
          morale = $8,
          injury = $9,
          shelter = $10,
          current_action = $11,
          action_target_x = $12,
          action_target_y = $13,
          action_started_at = $14,
          action_ends_at = $15,
          last_tick = $16,
          updated_at = $17
      where npc_id = $1
    `,
    [
      state.npc_id,
      state.tile_x,
      state.tile_y,
      state.hp,
      state.food,
      state.water,
      state.stamina,
      state.morale,
      state.injury,
      state.shelter,
      state.current_action,
      state.action_target_x,
      state.action_target_y,
      state.action_started_at,
      state.action_ends_at,
      state.last_tick,
      state.updated_at,
    ],
  );
}

function deriveDeathCause(state: NpcStateRow): string {
  if (state.water <= 0) {
    return 'dehydration';
  }

  if (state.food <= 0) {
    return 'starvation';
  }

  if (state.injury >= 70) {
    return 'critical_injury';
  }

  return 'critical_exhaustion';
}

async function updateNpcStatus(db: SqlExecutor, npcId: string, status: NpcRow['status'], deathCause: string | null): Promise<void> {
  await db.query(
    `
      update public.npcs
      set status = $2,
          death_cause = coalesce($3, death_cause),
          updated_at = now()
      where id = $1
    `,
    [npcId, status, deathCause],
  );
}

async function updateTileResource(db: SqlExecutor, resource: TileResourceRow): Promise<void> {
  await db.query(
    `
      update public.tile_resources
      set quantity = $5,
          regen_per_tick = $6,
          updated_at = $7
      where world_id = $1
        and tile_x = $2
        and tile_y = $3
        and item_id = $4
    `,
    [
      resource.world_id,
      resource.tile_x,
      resource.tile_y,
      resource.item_id,
      resource.quantity,
      resource.regen_per_tick,
      resource.updated_at,
    ],
  );
}

async function updateResourceGrant(db: SqlExecutor, grant: ResourceGrantRow): Promise<void> {
  await db.query(
    `
      update public.resource_grants
      set status = $2,
          spawn_tile_x = $3,
          spawn_tile_y = $4,
          expires_at = $5,
          claimed_at = $6,
          metadata = $7
      where id = $1
    `,
    [
      grant.id,
      grant.status,
      grant.spawn_tile_x,
      grant.spawn_tile_y,
      grant.expires_at,
      grant.claimed_at,
      grant.metadata,
    ],
  );
}

async function updateWorld(db: SqlExecutor, worldId: string, nextTick: number, worldStatus: WorldRow['status']): Promise<void> {
  await db.query(
    `
      update public.worlds
      set current_tick = $2,
          status = $3,
          updated_at = now()
      where id = $1
    `,
    [worldId, nextTick, worldStatus],
  );
}

async function insertWorldTick(db: SqlExecutor, outcome: WorldTickOutcome, worldId: string): Promise<void> {
  await db.query(
    `
      insert into public.world_ticks (
        id,
        world_id,
        tick,
        started_at,
        finished_at,
        npc_count,
        alive_count,
        dead_count,
        metadata
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
    [
      outcome.worldTick.id,
      worldId,
      outcome.worldTick.tick,
      outcome.worldTick.started_at,
      outcome.worldTick.finished_at,
      outcome.worldTick.npc_count,
      outcome.worldTick.alive_count,
      outcome.worldTick.dead_count,
      outcome.worldTick.metadata,
    ],
  );
}

async function insertWorldEvents(db: SqlExecutor, events: WorldEventInsertRow[]): Promise<void> {
  for (const event of events) {
    await db.query(
      `
        insert into public.world_events (
          id,
          tenant_id,
          streamer_id,
          world_id,
          live_session_id,
          tick,
          event_type,
          title_ja,
          description_ja,
          actor_npc_id,
          target_npc_id,
          tile_x,
          tile_y,
          metadata
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (id) do nothing
      `,
      [
        event.id,
        event.tenant_id,
        event.streamer_id,
        event.world_id,
        event.live_session_id,
        event.tick,
        event.event_type,
        event.title_ja,
        event.description_ja,
        event.actor_npc_id,
        event.target_npc_id,
        event.tile_x,
        event.tile_y,
        event.metadata,
      ],
    );
  }
}

export async function persistWorldTickOutcome(
  db: SqlExecutor,
  worldId: string,
  outcome: WorldTickOutcome,
): Promise<void> {
  await updateWorld(db, worldId, outcome.nextTick, outcome.worldStatus);
  await insertWorldTick(db, outcome, worldId);

  for (const state of outcome.npcStates) {
    await updateNpcState(db, state);
    if (state.hp <= 0) {
      await updateNpcStatus(db, state.npc_id, 'dead', deriveDeathCause(state));
    }
  }

  for (const inventory of outcome.npcInventories) {
    await updateNpcInventory(db, inventory);
  }

  for (const resource of outcome.tileResources) {
    await updateTileResource(db, resource);
  }

  for (const grant of outcome.resourceGrants) {
    await updateResourceGrant(db, grant);
  }

  await insertWorldEvents(db, outcome.worldEvents);

  publishWorldUpdate(worldId, {
    type: 'world_tick_completed',
    tick: outcome.nextTick,
    npcCount: outcome.worldTick.npc_count,
    aliveCount: outcome.worldTick.alive_count,
    deadCount: outcome.worldTick.dead_count,
    eventCount: outcome.worldEvents.length,
    worldStatus: outcome.worldStatus,
  });
}

export async function listTickableWorlds(db: SqlExecutor): Promise<WorldSummaryRow[]> {
  const rows = await queryMany<{
    id: string;
    tenant_id: string;
    streamer_id: string;
    name: string;
    width: number;
    height: number;
    tick_interval_seconds: number;
    current_tick: number;
    world_seed: string;
    status: WorldSummaryRow['status'];
    created_at: Date;
    updated_at: Date;
    npc_count: number;
    alive_npc_count: number;
    dead_npc_count: number;
    latest_live_session_id: string | null;
    latest_live_session_status: LiveSessionRow['status'] | null;
    latest_live_session_started_at: Date | null;
    latest_live_session_ended_at: Date | null;
    last_tick_started_at: Date | null;
  }>(
    db,
    `
      select
        w.id,
        w.tenant_id,
        w.streamer_id,
        w.name,
        w.width,
        w.height,
        w.tick_interval_seconds,
        w.current_tick,
        w.world_seed,
        w.status,
        w.created_at,
        w.updated_at,
        coalesce(npc_counts.npc_count, 0)::int as npc_count,
        coalesce(npc_counts.alive_npc_count, 0)::int as alive_npc_count,
        coalesce(npc_counts.dead_npc_count, 0)::int as dead_npc_count,
        latest_session.id as latest_live_session_id,
        latest_session.status as latest_live_session_status,
        latest_session.started_at as latest_live_session_started_at,
        latest_session.ended_at as latest_live_session_ended_at,
        latest_tick.started_at as last_tick_started_at
      from public.worlds w
      left join public.streamer_subscriptions sub
        on sub.tenant_id = w.tenant_id
       and sub.streamer_id = w.streamer_id
      left join lateral (
        select
          count(*)::int as npc_count,
          count(*) filter (where n.status = 'alive')::int as alive_npc_count,
          count(*) filter (where n.status = 'dead')::int as dead_npc_count
        from public.npcs n
        where n.world_id = w.id
      ) npc_counts on true
      left join lateral (
        select
          ls.id,
          ls.status,
          ls.started_at,
          ls.ended_at
        from public.live_sessions ls
        where ls.world_id = w.id
        order by ls.created_at desc
        limit 1
      ) latest_session on true
      left join lateral (
        select wt.started_at
        from public.world_ticks wt
        where wt.world_id = w.id
        order by wt.tick desc
        limit 1
      ) latest_tick on true
      where w.status in ('active', 'live')
        and coalesce(sub.status, 'trialing') in ('active', 'trialing')
      order by w.updated_at asc
    `,
  );

  return rows.map(buildWorldSummaryRow);
}

export async function verifySeedData(db: SqlExecutor): Promise<BootSummary> {
  const counts = await queryOne<{
    tenant_count: number;
    streamer_count: number;
    world_count: number;
    live_session_count: number;
    npc_count: number;
    alive_npc_count: number;
    world_tile_count: number;
    tile_resource_count: number;
  }>(
    db,
    `
      select
        (select count(*)::int from public.tenants) as tenant_count,
        (select count(*)::int from public.streamers) as streamer_count,
        (select count(*)::int from public.worlds) as world_count,
        (select count(*)::int from public.live_sessions) as live_session_count,
        (select count(*)::int from public.npcs) as npc_count,
        (select count(*)::int from public.npcs where status = 'alive') as alive_npc_count,
        (select count(*)::int from public.world_tiles) as world_tile_count,
        (select count(*)::int from public.tile_resources) as tile_resource_count
    `,
  );

  if (!counts) {
    throw notFound('seed data の検証に失敗しました');
  }

  return {
    tenantCount: counts.tenant_count,
    streamerCount: counts.streamer_count,
    worldCount: counts.world_count,
    liveSessionCount: counts.live_session_count,
    npcCount: counts.npc_count,
    aliveNpcCount: counts.alive_npc_count,
    worldTileCount: counts.world_tile_count,
    tileResourceCount: counts.tile_resource_count,
  };
}

export async function getWorldPlacementContext(
  db: SqlExecutor,
  worldId: string,
): Promise<{
  world: WorldRow;
  tiles: WorldTileRow[];
  occupied: Set<string>;
}> {
  const world = ensureNonNull(await loadWorldById(db, worldId), `World ${worldId} が見つかりません`);
  const tiles = await queryMany<WorldTileRow>(
    db,
    `
      select
        id,
        world_id,
        tile_x,
        tile_y,
        tile_type,
        danger_level,
        fertility,
        water_level,
        has_blocker,
        metadata,
        created_at
      from public.world_tiles
      where world_id = $1
    `,
    [worldId],
  );
  const states = await queryMany<NpcStateRow>(
    db,
    `
      select
        npc_id,
        tile_x,
        tile_y,
        hp,
        food,
        water,
        stamina,
        morale,
        injury,
        shelter,
        current_action,
        action_target_x,
        action_target_y,
        action_started_at,
        action_ends_at,
        last_tick,
        updated_at
      from public.npc_states ns
      join public.npcs n on n.id = ns.npc_id
      where n.world_id = $1
        and ns.hp > 0
    `,
    [worldId],
  );

  return {
    world,
    tiles,
    occupied: new Set(states.map((state) => makeTileKey(state.tile_x, state.tile_y))),
  };
}
