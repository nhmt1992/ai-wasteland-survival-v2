export type PlanType = 'free_trial' | 'starter' | 'pro' | 'studio';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export type WorldStatus = 'inactive' | 'active' | 'live' | 'paused' | 'archived';
export type LiveSessionStatus = 'created' | 'connecting' | 'live' | 'ended' | 'failed';
export type NpcStatus = 'alive' | 'dead' | 'missing';
export type NpcActionType =
  | 'idle'
  | 'move'
  | 'gather_food'
  | 'gather_water'
  | 'gather_wood'
  | 'rest'
  | 'eat'
  | 'drink'
  | 'pickup_grant'
  | 'socialize'
  | 'trade'
  | 'steal'
  | 'attack'
  | 'flee'
  | 'build_shelter'
  | 'join_tribe'
  | 'leave_tribe';
export type ItemCategory = 'food' | 'water' | 'material' | 'tool' | 'weapon' | 'medicine' | 'special';
export type GiftEventStatus = 'received' | 'processed' | 'ignored' | 'failed';
export type GrantStatus = 'pending' | 'spawned' | 'claimed' | 'expired';
export type GiftConnectionStatus = 'not_connected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'test_mode';
export type GiftAdapterType = 'dev_mock' | 'manual' | 'tiktok_experimental' | 'future_official';
export type BillingEventStatus = 'received' | 'processed' | 'failed';

export interface TenantRow {
  id: string;
  name: string;
  handle: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface StreamerRow {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  default_tiktok_id: string | null;
  password_hash: string;
  password_updated_at: Date;
  last_login_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PlatformAdminRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface StreamerSessionRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  session_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AdminSessionRow {
  id: string;
  admin_id: string;
  session_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  plan: PlanType;
  status: SubscriptionStatus;
  max_worlds: number;
  max_npcs_per_world: number;
  ai_narration_quota: number;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface GiftSourceConnectionRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  platform: string;
  connection_type: GiftAdapterType;
  status: GiftConnectionStatus;
  encrypted_credentials: Record<string, unknown> | null;
  last_connected_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorldRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  name: string;
  width: number;
  height: number;
  tick_interval_seconds: number;
  current_tick: number;
  world_seed: string;
  status: WorldStatus;
  created_at: Date;
  updated_at: Date;
}

export interface WorldSummaryRow extends WorldRow {
  npc_count: number;
  alive_npc_count: number;
  dead_npc_count: number;
  latest_live_session_id: string | null;
  latest_live_session_status: LiveSessionStatus | null;
  latest_live_session_started_at: Date | null;
  latest_live_session_ended_at: Date | null;
  last_tick_started_at: Date | null;
}

export interface LiveSessionRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  world_id: string;
  platform: string;
  platform_live_id: string | null;
  status: LiveSessionStatus;
  started_at: Date | null;
  ended_at: Date | null;
  viewer_count_peak: number;
  gift_count: number;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface WorldTileRow {
  id: string;
  world_id: string;
  tile_x: number;
  tile_y: number;
  tile_type: string;
  danger_level: number;
  fertility: number;
  water_level: number;
  has_blocker: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface WorldTickRow {
  id: string;
  world_id: string;
  tick: number;
  started_at: Date;
  finished_at: Date | null;
  npc_count: number;
  alive_count: number;
  dead_count: number;
  metadata: Record<string, unknown>;
}

export interface ViewerUserRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  tiktok_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NpcRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  world_id: string;
  viewer_user_id: string | null;
  name: string;
  age: number | null;
  gender: string | null;
  appearance_key: string;
  personality_prompt: string | null;
  backstory: string | null;
  trait_social: number;
  trait_aggression: number;
  trait_greed: number;
  trait_cooperation: number;
  trait_risk: number;
  trait_leadership: number;
  ai_seed: string;
  status: NpcStatus;
  death_cause: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NpcStateRow {
  npc_id: string;
  tile_x: number;
  tile_y: number;
  hp: number;
  food: number;
  water: number;
  stamina: number;
  morale: number;
  injury: number;
  shelter: number;
  current_action: NpcActionType;
  action_target_x: number | null;
  action_target_y: number | null;
  action_started_at: Date | null;
  action_ends_at: Date | null;
  last_tick: number;
  updated_at: Date;
}

export interface NpcInventoryRow {
  id: string;
  npc_id: string;
  item_id: string;
  quantity: number;
  durability: number | null;
  updated_at: Date;
}

export interface TileResourceRow {
  id: string;
  world_id: string;
  tile_x: number;
  tile_y: number;
  item_id: string;
  quantity: number;
  regen_per_tick: number;
  updated_at: Date;
}

export interface ItemDefinitionRow {
  id: string;
  name_ja: string;
  name_zh: string;
  category: ItemCategory;
  max_stack: number;
  restore_food: number;
  restore_water: number;
  restore_hp: number;
  tool_bonus: number;
  decay_per_tick: number;
  metadata: Record<string, unknown>;
}

export interface ResourcePackRow {
  id: string;
  name_ja: string;
  name_zh: string;
  tier: number;
  metadata: Record<string, unknown>;
}

export interface ResourcePackItemRow {
  pack_id: string;
  item_id: string;
  quantity: number;
  weight: number;
}

export interface ResourceGrantRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  world_id: string;
  live_session_id: string | null;
  gift_event_id: string | null;
  viewer_user_id: string | null;
  target_npc_id: string | null;
  pack_id: string | null;
  status: GrantStatus;
  spawn_tile_x: number | null;
  spawn_tile_y: number | null;
  expires_at: Date | null;
  claimed_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface GiftEventRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  world_id: string;
  live_session_id: string | null;
  platform: string;
  platform_event_id: string;
  tiktok_id: string;
  display_name: string | null;
  gift_id: string | null;
  gift_name: string | null;
  gift_value: number;
  repeat_count: number;
  status: GiftEventStatus;
  raw_payload: Record<string, unknown>;
  received_at: Date;
  processed_at: Date | null;
}

export interface BillingEventRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  subscription_id: string | null;
  provider: string;
  provider_event_id: string;
  provider_session_id: string | null;
  event_type: string;
  status: BillingEventStatus;
  payload: Record<string, unknown>;
  created_at: Date;
}

export interface WorldEventInsertRow {
  id: string;
  tenant_id: string;
  streamer_id: string;
  world_id: string;
  live_session_id: string | null;
  tick: number;
  event_type: string;
  title_ja: string | null;
  description_ja: string | null;
  actor_npc_id: string | null;
  target_npc_id: string | null;
  tile_x: number | null;
  tile_y: number | null;
  metadata: Record<string, unknown>;
}

export interface WorldEventRow extends WorldEventInsertRow {
  created_at: Date;
}

export interface WorldTickContext {
  tenant: TenantRow;
  streamer: StreamerRow;
  subscription: SubscriptionRow | null;
  giftConnection: GiftSourceConnectionRow | null;
  world: WorldRow;
  live_session: LiveSessionRow | null;
  item_definitions: ItemDefinitionRow[];
  resource_packs: ResourcePackRow[];
  resource_pack_items: ResourcePackItemRow[];
  world_tiles: WorldTileRow[];
  tile_resources: TileResourceRow[];
  resource_grants: ResourceGrantRow[];
  npcs: NpcRow[];
  npc_states: NpcStateRow[];
  npc_inventories: NpcInventoryRow[];
}

export interface WorldTickOutcome {
  nextTick: number;
  tickStartedAt: Date;
  tickFinishedAt: Date;
  npcStates: NpcStateRow[];
  npcInventories: NpcInventoryRow[];
  tileResources: TileResourceRow[];
  resourceGrants: ResourceGrantRow[];
  worldEvents: WorldEventInsertRow[];
  worldTick: WorldTickRow;
  worldStatus: WorldStatus;
}

export interface RealtimeMessage {
  type: string;
  worldId: string;
  timestamp: string;
  [key: string]: unknown;
}
