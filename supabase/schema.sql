-- =========================================================
-- AI Wasteland Survival v2
-- Multi-Streamer SaaS PostgreSQL Schema
-- =========================================================

create extension if not exists "pgcrypto";

-- -----------------------------
-- ENUMS
-- -----------------------------

create type subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired'
);

create type plan_type as enum (
  'free_trial',
  'starter',
  'pro',
  'studio'
);

create type world_status as enum (
  'inactive',
  'active',
  'live',
  'paused',
  'archived'
);

create type live_session_status as enum (
  'created',
  'connecting',
  'live',
  'ended',
  'failed'
);

create type npc_status as enum (
  'alive',
  'dead',
  'missing'
);

create type npc_action_type as enum (
  'idle',
  'move',
  'gather_food',
  'gather_water',
  'gather_wood',
  'rest',
  'eat',
  'drink',
  'pickup_grant',
  'socialize',
  'trade',
  'steal',
  'attack',
  'flee',
  'build_shelter',
  'join_tribe',
  'leave_tribe'
);

create type item_category as enum (
  'food',
  'water',
  'material',
  'tool',
  'weapon',
  'medicine',
  'special'
);

create type gift_event_status as enum (
  'received',
  'processed',
  'ignored',
  'failed'
);

create type grant_status as enum (
  'pending',
  'spawned',
  'claimed',
  'expired'
);

create type gift_connection_status as enum (
  'not_connected',
  'connecting',
  'connected',
  'reconnecting',
  'failed',
  'test_mode'
);

-- -----------------------------
-- TENANT / STREAMER
-- -----------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handle text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.streamers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  handle text not null unique,
  avatar_url text,
  default_tiktok_id text,
  password_hash text not null,
  password_updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.streamer_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique(tenant_id, streamer_id)
);

create table public.streamer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  plan plan_type not null default 'free_trial',
  status subscription_status not null default 'trialing',
  max_worlds int not null default 1,
  max_npcs_per_world int not null default 5,
  ai_narration_quota int not null default 0,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.streamer_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_streamer_sessions_streamer on public.streamer_sessions(streamer_id, expires_at desc);

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.platform_admins(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_admin_sessions_admin on public.admin_sessions(admin_id, expires_at desc);

-- -----------------------------
-- WORLD / LIVE SESSION
-- -----------------------------

create table public.worlds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  name text not null,
  width int not null default 64,
  height int not null default 64,
  tick_interval_seconds int not null default 60,
  current_tick bigint not null default 0,
  world_seed text not null,
  status world_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_worlds_tenant_streamer on public.worlds(tenant_id, streamer_id);

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  platform text not null default 'tiktok',
  platform_live_id text,
  status live_session_status not null default 'created',
  started_at timestamptz,
  ended_at timestamptz,
  viewer_count_peak int not null default 0,
  gift_count int not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_live_sessions_world_status on public.live_sessions(world_id, status);
create unique index idx_live_sessions_one_live_per_streamer on public.live_sessions(streamer_id) where status = 'live' and ended_at is null;

create table public.world_tiles (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  tile_x int not null,
  tile_y int not null,
  tile_type text not null,
  danger_level int not null default 0 check (danger_level between 0 and 100),
  fertility int not null default 0 check (fertility between 0 and 100),
  water_level int not null default 0 check (water_level between 0 and 100),
  has_blocker boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(world_id, tile_x, tile_y)
);

create table public.world_ticks (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  tick bigint not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  npc_count int not null default 0,
  alive_count int not null default 0,
  dead_count int not null default 0,
  metadata jsonb not null default '{}',
  unique(world_id, tick)
);

-- -----------------------------
-- VIEWER / NPC
-- -----------------------------

create table public.viewer_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  tiktok_id text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, tiktok_id)
);

create table public.npcs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  viewer_user_id uuid references public.viewer_users(id) on delete set null,
  name text not null,
  age int check (age between 1 and 120),
  gender text,
  appearance_key text not null default 'npc_common',
  personality_prompt text,
  backstory text,
  trait_social int not null default 50 check (trait_social between 0 and 100),
  trait_aggression int not null default 30 check (trait_aggression between 0 and 100),
  trait_greed int not null default 30 check (trait_greed between 0 and 100),
  trait_cooperation int not null default 50 check (trait_cooperation between 0 and 100),
  trait_risk int not null default 40 check (trait_risk between 0 and 100),
  trait_leadership int not null default 30 check (trait_leadership between 0 and 100),
  ai_seed text not null,
  status npc_status not null default 'alive',
  death_cause text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_npcs_world_status on public.npcs(world_id, status);
create index idx_npcs_tenant_viewer on public.npcs(tenant_id, viewer_user_id);

create table public.npc_states (
  npc_id uuid primary key references public.npcs(id) on delete cascade,
  tile_x int not null,
  tile_y int not null,
  hp numeric(6,2) not null default 100 check (hp >= 0 and hp <= 100),
  food numeric(6,2) not null default 70 check (food >= 0 and food <= 100),
  water numeric(6,2) not null default 70 check (water >= 0 and water <= 100),
  stamina numeric(6,2) not null default 100 check (stamina >= 0 and stamina <= 100),
  morale numeric(6,2) not null default 60 check (morale >= 0 and morale <= 100),
  injury numeric(6,2) not null default 0 check (injury >= 0 and injury <= 100),
  shelter numeric(6,2) not null default 0 check (shelter >= 0 and shelter <= 100),
  current_action npc_action_type not null default 'idle',
  action_target_x int,
  action_target_y int,
  action_started_at timestamptz,
  action_ends_at timestamptz,
  last_tick bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index idx_npc_states_position on public.npc_states(tile_x, tile_y);

-- -----------------------------
-- ITEMS / RESOURCES
-- -----------------------------

create table public.item_definitions (
  id text primary key,
  name_ja text not null,
  name_zh text not null,
  category item_category not null,
  max_stack int not null default 99,
  restore_food int not null default 0,
  restore_water int not null default 0,
  restore_hp int not null default 0,
  tool_bonus int not null default 0,
  decay_per_tick numeric(8,4) not null default 0,
  metadata jsonb not null default '{}'
);

create table public.npc_inventory (
  id uuid primary key default gen_random_uuid(),
  npc_id uuid not null references public.npcs(id) on delete cascade,
  item_id text not null references public.item_definitions(id),
  quantity numeric(10,2) not null default 0 check (quantity >= 0),
  durability numeric(6,2) check (durability is null or durability between 0 and 100),
  updated_at timestamptz not null default now(),
  unique(npc_id, item_id)
);

create table public.tile_resources (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  tile_x int not null,
  tile_y int not null,
  item_id text not null references public.item_definitions(id),
  quantity numeric(10,2) not null default 0 check (quantity >= 0),
  regen_per_tick numeric(10,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique(world_id, tile_x, tile_y, item_id)
);

-- -----------------------------
-- MEMORY / EVENTS
-- -----------------------------

create table public.npc_memories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  npc_id uuid not null references public.npcs(id) on delete cascade,
  tick bigint not null,
  importance int not null default 50 check (importance between 0 and 100),
  memory_type text not null,
  summary text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.world_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  live_session_id uuid references public.live_sessions(id) on delete set null,
  tick bigint not null,
  event_type text not null,
  title_ja text,
  description_ja text,
  actor_npc_id uuid references public.npcs(id) on delete set null,
  target_npc_id uuid references public.npcs(id) on delete set null,
  tile_x int,
  tile_y int,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_world_events_tenant_world_tick on public.world_events(tenant_id, world_id, tick desc);

-- -----------------------------
-- GIFTS
-- -----------------------------

create table public.gift_source_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  platform text not null default 'tiktok',
  connection_type text not null default 'dev_mock',
  status gift_connection_status not null default 'not_connected',
  encrypted_credentials jsonb,
  last_connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_gift_source_connections_tenant_streamer
  on public.gift_source_connections(tenant_id, streamer_id);

create table public.resource_packs (
  id text primary key,
  name_ja text not null,
  name_zh text not null,
  tier int not null default 1,
  metadata jsonb not null default '{}'
);

create table public.resource_pack_items (
  pack_id text not null references public.resource_packs(id) on delete cascade,
  item_id text not null references public.item_definitions(id),
  quantity numeric(10,2) not null check (quantity > 0),
  weight int not null default 100,
  primary key (pack_id, item_id)
);

create table public.gift_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  live_session_id uuid references public.live_sessions(id) on delete set null,
  platform text not null default 'tiktok',
  platform_event_id text not null,
  tiktok_id text not null,
  display_name text,
  gift_id text,
  gift_name text,
  gift_value int not null default 0,
  repeat_count int not null default 1,
  status gift_event_status not null default 'received',
  raw_payload jsonb not null default '{}',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(platform, platform_event_id)
);

create index idx_gift_events_live_session_status on public.gift_events(live_session_id, status);
create index idx_gift_events_tenant_tiktok on public.gift_events(tenant_id, tiktok_id);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  subscription_id uuid references public.streamer_subscriptions(id) on delete set null,
  provider text not null default 'mock_stripe',
  provider_event_id text not null unique,
  provider_session_id text,
  event_type text not null,
  status text not null default 'received',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_billing_events_tenant_streamer_created_at
  on public.billing_events(tenant_id, streamer_id, created_at desc);

create table public.resource_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  live_session_id uuid references public.live_sessions(id) on delete set null,
  gift_event_id uuid references public.gift_events(id) on delete set null,
  viewer_user_id uuid references public.viewer_users(id) on delete set null,
  target_npc_id uuid references public.npcs(id) on delete set null,
  pack_id text references public.resource_packs(id),
  status grant_status not null default 'pending',
  spawn_tile_x int,
  spawn_tile_y int,
  expires_at timestamptz,
  claimed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_resource_grants_world_status on public.resource_grants(world_id, status);
create index idx_resource_grants_npc_status on public.resource_grants(target_npc_id, status);

-- -----------------------------
-- SEED DATA
-- -----------------------------

insert into public.tenants (id, name, handle)
values
  ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'matt'),
  ('00000000-0000-0000-0000-000000000002', 'Streamer A Tenant', 'streamer_a'),
  ('00000000-0000-0000-0000-000000000003', 'Streamer B Tenant', 'streamer_b')
on conflict do nothing;

insert into public.streamers (
  id,
  tenant_id,
  email,
  display_name,
  handle,
  default_tiktok_id,
  password_hash,
  password_updated_at,
  last_login_at,
  is_active
)
values
(
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'matt@example.com',
  'マット',
  'matt',
  'matt_demo',
  crypt('matt-demo-123', gen_salt('bf')),
  now(),
  null,
  true
),
(
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000002',
  'streamer_a@example.com',
  '配信者 A',
  'streamer_a',
  'streamer_a_demo',
  crypt('streamer-a-123', gen_salt('bf')),
  now(),
  null,
  true
),
(
  '00000000-0000-0000-0000-000000000013',
  '00000000-0000-0000-0000-000000000003',
  'streamer_b@example.com',
  '配信者 B',
  'streamer_b',
  'streamer_b_demo',
  crypt('streamer-b-123', gen_salt('bf')),
  now(),
  null,
  true
)
on conflict do nothing;

insert into public.platform_admins (
  id,
  email,
  display_name,
  password_hash,
  is_active,
  last_login_at,
  created_at,
  updated_at
)
values
(
  '00000000-0000-0000-0000-000000000021',
  'admin@example.com',
  'プラットフォーム管理者',
  crypt('admin-demo-123', gen_salt('bf')),
  true,
  null,
  now(),
  now()
)
on conflict do nothing;

insert into public.streamer_members (tenant_id, streamer_id, role)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'owner'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', 'owner'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000013', 'owner')
on conflict do nothing;

insert into public.streamer_subscriptions (tenant_id, streamer_id, plan, status, max_worlds, max_npcs_per_world)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'free_trial', 'trialing', 1, 5),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', 'free_trial', 'trialing', 1, 5),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000013', 'free_trial', 'trialing', 1, 5)
on conflict do nothing;

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
values
(
  '00000000-0000-0000-0000-000000000131',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  'tiktok',
  'dev_mock',
  'test_mode',
  '{"seed": true, "source": "schema", "adapterType": "dev_mock"}',
  now(),
  null,
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000132',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000012',
  'tiktok',
  'dev_mock',
  'not_connected',
  '{"seed": true, "source": "schema", "adapterType": "dev_mock"}',
  null,
  null,
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000133',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000013',
  'tiktok',
  'dev_mock',
  'not_connected',
  '{"seed": true, "source": "schema", "adapterType": "dev_mock"}',
  null,
  null,
  now(),
  now()
)
on conflict (tenant_id, streamer_id) do nothing;

insert into public.worlds (id, tenant_id, streamer_id, name, width, height, world_seed, status)
values
(
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '荒土世界 Alpha',
  64,
  64,
  'alpha-seed-v2',
  'active'
),
(
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000012',
  '荒土世界 Beta',
  64,
  64,
  'streamer-a-seed-v2',
  'active'
),
(
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000013',
  '荒土世界 Gamma',
  64,
  64,
  'streamer-b-seed-v2',
  'active'
)
on conflict do nothing;

insert into public.item_definitions
(id, name_ja, name_zh, category, max_stack, restore_food, restore_water, restore_hp, tool_bonus, decay_per_tick)
values
('food_dry_meat', '干し肉', '干肉', 'food', 20, 25, 0, 0, 0, 0.001),
('food_berries', '野生ベリー', '野莓', 'food', 20, 12, 0, 0, 0, 0.01),
('water_bottle', '水ボトル', '瓶装水', 'water', 20, 0, 30, 0, 0, 0),
('wood', '木材', '木材', 'material', 99, 0, 0, 0, 0, 0),
('stone', '石材', '石材', 'material', 99, 0, 0, 0, 0, 0),
('scrap', 'スクラップ', '废料', 'material', 99, 0, 0, 0, 0, 0),
('tool_axe', '斧', '斧头', 'tool', 1, 0, 0, 0, 20, 0),
('medicine_basic', '応急薬', '基础药品', 'medicine', 10, 0, 0, 30, 0, 0)
on conflict do nothing;

insert into public.resource_packs (id, name_ja, name_zh, tier)
values
('small_food_pack', '小型食料パック', '小型食物包', 1),
('small_water_pack', '小型水パック', '小型水包', 1),
('basic_survival_pack', '基本サバイバルパック', '基础生存包', 2)
on conflict do nothing;

insert into public.resource_pack_items (pack_id, item_id, quantity, weight)
values
('small_food_pack', 'food_berries', 3, 100),
('small_water_pack', 'water_bottle', 2, 100),
('basic_survival_pack', 'food_dry_meat', 2, 100),
('basic_survival_pack', 'water_bottle', 2, 100),
('basic_survival_pack', 'wood', 5, 100)
on conflict do nothing;

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
)
values (
  '00000000-0000-0000-0000-000000000121',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000101',
  'tiktok',
  'dev-seeded-live',
  'created',
  now(),
  0,
  0,
  '{"seed": true, "source": "schema"}'
)
on conflict do nothing;

with grid as (
  select
    x,
    y,
    case
      when x between 27 and 36 and y between 27 and 36 then 'oasis'
      when x = 0 or y = 0 or x = 63 or y = 63 then 'border_wastes'
      when mod(x + y, 11) = 0 then 'ruins'
      when mod(x, 7) = 0 or mod(y, 7) = 0 then 'rocky'
      when mod(x * 3 + y * 5, 9) <= 2 then 'scrub'
      else 'dust_plain'
    end as tile_type,
    case
      when x between 27 and 36 and y between 27 and 36 then 8
      when x = 0 or y = 0 or x = 63 or y = 63 then 55
      when mod(x + y, 11) = 0 then 70
      when mod(x, 7) = 0 or mod(y, 7) = 0 then 28
      when mod(x * 3 + y * 5, 9) <= 2 then 18
      else 10
    end as danger_level,
    case
      when x between 27 and 36 and y between 27 and 36 then 82
      when x = 0 or y = 0 or x = 63 or y = 63 then 5
      when mod(x + y, 11) = 0 then 8
      when mod(x, 7) = 0 or mod(y, 7) = 0 then 15
      when mod(x * 3 + y * 5, 9) <= 2 then 38
      else 14
    end as fertility,
    case
      when x between 27 and 36 and y between 27 and 36 then 92
      when x = 0 or y = 0 or x = 63 or y = 63 then 10
      when mod(x + y, 11) = 0 then 6
      when mod(x, 7) = 0 or mod(y, 7) = 0 then 12
      when mod(x * 3 + y * 5, 9) <= 2 then 24
      else 8
    end as water_level,
    case
      when x between 27 and 36 and y between 27 and 36 then false
      when x = 0 or y = 0 or x = 63 or y = 63 then false
      when mod(x + y, 11) = 0 then true
      when mod(x, 7) = 0 or mod(y, 7) = 0 then mod(x + y, 13) = 0
      else false
    end as has_blocker
  from generate_series(0, 63) as gx(x)
  cross join generate_series(0, 63) as gy(y)
)
insert into public.world_tiles (
  world_id,
  tile_x,
  tile_y,
  tile_type,
  danger_level,
  fertility,
  water_level,
  has_blocker,
  metadata
)
select
  '00000000-0000-0000-0000-000000000101',
  x,
  y,
  tile_type,
  danger_level,
  fertility,
  water_level,
  has_blocker,
  jsonb_build_object(
    'seed', true,
    'region',
    case
      when tile_type = 'oasis' then 'center'
      when tile_type = 'ruins' then 'ruins'
      when tile_type = 'rocky' then 'ridge'
      when tile_type = 'scrub' then 'scrubland'
      when tile_type = 'border_wastes' then 'border'
      else 'plain'
    end
  )
from grid
on conflict (world_id, tile_x, tile_y) do nothing;

insert into public.tile_resources (
  world_id,
  tile_x,
  tile_y,
  item_id,
  quantity,
  regen_per_tick,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000101',
  x,
  y,
  item_id,
  quantity,
  regen_per_tick,
  now()
from (
  select
    x,
    y,
    case
      when x between 28 and 35 and y between 28 and 35 and mod(x + y, 2) = 0 then 'water_bottle'
      when mod(x * 3 + y * 5, 9) <= 2 and mod(x + y, 4) = 0 then 'food_berries'
      when mod(x + y, 11) = 0 then 'scrap'
      when mod(x, 7) = 0 or mod(y, 7) = 0 then 'stone'
      when mod(x * 5 + y * 3, 17) = 0 then 'wood'
      else null
    end as item_id,
    case
      when x between 28 and 35 and y between 28 and 35 and mod(x + y, 2) = 0 then 2.00
      when mod(x * 3 + y * 5, 9) <= 2 and mod(x + y, 4) = 0 then 3.00
      when mod(x + y, 11) = 0 then 4.00
      when mod(x, 7) = 0 or mod(y, 7) = 0 then 5.00
      when mod(x * 5 + y * 3, 17) = 0 then 6.00
      else null
    end as quantity,
    case
      when x between 28 and 35 and y between 28 and 35 and mod(x + y, 2) = 0 then 0.02
      when mod(x * 3 + y * 5, 9) <= 2 and mod(x + y, 4) = 0 then 0.03
      when mod(x + y, 11) = 0 then 0.015
      when mod(x, 7) = 0 or mod(y, 7) = 0 then 0.01
      when mod(x * 5 + y * 3, 17) = 0 then 0.008
      else null
    end as regen_per_tick
  from generate_series(0, 63) as gx(x)
  cross join generate_series(0, 63) as gy(y)
) seeded_resources
where item_id is not null
on conflict (world_id, tile_x, tile_y, item_id) do nothing;

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
  death_cause
)
values
(
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000101',
  null,
  'レン',
  26,
  'male',
  'npc_ren',
  '冷静で観察力が高い。まず状況を把握してから動く。',
  '荒土世界で先に動くより、まず生き残る道を探すタイプ。',
  48,
  32,
  28,
  72,
  40,
  58,
  'seed-ren-v2',
  'alive',
  null
),
(
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000101',
  null,
  'ミナ',
  23,
  'female',
  'npc_mina',
  '水源を探すのが得意で、仲間への気配りが細かい。',
  '限られた資源の中でも、静かに連携して生き延びてきた。',
  72,
  20,
  34,
  78,
  36,
  34,
  'seed-mina-v2',
  'alive',
  null
),
(
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000101',
  null,
  'タク',
  29,
  'male',
  'npc_taku',
  '物資集めを優先する慎重な生存者。',
  '危険が見えるとすぐ動きを変える、実利重視のタイプ。',
  38,
  54,
  44,
  52,
  58,
  44,
  'seed-taku-v2',
  'alive',
  null
),
(
  '00000000-0000-0000-0000-000000000204',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000101',
  null,
  'ユイ',
  21,
  'female',
  'npc_yui',
  '人をまとめるのが得意で、場の空気を読む。',
  '資源を分け合うより、全体の安定を優先する。',
  66,
  28,
  36,
  76,
  42,
  52,
  'seed-yui-v2',
  'alive',
  null
),
(
  '00000000-0000-0000-0000-000000000205',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000101',
  null,
  'ハル',
  31,
  'male',
  'npc_haru',
  '危険地帯の探索を恐れない、少し大胆な斥候。',
  '高リスクでも、見返りがあるなら踏み込む。',
  52,
  36,
  62,
  48,
  64,
  56,
  'seed-haru-v2',
  'alive',
  null
)
on conflict do nothing;

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
  last_tick
)
values
(
  '00000000-0000-0000-0000-000000000201',
  31,
  30,
  100,
  72,
  78,
  96,
  64,
  0,
  12,
  'idle',
  null,
  null,
  null,
  null,
  0
),
(
  '00000000-0000-0000-0000-000000000202',
  33,
  31,
  100,
  66,
  82,
  92,
  68,
  0,
  10,
  'idle',
  null,
  null,
  null,
  null,
  0
),
(
  '00000000-0000-0000-0000-000000000203',
  29,
  33,
  100,
  80,
  60,
  94,
  58,
  0,
  8,
  'idle',
  null,
  null,
  null,
  null,
  0
),
(
  '00000000-0000-0000-0000-000000000204',
  35,
  34,
  100,
  68,
  70,
  98,
  70,
  0,
  14,
  'idle',
  null,
  null,
  null,
  null,
  0
),
(
  '00000000-0000-0000-0000-000000000205',
  30,
  35,
  100,
  58,
  74,
  90,
  60,
  0,
  6,
  'idle',
  null,
  null,
  null,
  null,
  0
)
on conflict do nothing;

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
)
values (
  '00000000-0000-0000-0000-000000000132',
  '00000000-0000-0000-0000-000000000101',
  0,
  now(),
  now(),
  5,
  5,
  0,
  '{"seed": true, "source": "schema"}'
)
on conflict do nothing;

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
)
values (
  '00000000-0000-0000-0000-000000000131',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000121',
  0,
  'world_initialized',
  '荒土世界 Alpha が起動しました',
  '5人の初期 NPC と 64×64 のワールドが配置されました。',
  null,
  null,
  31,
  31,
  '{"seed": true, "source": "schema"}'
)
on conflict (id) do nothing;
