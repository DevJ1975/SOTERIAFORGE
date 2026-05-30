import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Compact HMAC-signed tokens for the cmi5 launch flow. These scope an external
 * Activity Unit (Unity WebGL build) to a specific tenant + learner +
 * registration, so the AU's xAPI statements can only ever be attributed to that
 * tenant — the isolation boundary for external content.
 */
export interface Cmi5TokenPayload {
  /** tenant id */ t: string;
  /** uid */ u: string;
  /** registration uuid */ r: string;
  /** activity id */ a: string;
  /** kind: 'fetch' (exchanged once) or 'auth' (used as xAPI Bearer) */ k: 'fetch' | 'auth';
  /** expiry (epoch seconds) */ exp: number;
}

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function signToken(payload: Cmi5TokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

/** Verify signature + expiry. Returns the payload or null. */
export function verifyToken(token: string, secret: string): Cmi5TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = createHmac('sha256', secret).update(body).digest();
  const given = fromB64url(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as Cmi5TokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const nowPlusSeconds = (s: number) => Math.floor(Date.now() / 1000) + s;
