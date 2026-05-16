import { randomUUID } from 'node:crypto';
import { withTransaction } from './db.js';
import { env } from './env.js';
import { loadWorldTickContext, listTickableWorlds, persistWorldTickOutcome, type SqlExecutor } from './repository.js';
import { realtimeHub } from './realtime.js';
import type {
  ItemDefinitionRow,
  NpcInventoryRow,
  NpcRow,
  NpcStateRow,
  ResourceGrantRow,
  ResourcePackItemRow,
  TileResourceRow,
  WorldEventInsertRow,
  WorldStatus,
  WorldTickContext,
  WorldTickOutcome,
  WorldTileRow,
} from './types.js';
import { clampNumber, hashString, makeTileKey } from './utils.js';

interface MutableState extends NpcStateRow {
  hp: number;
  food: number;
  water: number;
  stamina: number;
  morale: number;
  injury: number;
  shelter: number;
  current_action: NpcStateRow['current_action'];
  action_target_x: number | null;
  action_target_y: number | null;
  action_started_at: Date | null;
  action_ends_at: Date | null;
  last_tick: number;
  updated_at: Date;
}

interface MutableInventory extends NpcInventoryRow {
  quantity: number;
  durability: number | null;
  updated_at: Date;
}

interface MutableResourceGrant extends ResourceGrantRow {
  status: ResourceGrantRow['status'];
  spawn_tile_x: number | null;
  spawn_tile_y: number | null;
  expires_at: Date | null;
  claimed_at: Date | null;
}

type ActionType = 'idle' | 'move' | 'gather_food' | 'gather_water' | 'gather_wood' | 'rest' | 'eat' | 'drink' | 'pickup_grant' | 'socialize' | 'flee' | 'attack' | 'steal' | 'trade' | 'build_shelter';

type Decision = {
  action: ActionType;
  titleJa: string;
  descriptionJa: string;
  targetX: number | null;
  targetY: number | null;
  metadata: Record<string, unknown>;
};

type Resolution = {
  nextState: MutableState;
  events: WorldEventInsertRow[];
  action: ActionType;
};

function clamp(value: number): number {
  return clampNumber(value, 0, 100);
}

function groupBy<T, K extends string | number>(rows: T[], getKey: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();

  for (const row of rows) {
    const key = getKey(row);
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  return grouped;
}

function buildTileMap(tiles: WorldTileRow[]): Map<string, WorldTileRow> {
  return new Map(tiles.map((tile) => [makeTileKey(tile.tile_x, tile.tile_y), tile]));
}

function buildInventoryMap(rows: NpcInventoryRow[]): Map<string, MutableInventory> {
  const map = new Map<string, MutableInventory>();

  for (const row of rows) {
    map.set(`${row.npc_id}:${row.item_id}`, { ...row });
  }

  return map;
}

function buildStateMap(rows: NpcStateRow[]): Map<string, MutableState> {
  const map = new Map<string, MutableState>();

  for (const row of rows) {
    map.set(row.npc_id, { ...row });
  }

  return map;
}

function buildGrantMap(rows: ResourceGrantRow[]): Map<string, MutableResourceGrant> {
  const map = new Map<string, MutableResourceGrant>();

  for (const row of rows) {
    map.set(row.id, { ...row });
  }

  return map;
}

function buildItemMap(rows: ItemDefinitionRow[]): Map<string, ItemDefinitionRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

function buildPackItemMap(rows: ResourcePackItemRow[]): Map<string, ResourcePackItemRow[]> {
  return groupBy(rows, (row) => row.pack_id);
}

function tileAt(tileMap: Map<string, WorldTileRow>, tileX: number, tileY: number): WorldTileRow | null {
  return tileMap.get(makeTileKey(tileX, tileY)) ?? null;
}

function resourceAt(resources: TileResourceRow[], tileX: number, tileY: number): TileResourceRow[] {
  return resources.filter((resource) => resource.tile_x === tileX && resource.tile_y === tileY && resource.quantity > 0);
}

function pickItemForNeed(
  inventoryMap: Map<string, MutableInventory>,
  itemMap: Map<string, ItemDefinitionRow>,
  npcId: string,
  category: ItemDefinitionRow['category'],
  restoreKey: 'restore_food' | 'restore_water' | 'restore_hp',
): MutableInventory | null {
  const items: Array<{ inventory: MutableInventory; definition: ItemDefinitionRow }> = [];

  for (const inventory of inventoryMap.values()) {
    if (inventory.npc_id !== npcId || inventory.quantity <= 0) {
      continue;
    }

    const definition = itemMap.get(inventory.item_id);
    if (!definition || definition.category !== category) {
      continue;
    }

    items.push({ inventory, definition });
  }

  if (items.length === 0) {
    return null;
  }

  items.sort((left, right) => {
    const leftScore = left.definition[restoreKey];
    const rightScore = right.definition[restoreKey];
    return rightScore - leftScore;
  });

  return items[0]?.inventory ?? null;
}

function adjustInventoryQuantity(
  inventoryMap: Map<string, MutableInventory>,
  npcId: string,
  itemId: string,
  delta: number,
): MutableInventory {
  const key = `${npcId}:${itemId}`;
  const existing = inventoryMap.get(key);

  if (existing) {
    existing.quantity = clampNumber(existing.quantity + delta, 0, 9999);
    existing.updated_at = new Date();
    return existing;
  }

  const created: MutableInventory = {
    id: randomUUID(),
    npc_id: npcId,
    item_id: itemId,
    quantity: clampNumber(delta, 0, 9999),
    durability: null,
    updated_at: new Date(),
  };

  inventoryMap.set(key, created);
  return created;
}

function addInventoryByPack(
  inventoryMap: Map<string, MutableInventory>,
  npcId: string,
  packId: string,
  packItems: Map<string, ResourcePackItemRow[]>,
): void {
  const items = packItems.get(packId) ?? [];

  for (const item of items) {
    adjustInventoryQuantity(inventoryMap, npcId, item.item_id, item.quantity);
  }
}

function consumeInventoryItem(
  inventoryMap: Map<string, MutableInventory>,
  npcId: string,
  itemId: string,
  amount: number,
): void {
  const key = `${npcId}:${itemId}`;
  const inventory = inventoryMap.get(key);
  if (!inventory) {
    return;
  }

  inventory.quantity = clampNumber(inventory.quantity - amount, 0, 9999);
  inventory.updated_at = new Date();
}

function getCurrentTile(tileMap: Map<string, WorldTileRow>, state: MutableState): WorldTileRow {
  const tile = tileAt(tileMap, state.tile_x, state.tile_y);
  if (!tile) {
    return {
      id: randomUUID(),
      world_id: '',
      tile_x: state.tile_x,
      tile_y: state.tile_y,
      tile_type: 'unknown',
      danger_level: 20,
      fertility: 10,
      water_level: 10,
      has_blocker: false,
      metadata: {},
      created_at: new Date(),
    };
  }

  return tile;
}

function getNeighbors(world: { width: number; height: number }, tileX: number, tileY: number): Array<{ tileX: number; tileY: number }> {
  const candidates = [
    { tileX, tileY },
    { tileX: tileX + 1, tileY },
    { tileX: tileX - 1, tileY },
    { tileX, tileY: tileY + 1 },
    { tileX, tileY: tileY - 1 },
  ];

  return candidates.filter((candidate) => candidate.tileX >= 0 && candidate.tileY >= 0 && candidate.tileX < world.width && candidate.tileY < world.height);
}

function scoreTileForIntent(
  tile: WorldTileRow,
  intent: 'water' | 'food' | 'flee' | 'explore',
  nearbyGrantBonus: number,
  tickSeed: number,
): number {
  const base =
    intent === 'water'
      ? tile.water_level * 4 + tile.fertility * 0.7 - tile.danger_level * 2
      : intent === 'food'
        ? tile.fertility * 4 + tile.water_level * 0.7 - tile.danger_level * 2
        : intent === 'flee'
          ? 100 - tile.danger_level * 3 + tile.water_level * 0.5 + tile.fertility * 0.5
          : tile.water_level * 1.2 + tile.fertility * 1.1 - tile.danger_level * 1.5;

  return base + nearbyGrantBonus + (hashString(`${tile.tile_x}:${tile.tile_y}:${tickSeed}`) % 13) / 100;
}

function selectMoveTarget(
  context: WorldTickContext,
  state: MutableState,
  intent: 'water' | 'food' | 'flee' | 'explore',
  grantTiles: Set<string>,
  occupied: Set<string>,
  tickSeed: number,
): { tileX: number; tileY: number } {
  const tileMap = buildTileMap(context.world_tiles);
  const neighbors = getNeighbors(context.world, state.tile_x, state.tile_y);

  let bestTile = { tileX: state.tile_x, tileY: state.tile_y };
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of neighbors) {
    const tile = tileMap.get(makeTileKey(candidate.tileX, candidate.tileY));
    if (!tile || tile.has_blocker) {
      continue;
    }

    if (occupied.has(makeTileKey(candidate.tileX, candidate.tileY)) && (candidate.tileX !== state.tile_x || candidate.tileY !== state.tile_y)) {
      continue;
    }

    const grantBonus = grantTiles.has(makeTileKey(candidate.tileX, candidate.tileY)) ? 25 : 0;
    const score = scoreTileForIntent(tile, intent, grantBonus, tickSeed);
    if (score > bestScore) {
      bestScore = score;
      bestTile = candidate;
    }
  }

  return bestTile;
}

function buildEvent(
  context: WorldTickContext,
  tick: number,
  type: string,
  titleJa: string,
  descriptionJa: string,
  actorNpcId: string | null,
  targetNpcId: string | null,
  tileX: number | null,
  tileY: number | null,
  metadata: Record<string, unknown>,
): WorldEventInsertRow {
  return {
    id: randomUUID(),
    tenant_id: context.tenant.id,
    streamer_id: context.streamer.id,
    world_id: context.world.id,
    live_session_id: context.live_session?.id ?? null,
    tick,
    event_type: type,
    title_ja: titleJa,
    description_ja: descriptionJa,
    actor_npc_id: actorNpcId,
    target_npc_id: targetNpcId,
    tile_x: tileX,
    tile_y: tileY,
    metadata,
  };
}

function computePressure(state: MutableState, tile: WorldTileRow, nearbyDanger: number): number {
  return (
    (100 - state.water) * 1.5 +
    (100 - state.food) * 1.0 +
    (100 - state.hp) * 2.0 +
    state.injury * 1.2 +
    nearbyDanger * 1.5 -
    state.shelter * 0.5 +
    tile.danger_level * 0.8
  );
}

function pickNearbyDanger(tileMap: Map<string, WorldTileRow>, state: MutableState, world: { width: number; height: number }): number {
  let maxDanger = 0;

  for (const candidate of getNeighbors(world, state.tile_x, state.tile_y)) {
    const tile = tileMap.get(makeTileKey(candidate.tileX, candidate.tileY));
    if (!tile) {
      continue;
    }

    if (tile.danger_level > maxDanger) {
      maxDanger = tile.danger_level;
    }
  }

  return maxDanger;
}

function applyBaselineConsumption(state: MutableState): void {
  state.water = clamp(state.water - 6);
  state.food = clamp(state.food - 5);
  state.stamina = clamp(state.stamina - 4);
}

function applyTileResourceRegen(resources: TileResourceRow[]): TileResourceRow[] {
  return resources.map((resource) => ({
    ...resource,
    quantity: clampNumber(resource.quantity + resource.regen_per_tick, 0, 9999),
    updated_at: new Date(),
  }));
}

function maybeSpawnGrant(
  context: WorldTickContext,
  grant: MutableResourceGrant,
  stateByNpcId: Map<string, MutableState>,
  tileMap: Map<string, WorldTileRow>,
  occupied: Set<string>,
  tickSeed: number,
): { grant: MutableResourceGrant; event: WorldEventInsertRow | null } {
  if (grant.status !== 'pending') {
    return { grant, event: null };
  }

  const targetState = grant.target_npc_id ? stateByNpcId.get(grant.target_npc_id) ?? null : null;
  const anchor = targetState && targetState.hp > 0 ? targetState : null;
  const baseX = anchor ? anchor.tile_x : Math.floor(context.world.width / 2);
  const baseY = anchor ? anchor.tile_y : Math.floor(context.world.height / 2);

  let bestTileX = baseX;
  let bestTileY = baseY;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) {
      const tileX = clampNumber(baseX + dx, 0, context.world.width - 1);
      const tileY = clampNumber(baseY + dy, 0, context.world.height - 1);
      const tile = tileMap.get(makeTileKey(tileX, tileY));
      if (!tile || tile.has_blocker || occupied.has(makeTileKey(tileX, tileY))) {
        continue;
      }

      const score = tile.water_level * 1.2 + tile.fertility + (hashString(`${tileX}:${tileY}:${tickSeed}`) % 17) / 10;
      if (score > bestScore) {
        bestScore = score;
        bestTileX = tileX;
        bestTileY = tileY;
      }
    }
  }

  const nextGrant: MutableResourceGrant = {
    ...grant,
    status: 'spawned',
    spawn_tile_x: bestTileX,
    spawn_tile_y: bestTileY,
    metadata: {
      ...grant.metadata,
      spawned_at_tick: context.world.current_tick + 1,
      spawned_from: 'gift_event',
    },
  };

  return {
    grant: nextGrant,
    event: buildEvent(
      context,
      context.world.current_tick + 1,
      'resource_grant_spawned',
      '支援箱が出現しました',
      `支援箱が (${bestTileX}, ${bestTileY}) に出現しました。`,
      null,
      grant.target_npc_id,
      bestTileX,
      bestTileY,
      {
        resourceGrantId: grant.id,
        packId: grant.pack_id,
      },
    ),
  };
}

function claimGrant(
  context: WorldTickContext,
  grant: MutableResourceGrant,
  inventoryMap: Map<string, MutableInventory>,
  packItems: Map<string, ResourcePackItemRow[]>,
  npcId: string,
  tick: number,
): { grant: MutableResourceGrant; event: WorldEventInsertRow } {
  if (!grant.pack_id) {
    grant.status = 'claimed';
    grant.claimed_at = new Date();

    return {
      grant,
      event: buildEvent(
        context,
        tick,
        'resource_grant_claimed',
        '支援箱を回収しました',
        '支援箱の中身は空でした。',
        npcId,
        npcId,
        grant.spawn_tile_x,
        grant.spawn_tile_y,
        { resourceGrantId: grant.id, packId: null },
      ),
    };
  }

  addInventoryByPack(inventoryMap, npcId, grant.pack_id, packItems);
  grant.status = 'claimed';
  grant.claimed_at = new Date();

  return {
    grant,
    event: buildEvent(
      context,
      tick,
      'resource_grant_claimed',
      '支援箱を回収しました',
      `支援箱 ${grant.pack_id} を回収しました。`,
      npcId,
      npcId,
      grant.spawn_tile_x,
      grant.spawn_tile_y,
      {
        resourceGrantId: grant.id,
        packId: grant.pack_id,
      },
    ),
  };
}

function decideAction(
  context: WorldTickContext,
  state: MutableState,
  npc: NpcRow,
  tileMap: Map<string, WorldTileRow>,
  inventoryMap: Map<string, MutableInventory>,
  resourceByTile: Map<string, TileResourceRow[]>,
  grantByTile: Map<string, MutableResourceGrant[]>,
  grantMap: Map<string, MutableResourceGrant>,
  packItems: Map<string, ResourcePackItemRow[]>,
  occupied: Set<string>,
  tickSeed: number,
  currentTick: number,
): Resolution {
  const currentTile = getCurrentTile(tileMap, state);
  const nearbyDanger = pickNearbyDanger(tileMap, state, context.world);
  const pressure = computePressure(state, currentTile, nearbyDanger);
  const currentTileKey = makeTileKey(state.tile_x, state.tile_y);
  const currentResources = resourceByTile.get(currentTileKey) ?? [];
  const grantsHere = grantByTile.get(currentTileKey) ?? [];
  const allItems = buildItemMap(context.item_definitions);
  const socialNeighbors = getNeighbors(context.world, state.tile_x, state.tile_y).filter((candidate) => {
    const key = makeTileKey(candidate.tileX, candidate.tileY);
    return occupied.has(key) && key !== currentTileKey;
  }).length;
  const waterInventory = pickItemForNeed(inventoryMap, allItems, npc.id, 'water', 'restore_water');
  const foodInventory = pickItemForNeed(inventoryMap, allItems, npc.id, 'food', 'restore_food');
  const medicineInventory = pickItemForNeed(inventoryMap, allItems, npc.id, 'medicine', 'restore_hp');

  const baselineState: MutableState = {
    ...state,
    current_action: 'idle',
    action_target_x: null,
    action_target_y: null,
    action_started_at: new Date(),
    action_ends_at: new Date(Date.now() + Math.max(context.world.tick_interval_seconds, 60) * 1000),
    last_tick: currentTick,
    updated_at: new Date(),
  };

  const grantTiles = new Set(
    Array.from(grantMap.values())
      .filter((grant) => grant.status === 'spawned' && grant.spawn_tile_x !== null && grant.spawn_tile_y !== null)
      .map((grant) => (grant.spawn_tile_x !== null && grant.spawn_tile_y !== null ? makeTileKey(grant.spawn_tile_x, grant.spawn_tile_y) : null))
      .filter((value): value is string => value !== null),
  );

  if (state.hp <= 0) {
    baselineState.current_action = 'idle';
    return {
      nextState: baselineState,
      action: 'idle',
      events: [],
    };
  }

  const events: WorldEventInsertRow[] = [];
  let decision: Decision = {
    action: 'idle',
    titleJa: `${npc.name} は様子を見ています`,
    descriptionJa: '周囲の状況を確認しています。',
    targetX: null,
    targetY: null,
    metadata: {
      pressure,
    },
  };

  const pickCurrentGrant = grantsHere.find((grant) => grant.status === 'spawned') ?? null;

  if (pickCurrentGrant) {
    const claimed = claimGrant(context, pickCurrentGrant, inventoryMap, packItems, npc.id, currentTick);
    grantMap.set(claimed.grant.id, claimed.grant);
    events.push(claimed.event);
    baselineState.current_action = 'pickup_grant';
    decision = {
      action: 'pickup_grant',
      titleJa: `${npc.name} が支援箱を回収しました`,
      descriptionJa: `${npc.name} は地面の支援箱を見つけて回収しました。`,
      targetX: claimed.grant.spawn_tile_x,
      targetY: claimed.grant.spawn_tile_y,
      metadata: {
        resourceGrantId: claimed.grant.id,
        packId: claimed.grant.pack_id,
      },
    };
    baselineState.morale = clamp(baselineState.morale + 4);
  } else if (state.water <= 20 && waterInventory) {
    const definition = allItems.get(waterInventory.item_id);
    consumeInventoryItem(inventoryMap, npc.id, waterInventory.item_id, 1);
    baselineState.water = clamp(baselineState.water + (definition?.restore_water ?? 30));
    baselineState.stamina = clamp(baselineState.stamina + 4);
    baselineState.morale = clamp(baselineState.morale + 3);
    decision = {
      action: 'drink',
      titleJa: `${npc.name} は水を飲みました`,
      descriptionJa: `${npc.name} は所持していた水を飲んで落ち着きました。`,
      targetX: null,
      targetY: null,
      metadata: {
        itemId: waterInventory.item_id,
      },
    };
  } else if (state.food <= 20 && foodInventory) {
    const definition = allItems.get(foodInventory.item_id);
    consumeInventoryItem(inventoryMap, npc.id, foodInventory.item_id, 1);
    baselineState.food = clamp(baselineState.food + (definition?.restore_food ?? 25));
    baselineState.stamina = clamp(baselineState.stamina + 3);
    baselineState.morale = clamp(baselineState.morale + 2);
    decision = {
      action: 'eat',
      titleJa: `${npc.name} は食料を食べました`,
      descriptionJa: `${npc.name} は所持していた食料を食べました。`,
      targetX: null,
      targetY: null,
      metadata: {
        itemId: foodInventory.item_id,
      },
    };
  } else if (state.hp <= 25 && medicineInventory) {
    const definition = allItems.get(medicineInventory.item_id);
    consumeInventoryItem(inventoryMap, npc.id, medicineInventory.item_id, 1);
    baselineState.hp = clamp(baselineState.hp + (definition?.restore_hp ?? 30));
    baselineState.stamina = clamp(baselineState.stamina + 2);
    baselineState.morale = clamp(baselineState.morale + 1);
    decision = {
      action: 'rest',
      titleJa: `${npc.name} は応急処置を行いました`,
      descriptionJa: `${npc.name} は応急薬を使って体力を少し戻しました。`,
      targetX: null,
      targetY: null,
      metadata: {
        itemId: medicineInventory.item_id,
      },
    };
  } else if (state.water <= 40) {
    const currentWaterResource = currentResources.find((resource) => {
      const definition = allItems.get(resource.item_id);
      return definition?.category === 'water' && resource.quantity > 0;
    });

    if (currentWaterResource) {
      currentWaterResource.quantity = clampNumber(currentWaterResource.quantity - 1, 0, 9999);
      currentWaterResource.updated_at = new Date();
      baselineState.water = clamp(baselineState.water + (allItems.get(currentWaterResource.item_id)?.restore_water ?? 30));
      baselineState.current_action = 'drink';
      decision = {
        action: 'drink',
        titleJa: `${npc.name} は水を確保しました`,
        descriptionJa: `${npc.name} は地面の水資源を利用しました。`,
        targetX: state.tile_x,
        targetY: state.tile_y,
        metadata: {
          itemId: currentWaterResource.item_id,
        },
      };
    } else {
      const target = selectMoveTarget(context, state, 'water', grantTiles, occupied, tickSeed);
      baselineState.tile_x = target.tileX;
      baselineState.tile_y = target.tileY;
      baselineState.stamina = clamp(baselineState.stamina - 2);
      baselineState.current_action = 'move';
      baselineState.action_target_x = target.tileX;
      baselineState.action_target_y = target.tileY;
      decision = {
        action: 'move',
        titleJa: `${npc.name} は水を探して移動しました`,
        descriptionJa: `${npc.name} は水資源を求めて移動しました。`,
        targetX: target.tileX,
        targetY: target.tileY,
        metadata: {
          intent: 'seek_water',
        },
      };
    }
  } else if (state.food <= 45) {
    const currentFoodResource = currentResources.find((resource) => {
      const definition = allItems.get(resource.item_id);
      return definition?.category === 'food' && resource.quantity > 0;
    });

    if (currentFoodResource) {
      currentFoodResource.quantity = clampNumber(currentFoodResource.quantity - 1, 0, 9999);
      currentFoodResource.updated_at = new Date();
      baselineState.food = clamp(baselineState.food + (allItems.get(currentFoodResource.item_id)?.restore_food ?? 20));
      baselineState.current_action = 'eat';
      decision = {
        action: 'eat',
        titleJa: `${npc.name} は食料を確保しました`,
        descriptionJa: `${npc.name} は地面の食料資源を利用しました。`,
        targetX: state.tile_x,
        targetY: state.tile_y,
        metadata: {
          itemId: currentFoodResource.item_id,
        },
      };
    } else {
      const target = selectMoveTarget(context, state, 'food', grantTiles, occupied, tickSeed);
      baselineState.tile_x = target.tileX;
      baselineState.tile_y = target.tileY;
      baselineState.stamina = clamp(baselineState.stamina - 2);
      baselineState.current_action = 'move';
      baselineState.action_target_x = target.tileX;
      baselineState.action_target_y = target.tileY;
      decision = {
        action: 'move',
        titleJa: `${npc.name} は食料を探して移動しました`,
        descriptionJa: `${npc.name} は食料資源を求めて移動しました。`,
        targetX: target.tileX,
        targetY: target.tileY,
        metadata: {
          intent: 'seek_food',
        },
      };
    }
  } else if (pressure >= 120) {
    const target = selectMoveTarget(context, state, 'flee', grantTiles, occupied, tickSeed);
    baselineState.tile_x = target.tileX;
    baselineState.tile_y = target.tileY;
    baselineState.stamina = clamp(baselineState.stamina - 3);
    baselineState.morale = clamp(baselineState.morale - 2);
    baselineState.current_action = 'flee';
    baselineState.action_target_x = target.tileX;
    baselineState.action_target_y = target.tileY;
    decision = {
      action: 'flee',
      titleJa: `${npc.name} は危険から逃げました`,
      descriptionJa: `${npc.name} は危険度の低い地点へ退避しました。`,
      targetX: target.tileX,
      targetY: target.tileY,
      metadata: {
        pressure,
      },
    };
  } else if (state.stamina <= 30) {
    baselineState.stamina = clamp(baselineState.stamina + 12);
    baselineState.morale = clamp(baselineState.morale + 3);
    baselineState.current_action = 'rest';
    decision = {
      action: 'rest',
      titleJa: `${npc.name} は休息しました`,
      descriptionJa: `${npc.name} は体力を回復するために休みました。`,
      targetX: state.tile_x,
      targetY: state.tile_y,
      metadata: {
        reason: 'stamina_low',
      },
    };
  } else if (npc.trait_social >= 60 && socialNeighbors > 0) {
    baselineState.morale = clamp(baselineState.morale + 4);
    baselineState.stamina = clamp(baselineState.stamina - 1);
    baselineState.current_action = 'socialize';
    decision = {
      action: 'socialize',
      titleJa: `${npc.name} は周囲と会話しました`,
      descriptionJa: `${npc.name} は近くの仲間と短く会話しました。`,
      targetX: state.tile_x,
      targetY: state.tile_y,
      metadata: {
        neighbors: socialNeighbors,
      },
    };
  } else {
    const target = selectMoveTarget(context, state, 'explore', grantTiles, occupied, tickSeed);
    const shouldMove = target.tileX !== state.tile_x || target.tileY !== state.tile_y;

    if (shouldMove) {
      baselineState.tile_x = target.tileX;
      baselineState.tile_y = target.tileY;
      baselineState.stamina = clamp(baselineState.stamina - 2);
      baselineState.current_action = 'move';
      baselineState.action_target_x = target.tileX;
      baselineState.action_target_y = target.tileY;
      decision = {
        action: 'move',
        titleJa: `${npc.name} は探索しました`,
        descriptionJa: `${npc.name} は周囲を探索するために移動しました。`,
        targetX: target.tileX,
        targetY: target.tileY,
        metadata: {
          intent: 'explore',
        },
      };
    } else {
      baselineState.current_action = 'idle';
      baselineState.stamina = clamp(baselineState.stamina + 1);
      decision = {
        action: 'idle',
        titleJa: `${npc.name} は様子を見ました`,
        descriptionJa: `${npc.name} はその場で周囲を確認しました。`,
        targetX: state.tile_x,
        targetY: state.tile_y,
        metadata: {
          intent: 'observe',
        },
      };
    }
  }

  applyBaselineConsumption(baselineState);

  if (baselineState.water <= 0 || baselineState.food <= 0) {
    baselineState.hp = clamp(baselineState.hp - 5);
  }

  if (currentTile.danger_level >= 60) {
    baselineState.hp = clamp(baselineState.hp - 2);
    baselineState.injury = clamp(baselineState.injury + 1);
  }

  if (baselineState.stamina <= 0) {
    baselineState.hp = clamp(baselineState.hp - 1);
  }

  if (baselineState.hp <= 0) {
    baselineState.current_action = 'idle';
    return {
      nextState: {
        ...baselineState,
        hp: 0,
        current_action: 'idle',
      },
      action: 'idle',
      events,
    };
  }

  const deathThreshold = baselineState.water <= 0 ? 'dehydration' : baselineState.food <= 0 ? 'starvation' : null;
  if (deathThreshold && baselineState.hp <= 0) {
    baselineState.current_action = 'idle';
  }

  if (decision.action === 'drink') {
    events.push(
      buildEvent(
        context,
        currentTick,
        'npc_drink',
        `${npc.name} は水を飲みました`,
        decision.descriptionJa,
        npc.id,
        null,
        decision.targetX,
        decision.targetY,
        decision.metadata,
      ),
    );
  } else if (decision.action === 'eat') {
    events.push(
      buildEvent(
        context,
        currentTick,
        'npc_eat',
        `${npc.name} は食べました`,
        decision.descriptionJa,
        npc.id,
        null,
        decision.targetX,
        decision.targetY,
        decision.metadata,
      ),
    );
  } else if (decision.action === 'rest') {
    events.push(
      buildEvent(
        context,
        currentTick,
        'npc_rest',
        `${npc.name} は休息しました`,
        decision.descriptionJa,
        npc.id,
        null,
        decision.targetX,
        decision.targetY,
        decision.metadata,
      ),
    );
  } else if (decision.action === 'pickup_grant') {
    events.push(
      buildEvent(
        context,
        currentTick,
        'npc_pickup_grant',
        `${npc.name} が支援箱を拾いました`,
        decision.descriptionJa,
        npc.id,
        npc.id,
        decision.targetX,
        decision.targetY,
        decision.metadata,
      ),
    );
  } else if (decision.action === 'socialize') {
    events.push(
      buildEvent(
        context,
        currentTick,
        'npc_socialize',
        `${npc.name} が会話しました`,
        decision.descriptionJa,
        npc.id,
        null,
        decision.targetX,
        decision.targetY,
        decision.metadata,
      ),
    );
  } else if (decision.action === 'flee') {
    events.push(
      buildEvent(
        context,
        currentTick,
        'npc_flee',
        `${npc.name} が退避しました`,
        decision.descriptionJa,
        npc.id,
        null,
        decision.targetX,
        decision.targetY,
        decision.metadata,
      ),
    );
  } else if (decision.action === 'move') {
    events.push(
      buildEvent(
        context,
        currentTick,
        'npc_move',
        `${npc.name} が移動しました`,
        decision.descriptionJa,
        npc.id,
        null,
        decision.targetX,
        decision.targetY,
        decision.metadata,
      ),
    );
  } else if (decision.action === 'idle') {
    events.push(
      buildEvent(
        context,
        currentTick,
        'npc_idle',
        `${npc.name} はその場に留まりました`,
        decision.descriptionJa,
        npc.id,
        null,
        decision.targetX,
        decision.targetY,
        decision.metadata,
      ),
    );
  }

  const finalState = {
    ...baselineState,
    hp: clamp(baselineState.hp),
    food: clamp(baselineState.food),
    water: clamp(baselineState.water),
    stamina: clamp(baselineState.stamina),
    morale: clamp(baselineState.morale),
    injury: clamp(baselineState.injury),
    shelter: clamp(baselineState.shelter),
    current_action: baselineState.current_action,
    updated_at: new Date(),
  };

  return {
    nextState: finalState,
    action: decision.action,
    events,
  };
}

export function advanceWorldTick(context: WorldTickContext): WorldTickOutcome {
  const tickStartedAt = new Date();
  const tickSeed = context.world.current_tick + 1;
  let tickFinishedAt = new Date();
  const tileMap = buildTileMap(context.world_tiles);
  const itemMap = buildItemMap(context.item_definitions);
  const packItems = buildPackItemMap(context.resource_pack_items);
  const stateMap = buildStateMap(context.npc_states);
  const inventoryMap = buildInventoryMap(context.npc_inventories);
  const grantMap = buildGrantMap(context.resource_grants);
  const resourceByTile = groupBy(applyTileResourceRegen(context.tile_resources), (resource) => makeTileKey(resource.tile_x, resource.tile_y));
  const resourceList = Array.from(resourceByTile.values()).flat();
  const occupied = new Set(
    context.npc_states
      .filter((state) => state.hp > 0)
      .map((state) => makeTileKey(state.tile_x, state.tile_y)),
  );
  const events: WorldEventInsertRow[] = [];

  for (const grant of grantMap.values()) {
    if (grant.status === 'pending') {
      const spawned = maybeSpawnGrant(context, grant, stateMap, tileMap, occupied, tickSeed);
      grantMap.set(spawned.grant.id, spawned.grant);
      if (spawned.event) {
        events.push(spawned.event);
      }
    }
  }

  const grantByTile = groupBy(
    Array.from(grantMap.values()).filter((grant) => grant.status === 'spawned' && grant.spawn_tile_x !== null && grant.spawn_tile_y !== null),
    (grant) => makeTileKey(grant.spawn_tile_x ?? -1, grant.spawn_tile_y ?? -1),
  );

  const npcsInOrder = [...context.npcs].sort((left, right) => {
    const leftState = stateMap.get(left.id);
    const rightState = stateMap.get(right.id);
    if (!leftState || !rightState) {
      return left.created_at.getTime() - right.created_at.getTime();
    }

    return leftState.last_tick - rightState.last_tick || left.created_at.getTime() - right.created_at.getTime();
  });

  for (const npc of npcsInOrder) {
    const state = stateMap.get(npc.id);
    if (!state) {
      continue;
    }

    if (npc.status === 'dead' || state.hp <= 0) {
      const deadState: MutableState = {
        ...state,
        hp: 0,
        current_action: 'idle',
        last_tick: tickSeed,
        updated_at: tickFinishedAt,
      };
      stateMap.set(npc.id, deadState);
      continue;
    }

    const result = decideAction(
      context,
      state,
      npc,
      tileMap,
      inventoryMap,
      resourceByTile,
      grantByTile,
      grantMap,
      packItems,
      occupied,
      tickSeed,
      tickSeed,
    );

    stateMap.set(npc.id, result.nextState);
    events.push(...result.events);

    occupied.add(makeTileKey(result.nextState.tile_x, result.nextState.tile_y));
  }

  tickFinishedAt = new Date();

  const npcStates = Array.from(stateMap.values()).map((state) => ({
    ...state,
    updated_at: tickFinishedAt,
  }));

  const npcInventories = Array.from(inventoryMap.values()).map((inventory) => ({
    ...inventory,
    updated_at: tickFinishedAt,
  }));

  const tileResources = Array.from(resourceByTile.values()).flat().map((resource) => ({
    ...resource,
    updated_at: tickFinishedAt,
  }));

  const resourceGrants = Array.from(grantMap.values()).map((grant) => ({
    ...grant,
    metadata: {
      ...grant.metadata,
      last_ticked_at: tickFinishedAt.toISOString(),
    },
  }));

  const aliveCount = npcStates.filter((state) => state.hp > 0).length;
  const deadCount = npcStates.length - aliveCount;
  const tickEvent = buildEvent(
    context,
    tickSeed,
    'world_tick_completed',
    'ワールド Tick が完了しました',
    `Tick ${tickSeed} で ${aliveCount} 人が生存、${deadCount} 人が死亡しています。`,
    null,
    null,
    null,
    null,
    {
      npcCount: npcStates.length,
      aliveCount,
      deadCount,
      actionCount: events.length,
    },
  );

  events.push(tickEvent);

  return {
    nextTick: tickSeed,
    tickStartedAt,
    tickFinishedAt,
    npcStates,
    npcInventories,
    tileResources,
    resourceGrants,
    worldEvents: events,
    worldTick: {
      id: randomUUID(),
      world_id: context.world.id,
      tick: tickSeed,
      started_at: tickStartedAt,
      finished_at: tickFinishedAt,
      npc_count: npcStates.length,
      alive_count: aliveCount,
      dead_count: deadCount,
      metadata: {
        source: 'tick-engine',
        worldId: context.world.id,
        streamerHandle: context.streamer.handle,
        tick: tickSeed,
        events: events.length,
      },
    },
    worldStatus: context.world.status,
  };
}

function publishWorldTickOutcome(worldId: string, outcome: WorldTickOutcome): void {
  realtimeHub.publishWorldMessage(worldId, {
    type: 'world_tick_completed',
    tick: outcome.nextTick,
    npcCount: outcome.worldTick.npc_count,
    aliveCount: outcome.worldTick.alive_count,
    deadCount: outcome.worldTick.dead_count,
    eventCount: outcome.worldEvents.length,
    worldStatus: outcome.worldStatus,
  });
}

async function executeWorldTick(worldId: string): Promise<WorldTickOutcome> {
  return withTransaction(async (client) => {
    const context = await loadWorldTickContext(client, worldId);
    const outcome = advanceWorldTick(context);
    await persistWorldTickOutcome(client, worldId, outcome);
    return outcome;
  });
}

function isWorldDue(world: { status: WorldStatus; tick_interval_seconds: number; last_tick_started_at: Date | null }, now: Date): boolean {
  if (world.status !== 'active' && world.status !== 'live') {
    return false;
  }

  const elapsed = now.getTime() - (world.last_tick_started_at?.getTime() ?? 0);
  const intervalSeconds = world.status === 'live'
    ? Math.max(env.LIVE_WORLD_TICK_INTERVAL_SECONDS, world.tick_interval_seconds)
    : Math.max(env.ACTIVE_WORLD_TICK_INTERVAL_SECONDS, world.tick_interval_seconds * 5);

  return elapsed >= intervalSeconds * 1000;
}

export async function runTickScheduler(db: SqlExecutor): Promise<Array<{ worldId: string; nextTick: number }>> {
  const now = new Date();
  const worlds = await listTickableWorlds(db);
  const processed: Array<{ worldId: string; nextTick: number }> = [];

  for (const world of worlds) {
    if (!isWorldDue(world, now)) {
      continue;
    }

    const outcome = await executeWorldTick(world.id);
    publishWorldTickOutcome(world.id, outcome);
    processed.push({ worldId: world.id, nextTick: outcome.nextTick });
  }

  return processed;
}

export async function runManualTick(db: SqlExecutor, worldId?: string | null): Promise<Array<{ worldId: string; nextTick: number }>> {
  if (worldId) {
    const outcome = await executeWorldTick(worldId);
    publishWorldTickOutcome(worldId, outcome);
    return [{ worldId, nextTick: outcome.nextTick }];
  }

  const worlds = await listTickableWorlds(db);
  const results: Array<{ worldId: string; nextTick: number }> = [];

  for (const world of worlds) {
    const outcome = await executeWorldTick(world.id);
    publishWorldTickOutcome(world.id, outcome);
    results.push({ worldId: world.id, nextTick: outcome.nextTick });
  }

  return results;
}
