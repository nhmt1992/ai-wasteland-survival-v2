import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { closeDatabase, pool } from '../src/db.js';
import { loadStreamerContext, verifySeedData } from '../src/repository.js';
import { runManualTick } from '../src/tick.js';

type GrantItem = {
  item_id: string;
  quantity: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function toQuantityMap(rows: Array<{ item_id: string; quantity: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.item_id, row.quantity);
  }

  return map;
}

async function loadPrimaryFixture(): Promise<{
  summary: Awaited<ReturnType<typeof verifySeedData>>;
  tenantId: string;
  streamerId: string;
  worldId: string;
  npcId: string;
  npcName: string;
  npcTileX: number;
  npcTileY: number;
  packId: string;
  packItems: GrantItem[];
}> {
  const summary = await verifySeedData(pool);
  const context = await loadStreamerContext(pool, 'matt');
  const world = context.primaryWorld;
  assert(world, 'default world is missing');

  const npcRow = await pool.query<{
    npc_id: string;
    npc_name: string;
    tile_x: number;
    tile_y: number;
  }>(
    `
      select
        n.id as npc_id,
        n.name as npc_name,
        s.tile_x,
        s.tile_y
      from public.npcs n
      join public.npc_states s
        on s.npc_id = n.id
      where n.world_id = $1
        and n.status = 'alive'
      order by n.created_at asc
      limit 1
    `,
    [world.id],
  );
  const npc = npcRow.rows[0];
  assert(npc, 'alive npc is missing');

  const packRow = await pool.query<{ pack_id: string }>(
    `
      select pack_id
      from public.resource_pack_items
      group by pack_id
      having count(*) > 0
      order by pack_id asc
      limit 1
    `,
  );
  const pack = packRow.rows[0];
  assert(pack, 'resource pack with items is missing');

  const packItemsRow = await pool.query<GrantItem>(
    `
      select item_id, quantity
      from public.resource_pack_items
      where pack_id = $1
      order by item_id asc
    `,
    [pack.pack_id],
  );
  assert(packItemsRow.rows.length > 0, 'resource pack items are missing');

  return {
    summary,
    tenantId: context.tenant.id,
    streamerId: context.streamer.id,
    worldId: world.id,
    npcId: npc.npc_id,
    npcName: npc.npc_name,
    npcTileX: npc.tile_x,
    npcTileY: npc.tile_y,
    packId: pack.pack_id,
    packItems: packItemsRow.rows,
  };
}

async function insertSpawnedGrant(input: {
  tenantId: string;
  streamerId: string;
  worldId: string;
  npcId: string;
  npcTileX: number;
  npcTileY: number;
  packId: string;
}): Promise<string> {
  const grantId = randomUUID();
  await pool.query(
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
        $1,$2,$3,$4,null,null,null,$5,$6,'spawned',$7,$8,$9,null,$10,now()
      )
    `,
    [
      grantId,
      input.tenantId,
      input.streamerId,
      input.worldId,
      input.npcId,
      input.packId,
      input.npcTileX,
      input.npcTileY,
      new Date(Date.now() + 30 * 60 * 1000),
      {
        source: 'verify-tick-transaction',
        resourceGrantId: grantId,
        packId: input.packId,
      },
    ],
  );

  return grantId;
}

async function loadInventoryQuantities(npcId: string, itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) {
    return new Map();
  }

  const result = await pool.query<{ item_id: string; quantity: number }>(
    `
      select item_id, quantity
      from public.npc_inventory
      where npc_id = $1
        and item_id = any($2::text[])
      order by item_id asc
    `,
    [npcId, itemIds],
  );

  return toQuantityMap(result.rows);
}

async function loadGrantState(grantId: string): Promise<{ status: string; claimedAt: string | null }> {
  const result = await pool.query<{ status: string; claimed_at: Date | null }>(
    `
      select status, claimed_at
      from public.resource_grants
      where id = $1
      limit 1
    `,
    [grantId],
  );

  const row = result.rows[0];
  assert(row, `resource grant ${grantId} is missing`);

  return {
    status: row.status,
    claimedAt: row.claimed_at ? row.claimed_at.toISOString() : null,
  };
}

async function loadWorldTickSnapshot(worldId: string, npcId: string): Promise<{
  currentTick: number;
  npcState: {
    tileX: number;
    tileY: number;
    hp: number;
    food: number;
    water: number;
    stamina: number;
    morale: number;
    injury: number;
    shelter: number;
    currentAction: string;
    lastTick: number;
  };
}> {
  const worldResult = await pool.query<{ current_tick: number }>(
    `
      select current_tick
      from public.worlds
      where id = $1
      limit 1
    `,
    [worldId],
  );
  const worldRow = worldResult.rows[0];
  assert(worldRow, `world ${worldId} is missing`);

  const stateResult = await pool.query<{
    tile_x: number;
    tile_y: number;
    hp: number;
    food: number;
    water: number;
    stamina: number;
    morale: number;
    injury: number;
    shelter: number;
    current_action: string;
    last_tick: number;
  }>(
    `
      select
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
        last_tick
      from public.npc_states
      where npc_id = $1
      limit 1
    `,
    [npcId],
  );
  const stateRow = stateResult.rows[0];
  assert(stateRow, `npc state ${npcId} is missing`);

  return {
    currentTick: worldRow.current_tick,
    npcState: {
      tileX: stateRow.tile_x,
      tileY: stateRow.tile_y,
      hp: stateRow.hp,
      food: stateRow.food,
      water: stateRow.water,
      stamina: stateRow.stamina,
      morale: stateRow.morale,
      injury: stateRow.injury,
      shelter: stateRow.shelter,
      currentAction: stateRow.current_action,
      lastTick: stateRow.last_tick,
    },
  };
}

function patchPoolConnectForWorldEventFailure(): () => void {
  const originalConnect = pool.connect.bind(pool);

  pool.connect = (async () => {
    const client = await originalConnect();

    const wrappedClient: Pick<PoolClient, 'query' | 'release'> = {
      query: async (text: string, values?: readonly unknown[]) => {
        if (text.toLowerCase().includes('insert into public.world_events')) {
          throw new Error('injected world_events failure');
        }

        return client.query(text, values);
      },
      release: () => client.release(),
    };

    return wrappedClient as PoolClient;
  }) as typeof pool.connect;

  return () => {
    pool.connect = originalConnect as typeof pool.connect;
  };
}

async function runSuccessfulPickupScenario(fixture: Awaited<ReturnType<typeof loadPrimaryFixture>>): Promise<{
  grantId: string;
  nextTick: number;
  inventoryBefore: Map<string, number>;
  inventoryAfter: Map<string, number>;
}> {
  const inventoryBefore = await loadInventoryQuantities(
    fixture.npcId,
    fixture.packItems.map((item) => item.item_id),
  );
  const grantId = await insertSpawnedGrant(fixture);
  const tickResults = await runManualTick(pool, fixture.worldId);
  const tickResult = tickResults.find((result) => result.worldId === fixture.worldId);
  assert(tickResult, 'manual tick did not process the target world');

  const inventoryAfter = await loadInventoryQuantities(
    fixture.npcId,
    fixture.packItems.map((item) => item.item_id),
  );
  const grantState = await loadGrantState(grantId);
  assert(grantState.status === 'claimed', 'spawned grant was not claimed');

  const eventsResult = await pool.query<{
    event_type: string;
    target_npc_id: string | null;
    actor_npc_id: string | null;
    metadata: Record<string, unknown>;
  }>(
    `
      select
        event_type,
        target_npc_id,
        actor_npc_id,
        metadata
      from public.world_events
      where world_id = $1
        and tick = $2
      order by created_at asc
    `,
    [fixture.worldId, tickResult.nextTick],
  );

  const pickupEvent = eventsResult.rows.find((row) => row.event_type === 'npc_pickup_grant');
  assert(pickupEvent, 'npc_pickup_grant event was not written');
  assert(pickupEvent.target_npc_id === fixture.npcId, 'npc_pickup_grant target_npc_id is not the npc id');
  assert(
    pickupEvent.metadata.resourceGrantId === grantId,
    'npc_pickup_grant metadata.resourceGrantId does not match the spawned grant',
  );

  const claimedEvent = eventsResult.rows.find((row) => row.event_type === 'resource_grant_claimed');
  assert(claimedEvent, 'resource_grant_claimed event was not written');
  assert(claimedEvent.target_npc_id === fixture.npcId, 'resource_grant_claimed target_npc_id is not the npc id');

  for (const item of fixture.packItems) {
    const before = inventoryBefore.get(item.item_id) ?? 0;
    const after = inventoryAfter.get(item.item_id) ?? 0;
    assert(after === before + item.quantity, `inventory item ${item.item_id} did not increase by ${item.quantity}`);
  }

  return {
    grantId,
    nextTick: tickResult.nextTick,
    inventoryBefore,
    inventoryAfter,
  };
}

async function runRollbackScenario(fixture: Awaited<ReturnType<typeof loadPrimaryFixture>>): Promise<void> {
  const baseline = await loadWorldTickSnapshot(fixture.worldId, fixture.npcId);
  const inventoryBefore = await loadInventoryQuantities(
    fixture.npcId,
    fixture.packItems.map((item) => item.item_id),
  );
  const grantId = await insertSpawnedGrant({
    ...fixture,
    npcTileX: baseline.npcState.tileX,
    npcTileY: baseline.npcState.tileY,
  });

  const restoreConnect = patchPoolConnectForWorldEventFailure();
  let failed = false;
  try {
    await runManualTick(pool, fixture.worldId);
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes('injected world_events failure'), 'unexpected rollback error message');
  } finally {
    restoreConnect();
  }

  assert(failed, 'transaction rollback scenario did not fail as expected');

  const after = await loadWorldTickSnapshot(fixture.worldId, fixture.npcId);
  assert(after.currentTick === baseline.currentTick, 'world tick advanced despite rollback');
  assert(
    after.npcState.tileX === baseline.npcState.tileX &&
      after.npcState.tileY === baseline.npcState.tileY &&
      after.npcState.hp === baseline.npcState.hp &&
      after.npcState.food === baseline.npcState.food &&
      after.npcState.water === baseline.npcState.water &&
      after.npcState.stamina === baseline.npcState.stamina &&
      after.npcState.morale === baseline.npcState.morale &&
      after.npcState.injury === baseline.npcState.injury &&
      after.npcState.shelter === baseline.npcState.shelter &&
      after.npcState.currentAction === baseline.npcState.currentAction &&
      after.npcState.lastTick === baseline.npcState.lastTick,
    'npc state changed despite rollback',
  );

  const grantState = await loadGrantState(grantId);
  assert(grantState.status === 'spawned', 'failed tick should not have claimed the grant');
  assert(grantState.claimedAt === null, 'failed tick should not set claimed_at');

  const inventoryAfter = await loadInventoryQuantities(
    fixture.npcId,
    fixture.packItems.map((item) => item.item_id),
  );

  for (const item of fixture.packItems) {
    const before = inventoryBefore.get(item.item_id) ?? 0;
    const afterQuantity = inventoryAfter.get(item.item_id) ?? 0;
    assert(afterQuantity === before, `inventory item ${item.item_id} changed during rollback`);
  }
}

async function main(): Promise<void> {
  const fixture = await loadPrimaryFixture();

  const success = await runSuccessfulPickupScenario(fixture);
  await runRollbackScenario(fixture);

  console.log(
    JSON.stringify(
      {
        ok: true,
        summary: fixture.summary,
        worldId: fixture.worldId,
        npcId: fixture.npcId,
        npcName: fixture.npcName,
        packId: fixture.packId,
        successfulTick: success.nextTick,
        successfulGrantId: success.grantId,
        packItems: fixture.packItems,
        rollbackVerified: true,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
