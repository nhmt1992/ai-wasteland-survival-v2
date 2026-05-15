import { conflict } from './errors.js';
import type { GiftAdapterType } from './types.js';

export interface GiftAdapterSourceInput {
  streamerHandle: string;
  worldId?: string | null;
  tiktokId: string;
  displayName?: string | null;
  giftName: string;
  giftValue: number;
  repeatCount: number;
  giftId?: string | null;
  platformEventId?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface NormalizedGiftAdapterEvent extends GiftAdapterSourceInput {
  adapterType: GiftAdapterType;
  adapterLabel: string;
  rawPayload: Record<string, unknown>;
}

export interface GiftAdapterDefinition {
  type: GiftAdapterType;
  label: string;
  description: string;
  enabled: boolean;
  experimental: boolean;
  normalize(input: GiftAdapterSourceInput): NormalizedGiftAdapterEvent;
}

function firstDefinedString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function firstDefinedNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function buildNormalizedEvent(
  adapterType: GiftAdapterType,
  adapterLabel: string,
  input: GiftAdapterSourceInput,
  rawPayload: Record<string, unknown> | null | undefined,
): NormalizedGiftAdapterEvent {
  return {
    ...input,
    adapterType,
    adapterLabel,
    displayName: input.displayName ?? null,
    giftId: input.giftId ?? null,
    platformEventId: input.platformEventId ?? null,
    rawPayload: rawPayload ?? {},
  };
}

const devMockGiftAdapter: GiftAdapterDefinition = {
  type: 'dev_mock',
  label: 'DevMockGiftAdapter',
  description: 'ローカル開発用の模擬ギフトアダプター',
  enabled: true,
  experimental: false,
  normalize(input) {
    return buildNormalizedEvent('dev_mock', this.label, input, {
      source: this.label,
      adapterType: this.type,
      ...((input.rawPayload ?? {}) as Record<string, unknown>),
    });
  },
};

const manualGiftAdapter: GiftAdapterDefinition = {
  type: 'manual',
  label: 'ManualGiftAdapter',
  description: '配信者が手動でテスト送信するギフトアダプター',
  enabled: true,
  experimental: false,
  normalize(input) {
    return buildNormalizedEvent('manual', this.label, input, {
      source: this.label,
      adapterType: this.type,
      ...((input.rawPayload ?? {}) as Record<string, unknown>),
    });
  },
};

const tikTokExperimentalGiftAdapter: GiftAdapterDefinition = {
  type: 'tiktok_experimental',
  label: 'TikTokExperimentalAdapter',
  description: '実験的な TikTok 連携アダプター',
  enabled: true,
  experimental: true,
  normalize(input) {
    const raw = (input.rawPayload ?? {}) as Record<string, unknown>;
    const normalizedTiktokId = firstDefinedString(
      raw.tiktokId,
      raw.tiktok_id,
      raw.userId,
      raw.user_id,
      input.tiktokId,
    ) ?? input.tiktokId;
    const normalizedDisplayName = firstDefinedString(
      raw.displayName,
      raw.display_name,
      raw.nickname,
      raw.nick_name,
      input.displayName,
      input.tiktokId,
    );
    const normalizedGiftName = firstDefinedString(
      raw.giftName,
      raw.gift_name,
      raw.gift,
      input.giftName,
    ) ?? input.giftName;
    const normalizedGiftId = firstDefinedString(raw.giftId, raw.gift_id, input.giftId, normalizedGiftName) ?? input.giftName;
    const normalizedGiftValue = firstDefinedNumber(raw.giftValue, raw.gift_value, raw.value, input.giftValue) ?? input.giftValue;
    const normalizedRepeatCount = Math.max(
      1,
      Math.trunc(firstDefinedNumber(raw.repeatCount, raw.repeat_count, raw.repeat, input.repeatCount) ?? input.repeatCount),
    );

    return buildNormalizedEvent('tiktok_experimental', this.label, {
      ...input,
      tiktokId: normalizedTiktokId,
      displayName: normalizedDisplayName,
      giftName: normalizedGiftName,
      giftId: normalizedGiftId,
      giftValue: normalizedGiftValue,
      repeatCount: normalizedRepeatCount,
    }, {
      source: this.label,
      adapterType: this.type,
      ...raw,
    });
  },
};

const futureOfficialGiftAdapter: GiftAdapterDefinition = {
  type: 'future_official',
  label: 'FutureOfficialTikTokAdapter',
  description: '将来の公式 TikTok 連携のための予約アダプター',
  enabled: false,
  experimental: false,
  normalize(input) {
    throw conflict('FutureOfficialTikTokAdapter はまだ有効化されていません', {
      reason: 'gift_adapter_disabled',
      adapterType: this.type,
      label: this.label,
      input,
    });
  },
};

export const GIFT_ADAPTER_REGISTRY: Record<GiftAdapterType, GiftAdapterDefinition> = {
  dev_mock: devMockGiftAdapter,
  manual: manualGiftAdapter,
  tiktok_experimental: tikTokExperimentalGiftAdapter,
  future_official: futureOfficialGiftAdapter,
};

export const AVAILABLE_GIFT_ADAPTERS = Object.values(GIFT_ADAPTER_REGISTRY);

export function resolveGiftAdapter(adapterType?: string | null): GiftAdapterDefinition {
  const normalizedType = adapterType && adapterType in GIFT_ADAPTER_REGISTRY
    ? (adapterType as GiftAdapterType)
    : 'dev_mock';

  return GIFT_ADAPTER_REGISTRY[normalizedType];
}

export function normalizeGiftAdapterEvent(input: GiftAdapterSourceInput & { adapterType?: string | null }): NormalizedGiftAdapterEvent {
  const adapter = resolveGiftAdapter(input.adapterType ?? 'dev_mock');
  if (!adapter.enabled) {
    throw conflict('選択されたギフトアダプターは無効です', {
      reason: 'gift_adapter_disabled',
      adapterType: adapter.type,
      label: adapter.label,
    });
  }

  return adapter.normalize(input);
}
