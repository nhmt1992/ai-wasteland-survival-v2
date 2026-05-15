import type { QueryResult, QueryResultRow } from 'pg';
import { loadStreamerById, loadStreamerContext, type AdminGiftEventListItem, type AdminLiveSessionListItem, type AdminSessionAuthResult, type AdminStreamerDetailResult, type AdminStreamerListItem, type AdminSummaryResult, type AdminSystemHealthResult, type AdminTenantListItem, type AdminWorldListItem, type SqlExecutor } from './repository.js';
import type { GiftEventRow, LiveSessionRow, SubscriptionRow, TenantRow, StreamerRow, WorldSummaryRow, PlatformAdminRow, AdminSessionRow } from './types.js';

export type {
  AdminGiftEventListItem,
  AdminLiveSessionListItem,
  AdminStreamerDetailResult,
  AdminStreamerListItem,
  AdminSummaryResult,
  AdminSystemHealthResult,
  AdminTenantListItem,
  AdminWorldListItem,
} from './repository.js';

async function queryOne<T extends QueryResultRow>(db: SqlExecutor, text: string, values?: readonly unknown[]): Promise<T | null> {
  const result = await db.query<T>(text, values);
  return result.rows[0] ?? null;
}

async function queryMany<T extends QueryResultRow>(db: SqlExecutor, text: string, values?: readonly unknown[]): Promise<T[]> {
  const result = await db.query<T>(text, values);
  return result.rows;
}

function mapTenant(row: {
  tenant_id: string;
  tenant_name: string;
  tenant_handle: string;
  tenant_status: string;
  tenant_created_at: Date;
  tenant_updated_at: Date;
}): TenantRow {
  return {
    id: row.tenant_id,
    name: row.tenant_name,
    handle: row.tenant_handle,
    status: row.tenant_status,
    created_at: row.tenant_created_at,
    updated_at: row.tenant_updated_at,
  };
}

function mapStreamer(row: {
  streamer_id: string;
  streamer_tenant_id: string;
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
}): StreamerRow {
  return {
    id: row.streamer_id,
    tenant_id: row.streamer_tenant_id,
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
  };
}

function mapSubscription(row: {
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
  tenant_created_at: Date;
  tenant_updated_at: Date;
}): SubscriptionRow | null {
  if (!row.subscription_id) {
    return null;
  }

  return {
    id: row.subscription_id,
    tenant_id: row.subscription_tenant_id ?? '',
    streamer_id: row.subscription_streamer_id ?? '',
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
  };
}

function mapWorld(row: {
  world_id: string;
  world_tenant_id: string;
  world_streamer_id: string;
  world_name: string;
  world_width: number;
  world_height: number;
  world_tick_interval_seconds: number;
  world_current_tick: number;
  world_world_seed: string;
  world_status: WorldSummaryRow['status'];
  world_created_at: Date;
  world_updated_at: Date;
  world_npc_count: number;
  world_alive_npc_count: number;
  world_dead_npc_count: number;
  world_latest_live_session_id: string | null;
  world_latest_live_session_status: LiveSessionRow['status'] | null;
  world_latest_live_session_started_at: Date | null;
  world_latest_live_session_ended_at: Date | null;
  world_last_tick_started_at: Date | null;
}): WorldSummaryRow {
  return {
    id: row.world_id,
    tenant_id: row.world_tenant_id,
    streamer_id: row.world_streamer_id,
    name: row.world_name,
    width: row.world_width,
    height: row.world_height,
    tick_interval_seconds: row.world_tick_interval_seconds,
    current_tick: row.world_current_tick,
    world_seed: row.world_world_seed,
    status: row.world_status,
    created_at: row.world_created_at,
    updated_at: row.world_updated_at,
    npc_count: row.world_npc_count,
    alive_npc_count: row.world_alive_npc_count,
    dead_npc_count: row.world_dead_npc_count,
    latest_live_session_id: row.world_latest_live_session_id,
    latest_live_session_status: row.world_latest_live_session_status,
    latest_live_session_started_at: row.world_latest_live_session_started_at,
    latest_live_session_ended_at: row.world_latest_live_session_ended_at,
    last_tick_started_at: row.world_last_tick_started_at,
  };
}

function mapLiveSession(row: {
  live_session_id: string;
  live_session_tenant_id: string;
  live_session_streamer_id: string;
  live_session_world_id: string;
  live_session_platform: string;
  live_session_platform_live_id: string | null;
  live_session_status: LiveSessionRow['status'];
  live_session_started_at: Date | null;
  live_session_ended_at: Date | null;
  live_session_viewer_count_peak: number;
  live_session_gift_count: number;
  live_session_metadata: Record<string, unknown>;
  live_session_created_at: Date;
}): LiveSessionRow {
  return {
    id: row.live_session_id,
    tenant_id: row.live_session_tenant_id,
    streamer_id: row.live_session_streamer_id,
    world_id: row.live_session_world_id,
    platform: row.live_session_platform,
    platform_live_id: row.live_session_platform_live_id,
    status: row.live_session_status,
    started_at: row.live_session_started_at,
    ended_at: row.live_session_ended_at,
    viewer_count_peak: row.live_session_viewer_count_peak,
    gift_count: row.live_session_gift_count,
    metadata: row.live_session_metadata,
    created_at: row.live_session_created_at,
  };
}

function mapGiftEvent(row: {
  gift_event_id: string;
  gift_event_tenant_id: string;
  gift_event_streamer_id: string;
  gift_event_world_id: string;
  gift_event_live_session_id: string | null;
  gift_event_platform: string;
  gift_event_platform_event_id: string;
  gift_event_tiktok_id: string;
  gift_event_display_name: string | null;
  gift_event_gift_id: string | null;
  gift_event_gift_name: string | null;
  gift_event_gift_value: number;
  gift_event_repeat_count: number;
  gift_event_status: GiftEventRow['status'];
  gift_event_raw_payload: Record<string, unknown>;
  gift_event_received_at: Date;
  gift_event_processed_at: Date | null;
}): GiftEventRow {
  return {
    id: row.gift_event_id,
    tenant_id: row.gift_event_tenant_id,
    streamer_id: row.gift_event_streamer_id,
    world_id: row.gift_event_world_id,
    live_session_id: row.gift_event_live_session_id,
    platform: row.gift_event_platform,
    platform_event_id: row.gift_event_platform_event_id,
    tiktok_id: row.gift_event_tiktok_id,
    display_name: row.gift_event_display_name,
    gift_id: row.gift_event_gift_id,
    gift_name: row.gift_event_gift_name,
    gift_value: row.gift_event_gift_value,
    repeat_count: row.gift_event_repeat_count,
    status: row.gift_event_status,
    raw_payload: row.gift_event_raw_payload,
    received_at: row.gift_event_received_at,
    processed_at: row.gift_event_processed_at,
  };
}

export async function loadAdminSummary(db: SqlExecutor): Promise<AdminSummaryResult> {
  const row = await queryOne<{
    tenant_count: number;
    streamer_count: number;
    active_streamer_count: number;
    live_world_count: number;
    world_count: number;
    npc_count: number;
    alive_npc_count: number;
    today_live_session_count: number;
    today_gift_event_count: number;
  }>(
    db,
    `
      select
        (select count(*)::int from public.tenants) as tenant_count,
        (select count(*)::int from public.streamers) as streamer_count,
        (select count(*)::int
           from public.streamers s
           join public.tenants t on t.id = s.tenant_id
          where s.is_active = true
            and t.status = 'active') as active_streamer_count,
        (select count(*)::int from public.worlds where status = 'live') as live_world_count,
        (select count(*)::int from public.worlds) as world_count,
        (select count(*)::int from public.npcs) as npc_count,
        (select count(*)::int from public.npcs where status = 'alive') as alive_npc_count,
        (select count(*)::int from public.live_sessions where started_at >= date_trunc('day', now())) as today_live_session_count,
        (select count(*)::int from public.gift_events where received_at >= date_trunc('day', now())) as today_gift_event_count
    `,
  );

  if (!row) {
    throw new Error('admin summary の取得に失敗しました');
  }

  return {
    tenantCount: row.tenant_count,
    streamerCount: row.streamer_count,
    activeStreamerCount: row.active_streamer_count,
    liveWorldCount: row.live_world_count,
    worldCount: row.world_count,
    npcCount: row.npc_count,
    aliveNpcCount: row.alive_npc_count,
    todayLiveSessionCount: row.today_live_session_count,
    todayGiftEventCount: row.today_gift_event_count,
  };
}

export async function listAdminStreamers(db: SqlExecutor): Promise<AdminStreamerListItem[]> {
  const rows = await queryMany<{
    tenant_id: string;
    tenant_name: string;
    tenant_handle: string;
    tenant_status: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
    streamer_id: string;
    streamer_tenant_id: string;
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
    world_count: number;
    npc_count: number;
    live_session_count: number;
    last_live_at: Date | null;
    latest_live_session_status: LiveSessionRow['status'] | null;
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
        s.tenant_id as streamer_tenant_id,
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
        stats.world_count,
        stats.npc_count,
        stats.live_session_count,
        stats.last_live_at,
        stats.latest_live_session_status
      from public.streamers s
      join public.tenants t on t.id = s.tenant_id
      left join public.streamer_subscriptions sub
        on sub.tenant_id = s.tenant_id
       and sub.streamer_id = s.id
      left join lateral (
        select
          (select count(*)::int from public.worlds w where w.tenant_id = s.tenant_id and w.streamer_id = s.id) as world_count,
          (select count(*)::int from public.npcs n where n.tenant_id = s.tenant_id and n.streamer_id = s.id) as npc_count,
          (select count(*)::int from public.live_sessions ls where ls.tenant_id = s.tenant_id and ls.streamer_id = s.id) as live_session_count,
          (select max(ls.started_at) from public.live_sessions ls where ls.tenant_id = s.tenant_id and ls.streamer_id = s.id) as last_live_at,
          (select ls.status from public.live_sessions ls where ls.tenant_id = s.tenant_id and ls.streamer_id = s.id order by ls.started_at desc nulls last, ls.created_at desc limit 1) as latest_live_session_status
      ) stats on true
      order by t.created_at desc, s.created_at desc
    `,
  );

  return rows.map((row) => ({
    tenant: mapTenant(row),
    streamer: mapStreamer(row),
    subscription: mapSubscription(row),
    worldCount: row.world_count ?? 0,
    npcCount: row.npc_count ?? 0,
    liveSessionCount: row.live_session_count ?? 0,
    lastLiveAt: row.last_live_at,
    latestLiveSessionStatus: row.latest_live_session_status,
  }));
}

export async function listAdminTenants(db: SqlExecutor): Promise<AdminTenantListItem[]> {
  const rows = await queryMany<{
    tenant_id: string;
    tenant_name: string;
    tenant_handle: string;
    tenant_status: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
    streamer_count: number;
    active_streamer_count: number;
    world_count: number;
    npc_count: number;
    live_session_count: number;
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
        stats.streamer_count,
        stats.active_streamer_count,
        stats.world_count,
        stats.npc_count,
        stats.live_session_count
      from public.tenants t
      left join lateral (
        select
          (select count(*)::int from public.streamers s where s.tenant_id = t.id) as streamer_count,
          (select count(*)::int from public.streamers s where s.tenant_id = t.id and s.is_active = true) as active_streamer_count,
          (select count(*)::int from public.worlds w where w.tenant_id = t.id) as world_count,
          (select count(*)::int from public.npcs n where n.tenant_id = t.id) as npc_count,
          (select count(*)::int from public.live_sessions ls where ls.tenant_id = t.id) as live_session_count
      ) stats on true
      order by t.created_at desc
    `,
  );

  return rows.map((row) => ({
    tenant: mapTenant(row),
    streamerCount: row.streamer_count ?? 0,
    activeStreamerCount: row.active_streamer_count ?? 0,
    worldCount: row.world_count ?? 0,
    npcCount: row.npc_count ?? 0,
    liveSessionCount: row.live_session_count ?? 0,
  }));
}

export async function listAdminWorlds(db: SqlExecutor): Promise<AdminWorldListItem[]> {
  const rows = await queryMany<{
    tenant_id: string;
    tenant_name: string;
    tenant_handle: string;
    tenant_status: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
    streamer_id: string;
    streamer_tenant_id: string;
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
    world_id: string;
    world_tenant_id: string;
    world_streamer_id: string;
    world_name: string;
    world_width: number;
    world_height: number;
    world_tick_interval_seconds: number;
    world_current_tick: number;
    world_world_seed: string;
    world_status: WorldSummaryRow['status'];
    world_created_at: Date;
    world_updated_at: Date;
    world_npc_count: number;
    world_alive_npc_count: number;
    world_dead_npc_count: number;
    world_latest_live_session_id: string | null;
    world_latest_live_session_status: LiveSessionRow['status'] | null;
    world_latest_live_session_started_at: Date | null;
    world_latest_live_session_ended_at: Date | null;
    world_last_tick_started_at: Date | null;
    last_gift_event_at: Date | null;
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
        s.tenant_id as streamer_tenant_id,
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
        w.id as world_id,
        w.tenant_id as world_tenant_id,
        w.streamer_id as world_streamer_id,
        w.name as world_name,
        w.width as world_width,
        w.height as world_height,
        w.tick_interval_seconds as world_tick_interval_seconds,
        w.current_tick as world_current_tick,
        w.world_seed as world_world_seed,
        w.status as world_status,
        w.created_at as world_created_at,
        w.updated_at as world_updated_at,
        coalesce(world_counts.npc_count, 0)::int as world_npc_count,
        coalesce(world_counts.alive_npc_count, 0)::int as world_alive_npc_count,
        coalesce(world_counts.dead_npc_count, 0)::int as world_dead_npc_count,
        world_counts.latest_live_session_id as world_latest_live_session_id,
        world_counts.latest_live_session_status as world_latest_live_session_status,
        world_counts.latest_live_session_started_at as world_latest_live_session_started_at,
        world_counts.latest_live_session_ended_at as world_latest_live_session_ended_at,
        world_counts.last_tick_started_at as world_last_tick_started_at,
        gift_counts.last_gift_event_at as last_gift_event_at
      from public.worlds w
      join public.tenants t on t.id = w.tenant_id
      join public.streamers s on s.id = w.streamer_id
      left join public.streamer_subscriptions sub
        on sub.tenant_id = w.tenant_id
       and sub.streamer_id = w.streamer_id
      left join lateral (
        select
          count(*)::int as npc_count,
          count(*) filter (where n.status = 'alive')::int as alive_npc_count,
          count(*) filter (where n.status = 'dead')::int as dead_npc_count,
          (
            select ls.id
            from public.live_sessions ls
            where ls.world_id = w.id
            order by ls.started_at desc nulls last, ls.created_at desc
            limit 1
          ) as latest_live_session_id,
          (
            select ls.status
            from public.live_sessions ls
            where ls.world_id = w.id
            order by ls.started_at desc nulls last, ls.created_at desc
            limit 1
          ) as latest_live_session_status,
          (
            select ls.started_at
            from public.live_sessions ls
            where ls.world_id = w.id
            order by ls.started_at desc nulls last, ls.created_at desc
            limit 1
          ) as latest_live_session_started_at,
          (
            select ls.ended_at
            from public.live_sessions ls
            where ls.world_id = w.id
            order by ls.started_at desc nulls last, ls.created_at desc
            limit 1
          ) as latest_live_session_ended_at,
          (
            select wt.started_at
            from public.world_ticks wt
            where wt.world_id = w.id
            order by wt.tick desc, wt.started_at desc
            limit 1
          ) as last_tick_started_at
        from public.npcs n
        where n.world_id = w.id
      ) world_counts on true
      left join lateral (
        select max(ge.received_at) as last_gift_event_at
        from public.gift_events ge
        where ge.world_id = w.id
      ) gift_counts on true
      order by w.created_at desc
    `,
  );

  return rows.map((row) => ({
    tenant: mapTenant(row),
    streamer: mapStreamer(row),
    subscription: mapSubscription(row),
    world: mapWorld(row),
    lastGiftEventAt: row.last_gift_event_at,
  }));
}

export async function listAdminLiveSessions(db: SqlExecutor): Promise<AdminLiveSessionListItem[]> {
  const rows = await queryMany<{
    tenant_id: string;
    tenant_name: string;
    tenant_handle: string;
    tenant_status: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
    streamer_id: string;
    streamer_tenant_id: string;
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
    world_id: string;
    world_tenant_id: string;
    world_streamer_id: string;
    world_name: string;
    world_width: number;
    world_height: number;
    world_tick_interval_seconds: number;
    world_current_tick: number;
    world_world_seed: string;
    world_status: WorldSummaryRow['status'];
    world_created_at: Date;
    world_updated_at: Date;
    world_npc_count: number;
    world_alive_npc_count: number;
    world_dead_npc_count: number;
    world_latest_live_session_id: string | null;
    world_latest_live_session_status: LiveSessionRow['status'] | null;
    world_latest_live_session_started_at: Date | null;
    world_latest_live_session_ended_at: Date | null;
    world_last_tick_started_at: Date | null;
    live_session_id: string;
    live_session_tenant_id: string;
    live_session_streamer_id: string;
    live_session_world_id: string;
    live_session_platform: string;
    live_session_platform_live_id: string | null;
    live_session_status: LiveSessionRow['status'];
    live_session_started_at: Date | null;
    live_session_ended_at: Date | null;
    live_session_viewer_count_peak: number;
    live_session_gift_count: number;
    live_session_metadata: Record<string, unknown>;
    live_session_created_at: Date;
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
        s.tenant_id as streamer_tenant_id,
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
        w.id as world_id,
        w.tenant_id as world_tenant_id,
        w.streamer_id as world_streamer_id,
        w.name as world_name,
        w.width as world_width,
        w.height as world_height,
        w.tick_interval_seconds as world_tick_interval_seconds,
        w.current_tick as world_current_tick,
        w.world_seed as world_world_seed,
        w.status as world_status,
        w.created_at as world_created_at,
        w.updated_at as world_updated_at,
        coalesce(world_counts.npc_count, 0)::int as world_npc_count,
        coalesce(world_counts.alive_npc_count, 0)::int as world_alive_npc_count,
        coalesce(world_counts.dead_npc_count, 0)::int as world_dead_npc_count,
        world_counts.latest_live_session_id as world_latest_live_session_id,
        world_counts.latest_live_session_status as world_latest_live_session_status,
        world_counts.latest_live_session_started_at as world_latest_live_session_started_at,
        world_counts.latest_live_session_ended_at as world_latest_live_session_ended_at,
        world_counts.last_tick_started_at as world_last_tick_started_at,
        ls.id as live_session_id,
        ls.tenant_id as live_session_tenant_id,
        ls.streamer_id as live_session_streamer_id,
        ls.world_id as live_session_world_id,
        ls.platform as live_session_platform,
        ls.platform_live_id as live_session_platform_live_id,
        ls.status as live_session_status,
        ls.started_at as live_session_started_at,
        ls.ended_at as live_session_ended_at,
        ls.viewer_count_peak as live_session_viewer_count_peak,
        ls.gift_count as live_session_gift_count,
        ls.metadata as live_session_metadata,
        ls.created_at as live_session_created_at
      from public.live_sessions ls
      join public.worlds w on w.id = ls.world_id
      join public.tenants t on t.id = ls.tenant_id
      join public.streamers s on s.id = ls.streamer_id
      left join public.streamer_subscriptions sub
        on sub.tenant_id = ls.tenant_id
       and sub.streamer_id = ls.streamer_id
      left join lateral (
        select
          count(*)::int as npc_count,
          count(*) filter (where n.status = 'alive')::int as alive_npc_count,
          count(*) filter (where n.status = 'dead')::int as dead_npc_count,
          (
            select ls2.id
            from public.live_sessions ls2
            where ls2.world_id = w.id
            order by ls2.started_at desc nulls last, ls2.created_at desc
            limit 1
          ) as latest_live_session_id,
          (
            select ls2.status
            from public.live_sessions ls2
            where ls2.world_id = w.id
            order by ls2.started_at desc nulls last, ls2.created_at desc
            limit 1
          ) as latest_live_session_status,
          (
            select ls2.started_at
            from public.live_sessions ls2
            where ls2.world_id = w.id
            order by ls2.started_at desc nulls last, ls2.created_at desc
            limit 1
          ) as latest_live_session_started_at,
          (
            select ls2.ended_at
            from public.live_sessions ls2
            where ls2.world_id = w.id
            order by ls2.started_at desc nulls last, ls2.created_at desc
            limit 1
          ) as latest_live_session_ended_at,
          (
            select wt.started_at
            from public.world_ticks wt
            where wt.world_id = w.id
            order by wt.tick desc, wt.started_at desc
            limit 1
          ) as last_tick_started_at
        from public.npcs n
        where n.world_id = w.id
      ) world_counts on true
      order by coalesce(ls.started_at, ls.created_at) desc, ls.created_at desc
    `,
  );

  return rows.map((row) => ({
    liveSession: mapLiveSession(row),
    tenant: mapTenant(row),
    streamer: mapStreamer(row),
    world: mapWorld(row),
  }));
}

export async function listAdminGiftEvents(db: SqlExecutor): Promise<AdminGiftEventListItem[]> {
  const rows = await queryMany<{
    tenant_id: string;
    tenant_name: string;
    tenant_handle: string;
    tenant_status: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
    streamer_id: string;
    streamer_tenant_id: string;
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
    world_id: string;
    world_tenant_id: string;
    world_streamer_id: string;
    world_name: string;
    world_width: number;
    world_height: number;
    world_tick_interval_seconds: number;
    world_current_tick: number;
    world_world_seed: string;
    world_status: WorldSummaryRow['status'];
    world_created_at: Date;
    world_updated_at: Date;
    world_npc_count: number;
    world_alive_npc_count: number;
    world_dead_npc_count: number;
    world_latest_live_session_id: string | null;
    world_latest_live_session_status: LiveSessionRow['status'] | null;
    world_latest_live_session_started_at: Date | null;
    world_latest_live_session_ended_at: Date | null;
    world_last_tick_started_at: Date | null;
    live_session_id: string | null;
    live_session_tenant_id: string | null;
    live_session_streamer_id: string | null;
    live_session_world_id: string | null;
    live_session_platform: string | null;
    live_session_platform_live_id: string | null;
    live_session_status: LiveSessionRow['status'] | null;
    live_session_started_at: Date | null;
    live_session_ended_at: Date | null;
    live_session_viewer_count_peak: number | null;
    live_session_gift_count: number | null;
    live_session_metadata: Record<string, unknown> | null;
    live_session_created_at: Date | null;
    gift_event_id: string;
    gift_event_tenant_id: string;
    gift_event_streamer_id: string;
    gift_event_world_id: string;
    gift_event_live_session_id: string | null;
    gift_event_platform: string;
    gift_event_platform_event_id: string;
    gift_event_tiktok_id: string;
    gift_event_display_name: string | null;
    gift_event_gift_id: string | null;
    gift_event_gift_name: string | null;
    gift_event_gift_value: number;
    gift_event_repeat_count: number;
    gift_event_status: GiftEventRow['status'];
    gift_event_raw_payload: Record<string, unknown>;
    gift_event_received_at: Date;
    gift_event_processed_at: Date | null;
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
        s.tenant_id as streamer_tenant_id,
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
        w.id as world_id,
        w.tenant_id as world_tenant_id,
        w.streamer_id as world_streamer_id,
        w.name as world_name,
        w.width as world_width,
        w.height as world_height,
        w.tick_interval_seconds as world_tick_interval_seconds,
        w.current_tick as world_current_tick,
        w.world_seed as world_world_seed,
        w.status as world_status,
        w.created_at as world_created_at,
        w.updated_at as world_updated_at,
        coalesce(world_counts.npc_count, 0)::int as world_npc_count,
        coalesce(world_counts.alive_npc_count, 0)::int as world_alive_npc_count,
        coalesce(world_counts.dead_npc_count, 0)::int as world_dead_npc_count,
        world_counts.latest_live_session_id as world_latest_live_session_id,
        world_counts.latest_live_session_status as world_latest_live_session_status,
        world_counts.latest_live_session_started_at as world_latest_live_session_started_at,
        world_counts.latest_live_session_ended_at as world_latest_live_session_ended_at,
        world_counts.last_tick_started_at as world_last_tick_started_at,
        ls.id as live_session_id,
        ls.tenant_id as live_session_tenant_id,
        ls.streamer_id as live_session_streamer_id,
        ls.world_id as live_session_world_id,
        ls.platform as live_session_platform,
        ls.platform_live_id as live_session_platform_live_id,
        ls.status as live_session_status,
        ls.started_at as live_session_started_at,
        ls.ended_at as live_session_ended_at,
        ls.viewer_count_peak as live_session_viewer_count_peak,
        ls.gift_count as live_session_gift_count,
        ls.metadata as live_session_metadata,
        ls.created_at as live_session_created_at,
        ge.id as gift_event_id,
        ge.tenant_id as gift_event_tenant_id,
        ge.streamer_id as gift_event_streamer_id,
        ge.world_id as gift_event_world_id,
        ge.live_session_id as gift_event_live_session_id,
        ge.platform as gift_event_platform,
        ge.platform_event_id as gift_event_platform_event_id,
        ge.tiktok_id as gift_event_tiktok_id,
        ge.display_name as gift_event_display_name,
        ge.gift_id as gift_event_gift_id,
        ge.gift_name as gift_event_gift_name,
        ge.gift_value as gift_event_gift_value,
        ge.repeat_count as gift_event_repeat_count,
        ge.status as gift_event_status,
        ge.raw_payload as gift_event_raw_payload,
        ge.received_at as gift_event_received_at,
        ge.processed_at as gift_event_processed_at
      from public.gift_events ge
      join public.worlds w on w.id = ge.world_id
      join public.tenants t on t.id = ge.tenant_id
      join public.streamers s on s.id = ge.streamer_id
      left join public.live_sessions ls on ls.id = ge.live_session_id
      left join lateral (
        select
          count(*)::int as npc_count,
          count(*) filter (where n.status = 'alive')::int as alive_npc_count,
          count(*) filter (where n.status = 'dead')::int as dead_npc_count,
          (
            select ls2.id
            from public.live_sessions ls2
            where ls2.world_id = w.id
            order by ls2.started_at desc nulls last, ls2.created_at desc
            limit 1
          ) as latest_live_session_id,
          (
            select ls2.status
            from public.live_sessions ls2
            where ls2.world_id = w.id
            order by ls2.started_at desc nulls last, ls2.created_at desc
            limit 1
          ) as latest_live_session_status,
          (
            select ls2.started_at
            from public.live_sessions ls2
            where ls2.world_id = w.id
            order by ls2.started_at desc nulls last, ls2.created_at desc
            limit 1
          ) as latest_live_session_started_at,
          (
            select ls2.ended_at
            from public.live_sessions ls2
            where ls2.world_id = w.id
            order by ls2.started_at desc nulls last, ls2.created_at desc
            limit 1
          ) as latest_live_session_ended_at,
          (
            select wt.started_at
            from public.world_ticks wt
            where wt.world_id = w.id
            order by wt.tick desc, wt.started_at desc
            limit 1
          ) as last_tick_started_at
        from public.npcs n
        where n.world_id = w.id
      ) world_counts on true
      order by ge.received_at desc
      limit 200
    `,
  );

  return rows.map((row) => ({
    giftEvent: mapGiftEvent(row),
    tenant: mapTenant(row),
    streamer: mapStreamer(row),
    world: mapWorld(row),
    liveSession: row.live_session_id
      ? mapLiveSession({
          live_session_id: row.live_session_id,
          live_session_tenant_id: row.live_session_tenant_id ?? row.tenant_id,
          live_session_streamer_id: row.live_session_streamer_id ?? row.streamer_id,
          live_session_world_id: row.live_session_world_id ?? row.world_id,
          live_session_platform: row.live_session_platform ?? 'tiktok',
          live_session_platform_live_id: row.live_session_platform_live_id,
          live_session_status: row.live_session_status ?? 'created',
          live_session_started_at: row.live_session_started_at,
          live_session_ended_at: row.live_session_ended_at,
          live_session_viewer_count_peak: row.live_session_viewer_count_peak ?? 0,
          live_session_gift_count: row.live_session_gift_count ?? 0,
          live_session_metadata: row.live_session_metadata ?? {},
          live_session_created_at: row.live_session_created_at ?? row.gift_event_received_at,
        })
      : null,
  }));
}

export async function loadAdminStreamerDetail(
  db: SqlExecutor,
  streamerId: string,
): Promise<AdminStreamerDetailResult | null> {
  const streamer = await loadStreamerById(db, streamerId);
  if (!streamer) {
    return null;
  }

  const context = await loadStreamerContext(db, streamer.handle);
  const recentLiveSessions = await queryMany<LiveSessionRow>(
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
      order by created_at desc
      limit 20
    `,
    [context.tenant.id, context.streamer.id],
  );

  const recentGiftEvents = await queryMany<GiftEventRow>(
    db,
    `
      select
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
      from public.gift_events
      where tenant_id = $1
        and streamer_id = $2
      order by received_at desc
      limit 20
    `,
    [context.tenant.id, context.streamer.id],
  );

  return {
    ...context,
    recentLiveSessions,
    recentGiftEvents,
  };
}

export async function loadAdminSystemHealth(db: SqlExecutor): Promise<AdminSystemHealthResult> {
  const row = await queryOne<{
    active_world_count: number;
    last_tick_at: Date | null;
    last_gift_event_at: Date | null;
  }>(
    db,
    `
      select
        (select count(*)::int from public.worlds where status in ('active', 'live')) as active_world_count,
        (select max(wt.started_at) from public.world_ticks wt) as last_tick_at,
        (select max(ge.received_at) from public.gift_events ge) as last_gift_event_at
    `,
  );

  if (!row) {
    throw new Error('admin system health の取得に失敗しました');
  }

  return {
    backendStatus: 'ok',
    databaseStatus: 'connected',
    websocketClients: 0,
    activeWorldCount: row.active_world_count,
    lastTickAt: row.last_tick_at,
    lastGiftEventAt: row.last_gift_event_at,
  };
}
