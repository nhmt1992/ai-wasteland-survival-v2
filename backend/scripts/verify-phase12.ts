import { randomUUID } from 'node:crypto';
import { closeDatabase, pool } from '../src/db.js';
import { isAppError } from '../src/errors.js';
import { PLAN_LIMITS } from '../src/plans.js';
import {
  createLiveSession,
  createViewerNpc,
  endLiveSession,
  loadPlatformAdminByEmail,
  loadStreamerContext,
  updateStreamerOperationalStatus,
  updateStreamerSubscriptionPlan,
  verifyPasswordHash,
  verifySeedData,
} from '../src/repository.js';
import {
  listAdminLiveSessions,
  loadAdminStreamerDetail,
  loadAdminSummary,
} from '../src/admin-repository.js';

async function expectAppError(
  action: () => Promise<unknown>,
  expected: {
    statusCode?: number;
    code?: string;
    detailCode?: string;
  },
  label: string,
): Promise<void> {
  try {
    await action();
    throw new Error(`${label} should have failed`);
  } catch (error) {
    if (!isAppError(error)) {
      throw error;
    }

    if (expected.statusCode !== undefined && error.statusCode !== expected.statusCode) {
      throw new Error(`${label} returned unexpected status: ${error.statusCode}`);
    }

    if (expected.code !== undefined && error.code !== expected.code) {
      throw new Error(`${label} returned unexpected code: ${error.code}`);
    }

    const details = error.details as { code?: string } | undefined;
    if (expected.detailCode !== undefined && details?.code !== expected.detailCode) {
      throw new Error(`${label} returned unexpected detail code: ${JSON.stringify(error.details)}`);
    }
  }
}

async function main(): Promise<void> {
  const summary = await verifySeedData(pool);
  const admin = await loadPlatformAdminByEmail(pool, 'admin@example.com');
  if (!admin) {
    throw new Error('Expected admin seed to exist');
  }

  if (!(await verifyPasswordHash(pool, 'admin-demo-123', admin.password_hash))) {
    throw new Error('Admin password seed mismatch');
  }

  const adminGrowthTiktokId = `phase12_admin_growth_${randomUUID()}`;
  const adminSummary = await loadAdminSummary(pool);
  if (adminSummary.tenantCount < 3 || adminSummary.streamerCount < 3) {
    throw new Error(`Unexpected admin summary: ${JSON.stringify(adminSummary)}`);
  }

  const mattBefore = await loadStreamerContext(pool, 'matt');
  const mattWorldId = mattBefore.primaryWorld?.id;
  if (!mattWorldId) {
    throw new Error('matt seed world is missing');
  }

  await updateStreamerSubscriptionPlan(pool, {
    streamerHandle: 'matt',
    plan: 'starter',
    status: 'active',
  });

  const mattStarter = await loadAdminStreamerDetail(pool, mattBefore.streamer.id);
  if (!mattStarter) {
    throw new Error('Failed to load matt admin detail');
  }

  if (mattStarter.subscription?.plan !== 'starter') {
    throw new Error(`Expected matt starter plan, got ${mattStarter.subscription?.plan ?? 'null'}`);
  }

  if (mattStarter.planLimits.maxNpcsPerWorld !== PLAN_LIMITS.starter.maxNpcsPerWorld) {
    throw new Error(`Expected matt starter npc limit ${PLAN_LIMITS.starter.maxNpcsPerWorld}, got ${mattStarter.planLimits.maxNpcsPerWorld}`);
  }

  const createdNpc = await createViewerNpc(pool, {
    streamerHandle: 'matt',
    tiktokId: adminGrowthTiktokId,
    displayName: 'Phase12 Growth',
    npcName: 'Admin Growth NPC',
  });

  if (!createdNpc.created) {
    throw new Error('Expected matt starter NPC creation to succeed');
  }

  const streamerAId = (await loadStreamerContext(pool, 'streamer_a')).streamer.id;
  await updateStreamerOperationalStatus(pool, {
    streamerId: streamerAId,
    isActive: false,
  });

  const streamerAPaused = await loadStreamerContext(pool, 'streamer_a');
  if (streamerAPaused.tenant.status !== 'paused' || streamerAPaused.streamer.is_active !== false) {
    throw new Error('Expected streamer_a to be paused');
  }

  await expectAppError(
    () =>
      createLiveSession(pool, {
        streamerHandle: 'streamer_a',
        worldId: streamerAPaused.primaryWorld?.id,
      }),
    {
      statusCode: 409,
      code: 'streamer_inactive',
    },
    'paused streamer_a live session',
  );

  const streamerB = await loadStreamerContext(pool, 'streamer_b');
  const streamerBLive = await createLiveSession(pool, {
    streamerHandle: 'streamer_b',
    worldId: streamerB.primaryWorld?.id,
  });

  if (streamerBLive.liveSession.status !== 'live') {
    throw new Error(`Expected streamer_b live session to be live, got ${streamerBLive.liveSession.status}`);
  }

  let adminLiveSessions = await listAdminLiveSessions(pool);
  const liveB = adminLiveSessions.find((item) => item.liveSession.id === streamerBLive.liveSession.id);
  if (!liveB || liveB.liveSession.status !== 'live') {
    throw new Error('Admin live session list did not show streamer_b as live');
  }

  const endedStreamerB = await endLiveSession(pool, {
    streamerHandle: 'streamer_b',
    liveSessionId: streamerBLive.liveSession.id,
  });

  if (endedStreamerB.liveSession.status !== 'ended') {
    throw new Error(`Expected streamer_b session to end, got ${endedStreamerB.liveSession.status}`);
  }

  adminLiveSessions = await listAdminLiveSessions(pool);
  const endedB = adminLiveSessions.find((item) => item.liveSession.id === streamerBLive.liveSession.id);
  if (!endedB || endedB.liveSession.status !== 'ended') {
    throw new Error('Admin live session list did not show streamer_b as ended');
  }

  await updateStreamerOperationalStatus(pool, {
    streamerId: streamerAId,
    isActive: true,
  });

  const streamerAActive = await loadStreamerContext(pool, 'streamer_a');
  if (streamerAActive.tenant.status !== 'active' || streamerAActive.streamer.is_active !== true) {
    throw new Error('Expected streamer_a to be restored');
  }

  const streamerALive = await createLiveSession(pool, {
    streamerHandle: 'streamer_a',
    worldId: streamerAActive.primaryWorld?.id,
  });

  if (streamerALive.liveSession.status !== 'live') {
    throw new Error(`Expected streamer_a restored session to be live, got ${streamerALive.liveSession.status}`);
  }

  await endLiveSession(pool, {
    streamerHandle: 'streamer_a',
    liveSessionId: streamerALive.liveSession.id,
  });

  const adminDetailAfterRestore = await loadAdminStreamerDetail(pool, streamerAId);
  if (!adminDetailAfterRestore) {
    throw new Error('Failed to reload streamer_a admin detail');
  }

  const result = {
    ok: true,
    summary,
    adminSummary,
    matt: {
      worldId: mattWorldId,
      plan: mattStarter.subscription?.plan ?? null,
      npcCount: mattStarter.stats.npcCount,
      planLimit: mattStarter.planLimits.maxNpcsPerWorld,
      createdNpcId: createdNpc.npc.npc.id,
      tiktokId: adminGrowthTiktokId,
    },
    streamerA: {
      status: streamerAActive.tenant.status,
      operational: streamerAActive.streamer.is_active,
      latestAdminLiveStatus: adminDetailAfterRestore.liveSession?.status ?? null,
    },
    streamerB: {
      liveSessionId: streamerBLive.liveSession.id,
      liveStatus: endedB?.liveSession.status ?? null,
    },
  };

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
