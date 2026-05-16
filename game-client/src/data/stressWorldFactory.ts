import type {
  BackendSnapshotResponse,
  SnapshotEvent,
  SnapshotGrant,
  SnapshotNpc,
  SnapshotSubscription,
  SnapshotTenant,
  SnapshotWorld,
  SnapshotStreamer,
  SnapshotLiveSession,
} from '../types.js';
import { clamp, createSeededRng, pick } from '../utils.js';

const WORLD_WIDTH = 64;
const WORLD_HEIGHT = 64;

const NPC_NAMES = [
  'レン',
  'ミナ',
  'タク',
  'ユイ',
  'ハル',
  'ソラ',
  'ナナ',
  'ケイ',
  'リオ',
  'シン',
  'アオイ',
  'カイ',
  'ユウ',
  'レイ',
  'マコ',
  'ルカ',
];

const ACTIONS = ['idle', 'move', 'gather_food', 'gather_water', 'rest', 'drink', 'eat', 'pickup_grant', 'flee'] as const;

const TERRAIN_TEXTURES = ['tile_ground_dry_01', 'tile_ground_crack_01', 'tile_ground_scrub_01', 'tile_ground_rocky_01', 'tile_water_01', 'tile_ruins_01'] as const;

function makeTenant(streamerHandle: string): SnapshotTenant {
  return {
    id: `tenant_${streamerHandle}`,
    name: `${streamerHandle} Tenant`,
    handle: streamerHandle,
    status: 'active',
  };
}

function makeStreamer(streamerHandle: string): SnapshotStreamer {
  return {
    id: `streamer_${streamerHandle}`,
    tenantId: `tenant_${streamerHandle}`,
    email: `${streamerHandle}@example.com`,
    displayName: streamerHandle === 'matt' ? 'マット' : `${streamerHandle} さん`,
    handle: streamerHandle,
    avatarUrl: null,
    defaultTiktokId: `${streamerHandle}_demo`,
    isActive: true,
  };
}

function makeSubscription(streamerHandle: string): SnapshotSubscription {
  return {
    id: `subscription_${streamerHandle}`,
    tenantId: `tenant_${streamerHandle}`,
    streamerId: `streamer_${streamerHandle}`,
    plan: 'free_trial',
    status: 'trialing',
    maxWorlds: 1,
    maxNpcsPerWorld: 1000,
    aiNarrationQuota: 0,
  };
}

function makeLiveSession(streamerHandle: string, worldId: string): SnapshotLiveSession {
  const now = new Date().toISOString();
  return {
    id: `live_${worldId}`,
    tenantId: `tenant_${streamerHandle}`,
    streamerId: `streamer_${streamerHandle}`,
    worldId,
    platform: 'tiktok',
    platformLiveId: 'stress-session',
    status: 'live',
    startedAt: now,
    endedAt: null,
    viewerCountPeak: 128,
    giftCount: 24,
    metadata: {
      source: 'stress-mode',
    },
    createdAt: now,
  };
}

function makeWorld(streamerHandle: string, worldId: string, npcCount: number): SnapshotWorld {
  const now = new Date().toISOString();
  return {
    id: worldId,
    tenantId: `tenant_${streamerHandle}`,
    streamerId: `streamer_${streamerHandle}`,
    name: streamerHandle === 'matt' ? '荒土世界 Alpha' : `${streamerHandle} の荒土世界`,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    tickIntervalSeconds: 60,
    currentTick: 240,
    worldSeed: `${worldId}:stress`,
    status: 'live',
    npcCount,
    aliveNpcCount: Math.max(0, npcCount - Math.floor(npcCount * 0.14)),
    deadNpcCount: Math.floor(npcCount * 0.14),
    latestLiveSessionId: `live_${worldId}`,
    latestLiveSessionStatus: 'live',
    latestLiveSessionStartedAt: now,
    latestLiveSessionEndedAt: null,
    lastTickStartedAt: now,
    overlayUrl: `/overlay/${streamerHandle}/${worldId}`,
    viewerCreateUrl: `/s/${streamerHandle}/create`,
    viewerMyNpcUrl: `/s/${streamerHandle}/my-npc`,
  };
}

function makeNpc(streamerHandle: string, worldId: string, index: number, rng: () => number): SnapshotNpc {
  const name = NPC_NAMES[index % NPC_NAMES.length] ?? `NPC-${index + 1}`;
  const dead = rng() < 0.14;
  const hp = dead ? 0 : clamp(Math.floor(40 + rng() * 60), 1, 100);
  const water = clamp(Math.floor(10 + rng() * 90), 0, 100);
  const food = clamp(Math.floor(10 + rng() * 90), 0, 100);
  const stamina = clamp(Math.floor(20 + rng() * 80), 0, 100);
  const x = Math.floor(rng() * WORLD_WIDTH);
  const y = Math.floor(rng() * WORLD_HEIGHT);
  const action = dead ? 'idle' : pick(ACTIONS, rng);

  return {
    id: `stress_npc_${index}`,
    tenantId: `tenant_${streamerHandle}`,
    streamerId: `streamer_${streamerHandle}`,
    worldId,
    viewerUserId: index % 7 === 0 ? `viewer_${index}` : null,
    name,
    age: 18 + (index % 20),
    gender: index % 2 === 0 ? 'female' : 'male',
    appearanceKey: `npc_stress_${index % 12}`,
    personalityPrompt: 'ストレステスト用の占位人格。',
    backstory: '1000 NPC ストレスモードの占位データ。',
    traits: {
      social: Math.floor(rng() * 100),
      aggression: Math.floor(rng() * 100),
      greed: Math.floor(rng() * 100),
      cooperation: Math.floor(rng() * 100),
      risk: Math.floor(rng() * 100),
      leadership: Math.floor(rng() * 100),
    },
    aiSeed: `stress-seed-${index}`,
    status: dead ? 'dead' : 'alive',
    deathCause: dead ? 'stress-mode collapse' : null,
    createdAt: new Date(Date.now() - index * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    viewerUser: index % 7 === 0
      ? {
          id: `viewer_${index}`,
          tiktokId: `viewer_${index}`,
          displayName: `Viewer ${index}`,
          avatarUrl: null,
        }
      : null,
    state: {
      tileX: x,
      tileY: y,
      hp,
      food,
      water,
      stamina,
      morale: clamp(Math.floor(20 + rng() * 80), 0, 100),
      injury: dead ? 100 : clamp(Math.floor(rng() * 50), 0, 100),
      shelter: clamp(Math.floor(rng() * 100), 0, 100),
      currentAction: action,
      actionTargetX: action === 'move' || action === 'flee' ? clamp(x + Math.floor(rng() * 5) - 2, 0, WORLD_WIDTH - 1) : null,
      actionTargetY: action === 'move' || action === 'flee' ? clamp(y + Math.floor(rng() * 5) - 2, 0, WORLD_HEIGHT - 1) : null,
      actionStartedAt: new Date(Date.now() - 2500).toISOString(),
      actionEndsAt: new Date(Date.now() + 2500).toISOString(),
      lastTick: 240,
      updatedAt: new Date().toISOString(),
    },
    inventory: [
      {
        id: `inventory_${index}_water`,
        npcId: `stress_npc_${index}`,
        itemId: 'water_bottle',
        quantity: index % 3 === 0 ? 1 : 0,
        durability: null,
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}

function makeGrant(streamerHandle: string, worldId: string, index: number, rng: () => number): SnapshotGrant {
  const x = Math.floor(rng() * WORLD_WIDTH);
  const y = Math.floor(rng() * WORLD_HEIGHT);
  return {
    id: `grant_${index}`,
    tenantId: `tenant_${streamerHandle}`,
    streamerId: `streamer_${streamerHandle}`,
    worldId,
    liveSessionId: `live_${worldId}`,
    giftEventId: `gift_${index}`,
    viewerUserId: index % 3 === 0 ? `viewer_${index}` : null,
    targetNpcId: index % 4 === 0 ? `stress_npc_${index % 200}` : null,
    packId: index % 2 === 0 ? 'basic_survival_pack' : 'small_food_pack',
    status: 'spawned',
    spawnTileX: x,
    spawnTileY: y,
    expiresAt: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
    claimedAt: null,
    metadata: {
      source: 'stress-mode',
    },
    createdAt: new Date().toISOString(),
  };
}

function makeEvent(streamerHandle: string, worldId: string, index: number, rng: () => number): SnapshotEvent {
  const types = ['gift_received', 'npc_move', 'npc_rest', 'npc_flee', 'npc_pickup_grant', 'world_warning'] as const;
  const eventType = types[index % types.length];
  const tileX = Math.floor(rng() * WORLD_WIDTH);
  const tileY = Math.floor(rng() * WORLD_HEIGHT);

  return {
    id: `event_${index}`,
    tenantId: `tenant_${streamerHandle}`,
    streamerId: `streamer_${streamerHandle}`,
    worldId,
    liveSessionId: `live_${worldId}`,
    tick: 240 - index,
    eventType,
    titleJa:
      eventType === 'gift_received'
        ? '支援物資が届きました'
        : eventType === 'npc_flee'
          ? 'NPC が退避しました'
          : eventType === 'npc_pickup_grant'
            ? '補給箱が回収されました'
            : eventType === 'world_warning'
              ? '危険エリアが拡大しています'
              : 'NPC が行動しました',
    descriptionJa:
      eventType === 'gift_received'
        ? 'ストレスモード用の礼物演出です。'
        : eventType === 'npc_flee'
          ? '高危険度の地点から NPC が移動しました。'
          : eventType === 'npc_pickup_grant'
            ? '資源箱が近くの NPC により回収されました。'
            : eventType === 'world_warning'
              ? '荒土世界の一部で危険が増加しています。'
              : 'NPC の行動を示す演出です。',
    actorNpcId: index % 5 === 0 ? `stress_npc_${index % 200}` : null,
    targetNpcId: index % 4 === 0 ? `stress_npc_${(index + 11) % 200}` : null,
    tileX,
    tileY,
    metadata: {
      source: 'stress-mode',
      index,
    },
    createdAt: new Date(Date.now() - index * 2500).toISOString(),
  };
}

function createStressSnapshot(streamerHandle: string, worldId: string, npcCount: number): BackendSnapshotResponse {
  const rng = createSeededRng(`${streamerHandle}:${worldId}:${npcCount}`);
  const tenant = makeTenant(streamerHandle);
  const streamer = makeStreamer(streamerHandle);
  const subscription = makeSubscription(streamerHandle);
  const world = makeWorld(streamerHandle, worldId, npcCount);
  const liveSession = makeLiveSession(streamerHandle, worldId);
  const npcs = Array.from({ length: npcCount }, (_, index) => makeNpc(streamerHandle, worldId, index, rng));
  const resourceGrants = Array.from({ length: 24 }, (_, index) => makeGrant(streamerHandle, worldId, index, rng));
  const events = Array.from({ length: 12 }, (_, index) => makeEvent(streamerHandle, worldId, index, rng));

  return {
    ok: true,
    tenant,
    streamer,
    subscription,
    world,
    liveSession,
    npcs,
    events,
    resourceGrants,
  };
}

export function buildStressSnapshot(streamerHandle: string, worldId: string, npcCount: number): BackendSnapshotResponse {
  return createStressSnapshot(streamerHandle, worldId, clamp(npcCount, 1, 1000));
}

export function getStressTextureKey(tileType: string): (typeof TERRAIN_TEXTURES)[number] {
  if (tileType.includes('water')) {
    return 'tile_water_01';
  }
  if (tileType.includes('ruin')) {
    return 'tile_ruins_01';
  }
  if (tileType.includes('rock')) {
    return 'tile_ground_rocky_01';
  }
  if (tileType.includes('scrub')) {
    return 'tile_ground_scrub_01';
  }
  if (tileType.includes('crack')) {
    return 'tile_ground_crack_01';
  }
  return 'tile_ground_dry_01';
}
