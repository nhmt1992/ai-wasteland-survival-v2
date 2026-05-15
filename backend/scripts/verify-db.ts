import { closeDatabase, pool } from '../src/db.js';
import { isAppError } from '../src/errors.js';
import { env } from '../src/env.js';
import { PLAN_LIMITS } from '../src/plans.js';
import { loadPlatformAdminByEmail, loadStreamerAuthByEmail, loadStreamerContext, loadWorldSnapshotByHandle, verifyPasswordHash, verifySeedData } from '../src/repository.js';

async function assertPasswordHashMatches(email: string, password: string): Promise<void> {
  const auth = await loadStreamerAuthByEmail(pool, email);
  if (!auth) {
    throw new Error(`Expected auth row for ${email}`);
  }

  if (!(await verifyPasswordHash(pool, password, auth.streamer.password_hash))) {
    throw new Error(`Password seed mismatch for ${email}`);
  }
}

async function assertAdminPasswordHashMatches(email: string, password: string): Promise<void> {
  const admin = await loadPlatformAdminByEmail(pool, email);
  if (!admin) {
    throw new Error(`Expected admin row for ${email}`);
  }

  if (!(await verifyPasswordHash(pool, password, admin.password_hash))) {
    throw new Error(`Password seed mismatch for ${email}`);
  }
}

async function assertSnapshotForbidden(handle: string, worldId: string): Promise<void> {
  try {
    await loadWorldSnapshotByHandle(pool, handle, worldId);
    throw new Error(`Expected ${handle} to be blocked from world ${worldId}`);
  } catch (error) {
    if (!isAppError(error) || error.statusCode !== 404) {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const summary = await verifySeedData(pool);
  const matt = await loadStreamerContext(pool, env.DEFAULT_STREAMER_HANDLE);
  const streamerA = await loadStreamerContext(pool, 'streamer_a');
  const streamerB = await loadStreamerContext(pool, 'streamer_b');

  await assertPasswordHashMatches('matt@example.com', 'matt-demo-123');
  await assertPasswordHashMatches('streamer_a@example.com', 'streamer-a-123');
  await assertPasswordHashMatches('streamer_b@example.com', 'streamer-b-123');
  await assertAdminPasswordHashMatches('admin@example.com', 'admin-demo-123');

  const result = {
    ok: true,
    defaults: {
      matt: {
        tenantHandle: matt.tenant.handle,
        streamerHandle: matt.streamer.handle,
        worldId: matt.primaryWorld?.id ?? null,
        worldName: matt.primaryWorld?.name ?? null,
        npcCount: matt.stats.npcCount,
        worldCount: matt.stats.worldCount,
      },
      streamerA: {
        tenantHandle: streamerA.tenant.handle,
        streamerHandle: streamerA.streamer.handle,
        worldId: streamerA.primaryWorld?.id ?? null,
        worldName: streamerA.primaryWorld?.name ?? null,
        npcCount: streamerA.stats.npcCount,
        worldCount: streamerA.stats.worldCount,
      },
      streamerB: {
        tenantHandle: streamerB.tenant.handle,
        streamerHandle: streamerB.streamer.handle,
        worldId: streamerB.primaryWorld?.id ?? null,
        worldName: streamerB.primaryWorld?.name ?? null,
        npcCount: streamerB.stats.npcCount,
        worldCount: streamerB.stats.worldCount,
      },
    },
    summary,
  };

  if (matt.tenant.handle !== env.DEFAULT_TENANT_HANDLE) {
    throw new Error(`Expected tenant handle ${env.DEFAULT_TENANT_HANDLE}, got ${matt.tenant.handle}`);
  }

  if (matt.streamer.handle !== env.DEFAULT_STREAMER_HANDLE) {
    throw new Error(`Expected streamer handle ${env.DEFAULT_STREAMER_HANDLE}, got ${matt.streamer.handle}`);
  }

  if (matt.primaryWorld?.id !== env.DEFAULT_WORLD_ID) {
    throw new Error(`Expected world id ${env.DEFAULT_WORLD_ID}, got ${matt.primaryWorld?.id ?? 'null'}`);
  }

  if (matt.stats.npcCount < 5) {
    throw new Error(`Expected at least 5 NPCs, got ${matt.stats.npcCount}`);
  }

  if (matt.subscription?.plan !== 'free_trial' || matt.subscription?.max_npcs_per_world !== PLAN_LIMITS.free_trial.maxNpcsPerWorld) {
    throw new Error(`Expected matt free trial limits to match plan config, got ${JSON.stringify({
      plan: matt.subscription?.plan,
      maxNpcsPerWorld: matt.subscription?.max_npcs_per_world,
    })}`);
  }

  if (streamerA.tenant.handle !== 'streamer_a' || streamerA.streamer.handle !== 'streamer_a') {
    throw new Error('Expected streamer_a seed to be present');
  }

  if (streamerA.subscription?.plan !== 'free_trial' || streamerA.subscription?.max_npcs_per_world !== PLAN_LIMITS.free_trial.maxNpcsPerWorld) {
    throw new Error('Expected streamer_a free trial plan limits to match plan config');
  }

  if (streamerB.tenant.handle !== 'streamer_b' || streamerB.streamer.handle !== 'streamer_b') {
    throw new Error('Expected streamer_b seed to be present');
  }

  if (streamerB.subscription?.plan !== 'free_trial' || streamerB.subscription?.max_npcs_per_world !== PLAN_LIMITS.free_trial.maxNpcsPerWorld) {
    throw new Error('Expected streamer_b free trial plan limits to match plan config');
  }

  if (streamerA.primaryWorld?.id === streamerB.primaryWorld?.id || streamerA.primaryWorld?.id === matt.primaryWorld?.id) {
    throw new Error('Seed worlds must be distinct across tenants');
  }

  if (streamerA.primaryWorld?.tenant_id !== streamerA.tenant.id || streamerB.primaryWorld?.tenant_id !== streamerB.tenant.id) {
    throw new Error('Seed world tenant linkage is broken');
  }

  if (streamerA.primaryWorld?.id && streamerB.primaryWorld?.id) {
    await assertSnapshotForbidden('streamer_a', streamerB.primaryWorld.id);
    await assertSnapshotForbidden('streamer_b', streamerA.primaryWorld.id);
  }

  if (matt.primaryWorld?.id && streamerA.primaryWorld?.id) {
    await assertSnapshotForbidden(env.DEFAULT_STREAMER_HANDLE, streamerA.primaryWorld.id);
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
