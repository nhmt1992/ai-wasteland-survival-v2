import { randomUUID } from 'node:crypto';
import { closeDatabase, pool } from '../src/db.js';
import { mockStripeBillingProvider } from '../src/billing.js';
import { isAppError } from '../src/errors.js';
import {
  createLiveSession,
  endLiveSession,
  loadStreamerContext,
  updateStreamerSubscriptionState,
  verifySeedData,
} from '../src/repository.js';
import { runManualTick } from '../src/tick.js';

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

async function assertWorldNotTicked(worldId: string, label: string): Promise<void> {
  const before = await loadStreamerContext(pool, 'matt');
  const beforeTick = before.primaryWorld?.current_tick;
  const tickResults = await runManualTick(pool);
  const after = await loadStreamerContext(pool, 'matt');
  const afterTick = after.primaryWorld?.current_tick;

  if (tickResults.some((result) => result.worldId === worldId)) {
    throw new Error(`${label} unexpectedly ticked the disabled world`);
  }

  if (beforeTick !== afterTick) {
    throw new Error(`${label} changed disabled world tick from ${beforeTick ?? 'null'} to ${afterTick ?? 'null'}`);
  }
}

async function main(): Promise<void> {
  const summary = await verifySeedData(pool);
  const originalContext = await loadStreamerContext(pool, 'matt');
  const worldId = originalContext.primaryWorld?.id;
  if (!worldId) {
    throw new Error('matt seed world is missing');
  }

  const originalSubscription = originalContext.subscription;
  if (!originalSubscription) {
    throw new Error('matt subscription is missing');
  }

  const checkout = await mockStripeBillingProvider.checkout(pool, {
    streamerHandle: 'matt',
    plan: 'starter',
    providerEventId: `phase15_checkout_${randomUUID()}`,
    providerSessionId: `phase15_checkout_session_${randomUUID()}`,
    paymentMethod: 'mock_card',
  });

  if (checkout.subscription?.plan !== 'starter' || checkout.subscription.status !== 'active') {
    throw new Error(`Checkout did not activate starter plan: ${checkout.subscription?.plan ?? 'null'} / ${checkout.subscription?.status ?? 'null'}`);
  }

  if (checkout.planLimits.maxNpcsPerWorld !== 20) {
    throw new Error(`Expected starter NPC limit 20, got ${checkout.planLimits.maxNpcsPerWorld}`);
  }

  const liveSession = await createLiveSession(pool, {
    streamerHandle: 'matt',
    worldId,
    platform: 'tiktok',
    platformLiveId: `phase15_${randomUUID()}`,
  });

  if (liveSession.liveSession.status !== 'live') {
    throw new Error(`Expected live session to be live, got ${liveSession.liveSession.status}`);
  }

  await endLiveSession(pool, {
    streamerHandle: 'matt',
    liveSessionId: liveSession.liveSession.id,
  });

  const expired = await mockStripeBillingProvider.portalAction(pool, {
    streamerHandle: 'matt',
    action: 'mark_expired',
    providerEventId: `phase15_expired_${randomUUID()}`,
  });

  if (expired.subscription?.status !== 'expired') {
    throw new Error(`Expected expired subscription, got ${expired.subscription?.status ?? 'null'}`);
  }

  await expectAppError(
    () =>
      createLiveSession(pool, {
        streamerHandle: 'matt',
        worldId,
      }),
    {
      statusCode: 409,
      code: 'subscription_inactive',
    },
    'expired live session start',
  );

  await assertWorldNotTicked(worldId, 'expired subscription');

  const restoredAfterExpired = await mockStripeBillingProvider.portalAction(pool, {
    streamerHandle: 'matt',
    action: 'restore',
    providerEventId: `phase15_restore_after_expired_${randomUUID()}`,
  });

  if (restoredAfterExpired.subscription?.status !== 'active') {
    throw new Error(`Expected restored active subscription, got ${restoredAfterExpired.subscription?.status ?? 'null'}`);
  }

  const canceled = await mockStripeBillingProvider.portalAction(pool, {
    streamerHandle: 'matt',
    action: 'cancel',
    providerEventId: `phase15_cancel_${randomUUID()}`,
  });

  if (canceled.subscription?.status !== 'canceled') {
    throw new Error(`Expected canceled subscription, got ${canceled.subscription?.status ?? 'null'}`);
  }

  await expectAppError(
    () =>
      createLiveSession(pool, {
        streamerHandle: 'matt',
        worldId,
      }),
    {
      statusCode: 409,
      code: 'subscription_inactive',
    },
    'canceled live session start',
  );

  const restoredAfterCancel = await mockStripeBillingProvider.portalAction(pool, {
    streamerHandle: 'matt',
    action: 'restore',
    providerEventId: `phase15_restore_after_cancel_${randomUUID()}`,
  });

  if (restoredAfterCancel.subscription?.status !== 'active') {
    throw new Error(`Expected active subscription after cancel restore, got ${restoredAfterCancel.subscription?.status ?? 'null'}`);
  }

  const webhookEventId = `phase15_webhook_${randomUUID()}`;
  const webhookFirst = await mockStripeBillingProvider.handleWebhook(pool, {
    streamerHandle: 'matt',
    providerEventId: webhookEventId,
    providerSessionId: `phase15_webhook_session_${randomUUID()}`,
    eventType: 'invoice.payment_failed',
    payload: {
      action: 'mark_past_due',
      source: 'phase15',
    },
  });

  const webhookSecond = await mockStripeBillingProvider.handleWebhook(pool, {
    streamerHandle: 'matt',
    providerEventId: webhookEventId,
    providerSessionId: `phase15_webhook_session_${randomUUID()}`,
    eventType: 'invoice.payment_failed',
    payload: {
      action: 'mark_past_due',
      source: 'phase15',
      duplicate: true,
    },
  });

  if (webhookFirst.billingEvent.id !== webhookSecond.billingEvent.id) {
    throw new Error('Webhook replay created a duplicate billing event');
  }

  if (webhookSecond.subscription?.status !== 'past_due') {
    throw new Error(`Expected past_due subscription, got ${webhookSecond.subscription?.status ?? 'null'}`);
  }

  await expectAppError(
    () =>
      createLiveSession(pool, {
        streamerHandle: 'matt',
        worldId,
      }),
    {
      statusCode: 409,
      code: 'subscription_inactive',
    },
    'past_due live session start',
  );

  await assertWorldNotTicked(worldId, 'past_due subscription');

  const renewed = await mockStripeBillingProvider.portalAction(pool, {
    streamerHandle: 'matt',
    action: 'renew',
    providerEventId: `phase15_renew_${randomUUID()}`,
  });

  if (renewed.subscription?.status !== 'active') {
    throw new Error(`Expected renewed active subscription, got ${renewed.subscription?.status ?? 'null'}`);
  }

  const relaunched = await createLiveSession(pool, {
    streamerHandle: 'matt',
    worldId,
    platform: 'tiktok',
    platformLiveId: `phase15_relaunch_${randomUUID()}`,
  });

  if (relaunched.liveSession.status !== 'live') {
    throw new Error(`Expected relaunched live session to be live, got ${relaunched.liveSession.status}`);
  }

  await endLiveSession(pool, {
    streamerHandle: 'matt',
    liveSessionId: relaunched.liveSession.id,
  });

  await updateStreamerSubscriptionState(pool, {
    streamerHandle: 'matt',
    plan: originalSubscription.plan,
    status: originalSubscription.status,
    provider: originalSubscription.provider,
    providerCustomerId: originalSubscription.provider_customer_id,
    providerSubscriptionId: originalSubscription.provider_subscription_id,
    currentPeriodStart: originalSubscription.current_period_start,
    currentPeriodEnd: originalSubscription.current_period_end,
    cancelAtPeriodEnd: originalSubscription.cancel_at_period_end,
  });

  const finalContext = await loadStreamerContext(pool, 'matt');
  if (finalContext.subscription?.plan !== originalSubscription.plan || finalContext.subscription?.status !== originalSubscription.status) {
    throw new Error('Failed to restore matt subscription to its original state');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        summary,
        worldId,
        checkout: {
          plan: checkout.subscription?.plan ?? null,
          status: checkout.subscription?.status ?? null,
          npcLimit: checkout.planLimits.maxNpcsPerWorld,
        },
        inactiveStates: {
          expired: expired.subscription?.status ?? null,
          canceled: canceled.subscription?.status ?? null,
          pastDue: webhookSecond.subscription?.status ?? null,
        },
        billingReplay: {
          billingEventId: webhookFirst.billingEvent.id,
          replayBillingEventId: webhookSecond.billingEvent.id,
        },
        finalSubscription: {
          plan: finalContext.subscription?.plan ?? null,
          status: finalContext.subscription?.status ?? null,
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
