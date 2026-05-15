import type { PlanType, SubscriptionRow, SubscriptionStatus } from './types.js';

export type PlanBranding = 'watermark' | 'custom';

export interface PlanLimits {
  maxWorlds: number;
  maxNpcsPerWorld: number;
  maxLiveSessionsPerMonth: number;
  aiNarrationQuota: number;
  overlayBranding: PlanBranding;
  customGiftMapping: boolean;
}

export interface UsageWindow {
  start: Date;
  end: Date;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free_trial: {
    maxWorlds: 1,
    maxNpcsPerWorld: 5,
    maxLiveSessionsPerMonth: 5,
    aiNarrationQuota: 0,
    overlayBranding: 'watermark',
    customGiftMapping: false,
  },
  starter: {
    maxWorlds: 1,
    maxNpcsPerWorld: 20,
    maxLiveSessionsPerMonth: 30,
    aiNarrationQuota: 100,
    overlayBranding: 'watermark',
    customGiftMapping: false,
  },
  pro: {
    maxWorlds: 3,
    maxNpcsPerWorld: 100,
    maxLiveSessionsPerMonth: 200,
    aiNarrationQuota: 1000,
    overlayBranding: 'custom',
    customGiftMapping: true,
  },
  studio: {
    maxWorlds: 10,
    maxNpcsPerWorld: 500,
    maxLiveSessionsPerMonth: 1000,
    aiNarrationQuota: 10000,
    overlayBranding: 'custom',
    customGiftMapping: true,
  },
};

export const PLAN_LABELS: Record<PlanType, string> = {
  free_trial: '無料トライアル',
  starter: 'スターター',
  pro: 'プロ',
  studio: 'スタジオ',
};

export function normalizePlanType(plan: string | null | undefined): PlanType {
  if (plan === 'starter' || plan === 'pro' || plan === 'studio') {
    return plan;
  }

  return 'free_trial';
}

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[normalizePlanType(plan)];
}

export function getPlanLabel(plan: string | null | undefined): string {
  return PLAN_LABELS[normalizePlanType(plan)];
}

export function isSubscriptionActiveForUsage(status: SubscriptionStatus | string | null | undefined): boolean {
  return status === 'active' || status === 'trialing';
}

export function resolveUsageWindow(
  subscription: Pick<SubscriptionRow, 'current_period_start' | 'current_period_end'> | null,
  now = new Date(),
): UsageWindow {
  if (subscription?.current_period_start) {
    return {
      start: subscription.current_period_start,
      end: subscription.current_period_end ?? now,
    };
  }

  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}
