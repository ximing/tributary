import { config } from '../config.js';

export const SESSION_COOKIE = 'tributary_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function readSessionToken(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const piece = part.trim();
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    if (piece.slice(0, eq) !== SESSION_COOKIE) continue;
    const value = piece.slice(eq + 1);
    return value.length > 0 ? decodeURIComponent(value) : null;
  }
  return null;
}

export function sessionCookie(token: string, maxAge = SESSION_MAX_AGE_SECONDS): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  const value = encodeURIComponent(token);
  return `${SESSION_COOKIE}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${String(maxAge)}${secure}`;
}

export function clearSessionCookie(): string {
  return sessionCookie('', 0);
}
