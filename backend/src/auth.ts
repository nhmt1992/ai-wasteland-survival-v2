import { createHash, randomBytes } from 'node:crypto';

export const STREAMER_SESSION_COOKIE_NAME = 'aws_streamer_session';
export const STREAMER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const ADMIN_SESSION_COOKIE_NAME = 'aws_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function serializeCookie(parts: string[]): string {
  return parts.join('; ');
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function readCookieValue(cookieHeader: string | string[] | undefined, name: string): string | null {
  const normalizedHeader = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;

  if (!normalizedHeader) {
    return null;
  }

  const entries = normalizedHeader.split(';');
  for (const entry of entries) {
    const [rawKey, ...rawValueParts] = entry.split('=');
    const key = rawKey.trim();
    if (key !== name) {
      continue;
    }

    const value = rawValueParts.join('=').trim();
    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

export function buildSessionCookie(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return serializeCookie([
    `${STREAMER_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ]);
}

export function buildClearedSessionCookie(): string {
  return serializeCookie([
    `${STREAMER_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]);
}

export function buildAdminSessionCookie(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return serializeCookie([
    `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ]);
}

export function buildClearedAdminSessionCookie(): string {
  return serializeCookie([
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]);
}
