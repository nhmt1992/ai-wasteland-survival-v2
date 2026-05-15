import { randomUUID } from 'node:crypto';
import { notFound } from './errors.js';
import { getPlanLabel, getPlanLimits, normalizePlanType, resolveUsageWindow } from './plans.js';
import {
  listBillingEventsForStreamer,
  loadStreamerContext,
  recordBillingEvent,
  updateStreamerSubscriptionState,
} from './repository.js';
import type { BillingEventRow, PlanType, StreamerRow, SubscriptionRow, TenantRow } from './types.js';
import type { StreamerContextResult, SqlExecutor } from './repository.js';

export const MOCK_STRIPE_PROVIDER = 'mock_stripe';
const BILLING_PERIOD_DAYS = 30;

export type BillingPortalAction =
  | 'renew'
  | 'cancel'
  | 'restore'
  | 'mark_past_due'
  | 'mark_expired';

export interface BillingConsoleState extends StreamerContextResult {
  usageWindow: {
    start: Date;
    end: Date;
  };
  billingEvents: BillingEventRow[];
}

export interface BillingActionResult extends BillingConsoleState {
  billingEvent: BillingEventRow;
}

interface BillingTransition {
  action: 'checkout' | BillingPortalAction;
  eventType: string;
  plan?: PlanType;
  status?: SubscriptionRow['status'];
  providerEventId?: string;
  providerSessionId?: string | null;
  payload: Record<string, unknown>;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function createProviderId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function isPlanType(value: string | null | undefined): value is PlanType {
  return value === 'free_trial' || value === 'starter' || value === 'pro' || value === 'studio';
}

async function loadBillingConsoleState(db: SqlExecutor, streamerHandle: string): Promise<BillingConsoleState> {
  const context = await loadStreamerContext(db, streamerHandle);
  return {
    ...context,
    usageWindow: resolveUsageWindow(context.subscription),
    billingEvents: await listBillingEventsForStreamer(db, {
      tenantId: context.tenant.id,
      streamerId: context.streamer.id,
      limit: 20,
    }),
  };
}

function buildSubscriptionPayload(
  context: StreamerContextResult,
  transition: BillingTransition,
  subscription: SubscriptionRow,
  previousSubscription: SubscriptionRow | null,
): Record<string, unknown> {
  return {
    provider: MOCK_STRIPE_PROVIDER,
    action: transition.action,
    eventType: transition.eventType,
    streamerHandle: context.streamer.handle,
    tenantId: context.tenant.id,
    streamerId: context.streamer.id,
    previousPlan: previousSubscription?.plan ?? null,
    previousStatus: previousSubscription?.status ?? null,
    previousPeriodStart: previousSubscription?.current_period_start?.toISOString() ?? null,
    previousPeriodEnd: previousSubscription?.current_period_end?.toISOString() ?? null,
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start?.toISOString() ?? null,
    currentPeriodEnd: subscription.current_period_end?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    planLabel: getPlanLabel(subscription.plan),
    limits: getPlanLimits(subscription.plan),
  };
}

function resolvePortalTransition(action: BillingPortalAction, current: SubscriptionRow, now: Date): Omit<BillingTransition, 'action'> {
  const providerSessionId = createProviderId(`portal_${action}`);
  const providerEventId = createProviderId(`billing_${action}`);
  const currentPeriodStart = current.current_period_start ?? now;
  const currentPeriodEnd = addDays(currentPeriodStart, BILLING_PERIOD_DAYS);

  switch (action) {
    case 'renew':
      return {
        eventType: 'billing.portal.renewed',
        status: 'active',
        providerEventId,
        providerSessionId,
        payload: {
          action,
          nextStatus: 'active',
          currentPeriodStart: currentPeriodStart.toISOString(),
          currentPeriodEnd: currentPeriodEnd.toISOString(),
        },
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      };
    case 'cancel':
      return {
        eventType: 'billing.portal.canceled',
        status: 'canceled',
        providerEventId,
        providerSessionId,
        payload: {
          action,
          nextStatus: 'canceled',
          currentPeriodEnd: now.toISOString(),
        },
        currentPeriodEnd: now,
        cancelAtPeriodEnd: true,
      };
    case 'restore':
      return {
        eventType: 'billing.portal.restored',
        status: 'active',
        providerEventId,
        providerSessionId,
        payload: {
          action,
          nextStatus: 'active',
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: currentPeriodEnd.toISOString(),
        },
        currentPeriodStart: now,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      };
    case 'mark_past_due':
      return {
        eventType: 'billing.portal.past_due',
        status: 'past_due',
        providerEventId,
        providerSessionId,
        payload: {
          action,
          nextStatus: 'past_due',
          currentPeriodEnd: now.toISOString(),
        },
        currentPeriodEnd: now,
        cancelAtPeriodEnd: current.cancel_at_period_end,
      };
    case 'mark_expired':
      return {
        eventType: 'billing.portal.expired',
        status: 'expired',
        providerEventId,
        providerSessionId,
        payload: {
          action,
          nextStatus: 'expired',
          currentPeriodEnd: now.toISOString(),
        },
        currentPeriodEnd: now,
        cancelAtPeriodEnd: true,
      };
    default:
      return {
        eventType: `billing.portal.${action}`,
        status: current.status,
        providerEventId,
        providerSessionId,
        payload: {
          action,
          nextStatus: current.status,
        },
        cancelAtPeriodEnd: current.cancel_at_period_end,
      };
  }
}

function resolveWebhookTransition(
  eventType: string,
  payload: Record<string, unknown>,
  current: SubscriptionRow,
  now: Date,
): Omit<BillingTransition, 'action'> | null {
  const rawAction = typeof payload.action === 'string' ? payload.action : null;
  const actionFromEvent =
    eventType.includes('deleted') || eventType.includes('canceled')
      ? 'cancel'
      : eventType.includes('payment_failed')
        ? 'mark_past_due'
        : eventType.includes('paid')
          ? 'renew'
          : eventType.includes('expired')
            ? 'mark_expired'
            : null;

  const action = rawAction && (rawAction === 'renew' || rawAction === 'cancel' || rawAction === 'restore' || rawAction === 'mark_past_due' || rawAction === 'mark_expired')
    ? rawAction
    : actionFromEvent;

  if (!action) {
    return null;
  }

  return resolvePortalTransition(action, current, now);
}

async function applyBillingTransition(
  db: SqlExecutor,
  streamerHandle: string,
  transition: BillingTransition,
): Promise<BillingActionResult> {
  const before = await loadStreamerContext(db, streamerHandle);
  const current = before.subscription;
  if (!current) {
    throw notFound(`subscription ${streamerHandle} が見つかりません`);
  }

  let nextSubscription: SubscriptionRow = current;

  if (transition.action === 'checkout') {
    const nextPlan = transition.plan ?? normalizePlanType(current.plan);
    const checkoutPeriodStart = transition.currentPeriodStart ?? new Date();
    const checkoutPeriodEnd = transition.currentPeriodEnd ?? addDays(checkoutPeriodStart, BILLING_PERIOD_DAYS);
    nextSubscription = await updateStreamerSubscriptionState(db, {
      streamerHandle,
      plan: nextPlan,
      status: transition.status ?? 'active',
      provider: MOCK_STRIPE_PROVIDER,
      providerCustomerId: before.subscription?.provider_customer_id ?? createProviderId(`cus_${before.streamer.handle}`),
      providerSubscriptionId: before.subscription?.provider_subscription_id ?? createProviderId(`sub_${before.streamer.handle}`),
      currentPeriodStart: checkoutPeriodStart,
      currentPeriodEnd: checkoutPeriodEnd,
      cancelAtPeriodEnd: transition.cancelAtPeriodEnd ?? false,
    });
  } else {
    nextSubscription = await updateStreamerSubscriptionState(db, {
      streamerHandle,
      status: transition.status ?? current.status,
      provider: MOCK_STRIPE_PROVIDER,
      providerCustomerId: before.subscription?.provider_customer_id ?? createProviderId(`cus_${before.streamer.handle}`),
      providerSubscriptionId: before.subscription?.provider_subscription_id ?? createProviderId(`sub_${before.streamer.handle}`),
      currentPeriodStart: transition.currentPeriodStart === undefined ? current.current_period_start : transition.currentPeriodStart,
      currentPeriodEnd: transition.currentPeriodEnd === undefined ? current.current_period_end : transition.currentPeriodEnd,
      cancelAtPeriodEnd: transition.cancelAtPeriodEnd ?? current.cancel_at_period_end,
    });
  }

  const billingEvent = await recordBillingEvent(db, {
    tenantId: before.tenant.id,
    streamerId: before.streamer.id,
    subscriptionId: nextSubscription.id,
    provider: MOCK_STRIPE_PROVIDER,
    providerEventId: transition.providerEventId ?? createProviderId(transition.action),
    providerSessionId: transition.providerSessionId ?? null,
    eventType: transition.eventType,
    status: 'processed',
    payload: buildSubscriptionPayload(before, transition, nextSubscription, current),
  });

  const state = await loadBillingConsoleState(db, streamerHandle);
  return {
    ...state,
    billingEvent,
  };
}

export class MockStripeBillingProvider {
  async loadConsoleState(db: SqlExecutor, streamerHandle: string): Promise<BillingConsoleState> {
    return loadBillingConsoleState(db, streamerHandle);
  }

  async checkout(
    db: SqlExecutor,
    input: {
      streamerHandle: string;
      plan: PlanType;
      providerEventId?: string | null;
      providerSessionId?: string | null;
      paymentMethod?: string | null;
    },
  ): Promise<BillingActionResult> {
    return applyBillingTransition(db, input.streamerHandle, {
      action: 'checkout',
      eventType: 'billing.checkout.completed',
      plan: input.plan,
      providerEventId: input.providerEventId ?? createProviderId('checkout'),
      providerSessionId: input.providerSessionId ?? createProviderId('checkout_session'),
      payload: {
        action: 'checkout',
        plan: input.plan,
        paymentMethod: input.paymentMethod ?? 'mock_card',
      },
      currentPeriodStart: new Date(),
      currentPeriodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
      cancelAtPeriodEnd: false,
      status: 'active',
    });
  }

  async portalAction(
    db: SqlExecutor,
    input: {
      streamerHandle: string;
      action: BillingPortalAction;
      providerEventId?: string | null;
      providerSessionId?: string | null;
    },
  ): Promise<BillingActionResult> {
    const state = await loadBillingConsoleState(db, input.streamerHandle);
    if (!state.subscription) {
      throw notFound(`subscription ${input.streamerHandle} が見つかりません`);
    }

    const now = new Date();
    const transition = resolvePortalTransition(input.action, state.subscription, now);
    return applyBillingTransition(db, input.streamerHandle, {
      action: input.action,
      ...transition,
      providerEventId: input.providerEventId ?? transition.providerEventId ?? createProviderId(input.action),
      providerSessionId: input.providerSessionId ?? transition.providerSessionId ?? null,
    });
  }

  async handleWebhook(
    db: SqlExecutor,
    input: {
      streamerHandle: string;
      providerEventId: string;
      eventType: string;
      providerSessionId?: string | null;
      payload: Record<string, unknown>;
    },
  ): Promise<BillingActionResult> {
    const state = await loadBillingConsoleState(db, input.streamerHandle);
    if (!state.subscription) {
      throw notFound(`subscription ${input.streamerHandle} が見つかりません`);
    }

    const now = new Date();
    const transition = resolveWebhookTransition(input.eventType, input.payload, state.subscription, now);
    if (!transition) {
      const billingEvent = await recordBillingEvent(db, {
        tenantId: state.tenant.id,
        streamerId: state.streamer.id,
        subscriptionId: state.subscription.id,
        provider: MOCK_STRIPE_PROVIDER,
        providerEventId: input.providerEventId,
        providerSessionId: input.providerSessionId ?? null,
        eventType: input.eventType,
        status: 'received',
        payload: {
          eventType: input.eventType,
          ...input.payload,
          streamerHandle: input.streamerHandle,
        },
      });

      return {
        ...state,
        billingEvent,
      };
    }

    return applyBillingTransition(db, input.streamerHandle, {
      action: transition.eventType.includes('checkout') ? 'checkout' : (transition.payload.action as BillingPortalAction) ?? 'restore',
      ...transition,
      providerEventId: input.providerEventId,
      providerSessionId: input.providerSessionId ?? null,
    });
  }
}

export const mockStripeBillingProvider = new MockStripeBillingProvider();
