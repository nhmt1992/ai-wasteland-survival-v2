import { closeDatabase, pool } from '../src/db.js';
import { isAppError } from '../src/errors.js';
import { PLAN_LIMITS } from '../src/plans.js';
import {
  createLiveSession,
  createViewerNpc,
  dispatchGiftEventForCurrentLiveSession,
  endLiveSession,
  loadStreamerContext,
  loadWorldSnapshotByHandle,
  updateStreamerSubscriptionPlan,
  verifySeedData,
} from '../src/repository.js';

function getWorldNpcCount(world: { npc_count?: number } | null | undefined): number {
  return world?.npc_count ?? 0;
}

async function expectAppError(
  action: () => Promise<unknown>,
  expected: {
    statusCode?: number;
    code?: string;
    detailCode?: string;
    detailReason?: string;
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

    const details = error.details as { code?: string; reason?: string } | undefined;
    if (expected.detailCode !== undefined && details?.code !== expected.detailCode) {
      throw new Error(`${label} returned unexpected detail code: ${JSON.stringify(error.details)}`);
    }

    if (expected.detailReason !== undefined && details?.reason !== expected.detailReason) {
      throw new Error(`${label} returned unexpected detail reason: ${JSON.stringify(error.details)}`);
    }
  }
}

async function main(): Promise<void> {
  const summary = await verifySeedData(pool);

  await updateStreamerSubscriptionPlan(pool, {
    streamerHandle: 'matt',
    plan: 'free_trial',
    status: 'trialing',
  });

  const mattFreeTrial = await loadStreamerContext(pool, 'matt');
  const freeTrialLimit = PLAN_LIMITS.free_trial.maxNpcsPerWorld;
  const mattWorldId = mattFreeTrial.primaryWorld?.id;

  if (!mattWorldId) {
    throw new Error('matt seed world is missing');
  }

  if (getWorldNpcCount(mattFreeTrial.primaryWorld) !== freeTrialLimit) {
    throw new Error(`Expected free trial seed NPC count ${freeTrialLimit}, got ${getWorldNpcCount(mattFreeTrial.primaryWorld)}`);
  }

  await expectAppError(
    () =>
      createViewerNpc(pool, {
        streamerHandle: 'matt',
        tiktokId: 'phase11_free_trial_blocked',
        displayName: 'Phase11 Blocked',
        npcName: 'Blocked NPC',
      }),
    {
      statusCode: 409,
      code: 'plan_limit_exceeded',
      detailCode: 'max_npcs_per_world',
    },
    'free trial NPC limit',
  );

  await updateStreamerSubscriptionPlan(pool, {
    streamerHandle: 'matt',
    plan: 'starter',
    status: 'active',
  });

  const starterContext = await loadStreamerContext(pool, 'matt');
  if (starterContext.subscription?.plan !== 'starter') {
    throw new Error(`Expected starter plan, got ${starterContext.subscription?.plan ?? 'null'}`);
  }

  if (starterContext.planLimits.maxNpcsPerWorld !== PLAN_LIMITS.starter.maxNpcsPerWorld) {
    throw new Error(`Expected starter NPC limit ${PLAN_LIMITS.starter.maxNpcsPerWorld}, got ${starterContext.planLimits.maxNpcsPerWorld}`);
  }

  const createdNpc = await createViewerNpc(pool, {
    streamerHandle: 'matt',
    tiktokId: 'phase11_starter_success',
    displayName: 'Phase11 Success',
    npcName: 'Starter NPC',
  });

  if (!createdNpc.created) {
    throw new Error('Expected starter plan NPC creation to succeed');
  }

  const starterAfterNpc = await loadStreamerContext(pool, 'matt');
  if (getWorldNpcCount(starterAfterNpc.primaryWorld) !== freeTrialLimit + 1) {
    throw new Error(`Expected NPC count ${freeTrialLimit + 1}, got ${getWorldNpcCount(starterAfterNpc.primaryWorld)}`);
  }

  await updateStreamerSubscriptionPlan(pool, {
    streamerHandle: 'matt',
    plan: 'starter',
    status: 'expired',
  });

  await expectAppError(
    () =>
      createLiveSession(pool, {
        streamerHandle: 'matt',
        worldId: mattWorldId,
      }),
    {
      statusCode: 409,
      code: 'subscription_inactive',
    },
    'expired subscription live session start',
  );

  await updateStreamerSubscriptionPlan(pool, {
    streamerHandle: 'matt',
    plan: 'starter',
    status: 'active',
  });

  const startedLiveSession = await createLiveSession(pool, {
    streamerHandle: 'matt',
    worldId: mattWorldId,
  });

  if (startedLiveSession.liveSession.status !== 'live') {
    throw new Error(`Expected live session status live, got ${startedLiveSession.liveSession.status}`);
  }

  if (startedLiveSession.world.status !== 'live') {
    throw new Error(`Expected world status live, got ${startedLiveSession.world.status}`);
  }

  const endedLiveSession = await endLiveSession(pool, {
    streamerHandle: 'matt',
    liveSessionId: startedLiveSession.liveSession.id,
  });

  if (endedLiveSession.liveSession.status !== 'ended') {
    throw new Error(`Expected ended live session status ended, got ${endedLiveSession.liveSession.status}`);
  }

  await expectAppError(
    () =>
      dispatchGiftEventForCurrentLiveSession(pool, {
        streamerHandle: 'matt',
        worldId: mattWorldId,
        tiktokId: 'phase11_gift_after_end',
        giftName: 'Rose',
        giftValue: 1,
        repeatCount: 1,
      }),
    {
      statusCode: 409,
      detailReason: 'no_active_live_session',
    },
    'gift after session end',
  );

  await expectAppError(
    () => loadWorldSnapshotByHandle(pool, 'streamer_b', mattWorldId),
    {
      statusCode: 404,
    },
    'cross-tenant snapshot access',
  );

  const result = {
    ok: true,
    summary,
    matt: {
      worldId: mattWorldId,
      freeTrialNpcCount: mattFreeTrial.primaryWorld?.npc_count ?? null,
      starterNpcCount: starterAfterNpc.primaryWorld?.npc_count ?? null,
      liveSessionId: startedLiveSession.liveSession.id,
      endedLiveSessionId: endedLiveSession.liveSession.id,
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
