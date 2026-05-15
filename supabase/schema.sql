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
  email text unique,
  display_name text not null,
  handle text not null unique,
  avatar_url text,
  default_tiktok_id text,
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
values ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'matt')
on conflict do nothing;

insert into public.streamers (id, tenant_id, email, display_name, handle, default_tiktok_id)
values (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'demo@example.com',
  'マット',
  'matt',
  'matt_demo'
)
on conflict do nothing;

insert into public.streamer_members (tenant_id, streamer_id, role)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  'owner'
)
on conflict do nothing;

insert into public.streamer_subscriptions (tenant_id, streamer_id, plan, status, max_worlds, max_npcs_per_world)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  'free_trial',
  'trialing',
  1,
  10
)
on conflict do nothing;

insert into public.worlds (id, tenant_id, streamer_id, name, width, height, world_seed, status)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '荒土世界 Alpha',
  64,
  64,
  'alpha-seed-v2',
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
