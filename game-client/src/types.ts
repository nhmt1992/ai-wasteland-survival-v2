export type GameMode = 'live' | 'stress';

export type WorldStatus = 'inactive' | 'active' | 'live' | 'paused' | 'archived';
export type LiveSessionStatus = 'created' | 'connecting' | 'live' | 'ended' | 'failed';
export type NpcStatus = 'alive' | 'dead' | 'missing';
export type NpcMorphKey = 'slim' | 'average' | 'tall' | 'bulky' | 'ragged';
export type NpcHeadKey = 'narrow' | 'round' | 'square' | 'gaunt';
export type NpcAccessoryKey = 'none' | 'hood' | 'backpack' | 'scarf' | 'bundle' | 'wrap';
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

export interface SnapshotTenant {
  id: string;
  name: string;
  handle: string;
  status: string;
}

export interface SnapshotStreamer {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  defaultTiktokId: string | null;
  isActive: boolean;
}

export interface SnapshotSubscription {
  id: string;
  tenantId: string;
  streamerId: string;
  plan: 'free_trial' | 'starter' | 'pro' | 'studio';
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  maxWorlds: number;
  maxNpcsPerWorld: number;
  aiNarrationQuota: number;
}

export interface SnapshotWorld {
  id: string;
  tenantId: string;
  streamerId: string;
  name: string;
  width: number;
  height: number;
  tickIntervalSeconds: number;
  currentTick: number;
  worldSeed: string;
  status: WorldStatus;
  npcCount: number;
  aliveNpcCount: number;
  deadNpcCount: number;
  latestLiveSessionId: string | null;
  latestLiveSessionStatus: LiveSessionStatus | null;
  latestLiveSessionStartedAt: string | null;
  latestLiveSessionEndedAt: string | null;
  lastTickStartedAt: string | null;
  overlayUrl: string | null;
  viewerCreateUrl: string | null;
  viewerMyNpcUrl: string | null;
}

export interface SnapshotLiveSession {
  id: string;
  tenantId: string;
  streamerId: string;
  worldId: string;
  platform: string;
  platformLiveId: string | null;
  status: LiveSessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  viewerCountPeak: number;
  giftCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SnapshotNpcState {
  tileX: number;
  tileY: number;
  hp: number;
  food: number;
  water: number;
  stamina: number;
  morale: number;
  injury: number;
  shelter: number;
  currentAction: NpcActionType;
  actionTargetX: number | null;
  actionTargetY: number | null;
  actionStartedAt: string | null;
  actionEndsAt: string | null;
  lastTick: number;
  updatedAt: string;
}

export interface SnapshotNpc {
  id: string;
  tenantId: string;
  streamerId: string;
  worldId: string;
  viewerUserId: string | null;
  name: string;
  age: number | null;
  gender: string | null;
  appearanceKey: string;
  personalityPrompt: string | null;
  backstory: string | null;
  traits: {
    social: number;
    aggression: number;
    greed: number;
    cooperation: number;
    risk: number;
    leadership: number;
  };
  aiSeed: string;
  status: NpcStatus;
  deathCause: string | null;
  createdAt: string;
  updatedAt: string;
  viewerUser: {
    id: string;
    tiktokId: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  state: SnapshotNpcState;
  inventory: Array<{
    id: string;
    npcId: string;
    itemId: string;
    quantity: number;
    durability: number | null;
    updatedAt: string;
  }>;
}

export interface SnapshotEvent {
  id: string;
  tenantId: string;
  streamerId: string;
  worldId: string;
  liveSessionId: string | null;
  tick: number;
  eventType: string;
  titleJa: string | null;
  descriptionJa: string | null;
  actorNpcId: string | null;
  targetNpcId: string | null;
  tileX: number | null;
  tileY: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SnapshotGrant {
  id: string;
  tenantId: string;
  streamerId: string;
  worldId: string;
  liveSessionId: string | null;
  giftEventId: string | null;
  viewerUserId: string | null;
  targetNpcId: string | null;
  packId: string | null;
  status: 'pending' | 'spawned' | 'claimed' | 'expired';
  spawnTileX: number | null;
  spawnTileY: number | null;
  expiresAt: string | null;
  claimedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BackendSnapshotResponse {
  ok: true;
  tenant: SnapshotTenant;
  streamer: SnapshotStreamer;
  subscription: SnapshotSubscription;
  world: SnapshotWorld;
  liveSession: SnapshotLiveSession | null;
  npcs: SnapshotNpc[];
  events: SnapshotEvent[];
  resourceGrants: SnapshotGrant[];
}

export interface RealtimeMessage {
  type: string;
  worldId: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface GameRouteState {
  streamerHandle: string;
  worldId: string;
  mode: GameMode;
  npcCount: number;
  debug: boolean;
}

export interface TileViewModel {
  id: string;
  x: number;
  y: number;
  tileType: string;
  dangerLevel: number;
  fertility: number;
  waterLevel: number;
  hasBlocker: boolean;
  textureKey: string;
  tint: number;
  sortY: number;
}

export interface DecorationViewModel {
  id: string;
  kind: 'vegetation' | 'prop' | 'animal' | 'beast';
  x: number;
  y: number;
  textureKey: string;
  tint: number;
  scale: number;
  sortY: number;
  alpha: number;
}

export interface NpcViewModel {
  id: string;
  name: string;
  status: NpcStatus;
  morphKey: NpcMorphKey;
  headKey: NpcHeadKey;
  accessoryKey: NpcAccessoryKey;
  action: NpcActionType;
  x: number;
  y: number;
  hp: number;
  food: number;
  water: number;
  stamina: number;
  morale: number;
  injury: number;
  shelter: number;
  focusLevel: number;
  labelLevel: 'hidden' | 'critical' | 'selected' | 'always';
  bodyTint: number;
  accentTint: number;
  sortY: number;
  walkPhase: number;
  avatarKey: string;
  currentActionLabel: string;
}

export interface ResourceGrantViewModel {
  id: string;
  x: number;
  y: number;
  packId: string | null;
  status: 'pending' | 'spawned' | 'claimed' | 'expired';
  sortY: number;
  tint: number;
}

export interface EventViewModel {
  id: string;
  type: string;
  titleJa: string;
  descriptionJa: string;
  x: number | null;
  y: number | null;
  severity: 'info' | 'warning' | 'danger';
  highlightNpcId: string | null;
}

export interface WorldViewModel {
  mode: GameMode;
  streamerHandle: string;
  streamerName: string;
  tenantName: string;
  worldId: string;
  worldName: string;
  worldSeed: string;
  width: number;
  height: number;
  tick: number;
  worldStatus: WorldStatus;
  liveSessionStatus: LiveSessionStatus | null;
  snapshotLoadedAt: number;
  tiles: TileViewModel[];
  decorations: DecorationViewModel[];
  npcs: NpcViewModel[];
  resourceGrants: ResourceGrantViewModel[];
  events: EventViewModel[];
  survivorCount: number;
  deadCount: number;
  focusNpcId: string | null;
  focusReason: string;
  overlayUrl: string | null;
  viewerCreateUrl: string | null;
  viewerMyNpcUrl: string | null;
  subscriptionPlan: SnapshotSubscription['plan'];
  subscriptionStatus: SnapshotSubscription['status'];
}

export interface CameraState {
  focusX: number;
  focusY: number;
  zoom: number;
  panX: number;
  panY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface HudSnapshot {
  mode: GameMode;
  streamerHandle: string;
  streamerName: string;
  worldName: string;
  worldStatus: WorldStatus;
  liveSessionStatus: LiveSessionStatus | null;
  tick: number;
  survivorCount: number;
  deadCount: number;
  grantsCount: number;
  focusText: string;
  subtitleText: string;
  realtimeStatus: string;
  snapshotAgeMs: number;
  fps: number;
  debugVisible: boolean;
  instructionText: string;
}
