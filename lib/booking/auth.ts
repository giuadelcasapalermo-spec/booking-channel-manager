import type { BookingToken } from './types';

let _cachedToken: BookingToken | null = null;

/**
 * Returns a valid bearer token for the Booking.com API.
 * Uses a cached token if still valid (>60s margin), otherwise fetches a new one.
 *
 * In MOCK_MODE (BOOKING_MOCK_MODE=true) returns a fake token without hitting
 * any real endpoint — safe to call at any time during development.
 */
export async function getToken(): Promise<string> {
  if (process.env.BOOKING_MOCK_MODE === 'true') {
    return 'mock-token-dev';
  }

  const now = new Date();
  const marginMs = 60_000;
  if (_cachedToken && _cachedToken.expiresAt.getTime() - now.getTime() > marginMs) {
    return _cachedToken.token;
  }

  const username = process.env.BOOKING_USERNAME;
  const password = process.env.BOOKING_PASSWORD;
  if (!username || !password) {
    throw new Error('BOOKING_USERNAME / BOOKING_PASSWORD non configurati');
  }

  // Token endpoint as documented in Connectivity Hub
  const base = process.env.BOOKING_ARI_BASE ?? 'https://supply-xml.booking.com';
  const res = await fetch(`${base}/hotels/ota/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      username,
      password,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token fetch failed: ${res.status} ${res.statusText}`);
  }

  const data: { access_token: string; expires_in: number } = await res.json();
  _cachedToken = {
    token: data.access_token,
    expiresAt: new Date(now.getTime() + data.expires_in * 1000),
  };
  return _cachedToken.token;
}

/** Basic-auth header from static credentials (legacy, sunsets Dec 2025) */
export function basicAuthHeader(): string {
  const username = process.env.BOOKING_USERNAME ?? '';
  const password = process.env.BOOKING_PASSWORD ?? '';
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

export function authHeaders(): HeadersInit {
  if (process.env.BOOKING_MOCK_MODE === 'true') {
    return { Authorization: 'Bearer mock-token-dev' };
  }
  // Use static credentials during development (token flow requires onboarding)
  return { Authorization: basicAuthHeader() };
}
