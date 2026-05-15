import { closeDatabase, pool } from '../src/db.js';
import { isAppError } from '../src/errors.js';
import {
  createLiveSession,
  dispatchGiftEventForCurrentLiveSession,
  endLiveSession,
  loadStreamerContext,
  loadWorldSnapshotByHandle,
  verifySeedData,
} from '../src/repository.js';

async function expectConflict(
  action: () => Promise<unknown>,
  expectedReason: string,
  label: string,
): Promise<void> {
  try {
    await action();
    throw new Error(`${label} should have failed`);
  } catch (error) {
    if (!isAppError(error) || error.statusCode !== 409) {
      throw error;
    }

    if ((error.details as { reason?: string } | undefined)?.reason !== expectedReason) {
      throw new Error(`${label} returned unexpected reason: ${JSON.stringify(error.details)}`);
    }
  }
}

async function expectNotFound(action: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await action();
    throw new Error(`${label} should have failed`);
  } catch (error) {
    if (!isAppError(error) || error.statusCode !== 404) {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const summary = await verifySeedData(pool);
  const streamerA = await loadStreamerContext(pool, 'streamer_a');
  const streamerB = await loadStreamerContext(pool, 'streamer_b');
  const worldId = streamerA.primaryWorld?.id;

  if (!worldId) {
    throw new Error('streamer_a seed world is missing');
  }

  if (!streamerB.primaryWorld?.id) {
    throw new Error('streamer_b seed world is missing');
  }

  const started = await createLiveSession(pool, {
    streamerHandle: 'streamer_a',
    worldId,
  });

  const contextAfterStart = await loadStreamerContext(pool, 'streamer_a');
  if (contextAfterStart.latestLiveSession?.id !== started.liveSession.id) {
    throw new Error('streamer_a current live session was not created');
  }

  const snapshotAfterStart = await loadWorldSnapshotByHandle(pool, 'streamer_a', worldId);
  if (snapshotAfterStart.liveSession?.status !== 'live') {
    throw new Error(`Expected live snapshot status live, got ${snapshotAfterStart.liveSession?.status ?? 'null'}`);
  }

  if (snapshotAfterStart.world.status !== 'live') {
    throw new Error(`Expected world status live, got ${snapshotAfterStart.world.status}`);
  }

  await expectConflict(
    () =>
      createLiveSession(pool, {
        streamerHandle: 'streamer_a',
        worldId,
      }),
    'live_session_already_active',
    'duplicate live session start',
  );

  const gift = await dispatchGiftEventForCurrentLiveSession(pool, {
    streamerHandle: 'streamer_a',
    worldId,
    tiktokId: 'phase10_test_user',
    giftName: 'Rose',
    giftValue: 1,
    repeatCount: 10,
    displayName: 'Phase10 Tester',
  });

  if (gift.liveSession.id !== started.liveSession.id) {
    throw new Error('gift was not attached to the current live session');
  }

  if (gift.liveSession.gift_count < 10) {
    throw new Error(`Expected gift count to increase, got ${gift.liveSession.gift_count}`);
  }

  const ended = await endLiveSession(pool, {
    streamerHandle: 'streamer_a',
    liveSessionId: started.liveSession.id,
  });

  if (ended.liveSession.status !== 'ended') {
    throw new Error(`Expected ended session status ended, got ${ended.liveSession.status}`);
  }

  if (ended.world.status !== 'active' && ended.world.status !== 'paused') {
    throw new Error(`Expected world to restore to active or paused, got ${ended.world.status}`);
  }

  const contextAfterEnd = await loadStreamerContext(pool, 'streamer_a');
  if (contextAfterEnd.latestLiveSession) {
    throw new Error('streamer_a should not have an active live session after ending');
  }

  const snapshotAfterEnd = await loadWorldSnapshotByHandle(pool, 'streamer_a', worldId);
  if (snapshotAfterEnd.liveSession) {
    throw new Error('snapshot should not expose a current live session after ending');
  }

  if (snapshotAfterEnd.world.latest_live_session_status !== 'ended') {
    throw new Error(`Expected latest live session status ended, got ${snapshotAfterEnd.world.latest_live_session_status ?? 'null'}`);
  }

  await expectConflict(
    () =>
      dispatchGiftEventForCurrentLiveSession(pool, {
        streamerHandle: 'streamer_a',
        worldId,
        tiktokId: 'phase10_test_user_2',
        giftName: 'Rose',
        giftValue: 1,
        repeatCount: 1,
      }),
    'no_active_live_session',
    'gift after ending',
  );

  await expectNotFound(() => loadWorldSnapshotByHandle(pool, 'streamer_b', worldId), 'cross-tenant snapshot');

  const result = {
    ok: true,
    summary,
    streamerA: {
      worldId,
      liveSessionId: started.liveSession.id,
      giftCount: gift.liveSession.gift_count,
      restoredWorldStatus: ended.world.status,
    },
    streamerB: {
      worldId: streamerB.primaryWorld?.id ?? null,
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
