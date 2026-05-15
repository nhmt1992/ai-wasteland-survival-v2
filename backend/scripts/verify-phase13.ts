import { randomUUID } from 'node:crypto';
import { closeDatabase, pool } from '../src/db.js';
import { AVAILABLE_GIFT_ADAPTERS, normalizeGiftAdapterEvent } from '../src/gift-adapters.js';
import {
  createLiveSession,
  dispatchGiftEventForCurrentLiveSession,
  endLiveSession,
  loadStreamerContext,
  updateGiftSourceConnection,
  verifySeedData,
} from '../src/repository.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const summary = await verifySeedData(pool);
  const adapterTypes = AVAILABLE_GIFT_ADAPTERS.map((adapter) => adapter.type).sort();

  assert(adapterTypes.includes('dev_mock'), 'dev_mock adapter is missing');
  assert(adapterTypes.includes('manual'), 'manual adapter is missing');
  assert(adapterTypes.includes('tiktok_experimental'), 'tiktok_experimental adapter is missing');
  assert(adapterTypes.includes('future_official'), 'future_official adapter is missing');

  const contextBefore = await loadStreamerContext(pool, 'matt');
  const worldId = contextBefore.primaryWorld?.id;
  assert(worldId, 'matt seed world is missing');

  const normalized = normalizeGiftAdapterEvent({
    streamerHandle: 'matt',
    worldId,
    adapterType: 'tiktok_experimental',
    tiktokId: 'raw_user_001',
    displayName: null,
    giftName: 'Rose',
    giftValue: 1,
    repeatCount: 10,
    rawPayload: {
      tiktok_id: 'raw_user_001',
      display_name: '実験ユーザー',
      gift_name: 'Rose',
      gift_value: 1,
      repeat_count: 10,
      extra_field: true,
    },
  });

  assert(normalized.adapterType === 'tiktok_experimental', 'adapter normalization did not preserve adapterType');
  assert(normalized.tiktokId === 'raw_user_001', 'adapter normalization did not preserve tiktokId');
  assert(normalized.displayName === '実験ユーザー', 'adapter normalization did not read display_name');
  assert(normalized.giftName === 'Rose', 'adapter normalization did not preserve giftName');
  assert(normalized.repeatCount === 10, 'adapter normalization did not preserve repeatCount');

  const updatedConnection = await updateGiftSourceConnection(pool, {
    streamerHandle: 'matt',
    platform: 'tiktok',
    connectionType: 'tiktok_experimental',
    status: 'test_mode',
    encryptedCredentials: {
      source: 'phase13',
      adapterType: 'tiktok_experimental',
      enabled: true,
    },
    lastConnectedAt: new Date(),
    lastError: null,
  });

  assert(updatedConnection.connection_type === 'tiktok_experimental', 'gift connection was not updated to tiktok_experimental');
  assert(updatedConnection.status === 'test_mode', 'gift connection did not switch to test_mode');

  const liveSession = await createLiveSession(pool, {
    streamerHandle: 'matt',
    worldId,
    platform: 'tiktok',
    platformLiveId: `phase13_${randomUUID()}`,
  });

  const dispatch = await dispatchGiftEventForCurrentLiveSession(pool, {
    streamerHandle: 'matt',
    worldId,
    adapterType: 'tiktok_experimental',
    tiktokId: 'raw_user_001',
    displayName: '実験ユーザー',
    giftName: 'Rose',
    giftValue: 1,
    repeatCount: 3,
    giftId: 'rose',
    platformEventId: `phase13_gift_${randomUUID()}`,
    rawPayload: {
      tiktok_id: 'raw_user_001',
      display_name: '実験ユーザー',
      gift_name: 'Rose',
      gift_value: 1,
      repeat_count: 3,
      source: 'phase13',
    },
  });

  const rawPayload = dispatch.giftEvent.raw_payload as Record<string, unknown>;
  assert(rawPayload.adapterType === 'tiktok_experimental', 'gift_event raw_payload did not preserve adapterType');
  assert(rawPayload.adapterLabel === 'TikTokExperimentalAdapter', 'gift_event raw_payload did not preserve adapterLabel');
  assert(dispatch.giftEvent.status === 'processed', 'gift event was not processed');
  assert(dispatch.resourceGrant.status === 'spawned', 'resource grant was not created');
  assert(dispatch.liveSession.id === liveSession.liveSession.id, 'gift was not attached to the current live session');

  const ended = await endLiveSession(pool, {
    streamerHandle: 'matt',
    liveSessionId: liveSession.liveSession.id,
  });

  assert(ended.liveSession.status === 'ended', 'live session did not end');

  const restoredConnection = await updateGiftSourceConnection(pool, {
    streamerHandle: 'matt',
    platform: contextBefore.giftConnection?.platform ?? 'tiktok',
    connectionType: contextBefore.giftConnection?.connection_type ?? 'dev_mock',
    status: contextBefore.giftConnection?.status ?? 'test_mode',
    encryptedCredentials: contextBefore.giftConnection?.encrypted_credentials ?? null,
    lastConnectedAt: contextBefore.giftConnection?.last_connected_at ?? new Date(),
    lastError: contextBefore.giftConnection?.last_error ?? null,
  });

  const contextAfter = await loadStreamerContext(pool, 'matt');

  assert(contextAfter.giftConnection?.connection_type === restoredConnection.connection_type, 'gift connection was not restored');
  assert(contextAfter.giftConnection?.status === restoredConnection.status, 'gift connection status was not restored');

  console.log(
    JSON.stringify(
      {
        ok: true,
        summary,
        adapters: adapterTypes,
        normalizedGift: {
          adapterType: normalized.adapterType,
          tiktokId: normalized.tiktokId,
          displayName: normalized.displayName,
          repeatCount: normalized.repeatCount,
        },
        liveSessionId: liveSession.liveSession.id,
        giftEventId: dispatch.giftEvent.id,
        giftConnection: {
          before: contextBefore.giftConnection?.connection_type ?? null,
          updated: updatedConnection.connection_type,
          restored: restoredConnection.connection_type,
        },
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
