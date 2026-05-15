import { randomUUID } from 'node:crypto';
import { env } from './env.js';

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hashString(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function makeTileKey(tileX: number, tileY: number): string {
  return `${tileX}:${tileY}`;
}

export function normalizeHandle(input: string): string {
  const normalized = input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'streamer';
}

export function formatDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function joinPublicUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  return `${normalizedBase}${path}`;
}

export function buildOverlayUrl(streamerHandle: string, worldId: string): string {
  return joinPublicUrl(
    env.PUBLIC_OVERLAY_BASE_URL,
    `/overlay/${encodeURIComponent(streamerHandle)}/${encodeURIComponent(worldId)}`,
  );
}

export function buildViewerCreateUrl(streamerHandle: string): string {
  return joinPublicUrl(env.PUBLIC_VIEWER_BASE_URL, `/s/${encodeURIComponent(streamerHandle)}/create`);
}

export function buildViewerMyNpcUrl(streamerHandle: string): string {
  return joinPublicUrl(env.PUBLIC_VIEWER_BASE_URL, `/s/${encodeURIComponent(streamerHandle)}/my-npc`);
}

export function buildViewerWatchUrl(streamerHandle: string, npcId: string): string {
  return joinPublicUrl(
    env.PUBLIC_VIEWER_BASE_URL,
    `/s/${encodeURIComponent(streamerHandle)}/watch/${encodeURIComponent(npcId)}`,
  );
}

export function createSeededId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
